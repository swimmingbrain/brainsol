// the connection tab: what a typed address will do, the page the audience
// should open and a quick test whether a tracker answers there

import { DEFAULT_PORT, type InfoResponse } from '$lib/link/protocol';
import { isSim, resolveAddress, type PageLocation } from '$lib/link/address';

export type AddressCheck =
  | { kind: 'empty' }
  | { kind: 'sim' }
  | { kind: 'invalid' }
  // a plain ws address on an https page, the browser blocks it. page is the
  // address of the copy of the app the tracker serves itself, which works
  | { kind: 'mixed'; host: string; page: string }
  | { kind: 'ok'; ws: string; http: string; label: string };

// the page a tracker serves on its own http port, for a plain address
export function servedPage(input: string): string | null {
  const text = input.trim().replace(/^(ws|http):\/\//i, '');
  try {
    const url = new URL(`http://${text}`);
    if (!url.hostname) return null;
    return `http://${url.hostname}:${url.port || DEFAULT_PORT}/`;
  } catch {
    return null;
  }
}

export function checkAddress(input: string, page: PageLocation): AddressCheck {
  const text = input.trim();
  if (text === '') return { kind: 'empty' };
  if (isSim(text)) return { kind: 'sim' };
  const result = resolveAddress(text, page);
  if (result.ok) return { kind: 'ok', ...result.value };
  if (result.problem === 'mixed') {
    const served = servedPage(text);
    if (served) return { kind: 'mixed', host: new URL(served).host, page: served };
  }
  return { kind: 'invalid' };
}

// two ways to write the same tracker count as one: brainsol.local and
// ws://brainsol.local:8080 both end at the same socket
export function sameTracker(a: string | null | undefined, b: string | null | undefined, page: PageLocation): boolean {
  const left = (a ?? '').trim();
  const right = (b ?? '').trim();
  if (isSim(left) || isSim(right)) return isSim(left) && isSim(right);
  if (left.toLowerCase() === right.toLowerCase()) return true;
  const x = resolveAddress(left, page);
  const y = resolveAddress(right, page);
  return x.ok && y.ok && x.value.ws === y.value.ws;
}

// a query value people can still read: colons and slashes are fine in a query
function queryValue(text: string): string {
  return encodeURIComponent(text).replace(/%3A/gi, ':').replace(/%2F/gi, '/').replace(/%40/gi, '@');
}

// the address of the public page for the audience. it only carries ?pi= when
// the page would not end up at this tracker by itself, through the default
// address in config.json. null as address means the simulation
export function shareLink(origin: string, address: string | null, fallback: string | null, page: PageLocation): string {
  const base = `${origin.replace(/\/+$/, '')}/`;
  const want = address && !isSim(address) ? address.trim() : 'sim';
  if (sameTracker(want, fallback ?? '', page)) return base;
  return `${base}?pi=${queryValue(want)}`;
}

// people cannot open a page on localhost from their phones
export function isLocalPage(hostname: string): boolean {
  return /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|::1)$/i.test(hostname);
}

export type Probe = { ok: true; info: InfoResponse } | { ok: false; reason: 'timeout' | 'network' | 'answer' };

// asks /api/info whether a tracker answers, without switching to it
export async function probeTracker(http: string, get: typeof fetch = fetch, timeout = 4000): Promise<Probe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await get(`${http.replace(/\/+$/, '')}/api/info`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return { ok: false, reason: 'answer' };
    const info = (await response.json()) as Partial<InfoResponse> | null;
    if (!info || typeof info.name !== 'string' || typeof info.version !== 'string') return { ok: false, reason: 'answer' };
    return { ok: true, info: info as InfoResponse };
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
