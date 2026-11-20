// what the plant tab shows and keeps while the dock is closed: the farmer's
// words, whether the recipe server is thinking, the recipe it made and the
// question it asks back when the plant is not in its table. the
// server address comes from ?brain= in the url or "brain" in config.json, an
// empty one means there is no recipe server and the tab says so

import { askRecipe, brainBase, loadRecipe, type ClientOptions, type RecipeError } from './client';
import type { Ask, Recipe } from './recipe';
import type { Lang } from '$lib/stores/preferences.svelte';

export interface FarmOptions extends ClientOptions {
  href?: () => string;
}

export class Farm {
  // the recipe server, '' without one, null until config.json was read
  base = $state<string | null>(null);
  prompt = $state('');
  pending = $state(false);
  recipe = $state.raw<Recipe | null>(null);
  error = $state<RecipeError | null>(null);
  // the open question back: the plant is unknown or was not named
  question = $state.raw<Ask | null>(null);
  // the server's own words about the last failure, for the curious
  detail = $state<string | null>(null);

  private started = false;

  constructor(private options: FarmOptions = {}) {}

  // finds the server and brings back the recipe it kept, once per visit
  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.base = brainBase(await this.address());
    if (!this.base) return;
    const result = await loadRecipe(this.base, this.options);
    if (result.ok && result.recipe && !this.recipe) this.recipe = result.recipe;
  }

  // asks for a recipe for the words in prompt, keeps the old one on failure
  ask(lang: Lang): Promise<boolean> {
    return this.send(lang);
  }

  // the farmer's answer to a question back: the same words with a plant's table name
  choose(name: string, lang: Lang): Promise<boolean> {
    return this.send(lang, name);
  }

  private async send(lang: Lang, plant?: string): Promise<boolean> {
    const words = this.prompt.trim();
    if (!this.base || !words || this.pending) return false;
    this.pending = true;
    this.error = null;
    this.detail = null;
    try {
      const result = await askRecipe(this.base, words, lang, { ...this.options, plant });
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

export const farm = new Farm();
