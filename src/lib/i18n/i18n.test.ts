import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { de, en, expName, fmt, phaseText, translate, type Key } from './index';
import { coreEn } from './core.en';
import { twinEn } from './twin.en';
import { panelsEn } from './panels.en';
import { adminEn } from './admin.en';
import { simEn } from './sim.en';
import { EXP_PHASES, STATES, MODES } from '$lib/link/protocol';

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

  it('keep each area inside its own prefix and no two areas share a key', () => {
    const areas = { twin: twinEn, panels: panelsEn, admin: adminEn, sim: simEn };
    for (const [name, dict] of Object.entries(areas)) {
      for (const key of Object.keys(dict)) expect(key.startsWith(`${name}.`), key).toBe(true);
    }
    const dicts: object[] = [coreEn, ...Object.values(areas)];
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

  it('have a name and a sentence for every experiment and a word for every phase', () => {
    for (const kind of ['cosine', 'compare', 'step'] as const) {
      expect(en).toHaveProperty(`exp.${kind}`);
      expect(en).toHaveProperty(`exp.about.${kind}`);
      expect(expName(kind)).not.toBe(`exp.${kind}`);
    }
    for (const phase of EXP_PHASES) expect(en).toHaveProperty(`phase.${phase}`);
    // a phase a newer tracker might send shows as it came
    expect(phaseText('warmup')).toBe('warmup');
  });

  it('use no dashes as punctuation', () => {
    for (const dict of [en, de]) {
      for (const [key, text] of Object.entries(dict)) {
        expect(text, key).not.toMatch(DASHES);
        expect(text, key).not.toMatch(/\s-\s|\s-$|^-\s|--/);
        // a minus sign stays in formulas, between two words it would be a dash
        expect(text, key).not.toMatch(/\p{L}{2,}\s\u2212\s\p{L}{2,}/u);
      }
    }
  });

  it('use no hyphen inside a word, compounds are written apart', () => {
    for (const dict of [en, de]) {
      for (const [key, text] of Object.entries(dict)) {
        expect(text.replace(/https?:\S+|\b[\w.-]+\.(local|org|dev)\b|wss?:\/\/\S*/g, ''), key).not.toMatch(/\p{L}-\p{L}/u);
      }
    }
  });

  it('write german with umlauts, not with ae, oe or ue stand ins', () => {
    for (const [key, text] of Object.entries(de)) {
      expect(text, key).not.toMatch(/\b(fuer|ueber|zurueck|schliessen|laeuft|faehrt|praesentation)/i);
    }
  });
});

// every dash and hyphen mark of unicode besides the plain hyphen and the minus sign
const DASHES = /[\u2010-\u2015\u2e3a\u2e3b\ufe58\ufe63\uff0d]/;

describe('the words outside the dictionaries', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const pages = (dir: string): string[] =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? pages(join(dir, e.name)) : e.name.endsWith('.svelte') ? [join(dir, e.name)] : []));

  it('use no dashes in the pages, the readme and the license list either', () => {
    const files = [...pages('src/routes'), 'README.md', 'THIRD_PARTY_LICENSES'];
    for (const file of files) {
      let text = readFileSync(join(root, file), 'utf8');
      // only what a reader sees: no scripts, styles, tags, expressions, code or addresses
      text = text.replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<[^>]*>|\{[^}]*\}/g, ' ');
      text = text.replace(/```[\s\S]*?```|`[^`]*`|https?:\S+/g, ' ');
      expect(text, file).not.toMatch(DASHES);
      for (const line of text.split('\n')) {
        // a markdown list item and the rule under a table head are syntax
        if (/^\s*\|[\s|:-]+\|\s*$/.test(line)) continue;
        expect(line.replace(/^\s*- /, ''), file).not.toMatch(/\s-\s|--/);
      }
    }
  });
});

describe('t', () => {
  it('fills placeholders and leaves unknown ones alone', () => {
    expect(translate('en', 'status.live', { host: 'pi.local:8080' })).toBe('live, pi.local:8080');
    expect(translate('de', 'admin.unlock.locked', { wait: '30 s' })).toBe('Zu viele falsche Versuche. Der nächste Versuch geht in 30 s.');
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
