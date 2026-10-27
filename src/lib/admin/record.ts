// the download of the current recording: /api/record.csv?token= on the http
// base of the live tracker. the connection store keeps the admin token of a
// live tracker in session storage and does not hand it out, so this reads it
// from there under the same key and checks it belongs to this tracker

// the key connection.svelte.ts stores the token under
export const TOKEN_KEY = 'brainsol-admin';

// the socket url the store saved the token with, from the http base
export function socketOf(api: string): string {
  return `${api.replace(/^http/, 'ws')}/ws`;
}

export function storedToken(api: string | null, storage: Pick<Storage, 'getItem'> | null, now = Date.now()): string | null {
  if (!api || !storage) return null;
  try {
    const value = JSON.parse(storage.getItem(TOKEN_KEY) ?? 'null') as { ws?: unknown; token?: unknown; exp?: unknown } | null;
    if (!value || value.ws !== socketOf(api) || typeof value.token !== 'string' || !value.token) return null;
    if (typeof value.exp === 'number' && value.exp * 1000 <= now) return null;
    return value.token;
  } catch {
    return null;
  }
}

export function recordUrl(api: string, token: string): string {
  return `${api.replace(/\/+$/, '')}/api/record.csv?token=${encodeURIComponent(token)}`;
}
