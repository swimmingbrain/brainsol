import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Connection } from './connection.svelte';
import { telemetry } from './telemetry.svelte';
import type { SocketLike } from '$lib/link/socket';
import type { ClientMessage, ServerMessage } from '$lib/link/protocol';
import type { SimEngine } from '$lib/link/transport';

class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: ClientMessage[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

// a simulation that says hello, takes any pin and acks every command
class TinyEngine implements SimEngine {
  emit: ((message: ServerMessage) => void) | null = null;
  start(emit: (message: ServerMessage) => void) {
    this.emit = emit;
    emit({ ...HELLO, driver: 'sim' } as ServerMessage);
  }
  stop() {
    this.emit = null;
  }
  handle(message: ClientMessage) {
    if (message.t === 'auth') this.emit?.({ t: 'auth', ok: true, token: 'sim-token', exp: 0 });
    else if (message.op === 'ping') this.emit?.({ t: 'ack', id: message.id, ok: true, data: { ts: 1 } });
  }
}

const HELLO = {
  t: 'hello',
  proto: 1,
  name: 'brainsol',
  version: '1.0.0',
  driver: 'bridge',
  caps: { lux: true, pv: false, simlight: false },
  admin: false,
  rate: 20,
  cfg: { limits: { pan: [-88, 88], tilt: [4, 176] } }
};

const last = () => FakeSocket.all[FakeSocket.all.length - 1];
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function make(href: string, config: unknown = { pi: '' }) {
  const url = new URL(href);
  const fetchMock = vi.fn(async (input: string) => {
    if (input === '/config.json') return new Response(JSON.stringify(config));
    if (input.includes('/api/history')) return new Response(JSON.stringify({ t0: 0, dt: 1, cols: ['pan'], rows: [] }));
    return new Response('nope', { status: 404 });
  });
  const connection = new Connection({
    createSocket: (target) => new FakeSocket(target),
    createEngine: () => new TinyEngine(),
    fetch: fetchMock as unknown as typeof fetch,
    page: () => ({ href: url.href, protocol: url.protocol, host: url.host })
  });
  return { connection, fetchMock };
}

describe('the connection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.all = [];
    telemetry.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the simulation when no address is given anywhere', async () => {
    const { connection } = make('https://sol.swimmingbrain.dev/');
    await connection.init();
    await settle();
    expect(FakeSocket.all).toHaveLength(0);
    expect(connection.source).toBe('sim');
    expect(connection.status).toBe('open');
    expect(connection.hello?.driver).toBe('sim');
    connection.stop();
  });

  it('connects to ?pi= over wss on the https site and goes live on hello', async () => {
    const { connection, fetchMock } = make('https://sol.swimmingbrain.dev/?pi=abc.trycloudflare.com');
    await connection.init();
    expect(last().url).toBe('wss://abc.trycloudflare.com/ws');
    expect(connection.source).toBe('live');
    expect(connection.status).toBe('connecting');
    expect(connection.from).toBe('query');
    last().open();
    last().receive(HELLO);
    expect(connection.source).toBe('live');
    expect(connection.status).toBe('open');
    expect(connection.host).toBe('abc.trycloudflare.com');
    expect(connection.config?.limits.pan).toEqual([-88, 88]);
    await settle();
    expect(fetchMock).toHaveBeenCalledWith('https://abc.trycloudflare.com/api/history?span=600', { cache: 'no-store' });
    connection.stop();
  });

  it('takes the address from config.json when nothing else is given', async () => {
    const { connection } = make('http://brainsol.local:8080/', { pi: 'self' });
    await connection.init();
    expect(last().url).toBe('ws://brainsol.local:8080/ws');
    expect(connection.from).toBe('config');
    connection.stop();
  });

  it('falls back to the simulation when the tracker does not answer, and goes live once it does', async () => {
    const { connection } = make('https://sol.swimmingbrain.dev/?pi=pi.example.org');
    await connection.init();
    vi.advanceTimersByTime(4000);
    await settle();
    expect(connection.source).toBe('sim');
    expect(connection.problem).toBe('unreachable');
    // the socket keeps trying in the background
    vi.advanceTimersByTime(6000);
    last().open();
    last().receive(HELLO);
    expect(connection.source).toBe('live');
    expect(connection.problem).toBeNull();
    expect(connection.hello?.driver).toBe('bridge');
    connection.stop();
  });

  it('explains a plain ws address on the https site and runs the simulation', async () => {
    const { connection } = make('https://sol.swimmingbrain.dev/?pi=ws://192.168.1.40:8080');
    await connection.init();
    await settle();
    expect(FakeSocket.all).toHaveLength(0);
    expect(connection.problem).toBe('mixed');
    expect(connection.host).toBe('192.168.1.40:8080');
    expect(connection.source).toBe('sim');
    connection.stop();
  });

  it('resolves a command with its ack, and with timeout or offline otherwise', async () => {
    const { connection } = make('https://sol.swimmingbrain.dev/?pi=pi.example.org');
    expect(await connection.send({ op: 'ping' })).toMatchObject({ ok: false, err: 'offline' });
    await connection.init();
    last().open();
    last().receive(HELLO);
    const answer = connection.send({ op: 'mode', mode: 'hold' });
    const sent = last().sent.pop() as { id: string; op: string };
    expect(sent).toMatchObject({ t: 'cmd', op: 'mode', mode: 'hold' });
    last().receive({ t: 'ack', id: sent.id, ok: true });
    expect(await answer).toEqual({ t: 'ack', id: sent.id, ok: true });
    const lost = connection.send({ op: 'stop' });
    vi.advanceTimersByTime(5000);
    expect(await lost).toMatchObject({ ok: false, err: 'timeout' });
    connection.stop();
  });

  it('waits 20 s for a calibration step, the pi answers once the step is done', async () => {
    const { connection } = make('https://sol.swimmingbrain.dev/?pi=pi.example.org');
    await connection.init();
    last().open();
    last().receive(HELLO);
    // the tracker keeps talking meanwhile, the link stays up
    const wait = (ms: number) => {
      for (let t = 0; t < ms; t += 1000) {
        vi.advanceTimersByTime(Math.min(1000, ms - t));
        last().receive({ t: 'evt', ts: 0, lvl: 'info', msg: 'still here' });
      }
    };
    let ack: unknown = null;
    void connection.send({ op: 'calib', step: 'polarity' }).then((a) => (ack = a));
    const sent = last().sent.pop() as { id: string };
    wait(6000);
    await settle();
    expect(ack).toBeNull();
    last().receive({ t: 'ack', id: sent.id, ok: true, data: { sx: 1, sy: -1, dx: -0.1, dy: 0.1 } });
    await settle();
    expect(ack).toMatchObject({ ok: true, data: { sx: 1, sy: -1 } });
    let slow: unknown = null;
    void connection.send({ op: 'calib', step: 'dark' }).then((a) => (slow = a));
    wait(19_999);
    await settle();
    expect(slow).toBeNull();
    wait(1);
    await settle();
    expect(slow).toMatchObject({ ok: false, err: 'timeout' });
    // anything else still gives up after 5 s
    let quick: unknown = null;
    void connection.send({ op: 'stop' }).then((a) => (quick = a));
    wait(5000);
    await settle();
    expect(quick).toMatchObject({ ok: false, err: 'timeout' });
    connection.stop();
  });

  it('unlocks the simulation without a real pin and locks again', async () => {
    const { connection } = make('https://sol.swimmingbrain.dev/');
    await connection.init();
    await settle();
    const result = connection.auth('');
    await settle();
    expect(await result).toEqual({ ok: true });
    expect(connection.admin).toBe(true);
    connection.logout();
    expect(connection.admin).toBe(false);
    connection.stop();
  });

  it('keeps the live tracker after a drop and reports reconnecting', async () => {
    const { connection } = make('https://sol.swimmingbrain.dev/?pi=pi.example.org');
    await connection.init();
    last().open();
    last().receive(HELLO);
    last().onclose?.({ code: 1006 });
    expect(connection.source).toBe('live');
    expect(connection.status).toBe('reconnecting');
    connection.stop();
  });

  it('hands out the token of a live tracker only while its tools are open', async () => {
    const { connection } = make('https://sol.swimmingbrain.dev/?pi=pi.example.org', { pi: 'tunnel.example.org' });
    await connection.init();
    expect(connection.defaultAddress).toBe('tunnel.example.org');
    last().open();
    last().receive(HELLO);
    expect(connection.token).toBeNull();
    const result = connection.auth('2468');
    last().receive({ t: 'auth', ok: true, token: 'tok', exp: Date.now() / 1000 + 3600 });
    await result;
    expect(connection.token).toBe('tok');
    connection.logout();
    expect(connection.token).toBeNull();
    connection.stop();
  });

  it('gives no token in the simulation and an empty default without config.json', async () => {
    const { connection } = make('https://sol.swimmingbrain.dev/', null);
    expect(connection.defaultAddress).toBeUndefined();
    await connection.init();
    await settle();
    expect(connection.defaultAddress).toBe('');
    await connection.auth('');
    expect(connection.admin).toBe(true);
    expect(connection.token).toBeNull();
    connection.stop();
  });

  it('remembers a wrong pin lockout from the tracker', async () => {
    const { connection } = make('https://sol.swimmingbrain.dev/?pi=pi.example.org');
    await connection.init();
    last().open();
    last().receive(HELLO);
    const result = connection.auth('0000');
    last().receive({ t: 'auth', ok: false, err: 'pin', wait: 30 });
    expect(await result).toEqual({ ok: false, err: 'pin', wait: 30 });
    expect(connection.lockedUntil).toBeGreaterThan(Date.now() + 29000);
    connection.stop();
  });

  it('starts over when the page comes back after a stop', async () => {
    const { connection } = make('https://sol.swimmingbrain.dev/');
    await connection.init();
    await settle();
    connection.stop();
    expect(connection.status).toBe('closed');
    await connection.init();
    await settle();
    expect(connection.status).toBe('open');
    expect(connection.hello?.driver).toBe('sim');
    connection.stop();
  });

  it('passes frames on to telemetry', async () => {
    const { connection } = make('https://sol.swimmingbrain.dev/?pi=pi.example.org');
    await connection.init();
    last().open();
    last().receive(HELLO);
    last().receive({ t: 's', ts: 1, mode: 'auto', st: 'locked', pan: 12.5, tilt: 40, vp: 0, vt: 0, ldr: [1, 1, 1, 1], raw: [1, 1, 1, 1], ex: 0, ey: 0, lvl: 1, lux: 900, pmw: 13, pv: null, gain: 1.4, off: 0.5, tgt: null, sun: null, sim: null });
    expect(telemetry.frame?.pan).toBe(12.5);
    connection.stop();
  });
});
