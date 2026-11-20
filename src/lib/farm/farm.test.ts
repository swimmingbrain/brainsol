import { describe, expect, it, vi } from 'vitest';
import { Farm } from './farm.svelte';

const RECIPE = {
  v: 3,
  plant: 'Tomato',
  names: { en: 'Tomato', de: 'Tomate' },
  light_target: 14,
  max_temp: 30,
  avoid_sun: [{ from: '11:00', to: '15:00' }],
  power_first: [{ from: '17:00', to: '21:00' }],
  source: 'unchecked'
};

const KNOWN = [{ name: 'Brinjal', names: { en: 'Eggplant', de: 'Aubergine' } }];

// a fake network: config.json and the recipe server
function network(routes: Record<string, () => Response>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    const route = routes[key];
    if (!route) throw new TypeError(`nothing at ${key}`);
    return route();
  }) as unknown as typeof fetch;
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status });

describe('Farm', () => {
  it('without a recipe server stays empty and asks nothing', async () => {
    const fetch = network({ 'GET /config.json': json({ pi: '', brain: '' }) });
    const farm = new Farm({ fetch, href: () => 'http://page/' });
    await farm.init();
    expect(farm.base).toBe('');
    farm.prompt = 'basil';
    expect(await farm.ask('en')).toBe(false);
  });

  it('takes the server from ?brain= over config.json and brings back the kept recipe', async () => {
    const fetch = network({ 'GET http://brain:8000/recipe': json({ recipe: RECIPE }) });
    const farm = new Farm({ fetch, href: () => 'http://page/?brain=brain:8000' });
    await farm.init();
    expect(farm.base).toBe('http://brain:8000');
    expect(farm.recipe?.plant).toBe('Tomato');
  });

  it('keeps the old recipe and names the error when asking fails', async () => {
    let fail = false;
    const fetch = network({
      'GET /config.json': json({ brain: 'http://brain' }),
      'GET http://brain/recipe': json({ err: 'none' }, 404),
      'POST http://brain/recipe': () => (fail ? json({ err: 'timeout', msg: 'slow' }, 504)() : json({ recipe: RECIPE })())
    });
    const farm = new Farm({ fetch, href: () => 'http://page/' });
    await farm.init();
    expect(farm.recipe).toBeNull();
    farm.prompt = '  basil  ';
    expect(await farm.ask('de')).toBe(true);
    expect(farm.recipe?.plant).toBe('Tomato');
    fail = true;
    expect(await farm.ask('de')).toBe(false);
    expect(farm.error).toBe('timeout');
    expect(farm.detail).toBe('slow');
    expect(farm.recipe?.plant).toBe('Tomato');
    expect(farm.pending).toBe(false);
  });

  it('asks back for an unknown plant and a picked chip sends the same words with the plant', async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/config.json') return new Response(JSON.stringify({ brain: 'http://brain' }));
      if (init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        bodies.push(body);
        return new Response(JSON.stringify(body.plant ? { recipe: { ...RECIPE, plant: body.plant } } : { ask: { plant: 'Safran', known: KNOWN } }));
      }
      return new Response(JSON.stringify({ err: 'none' }), { status: 404 });
    }) as unknown as typeof globalThis.fetch;
    const farm = new Farm({ fetch, href: () => 'http://page/' });
    await farm.init();
    farm.prompt = 'Safran, ab 17 Uhr Strom';
    expect(await farm.ask('de')).toBe(false);
    expect(farm.question).toEqual({ plant: 'Safran', known: KNOWN });
    expect(farm.recipe).toBeNull();
    expect(farm.error).toBeNull();
    expect(await farm.choose('Brinjal', 'de')).toBe(true);
    expect(bodies[1]).toEqual({ prompt: 'Safran, ab 17 Uhr Strom', lang: 'de', plant: 'Brinjal' });
    expect(farm.recipe?.plant).toBe('Brinjal');
    expect(farm.question).toBeNull();
  });
});
