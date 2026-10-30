// how a number field writes and reads its value. german uses the decimal
// comma, the field never groups thousands, so a lone comma or dot is always
// the decimal mark and people may type whichever their keyboard gives them

import type { Lang } from '$lib/stores/preferences.svelte';

export function formatField(n: number, precision: number, lang: Lang): string {
  if (!Number.isFinite(n)) return '0';
  let text = n.toFixed(precision);
  if (precision > 0) text = text.replace(/\.?0+$/, '');
  // -0 reads as 0
  if (/^-0$/.test(text)) text = '0';
  return lang === 'de' ? text.replace('.', ',') : text;
}

// NaN for anything that is not a number, the field then keeps its old value
export function parseField(text: string): number {
  let s = text.replace(/[\s '°%]/g, '').replace(/[^0-9.,eE+-]/g, '');
  if (!s) return NaN;
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    // both marks: the last one is the decimal mark, the other groups thousands
    s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (comma >= 0) {
    s = (s.match(/,/g)?.length ?? 0) > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if ((s.match(/\./g)?.length ?? 0) > 1) {
    s = s.replace(/\./g, '');
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return NaN;
  return Number(s);
}
