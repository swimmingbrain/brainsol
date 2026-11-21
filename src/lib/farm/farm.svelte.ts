// what the plant tab shows and keeps while the dock is closed: the farmer's
// words, whether the recipe server is thinking, the recipe it made with the plan
// of the planner and the question it asks back when the plant is not in its
// table. the server address comes from ?brain= in the url, "brain" in
// config.json or the pi the page is connected to when that one has a brain
// server, in that order. none of them means there is no recipe server and the
// tab says so

import { askRecipe, brainBase, loadRecipe, VIA_PI_TIMEOUT_MS, type ClientOptions, type RecipeError } from './client';
import { planPage, type DayPlan } from './plan';
import type { Ask, Recipe } from './recipe';
import { connection } from '$lib/stores/connection.svelte';
import type { Lang } from '$lib/stores/preferences.svelte';

// what the farm needs of the pi the page is connected to
export interface PiBrain {
  // the pi's http base, null without a live pi
  api: string | null;
  // its /api/info says it has a brain server
  brain: boolean;
  // the admin token while its tools are open
  token: string | null;
}

export interface FarmOptions extends ClientOptions {
  href?: () => string;
  pi?: () => PiBrain;
}

const NO_PI: PiBrain = { api: null, brain: false, token: null };

export class Farm {
  // the address from ?brain= or config.json, '' without one, null until config.json was read
  own = $state<string | null>(null);
  prompt = $state('');
  pending = $state(false);
  recipe = $state.raw<Recipe | null>(null);
  // the plan of the planner for the recipe, null while the planner is not ready
  plan = $state.raw<DayPlan | null>(null);
  error = $state<RecipeError | null>(null);
  // the open question back: the plant is unknown or was not named
  question = $state.raw<Ask | null>(null);
  // the server's own words about the last failure, for the curious
  detail = $state<string | null>(null);

  private started = false;
  // the base the kept recipe was last asked from
  private loaded: string | null = null;

  constructor(private options: FarmOptions = {}) {}

  // the recipe server, '' without one, null until config.json was read
  get base(): string | null {
    if (this.own === null) return null;
    if (this.own) return this.own;
    const pi = this.pi();
    return pi.brain && pi.api ? `${pi.api.replace(/\/+$/, '')}/brain` : '';
  }

  // the request goes through the pi, a post then needs its admin token
  get viaPi(): boolean {
    return this.own === '' && !!this.base;
  }

  // the full plan page of the planner in a new tab, null without a recipe server
  get planPage(): string | null {
    const base = this.base;
    if (!base) return null;
    return planPage(base, this.viaPi ? this.pi().token : null);
  }

  // finds the server and brings back the recipe it kept, once per visit
  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.own = brainBase(await this.address());
    await this.refresh();
  }

  // the kept recipe of a server that showed up, a pi that went live later for example
  async refresh(): Promise<void> {
    const base = this.base;
    if (!base || base === this.loaded) return;
    this.loaded = base;
    const result = await loadRecipe(base, this.options);
    if (result.ok && result.recipe && !this.recipe) {
      this.recipe = result.recipe;
      this.plan = result.plan ?? null;
    }
  }

  // asks for a recipe for the words in prompt, keeps the old one on failure
  ask(lang: Lang): Promise<boolean> {
    return this.send(lang);
  }

  // the farmer's answer to a question back: the same words with a plant's table name
  choose(name: string, lang: Lang): Promise<boolean> {
    return this.send(lang, name);
  }

  private pi(): PiBrain {
    return this.options.pi?.() ?? NO_PI;
  }

  private async send(lang: Lang, plant?: string): Promise<boolean> {
    const words = this.prompt.trim();
    const base = this.base;
    if (!base || !words || this.pending) return false;
    const via = this.viaPi;
    this.pending = true;
    this.error = null;
    this.detail = null;
    try {
      const result = await askRecipe(base, words, lang, {
        ...(via ? { timeoutMs: VIA_PI_TIMEOUT_MS, token: this.pi().token } : {}),
        ...this.options,
        plant
      });
      if (!result.ok) {
        this.error = result.err;
        this.detail = result.msg ?? null;
        return false;
      }
      if (result.ask) {
        this.question = result.ask;
        return false;
      }
      this.question = null;
      this.recipe = result.recipe;
      this.plan = result.plan ?? null;
      return true;
    } finally {
      this.pending = false;
    }
  }

  private async address(): Promise<string> {
    const href = this.options.href?.() ?? (typeof location !== 'undefined' ? location.href : 'http://localhost/');
    const query = new URL(href).searchParams.get('brain');
    if (query !== null) return query;
    const get = this.options.fetch ?? fetch;
    try {
      const response = await get('/config.json', { cache: 'no-store' });
      if (!response.ok) return '';
      const value = (await response.json()) as { brain?: unknown };
      return typeof value?.brain === 'string' ? value.brain : '';
    } catch {
      return '';
    }
  }
}

// the pi of the connection, only while it is live
export const farm = new Farm({
  pi: () => ({ api: connection.source === 'live' ? connection.api : null, brain: connection.brain, token: connection.token })
});
