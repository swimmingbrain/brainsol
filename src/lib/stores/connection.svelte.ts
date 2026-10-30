// how the page reaches a tracker. it picks the address (?pi=, a saved one,
// config.json), keeps a socket to it and falls back to the simulation in this
// browser while the tracker does not answer. a tracker that turns up later
// takes over. everything the tracker sends goes into telemetry and history

import { hostOf, isSim, pickAddress, resolveAddress, type AddressOrigin, type AddressProblem } from '$lib/link/address';
import { SimTransport } from '$lib/link/sim';
import { SocketTransport, type SocketLike } from '$lib/link/socket';
import type { LinkStatus, SimEngine, Source, Transport } from '$lib/link/transport';
import type { AckMessage, AuthMessage, Caps, CmdMessage, Command, Config, HelloMessage, HistoryResponse, ServerMessage } from '$lib/link/protocol';
import { createEngine } from '$lib/sim/engine';
import { t } from '$lib/i18n';
import { history, HISTORY_SECONDS } from './history.svelte';
import { preferences } from './preferences.svelte';
import { telemetry } from './telemetry.svelte';
import { toast } from './toasts.svelte';

// how long the page waits for a tracker before the simulation steps in
export const FALLBACK_AFTER = 4000;
// how long a command or an auth may take before it counts as lost
export const ANSWER_TIMEOUT = 5000;
// a pi answers a calibration step only once it is done, the direction test
// alone turns the head for about 6 s, so these may take longer
export const CALIB_TIMEOUT = 20000;
// the admin token of the live tracker survives a reload of the tab, not a new tab
const TOKEN_KEY = 'brainsol-admin';

// why the simulation runs although an address was given
export type Problem = Exclude<AddressProblem, 'empty'> | 'unreachable';

export interface AuthResult {
  ok: boolean;
  err?: string;
  // seconds until the pin may be tried again
  wait?: number;
}

export interface ConnectionOptions {
  createSocket?: (url: string) => SocketLike;
  createEngine?: () => SimEngine;
  fetch?: typeof fetch;
  // where the page itself was loaded from
  page?: () => { href: string; protocol: string; host: string };
}

interface Pending {
  resolve: (ack: AckMessage) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class Connection {
  // live while a tracker answers, sim while the simulation runs in this tab
  source = $state<Source>('sim');
  status = $state<LinkStatus>('idle');
  // the tracker address as it was given, and host and port as people read them
  address = $state<string | null>(null);
  host = $state<string | null>(null);
  from = $state<AddressOrigin | null>(null);
  problem = $state<Problem | null>(null);
  // round trip of the heartbeat in milliseconds, live only
  latency = $state<number | null>(null);
  hello = $state.raw<HelloMessage | null>(null);
  // the config of the hello, replaced by every cfg push
  config = $state.raw<Config | null>(null);
  admin = $state(false);
  // after too many wrong pins: the time (Date.now) the next try is allowed
  lockedUntil = $state(0);
  // the http base of the live tracker for /api/*, null in the simulation
  api: string | null = null;

  private live: SocketTransport | null = null;
  private sim: SimTransport | null = null;
  private active: Transport | null = null;
  private liveSeen = false;
  private wasOpen = false;
  private fallback: ReturnType<typeof setTimeout> | null = null;
  private pending = new Map<string, Pending>();
  private authWaiters: ((result: AuthResult) => void)[] = [];
  private seq = 0;
  private started = false;
  private options: ConnectionOptions;

  constructor(options: ConnectionOptions = {}) {
    this.options = options;
  }

  get caps(): Caps | null {
    return this.hello?.caps ?? null;
  }

  get transport(): Transport | null {
    return this.active;
  }

  // reads config.json and the address, then connects or starts the simulation
  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const page = this.page();
    const config = await this.loadConfig();
    const query = new URL(page.href).searchParams.get('pi');
    const pick = pickAddress({ query, saved: preferences.address || null, config });
    if (pick.address) this.connect(pick.address);
    else this.startSim();
    this.from = pick.from;
  }

