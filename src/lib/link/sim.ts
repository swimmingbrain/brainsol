// the simulation as a transport. the engine from $lib/sim runs in this tab and
// answers exactly like a pi, so everything above this line works the same.
// messages to the engine wait for a microtask, the way a network would make them

import type { ClientMessage, ServerMessage } from './protocol';
import { Emitter, type LinkStatus, type Listener, type SimEngine, type Source, type Transport, type TransportEvents } from './transport';

export class SimTransport implements Transport {
  readonly source: Source = 'sim';
  status: LinkStatus = 'idle';

  private events = new Emitter<TransportEvents>();
  private engine: SimEngine | null = null;
  private token: string | null = null;
  private session = 0;

  constructor(private create: () => SimEngine) {}

  on<K extends keyof TransportEvents>(type: K, listener: Listener<TransportEvents[K]>): () => void {
    return this.events.on(type, listener);
  }

  connect(): void {
    if (this.status === 'open' || this.status === 'connecting') return;
    this.begin();
  }

  close(): void {
    this.session++;
    this.engine?.stop();
    this.setStatus('closed');
  }

  reconnect(): void {
    this.session++;
    this.engine?.stop();
    this.begin();
  }

  send(message: ClientMessage): boolean {
    const engine = this.engine;
    if (this.status !== 'open' || !engine) return false;
    const session = this.session;
    queueMicrotask(() => {
      if (session === this.session) engine.handle(message);
    });
    return true;
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  private begin(): void {
    const session = ++this.session;
    this.setStatus('connecting');
    queueMicrotask(() => {
      if (session !== this.session) return;
      try {
        this.engine ??= this.create();
        this.setStatus('open');
        this.engine.start((message) => this.receive(message, session));
      } catch (error) {
        console.error('brainsol: the simulation did not start', error);
        this.setStatus('closed');
      }
    });
  }

  private receive(message: ServerMessage, session: number): void {
    if (session !== this.session) return;
    this.events.emit('message', message);
    if (message.t === 'hello' && this.token) this.send({ t: 'auth', token: this.token });
  }

  private setStatus(status: LinkStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.events.emit('status', status);
  }
}
