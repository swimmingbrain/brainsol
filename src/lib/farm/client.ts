// talks to the recipe server (server/ in this repo, on the gpu server or
// anywhere with a hugging face token). never throws: every answer is either a
// checked recipe or a short error code the tab turns into a sentence

import { parseAsk, parseRecipe, type Ask, type Recipe } from './recipe';
import type { Lang } from '$lib/stores/preferences.svelte';

// bad: the server refused the words, llm: the model failed, timeout: too slow,
// offline: nothing answered, none: no recipe kept yet, invalid: an answer the page cannot read
export type RecipeError = 'bad' | 'llm' | 'timeout' | 'offline' | 'none' | 'invalid';

// a recipe, or a question back when the plant is not in the server's table
export type RecipeResult =
  | { ok: true; recipe: Recipe; ask?: undefined }
  | { ok: true; ask: Ask; recipe?: undefined }
  | { ok: false; err: RecipeError; msg?: string };

export interface ClientOptions {
  fetch?: typeof fetch;
  // the model is slow, a minute is not unusual on a busy gpu
  timeoutMs?: number;
}

export const PROMPT_MAX = 1000;
const TIMEOUT_MS = 70_000;
const KNOWN: RecipeError[] = ['bad', 'llm', 'timeout', 'none'];

// the base address as typed, with a scheme and without a trailing slash
export function brainBase(address: string): string {
  const text = address.trim().replace(/\/+$/, '');
  if (text === '') return '';
  if (/^https?:\/\//i.test(text)) return text;
  // an https page may only reach https, a local page usually talks to a local server
  const secure = typeof location !== 'undefined' && location.protocol === 'https:';
  return `${secure ? 'https' : 'http'}://${text}`;
}

async function call(url: string, init: RequestInit, options: ClientOptions): Promise<RecipeResult> {
  const get = options.fetch ?? fetch;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), options.timeoutMs ?? TIMEOUT_MS);
  let response: Response;
  try {
    response = await get(url, { ...init, cache: 'no-store', signal: abort.signal });
  } catch {
    return { ok: false, err: abort.signal.aborted ? 'timeout' : 'offline' };
  } finally {
    clearTimeout(timer);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, err: response.ok ? 'invalid' : 'llm' };
  }
  const b = (body ?? {}) as { recipe?: unknown; ask?: unknown; err?: unknown; msg?: unknown };
  if (!response.ok) {
    const err = KNOWN.includes(b.err as RecipeError) ? (b.err as RecipeError) : 'llm';
    return { ok: false, err, msg: typeof b.msg === 'string' ? b.msg : undefined };
  }
  if (b.ask !== undefined) {
    const ask = parseAsk(b.ask);
    return ask ? { ok: true, ask } : { ok: false, err: 'invalid' };
  }
  const recipe = parseRecipe(b.recipe);
  return recipe ? { ok: true, recipe } : { ok: false, err: 'invalid' };
}

// asks the server to make a recipe out of the farmer's words. plant is the table
// name the farmer picked after a question back, it wins over the name in the words
export function askRecipe(
  base: string,
  prompt: string,
  lang: Lang,
  options: ClientOptions & { plant?: string } = {}
): Promise<RecipeResult> {
  const { plant, ...rest } = options;
  const body = { prompt: prompt.slice(0, PROMPT_MAX), lang, ...(plant ? { plant } : {}) };
  return call(`${base}/recipe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, rest);
}

// the last recipe the server kept
export function loadRecipe(base: string, options: ClientOptions = {}): Promise<RecipeResult> {
  return call(`${base}/recipe`, { method: 'GET' }, { timeoutMs: 8000, ...options });
}
