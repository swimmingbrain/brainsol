// the recipe the recipe server makes: the language model reads the plant's
// name and the hours out of the farmer's words, the plant table on the server
// adds the light target and the highest temperature. mirrors
// server/brain/recipe.py, which is the source of truth. the page checks it
// again and never trusts the wire blindly

export const RECIPE_VERSION = 3;
export const LIGHT_MIN = 1;
export const LIGHT_MAX = 40;
export const TEMP_MIN = 0;
export const TEMP_MAX = 50;

// a span of one day in local wall clock, "HH:MM", to is later than from
export interface Window {
  from: string;
  to: string;
}

export interface PlantNames {
  en: string;
  de: string;
}

export interface Recipe {
  v: number;
  // the plant's name in the plant table of the server, for example "Green chilli"
  plant: string;
  names: PlantNames;
  // daily light integral, mol/m²/day, from the plant table
  light_target: number;
  // °C from the plant table, null when the plant has no limit worth planning for
  max_temp: number | null;
  avoid_sun: Window[];
  power_first: Window[];
  // where the table's numbers come from
  source: string;
}

// a plant the server knows, offered when it has to ask back
export interface KnownPlant {
  // the exact dataset name, sent back when the farmer picks it
  name: string;
  names: PlantNames;
}

// the follow up question: the plant as the farmer named it (null if none was
// named) is not in the table, so the server asks instead of guessing
export interface Ask {
  plant: string | null;
  known: KnownPlant[];
}

const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;

// minutes after midnight of a valid "HH:MM"
export function minutes(clock: string): number {
  const [h, m] = clock.split(':');
  return Number(h) * 60 + Number(m);
}

function window(value: unknown): Window | null {
  if (!value || typeof value !== 'object') return null;
  const { from, to } = value as Record<string, unknown>;
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  if (!CLOCK.test(from) || !CLOCK.test(to) || minutes(from) >= minutes(to)) return null;
  return { from, to };
}

function windows(value: unknown): Window[] | null {
  if (!Array.isArray(value)) return null;
  const out = value.map(window);
  return out.every((w): w is Window => w !== null) ? out : null;
}

function inRange(value: unknown, lo: number, hi: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= lo && value <= hi;
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function names(value: unknown): PlantNames | null {
  if (!value || typeof value !== 'object') return null;
  const { en, de } = value as Record<string, unknown>;
  return text(en) && text(de) ? { en, de } : null;
}

// the recipe if every field fits, null otherwise
export function parseRecipe(value: unknown): Recipe | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  if (r.v !== RECIPE_VERSION || !text(r.plant)) return null;
  const n = names(r.names);
  if (!n) return null;
  if (!inRange(r.light_target, LIGHT_MIN, LIGHT_MAX)) return null;
  if (r.max_temp !== null && !inRange(r.max_temp, TEMP_MIN, TEMP_MAX)) return null;
  const avoid = windows(r.avoid_sun);
  const power = windows(r.power_first);
  if (!avoid || !power) return null;
  return {
    v: RECIPE_VERSION,
    plant: r.plant,
    names: n,
    light_target: r.light_target,
    max_temp: r.max_temp,
    avoid_sun: avoid,
    power_first: power,
    source: typeof r.source === 'string' ? r.source : ''
  };
}

// the follow up question if it can be shown, null otherwise
export function parseAsk(value: unknown): Ask | null {
  if (!value || typeof value !== 'object') return null;
  const a = value as Record<string, unknown>;
  if (a.plant !== null && typeof a.plant !== 'string') return null;
  if (!Array.isArray(a.known)) return null;
  const known: KnownPlant[] = [];
  for (const entry of a.known) {
    const k = (entry ?? {}) as Record<string, unknown>;
    const n = names(k.names);
    if (!text(k.name) || !n) return null;
    known.push({ name: k.name, names: n });
  }
  return { plant: text(a.plant) ? a.plant.trim() : null, known };
}
