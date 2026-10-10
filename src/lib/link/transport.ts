// one shape for both ways to reach a tracker: the socket to a pi and the
// simulation in this browser. the stores only ever talk to a Transport

import type { ClientMessage, ServerMessage } from './protocol';

export type Source = 'live' | 'sim';

// idle before the first connect, reconnecting after a drop while it tries again
export type LinkStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface TransportEvents {
  // every message from the tracker, already parsed
  message: ServerMessage;
  status: LinkStatus;
  // round trip of the heartbeat in milliseconds, the socket only
  latency: number;
}

export type Listener<T> = (value: T) => void;

export interface Transport {
  readonly source: Source;
  readonly status: LinkStatus;
  // starts connecting, and keeps reconnecting until close
  connect(): void;
  close(): void;
  // drops the connection and opens a fresh one, the tracker sees a new client
  reconnect(): void;
  // false when the message could not go out, it never throws
  send(message: ClientMessage): boolean;
  // after every (re)connect the transport sends this token before anything else
  setToken(token: string | null): void;
  on<K extends keyof TransportEvents>(type: K, listener: Listener<TransportEvents[K]>): () => void;
}

// the simulation engine behind SimTransport, see the comment at the top of
// $lib/sim/engine.ts for what each call has to do
export interface SimEngine {
  start(emit: (message: ServerMessage) => void): void;
  stop(): void;
  handle(message: ClientMessage): void;
}

// a listener that throws must not take the link down with it
export class Emitter<Events extends object> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(type: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as Listener<never>);
    return () => {
      set.delete(listener as Listener<never>);
    };
  }

  emit<K extends keyof Events>(type: K, value: Events[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        (listener as Listener<Events[K]>)(value);
      } catch (error) {
        console.error(`brainsol: a ${String(type)} listener failed`, error);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
