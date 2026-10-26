// mouse, finger and keys on the stage. a drag on the canvas turns the camera,
// the wheel and two fingers zoom, a double click or a double tap goes home.
// the lamp glyph is its own element above the canvas, so a drag that starts on
// it moves the lamp and never the camera.
//
// the three.js orbit controls are not used on purpose: they lock all touch
// scrolling on the canvas and eat every wheel turn, the stage has to let the
// page scroll on a phone and once the zoom has reached its limit

import type { Orbit } from './orbit';

export interface ControlsHost {
  orbit: Orbit;
  // something changed, draw again
  wake(): void;
  canDragLamp(): boolean;
  lampStart(): void;
  lampMove(clientX: number, clientY: number): void;
  lampEnd(): void;
  // degrees from the keyboard
  lampNudge(dAz: number, dEl: number): void;
}

// degrees per css pixel of drag
const TURN = 0.4;
// a tap moves less than this many pixels and lasts less than this many ms
const TAP_SLOP = 10;
const TAP_TIME = 260;
const DOUBLE_TAP = 320;

interface Pointer {
  x: number;
  y: number;
  startX: number;
  startY: number;
  start: number;
}

export class Controls {
  private pointers = new Map<number, Pointer>();
  private pinch: { dist: number; mid: [number, number] } | null = null;
  private lastTap = { at: 0, x: 0, y: 0 };
  private lampPointer: number | null = null;
  private off: (() => void)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private host: ControlsHost
  ) {
    this.setScroll(true);
    this.canvas.style.cursor = 'grab';
    this.listen(canvas, 'pointerdown', this.down);
    this.listen(canvas, 'pointermove', this.move);
    this.listen(canvas, 'pointerup', this.up);
    this.listen(canvas, 'pointercancel', this.cancel);
    this.listen(canvas, 'lostpointercapture', this.cancel);
    this.listen(canvas, 'wheel', this.wheel, { passive: false });
    this.listen(canvas, 'dblclick', this.home);
  }

  private listen<K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions): void {
    el.addEventListener(type, fn as EventListener, options);
    this.off.push(() => el.removeEventListener(type, fn as EventListener, options));
  }

  // a phone may scroll the page with one finger on the stage, unless the
  // stage fills the screen and there is nothing to scroll
  setScroll(scroll: boolean): void {
    this.canvas.style.touchAction = scroll ? 'pan-y' : 'none';
  }

  bindLamp(el: HTMLElement | null): void {
    if (!el) return;
    el.style.touchAction = 'none';
    this.listen(el, 'pointerdown', (e) => {
      if (!this.host.canDragLamp()) return;
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture?.(e.pointerId);
      this.lampPointer = e.pointerId;
      this.host.lampStart();
      this.host.lampMove(e.clientX, e.clientY);
    });
    this.listen(el, 'pointermove', (e) => {
      if (e.pointerId !== this.lampPointer) return;
      e.preventDefault();
      this.host.lampMove(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.lampPointer) return;
      this.lampPointer = null;
      this.host.lampEnd();
    };
    this.listen(el, 'pointerup', end);
    this.listen(el, 'pointercancel', end);
    this.listen(el, 'lostpointercapture', end);
    this.listen(el, 'keydown', (e) => {
      if (!this.host.canDragLamp()) return;
      const step = e.shiftKey ? 1 : 5;
      const keys: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      const move = keys[e.key];
      if (!move) return;
      e.preventDefault();
      this.host.lampNudge(move[0], move[1]);
    });
  }

  private down = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType === 'mouse') this.canvas.setPointerCapture?.(e.pointerId);
    const now = performance.now();
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, start: now });
    if (this.pointers.size === 2) this.pinch = this.measure();
    this.canvas.style.cursor = 'grabbing';
  };

  private move = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 1) {
      this.host.orbit.rotate(dx * TURN, dy * TURN);
      this.host.wake();
      return;
    }
    if (this.pointers.size === 2 && this.pinch) {
      const now = this.measure();
      if (now.dist > 0 && this.pinch.dist > 0) this.host.orbit.zoom(this.pinch.dist / now.dist);
      // half the move of a two finger drag, a pinch should not spin the view
      this.host.orbit.rotate(((now.mid[0] - this.pinch.mid[0]) * TURN) / 2, ((now.mid[1] - this.pinch.mid[1]) * TURN) / 2);
      this.pinch = now;
      this.host.wake();
    }
  };

  private up = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    this.release(e.pointerId);
    if (!p || e.pointerType === 'mouse') return;
    // a double tap goes home, the mouse has dblclick for that
    const now = performance.now();
    const tap = now - p.start < TAP_TIME && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < TAP_SLOP;
    if (!tap) return;
    if (now - this.lastTap.at < DOUBLE_TAP && Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < TAP_SLOP * 3) {
      this.lastTap.at = 0;
      this.home();
    } else {
      this.lastTap = { at: now, x: e.clientX, y: e.clientY };
    }
  };

  // the browser took the gesture over, a scroll most likely
  private cancel = (e: PointerEvent): void => {
    this.release(e.pointerId);
  };

  private release(id: number): void {
    this.pointers.delete(id);
    this.pinch = this.pointers.size === 2 ? this.measure() : null;
    if (this.pointers.size === 0) this.canvas.style.cursor = 'grab';
  }

  private measure(): { dist: number; mid: [number, number] } {
    const [a, b] = [...this.pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: [(a.x + b.x) / 2, (a.y + b.y) / 2] };
  }

  private wheel = (e: WheelEvent): void => {
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const delta = Math.max(-200, Math.min(200, e.deltaY * unit));
    const moved = this.host.orbit.zoom(Math.exp(delta * 0.0015));
    // at the limit the wheel scrolls the page again, a trackpad pinch never does
    if (moved || e.ctrlKey) e.preventDefault();
    if (moved) this.host.wake();
  };

  private home = (): void => {
    this.host.orbit.reset();
    this.host.wake();
  };

  dispose(): void {
    for (const off of this.off.splice(0)) off();
    this.pointers.clear();
  }
}
