// how a tracker address turns into a socket url and an api base, and where the
// address comes from. pure functions, the connection store feeds them

import { DEFAULT_PORT } from './protocol';

export interface Resolved {
  // the websocket url, always ending in /ws
  ws: string;
  // the base for /api/*, same host and port over http or https
  http: string;
  // host and port as people read them, for the status bar
  label: string;
}

// empty: nothing given. invalid: not an address. mixed: a plain ws:// address on
// an https page, which the browser blocks
export type AddressProblem = 'empty' | 'invalid' | 'mixed';

export type AddressResult = { ok: true; value: Resolved } | { ok: false; problem: AddressProblem };

export interface PageLocation {
  protocol: string;
  host: string;
}

// these two words stand for no tracker and for the server that serves the page
export const SIM_WORD = 'sim';
export const SELF_WORD = 'self';

// a browser lets an https page reach these over plain ws
const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i;

const SCHEMES: Record<string, 'ws' | 'wss'> = { 'ws:': 'ws', 'wss:': 'wss', 'http:': 'ws', 'https:': 'wss' };

export function isSim(input: string | null | undefined): boolean {
  const text = (input ?? '').trim().toLowerCase();
  return text === '' || text === SIM_WORD;
}

// an address without a scheme gets wss on an https page and ws otherwise.
// a plain ws address without a port gets 8080, the tracker's port. a secure one
// keeps 443, that is what a tunnel listens on
export function resolveAddress(input: string, page: PageLocation): AddressResult {
  let text = input.trim();
  if (text === '' || text.toLowerCase() === SIM_WORD) return { ok: false, problem: 'empty' };
  const secure = page.protocol === 'https:';
  if (text.toLowerCase() === SELF_WORD) text = `${secure ? 'https' : 'http'}://${page.host}`;

  let scheme: 'ws' | 'wss';
  let rest: string;
  const match = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(text);
  if (match) {
    const known = SCHEMES[`${match[1].toLowerCase()}:`];
    if (!known) return { ok: false, problem: 'invalid' };
    scheme = known;
    rest = match[2];
  } else {
    scheme = secure ? 'wss' : 'ws';
    rest = text;
  }

  let url: URL;
  try {
    url = new URL(`${scheme === 'wss' ? 'https' : 'http'}://${rest}`);
  } catch {
    return { ok: false, problem: 'invalid' };
  }
  if (!url.hostname || /\s/.test(rest) || url.username || url.password) return { ok: false, problem: 'invalid' };

  if (scheme === 'ws' && secure && !LOOPBACK.test(url.hostname)) return { ok: false, problem: 'mixed' };

  const port = url.port || (scheme === 'ws' ? String(DEFAULT_PORT) : '');
  const host = port ? `${url.hostname}:${port}` : url.hostname;
  // a path in front of /ws stays, for a tracker behind a proxy that adds one
  const base = url.pathname.replace(/\/+$/, '').replace(/\/ws$/, '');
  return {
    ok: true,
    value: {
      ws: `${scheme}://${host}${base}/ws`,
      http: `${scheme === 'wss' ? 'https' : 'http'}://${host}${base}`,
      label: host
    }
  };
}

// host and port out of whatever was typed, for messages about an address that
// did not resolve
export function hostOf(input: string): string {
  return input
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/[/?#].*$/, '');
}

export type AddressOrigin = 'query' | 'saved' | 'config';

// ?pi= in the page address wins, then an address saved in this browser, then
// config.json. sim in any of them asks for the simulation
export function pickAddress(sources: { query: string | null; saved: string | null; config: string | null }): {
  address: string | null;
  from: AddressOrigin | null;
} {
  const order: [AddressOrigin, string | null][] = [
    ['query', sources.query],
    ['saved', sources.saved],
    ['config', sources.config]
  ];
  for (const [from, value] of order) {
    if (value === null) continue;
    const text = value.trim();
    // an empty ?pi= is a wish too: the simulation for this visit
    if (text === '' && from !== 'query') continue;
    return { address: isSim(text) ? null : text, from };
  }
  return { address: null, from: null };
}
