// brightness spans a phone light (900 lx) and the sun (80000 lx). on a straight
// slider the phone light would sit in the first percent, so the slider runs on
// a log scale. position 0 is darkness, anything above starts at the minimum

export function toLogPos(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0 || !(min > 0) || !(max > min)) return 0;
  const pos = Math.log(value / min) / Math.log(max / min);
  return Math.min(1, Math.max(0, pos));
}

// two significant figures read better than 873.4 and are plenty for light
export function niceRound(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value < 10) return Math.round(value);
  const unit = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.round(value / unit) * unit;
}

export function fromLogPos(pos: number, min: number, max: number): number {
  if (!Number.isFinite(pos) || pos <= 0) return 0;
  return niceRound(min * (max / min) ** Math.min(1, pos));
}