  // a tracker address, as typed. save keeps it in this browser for next time
  connect(address: string, options: { save?: boolean } = {}): void {
    this.started = true;
    if (options.save) preferences.setAddress(address);
    if (isSim(address)) {
      this.useSim();
      return;
    }
    this.closeLive();
    this.from = options.save ? 'saved' : this.from;
    this.address = address.trim();
    const result = resolveAddress(address, this.page());
    if (!result.ok) {
      const host = hostOf(address);
      this.problem = result.problem === 'empty' ? null : result.problem;
      this.host = host;
      this.api = null;
      if (result.problem === 'mixed') toast(t('link.mixed', { host }), 'warning', 15000);
      if (result.problem === 'invalid') toast(t('link.invalid', { host }), 'error', 6000);
      this.startSim();
      return;
    }

    this.problem = null;
    this.host = result.value.label;
    this.api = result.value.http;
    this.liveSeen = false;
    this.wasOpen = false;
    const live = new SocketTransport(result.value.ws, { createSocket: this.options.createSocket });
    this.live = live;
    live.setToken(this.storedToken(result.value.ws));
    live.on('message', (message) => this.fromLive(live, message));
    live.on('status', (status) => this.liveStatus(live, status));
    live.on('latency', (ms) => {
      if (this.active === live) this.latency = Math.round(ms);
    });
    // nothing runs yet, the page says it is connecting
    if (!this.active) {
      this.source = 'live';
      this.status = 'connecting';
    }
    live.connect();
    const host = this.host;
    this.fallback = setTimeout(() => {
      this.fallback = null;
      if (this.live !== live || this.liveSeen) return;
      this.problem = 'unreachable';
      toast(t('link.unreachable', { host }), 'warning', 6000);
      this.startSim();
    }, FALLBACK_AFTER);
  }

  // the simulation, on purpose. save keeps that choice in this browser
  useSim(options: { save?: boolean } = {}): void {
    this.started = true;
    if (options.save) preferences.setAddress('sim');
    this.closeLive();
    this.address = null;
    this.host = null;
    this.api = null;
    this.problem = null;
    this.startSim();
  }

  // a command to the tracker. the promise always resolves, with the ack or
  // with ok false and err timeout or offline
  send(command: Command): Promise<AckMessage> {
    const id = `c${++this.seq}`;
    const offline: AckMessage = { t: 'ack', id, ok: false, err: 'offline' };
    const transport = this.active;
    if (!transport || transport.status !== 'open') return Promise.resolve(offline);
    return new Promise((resolve) => {
      const timer = setTimeout(
        () => {
          this.pending.delete(id);
          resolve({ t: 'ack', id, ok: false, err: 'timeout' });
        },
        command.op === 'calib' ? CALIB_TIMEOUT : ANSWER_TIMEOUT
      );
      this.pending.set(id, { resolve, timer });
      if (!transport.send({ ...command, t: 'cmd', id } as CmdMessage)) {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve(offline);
      }
    });
  }

