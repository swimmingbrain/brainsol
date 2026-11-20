import { describe, expect, it, vi } from 'vitest';
import { askRecipe, brainBase, loadRecipe, PROMPT_MAX } from './client';

const RECIPE = {
  v: 3,
  plant: 'Tomato',
  names: { en: 'Tomato', de: 'Tomate' },
  light_target: 14,
  max_temp: null,
  avoid_sun: [],
  power_first: [{ from: '17:00', to: '21:00' }],
  source: 'unchecked'
};

const KNOWN = [{ name: 'Brinjal', names: { en: 'Eggplant', de: 'Aubergine' } }];

function answer(status: number, body: unknown) {
  return vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
}

describe('askRecipe', () => {
  it('posts the words and the language and returns the checked recipe', async () => {
    const fetch = answer(200, { recipe: RECIPE });
    const result = await askRecipe('http://brain', 'basil', 'en', { fetch });
    expect(result).toEqual({ ok: true, recipe: RECIPE });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://brain/recipe');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ prompt: 'basil', lang: 'en' });
  });

  it('returns the question back for an unknown plant', async () => {
    const result = await askRecipe('http://b', 'saffron', 'en', { fetch: answer(200, { ask: { plant: 'saffron', known: KNOWN } }) });
    expect(result).toEqual({ ok: true, ask: { plant: 'saffron', known: KNOWN } });
  });

  it('sends a picked plant along', async () => {
    const fetch = answer(200, { recipe: RECIPE });
    await askRecipe('http://b', 'saffron', 'en', { fetch, plant: 'Brinjal' });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ prompt: 'saffron', lang: 'en', plant: 'Brinjal' });
  });

  it('refuses a question it cannot show', async () => {
    expect(await askRecipe('http://b', 'x', 'en', { fetch: answer(200, { ask: { plant: null } }) })).toEqual({ ok: false, err: 'invalid' });
  });

  it('cuts words that are too long before the server refuses them', async () => {
    const fetch = answer(200, { recipe: RECIPE });
    await askRecipe('http://brain', 'x'.repeat(PROMPT_MAX + 50), 'de', { fetch });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).prompt).toHaveLength(PROMPT_MAX);
  });

  it('passes on the error code and message of the server', async () => {
    const result = await askRecipe('http://brain', 'basil', 'en', { fetch: answer(502, { err: 'llm', msg: 'broken' }) });
    expect(result).toEqual({ ok: false, err: 'llm', msg: 'broken' });
  });

  it('turns unknown errors and html error pages into llm', async () => {
    expect(await askRecipe('http://b', 'x', 'en', { fetch: answer(500, { err: 'weird' }) })).toMatchObject({ err: 'llm' });
    expect(await askRecipe('http://b', 'x', 'en', { fetch: answer(502, '<html>bad gateway</html>') })).toMatchObject({ err: 'llm' });
  });

  it('refuses a recipe that does not fit', async () => {
    const result = await askRecipe('http://b', 'x', 'en', { fetch: answer(200, { recipe: { ...RECIPE, light_target: 99 } }) });
    expect(result).toEqual({ ok: false, err: 'invalid' });
  });

  it('says offline when nothing answers and timeout when it takes too long', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('failed to fetch');
    });
    expect(await askRecipe('http://b', 'x', 'en', { fetch: down })).toEqual({ ok: false, err: 'offline' });
    const slow = vi.fn(
      (_: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    );
    expect(await askRecipe('http://b', 'x', 'en', { fetch: slow as unknown as typeof fetch, timeoutMs: 5 })).toEqual({
      ok: false,
      err: 'timeout'
    });
  });
});

describe('loadRecipe', () => {
  it('knows when there is no recipe yet', async () => {
    expect(await loadRecipe('http://b', { fetch: answer(404, { err: 'none', msg: 'no recipe yet' }) })).toMatchObject({ ok: false, err: 'none' });
  });
});

describe('brainBase', () => {
  it('adds a scheme and drops trailing slashes', () => {
    expect(brainBase('')).toBe('');
    expect(brainBase('  ')).toBe('');
    expect(brainBase('https://brain.example/')).toBe('https://brain.example');
    expect(brainBase('localhost:8000')).toBe('http://localhost:8000');
  });
});
