// a tiny typed t(). english and german dictionaries, merged from the core and
// one pair of files per area (twin, panels, admin, sim). t() reads the
// language from the preferences store, so a template that calls it follows a
// language switch on its own

import { coreDe } from './core.de';
import { coreEn } from './core.en';
import { adminDe } from './admin.de';
import { adminEn } from './admin.en';
import { panelsDe } from './panels.de';
import { panelsEn } from './panels.en';
import { simDe } from './sim.de';
import { simEn } from './sim.en';
import { twinDe } from './twin.de';
import { twinEn } from './twin.en';
import { preferences, type Lang } from '$lib/stores/preferences.svelte';
import { EXP_PHASES, type ExpKind, type Mode, type St } from '$lib/link/protocol';

export const en = { ...coreEn, ...twinEn, ...panelsEn, ...adminEn, ...simEn };
export type Key = keyof typeof en;
export const de: Record<Key, string> = { ...coreDe, ...twinDe, ...panelsDe, ...adminDe, ...simDe };

export const dictionaries: Record<Lang, Record<Key, string>> = { en, de };

export type Params = Record<string, string | number>;

export function translate(lang: Lang, key: Key, params?: Params): string {
  const text: string = dictionaries[lang][key] ?? en[key] ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

export function t(key: Key, params?: Params): string {
  return translate(preferences.lang, key, params);
}

const formats = new Map<string, Intl.NumberFormat>();

// a number the way the language writes it, decimal comma in german. null and
// NaN come back as null, the caller decides what a missing value looks like
export function fmt(value: number | null | undefined, digits = 0, lang: Lang = preferences.lang): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const id = `${lang}${digits}`;
  let format = formats.get(id);
  if (!format) {
    format = new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
    formats.set(id, format);
  }
  // -0.0 reads as 0.0
  return format.format(value === 0 ? 0 : value).replace(/^-(0[.,]?0*)$/, '$1');
}

export function stateWord(st: St): string {
  return t(`st.${st}` as Key);
}

export function stateSentence(st: St | null): string {
  return st ? t(`say.${st}` as Key) : t('say.waiting');
}

export function modeName(mode: Mode): string {
  return t(`mode.${mode}` as Key);
}

// every part of the dock calls the experiments and their phases the same
export function expName(kind: ExpKind): string {
  return t(`exp.${kind}` as Key);
}

// a phase this page does not know yet shows as the tracker sent it
export function phaseText(phase: string): string {
  return (EXP_PHASES as string[]).includes(phase) ? t(`phase.${phase}` as Key) : phase;
}

// an err string from an ack or an auth, as a sentence
export function errorText(err: string | undefined): string {
  const key = `err.${err}` as Key;
  return key in en ? t(key) : (err ?? '');
}
