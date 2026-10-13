import { describe, expect, it } from 'vitest';
import { de, en, fmt, translate, type Key } from './index';
import { coreEn } from './core.en';
import { twinEn } from './twin.en';
import { panelsEn } from './panels.en';
import { adminEn } from './admin.en';
import { simEn } from './sim.en';
import { STATES, MODES } from '$lib/link/protocol';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('the dictionaries', () => {
  it('have the same keys in english and german', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it('have a text for every key in both languages', () => {
    for (const key of Object.keys(en) as Key[]) {
      expect(en[key].trim(), key).not.toBe('');
      expect(de[key].trim(), key).not.toBe('');
    }
  });

  it('use the same placeholders in both languages', () => {
    for (const key of Object.keys(en) as Key[]) {
      expect(placeholders(de[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('keep each stream inside its own prefix and no two streams share a key', () => {
    const streams = { twin: twinEn, panels: panelsEn, admin: adminEn, sim: simEn };
    for (const [name, dict] of Object.entries(streams)) {
      for (const key of Object.keys(dict)) expect(key.startsWith(`${name}.`), key).toBe(true);
    }
    const dicts: object[] = [coreEn, ...Object.values(streams)];
    const total = dicts.reduce((sum: number, dict) => sum + Object.keys(dict).length, 0);
    expect(Object.keys(en)).toHaveLength(total);
  });

  it('have a word and a sentence for every state and a name for every mode', () => {
    for (const st of STATES) {
      expect(en).toHaveProperty(`st.${st}`);
      expect(en).toHaveProperty(`say.${st}`);
    }
    for (const mode of MODES) expect(en).toHaveProperty(`mode.${mode}`);
  });

  it('use no dashes as punctuation', () => {
    for (const dict of [en, de]) {
      for (const [key, text] of Object.entries(dict)) {
        expect(text, key).not.toMatch(/[‒–—―]/);
        expect(text, key).not.toMatch(/\s-\s|\s-$|^-\s/);
      }
    }
  });

  it('write german with umlauts, not with ae, oe or ue stand ins', () => {
    for (const [key, text] of Object.entries(de)) {
      expect(text, key).not.toMatch(/\b(fuer|ueber|zurueck|schliessen|laeuft|faehrt|praesentation)/i);
    }
  });
});

describe('t', () => {
  it('fills placeholders and leaves unknown ones alone', () => {
    expect(translate('en', 'status.live', { host: 'pi.local:8080' })).toBe('live, pi.local:8080');
    expect(translate('de', 'lock.wait', { s: 30 })).toBe('Zu viele falsche Versuche, warte 30 s');
    expect(translate('en', 'status.live')).toBe('live, {host}');
  });

  it('formats numbers the way each language writes them', () => {
    expect(fmt(1234.5, 1, 'en')).toBe('1,234.5');
    expect(fmt(1234.5, 1, 'de')).toBe('1.234,5');
    expect(fmt(-0.04, 1, 'en')).toBe('0.0');
    expect(fmt(null, 1, 'en')).toBeNull();
    expect(fmt(NaN, 1, 'de')).toBeNull();
  });
});