  // asks for admin rights. the simulation takes any pin, a pi checks it
  auth(pin: string): Promise<AuthResult> {
    const transport = this.active;
    if (!transport || transport.status !== 'open') return Promise.resolve({ ok: false, err: 'offline' });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.authWaiters = this.authWaiters.filter((waiter) => waiter !== done);
        resolve({ ok: false, err: 'timeout' });
      }, ANSWER_TIMEOUT);
      const done = (result: AuthResult) => {
        clearTimeout(timer);
        resolve(result);
      };
      this.authWaiters.push(done);
      if (!transport.send({ t: 'auth', pin })) {
        this.authWaiters = this.authWaiters.filter((waiter) => waiter !== done);
        done({ ok: false, err: 'offline' });
      }
    });
  }

  // gives the rights back. a fresh connection is a fresh viewer for the tracker
  logout(): void {
    this.admin = false;
    this.clearToken();
    this.flushPending();
    const transport = this.active;
    if (!transport) return;
    transport.setToken(null);
    transport.reconnect();
  }

  // json from the live tracker's /api/*, null in the simulation or on any failure
  async fetchApi<T>(path: string): Promise<T | null> {
    if (this.source !== 'live' || !this.api) return null;
    const get = this.options.fetch ?? fetch;
    try {
      const response = await get(`${this.api}${path}`, { cache: 'no-store' });
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  // closes everything, for tests and for a page that goes away. a later init starts over
  stop(): void {
    this.started = false;
    this.closeLive();
    this.sim?.close();
    this.active = null;
    this.flushPending();
    this.status = 'closed';
  }

  private page() {
    return this.options.page?.() ?? { href: location.href, protocol: location.protocol, host: location.host };
  }

  private async loadConfig(): Promise<string | null> {
    const get = this.options.fetch ?? fetch;
    try {
      const response = await get('/config.json', { cache: 'no-store' });
      if (!response.ok) return null;
      const value = (await response.json()) as { pi?: unknown };
      return typeof value?.pi === 'string' ? value.pi : null;
    } catch {
      return null;
    }
  }

  private startSim(): void {
    if (this.sim && this.active === this.sim && this.sim.status !== 'closed') return;
    if (!this.sim) {
      const sim = new SimTransport(this.options.createEngine ?? (() => createEngine()));
      sim.on('message', (message) => {
        if (this.active === sim) this.handle(message);
      });
      sim.on('status', (status) => {
        if (this.active === sim) this.status = status;
      });
      this.sim = sim;
    }
    this.switchTo(this.sim);
    this.sim.setToken(null);
    this.sim.connect();
  }

  private switchTo(transport: Transport): void {
    if (this.active && this.active !== transport && this.active === this.sim) this.sim.close();
    this.flushPending();
    this.active = transport;
    this.source = transport.source;
    this.status = transport.status;
    this.latency = null;
    this.admin = false;
    this.lockedUntil = 0;
    this.hello = null;
    this.config = null;
    telemetry.reset();
    history.clear();
  }

  private fromLive(live: SocketTransport, message: ServerMessage): void {
    if (live !== this.live) return;
    if (message.t === 'hello') {
      this.liveSeen = true;
      if (this.fallback) clearTimeout(this.fallback);
      this.fallback = null;
      if (this.active !== live) {
        const fromSim = this.active === this.sim;
        this.switchTo(live);
        this.wasOpen = live.status === 'open';
        this.problem = null;
        if (fromSim) toast(t('link.found'), 'success', 4000);
        void this.prefill(live);
      }
    }
    if (this.active === live) this.handle(message);
  }

  private liveStatus(live: SocketTransport, status: LinkStatus): void {
    if (live !== this.live || this.active !== live) return;
    if (status === 'reconnecting' && this.wasOpen) {
      this.latency = null;
      toast(t('link.lost'), 'warning', 4000);
    }
    if (status === 'open' && this.wasOpen && this.status === 'reconnecting') toast(t('link.back'), 'success', 3000);
    if (status === 'open') this.wasOpen = true;
    this.status = status;
  }

  private async prefill(live: SocketTransport): Promise<void> {
    const data = await this.fetchApi<HistoryResponse>(`/api/history?span=${HISTORY_SECONDS}`);
    if (data && this.active === live) history.prefill(data);
  }

  private handle(message: ServerMessage): void {
    switch (message.t) {
      case 'hello':
        this.hello = message;
        this.config = message.cfg;
        if (message.admin) this.admin = true;
        break;
      case 'cfg':
        this.config = message.cfg;
        break;
      case 'ack': {
        const pending = this.pending.get(message.id);
        if (!pending) break;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        pending.resolve(message);
        break;
      }
      case 'auth':
        this.onAuth(message);
        break;
      case 's':
        telemetry.ingest(message);
        history.push(message);
        break;
      default:
        telemetry.ingest(message);
    }
  }

  private onAuth(message: AuthMessage): void {
    const waiters = this.authWaiters;
    this.authWaiters = [];
    if (message.ok) {
      this.admin = true;
      this.lockedUntil = 0;
      this.active?.setToken(message.token);
      if (this.active && this.active === this.live) this.storeToken(this.live.url, message.token, message.exp);
    } else {
      const wasAdmin = this.admin;
      this.admin = false;
      if (message.wait > 0) this.lockedUntil = Date.now() + message.wait * 1000;
      // nobody asked: the token the transport sent after a reconnect was refused
      if (waiters.length === 0) {
        this.active?.setToken(null);
        this.clearToken();
        if (wasAdmin) toast(t('err.token'), 'warning', 5000);
      }
    }
    const result: AuthResult = message.ok ? { ok: true } : { ok: false, err: message.err, wait: message.wait };
    for (const waiter of waiters) waiter(result);
  }

  private flushPending(): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve({ t: 'ack', id, ok: false, err: 'offline' });
    }
    this.pending.clear();
    const waiters = this.authWaiters;
    this.authWaiters = [];
    for (const waiter of waiters) waiter({ ok: false, err: 'offline' });
  }

  private closeLive(): void {
    if (this.fallback) clearTimeout(this.fallback);
    this.fallback = null;
    if (!this.live) return;
    const live = this.live;
    this.live = null;
    live.close();
    if (this.active === live) {
      this.active = null;
      this.flushPending();
    }
  }

  private storedToken(ws: string): string | null {
    try {
      const value = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as { ws?: string; token?: string; exp?: number } | null;
      if (value?.ws === ws && typeof value.token === 'string' && (value.exp ?? 0) * 1000 > Date.now()) return value.token;
    } catch {}
    return null;
  }

  private storeToken(ws: string, token: string, exp: number): void {
    try {
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ ws, token, exp }));
    } catch {}
  }

  private clearToken(): void {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {}
  }
}

export const connection = new Connection();
