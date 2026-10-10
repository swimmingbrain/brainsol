// the websocket to a real tracker. it keeps the connection up on its own:
// backoff between tries, a heartbeat that measures the round trip and notices a
// dead link, and the admin token sent again after every reconnect. nothing in
// here throws into the page, a failure only ever shows up as a status

import { parseServerMessage, type ClientMessage } from './protocol';
import { Emitter, type LinkStatus, type Listener, type Source, type Transport, type TransportEvents } from './transport';

// the parts of a WebSocket this uses, so a test can hand in its own
export interface SocketLike {
  readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface SocketOptions {
  createSocket?: (url: string) => SocketLike;
  // milliseconds between heartbeats
  heartbeat?: number;
  // no message for this long and the link counts as dead
  silence?: number;
  // a socket that is not open after this long is given up and tried again
  openTimeout?: number;
  // first and longest wait between tries
  backoffMin?: number;
  backoffMax?: number;
  now?: () => number;
  random?: () => number;
}

const OPEN = 1;
const HEARTBEAT_ID = 'hb';

export class SocketTransport implements Transport {
  readonly source: Source = 'live';
  status: LinkStatus = 'idle';

  private events = new Emitter<TransportEvents>();
  private socket: SocketLike | null = null;
  private wanted = false;
  private attempts = 0;
  private token: string | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private beat: ReturnType<typeof setInterval> | null = null;
  private opening: ReturnType<typeof setTimeout> | null = null;
  private lastHeard = 0;
  private pings = new Map<string, number>();
  private pingCount = 0;
  private everOpen = false;
  private options: Required<SocketOptions>;

  constructor(
    readonly url: string,
    options: SocketOptions = {}
  ) {
    this.options = {
      createSocket: options.createSocket ?? ((target) => new WebSocket(target) as unknown as SocketLike),
      heartbeat: options.heartbeat ?? 2000,
      silence: options.silence ?? 6000,
      openTimeout: options.openTimeout ?? 5000,
      backoffMin: options.backoffMin ?? 500,
      backoffMax: options.backoffMax ?? 10000,
      now: options.now ?? (() => performance.now()),
      random: options.random ?? Math.random
    };
  }

  on<K extends keyof TransportEvents>(type: K, listener: Listener<TransportEvents[K]>): () => void {
    return this.events.on(type, listener);
  }

  connect(): void {
    if (this.wanted) return;
    this.wanted = true;
    this.attempts = 0;
    this.open();
  }

  close(): void {
    this.wanted = false;
    this.clearTimers();
    this.drop();
    this.setStatus('closed');
  }

  reconnect(): void {
    if (!this.wanted) return this.connect();
    this.clearTimers();
    this.drop();
    this.attempts = 0;
    this.open();
  }

  send(message: ClientMessage): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== OPEN) return false;
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  private setStatus(status: LinkStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.events.emit('status', status);
  }

  private open(): void {
    this.setStatus(this.everOpen ? 'reconnecting' : 'connecting');
    let socket: SocketLike;
    try {
      socket = this.options.createSocket(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.socket = socket;
    this.opening = setTimeout(() => {
      // a host that swallows the packets can keep a socket connecting for minutes
      if (this.socket === socket && socket.readyState !== OPEN) this.lost(socket);
    }, this.options.openTimeout);
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.clearOpening();
      this.everOpen = true;
      this.lastHeard = this.options.now();
      this.setStatus('open');
      this.startHeartbeat();
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      this.lastHeard = this.options.now();
      this.receive(event.data);
    };
    socket.onclose = () => {
      if (this.socket === socket) this.lost(socket);
    };
    // a close always follows an error, that is where it is handled
    socket.onerror = () => {};
  }

  private receive(data: unknown): void {
    const message = parseServerMessage(data);
    if (!message) return;
    // a tracker that answers is a tracker worth coming back to quickly
    this.attempts = 0;
    if (message.t === 'ack' && message.id.startsWith(HEARTBEAT_ID)) {
      const sent = this.pings.get(message.id);
      this.pings.delete(message.id);
      if (sent !== undefined) this.events.emit('latency', Math.max(0, this.options.now() - sent));
      return;
    }
    this.events.emit('message', message);
    if (message.t === 'hello' && this.token) this.send({ t: 'auth', token: this.token });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.beat = setInterval(() => {
      const socket = this.socket;
      if (!socket) return;
      if (this.options.now() - this.lastHeard > this.options.silence) {
        this.lost(socket);
        return;
      }
      const id = `${HEARTBEAT_ID}${++this.pingCount}`;
      // answers that never came are forgotten after a while
      if (this.pings.size > 10) this.pings.clear();
      this.pings.set(id, this.options.now());
      this.send({ t: 'cmd', id, op: 'ping' });
    }, this.options.heartbeat);
  }

  private stopHeartbeat(): void {
    if (this.beat) clearInterval(this.beat);
    this.beat = null;
    this.pings.clear();
  }

  private clearOpening(): void {
    if (this.opening) clearTimeout(this.opening);
    this.opening = null;
  }

  private clearTimers(): void {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.clearOpening();
    this.stopHeartbeat();
  }

  private drop(): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    try {
      socket.close();
    } catch {}
  }

  private lost(socket: SocketLike): void {
    if (this.socket !== socket) return;
    this.clearTimers();
    this.drop();
    if (this.wanted) this.scheduleRetry();
    else this.setStatus('closed');
  }

  private scheduleRetry(): void {
    this.setStatus(this.everOpen ? 'reconnecting' : 'connecting');
    if (this.retry) clearTimeout(this.retry);
    const { backoffMin, backoffMax, random } = this.options;
    // the jitter keeps a room full of phones from knocking at the same moment
    const delay = Math.min(backoffMax, backoffMin * 2 ** this.attempts) * (0.8 + 0.4 * random());
    this.attempts += 1;
    this.retry = setTimeout(() => {
      this.retry = null;
      if (this.wanted) this.open();
    }, delay);
  }
}
