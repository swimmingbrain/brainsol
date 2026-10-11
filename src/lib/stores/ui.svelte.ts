// page state that belongs to no data: which layers are open

import { browser } from '$app/environment';

class Ui {
  // the stage fills the screen with large numbers
  presenting = $state(false);
  // the dialog behind the lock icon
  unlockOpen = $state(false);

  // presentation mode also asks for the full screen, a refusal is fine
  async setPresenting(on: boolean): Promise<void> {
    this.presenting = on;
    if (!browser) return;
    try {
      if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      if (!on && document.fullscreenElement) await document.exitFullscreen?.();
    } catch {}
  }

  togglePresenting(): void {
    void this.setPresenting(!this.presenting);
  }

  // leaving the full screen with escape or the browser ends presentation mode too
  watchFullscreen(): () => void {
    if (!browser) return () => {};
    let was = false;
    const onchange = () => {
      const now = Boolean(document.fullscreenElement);
      if (was && !now && this.presenting) this.presenting = false;
      was = now;
    };
    document.addEventListener('fullscreenchange', onchange);
    return () => document.removeEventListener('fullscreenchange', onchange);
  }
}

export const ui = new Ui();
