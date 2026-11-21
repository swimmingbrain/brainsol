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

const PLAN = {
  date: '2025-06-04',
  now: '09:20',
  reachable: true,
  hours: [{ from: '09:00', to: '10:00', offset: 0, why: 'sun' }],
  block: { from: '09:00', to: '12:00' }
};

describe('Farm through the pi', () => {
  const pi = { api: 'http://brainsol.local:8080', brain: true, token: 'tok' };

  it('finds the brain through the pi when the address and config.json name none', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url === '/config.json') return new Response(JSON.stringify({ pi: 'self' }));
      if (init?.method === 'POST') return new Response(JSON.stringify({ recipe: RECIPE, plan: PLAN, extra: true }));
      return new Response(JSON.stringify({ err: 'none' }), { status: 404 });
    }) as unknown as typeof globalThis.fetch;
    const farm = new Farm({ fetch, href: () => 'http://brainsol.local:8080/', pi: () => pi });
    await farm.init();
    expect(farm.base).toBe('http://brainsol.local:8080/brain');
    expect(farm.viaPi).toBe(true);
    expect(calls.map(([url]) => url)).toContain('http://brainsol.local:8080/brain/recipe');
    farm.prompt = 'Tomaten';
    expect(await farm.ask('de')).toBe(true);
    // the post carries the admin token of the pi, a get never does
    const post = calls.find(([, init]) => init?.method === 'POST')!;
    expect(post[0]).toBe('http://brainsol.local:8080/brain/recipe?token=tok');
    expect(farm.plan?.reachable).toBe(true);
    expect(farm.plan?.block).toEqual({ from: '09:00', to: '12:00' });
    expect(farm.planPage).toBe('http://brainsol.local:8080/brain/plan/?token=tok');
  });

  it('waits for a pi that goes live later and reads the kept recipe then', async () => {
    let live = { api: null as string | null, brain: false, token: null as string | null };
    const fetch = network({
      'GET /config.json': json({ pi: '' }),
      'GET https://pi.example.org/brain/recipe': json({ recipe: RECIPE, plan: PLAN })
    });
    const farm = new Farm({ fetch, href: () => 'https://sol.swimmingbrain.dev/', pi: () => live });
    await farm.init();
    expect(farm.base).toBe('');
    expect(farm.planPage).toBeNull();
    live = { api: 'https://pi.example.org', brain: true, token: null };
    expect(farm.base).toBe('https://pi.example.org/brain');
    await farm.refresh();
    expect(farm.recipe?.plant).toBe('Tomato');
    expect(farm.plan?.now).toBe('09:20');
    expect(farm.planPage).toBe('https://pi.example.org/brain/plan/');
  });

  it('leaves the pi alone when ?brain= or config.json name a server, and a pi without one too', async () => {
    const direct = new Farm({ fetch: network({ 'GET http://jetson:8000/recipe': json({ err: 'none' }, 404) }), href: () => 'http://page/?brain=jetson:8000', pi: () => pi });
    await direct.init();
    expect(direct.base).toBe('http://jetson:8000');
    expect(direct.viaPi).toBe(false);
    expect(direct.planPage).toBe('http://jetson:8000/plan/');
    const none = new Farm({ fetch: network({ 'GET /config.json': json({}) }), href: () => 'http://page/', pi: () => ({ ...pi, brain: false }) });
    await none.init();
    expect(none.base).toBe('');
  });

  it('names the refusal of the pi without a token', async () => {
    const fetch = network({
      'GET /config.json': json({}),
      'GET http://pi/brain/recipe': json({ err: 'none' }, 404),
      'POST http://pi/brain/recipe': json({ err: 'admin', msg: 'admin only' }, 403)
    });
    const farm = new Farm({ fetch, href: () => 'http://pi/', pi: () => ({ api: 'http://pi', brain: true, token: null }) });
    await farm.init();
    farm.prompt = 'basil';
    expect(await farm.ask('en')).toBe(false);
    expect(farm.error).toBe('admin');
  });
});
