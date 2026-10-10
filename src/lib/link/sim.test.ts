import { describe, expect, it } from 'vitest';
import { SimTransport } from './sim';
import type { ClientMessage, ServerMessage } from './protocol';
import type { LinkStatus, SimEngine } from './transport';

// an engine that says hello and echoes every command with an ack
class EchoEngine implements SimEngine {
  emit: ((message: ServerMessage) => void) | null = null;
  handled: ClientMessage[] = [];
  starts = 0;
  stops = 0;

  start(emit: (message: ServerMessage) => void) {
    this.starts++;
    this.emit = emit;
    emit({ t: 'hello' } as ServerMessage);
  }

  stop() {
    this.stops++;
    this.emit = null;
  }

  handle(message: ClientMessage) {
    this.handled.push(message);
    if (message.t === 'cmd') this.emit?.({ t: 'ack', id: message.id, ok: true });
  }
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function make() {
  const engine = new EchoEngine();
  const transport = new SimTransport(() => engine);
  const statuses: LinkStatus[] = [];
  const messages: ServerMessage[] = [];
  transport.on('status', (s) => statuses.push(s));
  transport.on('message', (m) => messages.push(m));
  return { engine, transport, statuses, messages };
}

describe('the simulation transport', () => {
  it('opens a moment after connect and passes the hello on', async () => {
    const { transport, statuses, messages } = make();
    transport.connect();
    expect(transport.status).toBe('connecting');
    await settle();
    expect(statuses).toEqual(['connecting', 'open']);
    expect(messages.map((m) => m.t)).toEqual(['hello']);
  });

  it('hands messages to the engine after a microtask and passes the answer on', async () => {
    const { transport, engine, messages } = make();
    expect(transport.send({ t: 'cmd', id: 'x', op: 'ping' })).toBe(false);
    transport.connect();
    await settle();
    expect(transport.send({ t: 'cmd', id: 'a', op: 'ping' })).toBe(true);
    expect(engine.handled).toEqual([]);
    await settle();
    expect(engine.handled).toEqual([{ t: 'cmd', id: 'a', op: 'ping' }]);
    expect(messages.pop()).toEqual({ t: 'ack', id: 'a', ok: true });
  });

  it('sends the token after hello on a reconnect and keeps the same engine', async () => {
    const { transport, engine } = make();
    transport.connect();
    await settle();
    transport.setToken('sim123');
    transport.reconnect();
    await settle();
    expect(engine.starts).toBe(2);
    expect(engine.stops).toBe(1);
    expect(engine.handled).toEqual([{ t: 'auth', token: 'sim123' }]);
  });

  it('stops the engine on close and refuses to send', async () => {
    const { transport, engine, statuses } = make();
    transport.connect();
    await settle();
    transport.close();
    expect(engine.stops).toBe(1);
    expect(statuses.pop()).toBe('closed');
    expect(transport.send({ t: 'cmd', id: 'a', op: 'ping' })).toBe(false);
  });

  it('drops a message that was on its way when the session ended', async () => {
    const { transport, engine } = make();
    transport.connect();
    await settle();
    transport.send({ t: 'cmd', id: 'late', op: 'ping' });
    transport.close();
    await settle();
    expect(engine.handled).toEqual([]);
  });
});
