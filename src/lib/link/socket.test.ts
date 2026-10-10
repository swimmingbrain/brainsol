import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SocketTransport, type SocketLike } from './socket';
import type { LinkStatus } from './transport';

// a websocket the test plays the tracker for
class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  closed = false;
  failSend = false;

  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }

  send(data: string) {
    if (this.failSend) throw new Error('the socket broke');
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.closed = true;
    this.readyState = 3;
  }

  open() {
    this.readyState = 1;
    this.onopen?.({});
  }

  receive(message: unknown) {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }

  drop() {
    this.readyState = 3;
    this.onclose?.({ code: 1006 });
  }
}

const HELLO = { t: 'hello', proto: 1, name: 'brainsol', version: '1.0.0', driver: 'bridge', caps: {}, admin: false, rate: 20, cfg: {} };
const last = () => FakeSocket.all[FakeSocket.all.length - 1];

function make(options = {}) {
  const transport = new SocketTransport('ws://pi.local:8080/ws', {
    createSocket: (url) => new FakeSocket(url),
    now: () => Date.now(),
    random: () => 0.5,
    ...options
  });
  const statuses: LinkStatus[] = [];
  const messages: { t: string }[] = [];
  const latencies: number[] = [];
  transport.on('status', (s) => statuses.push(s));
  transport.on('message', (m) => messages.push(m));
  transport.on('latency', (ms) => latencies.push(ms));
  return { transport, statuses, messages, latencies };
}

describe('the socket transport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.all = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects to the url and says so', () => {
    const { transport, statuses } = make();
    transport.connect();
    expect(last().url).toBe('ws://pi.local:8080/ws');
    expect(transport.status).toBe('connecting');
    last().open();
    expect(statuses).toEqual(['connecting', 'open']);
  });

  it('passes tracker messages on and drops what is not one', () => {
    const { transport, messages } = make();
    transport.connect();
    last().open();
    last().receive(HELLO);
    last().receive({ t: 's', pan: 1 });
    last().receive('not json');
    last().receive({ t: 'party' });
    last().receive([1, 2]);
    expect(messages.map((m) => m.t)).toEqual(['hello', 's']);
  });

  it('pings every two seconds and measures the round trip', () => {
    const { transport, latencies } = make();
    transport.connect();
    const ws = last();
    ws.open();
    vi.advanceTimersByTime(2000);
    expect(ws.sent).toEqual([{ t: 'cmd', id: 'hb1', op: 'ping' }]);
    vi.advanceTimersByTime(35);
    ws.receive({ t: 'ack', id: 'hb1', ok: true, data: { ts: 1 } });
    expect(latencies).toEqual([35]);
  });

  it('keeps its own heartbeat answers away from the page', () => {
    const { transport, messages } = make();
    transport.connect();
    last().open();
    vi.advanceTimersByTime(2000);
    last().receive({ t: 'ack', id: 'hb1', ok: true });
    last().receive({ t: 'ack', id: 'c1', ok: true });
    expect(messages).toEqual([{ t: 'ack', id: 'c1', ok: true }]);
  });

  it('tries again after a drop, waiting longer each time up to the cap', () => {
    const { transport, statuses } = make({ backoffMin: 500, backoffMax: 4000 });
    transport.connect();
    last().open();
    last().drop();
    expect(statuses).toEqual(['connecting', 'open', 'reconnecting']);
    expect(FakeSocket.all).toHaveLength(1);
    const waits = [500, 1000, 2000, 4000, 4000];
    for (const wait of waits) {
      const before = FakeSocket.all.length;
      vi.advanceTimersByTime(wait - 1);
      expect(FakeSocket.all).toHaveLength(before);
      vi.advanceTimersByTime(1);
      expect(FakeSocket.all).toHaveLength(before + 1);
      last().drop();
    }
  });

  it('starts over with short waits once the tracker answers again', () => {
    const { transport } = make({ backoffMin: 500 });
    transport.connect();
    last().drop();
    vi.advanceTimersByTime(500);
    last().drop();
    vi.advanceTimersByTime(1000);
    last().open();
    last().receive(HELLO);
    last().drop();
    const before = FakeSocket.all.length;
    vi.advanceTimersByTime(500);
    expect(FakeSocket.all).toHaveLength(before + 1);
  });

  it('gives a silent link up and reconnects', () => {
    const { transport, statuses } = make({ heartbeat: 2000, silence: 6000 });
    transport.connect();
    const ws = last();
    ws.open();
    vi.advanceTimersByTime(8000);
    expect(ws.closed).toBe(true);
    expect(statuses[statuses.length - 1]).toBe('reconnecting');
    vi.advanceTimersByTime(500);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('gives up on a socket that never opens and tries again', () => {
    const { transport } = make({ openTimeout: 5000 });
    transport.connect();
    const ws = last();
    vi.advanceTimersByTime(5000);
    expect(ws.closed).toBe(true);
    vi.advanceTimersByTime(500);
    expect(FakeSocket.all).toHaveLength(2);
    expect(transport.status).toBe('connecting');
  });

  it('sends the admin token again after every reconnect, right after hello', () => {
    const { transport } = make();
    transport.setToken('secret');
    transport.connect();
    last().open();
    last().receive(HELLO);
    expect(last().sent).toEqual([{ t: 'auth', token: 'secret' }]);
    last().drop();
    vi.advanceTimersByTime(500);
    last().open();
    expect(last().sent).toEqual([]);
    last().receive(HELLO);
    expect(last().sent).toEqual([{ t: 'auth', token: 'secret' }]);
    transport.setToken(null);
    transport.reconnect();
    last().open();
    last().receive(HELLO);
    expect(last().sent).toEqual([]);
  });

  it('reports false instead of throwing when a message cannot go out', () => {
    const { transport } = make();
    expect(transport.send({ t: 'cmd', id: 'a', op: 'ping' })).toBe(false);
    transport.connect();
    expect(transport.send({ t: 'cmd', id: 'b', op: 'ping' })).toBe(false);
    last().open();
    expect(transport.send({ t: 'cmd', id: 'c', op: 'ping' })).toBe(true);
    last().failSend = true;
    expect(transport.send({ t: 'cmd', id: 'd', op: 'ping' })).toBe(false);
  });

  it('retries when the socket cannot even be made', () => {
    let fail = true;
    const { transport } = make({
      createSocket: (url: string) => {
        if (fail) throw new Error('bad url');
        return new FakeSocket(url);
      }
    });
    expect(() => transport.connect()).not.toThrow();
    fail = false;
    vi.advanceTimersByTime(500);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('stays quiet after close', () => {
    const { transport, statuses } = make();
    transport.connect();
    last().open();
    transport.close();
    expect(last().closed).toBe(true);
    expect(statuses[statuses.length - 1]).toBe('closed');
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('keeps going when a listener throws', () => {
    const { transport, messages } = make();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    transport.on('message', () => {
      throw new Error('a broken panel');
    });
    transport.connect();
    last().open();
    last().receive(HELLO);
    last().receive({ t: 's' });
    expect(messages).toHaveLength(2);
    spy.mockRestore();
  });
});
