// small formatters for the system tab: an uptime people can read at a glance
// and the clock time of an event

export interface UptimeUnits {
  d: string;
  h: string;
  min: string;
  s: string;
}

// the two largest parts are enough: 3 d 4 h, 2 h 5 min, 4 min 10 s, 45 s
export function uptimeText(seconds: number | null | undefined, units: UptimeUnits): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.floor(seconds);
  const parts: [number, string][] = [
    [Math.floor(total / 86400), units.d],
    [Math.floor((total % 86400) / 3600), units.h],
    [Math.floor((total % 3600) / 60), units.min],
    [total % 60, units.s]
  ];
  const first = parts.findIndex(([n]) => n > 0);
  if (first < 0) return `0 ${units.s}`;
  return parts
    .slice(first, first + 2)
    .filter(([n], i) => i === 0 || n > 0)
    .map(([n, unit]) => `${n} ${unit}`)
    .join(' ');
}

// unix seconds as the local wall clock, 14:03:27
export function clockTime(ts: number): string {
  if (!Number.isFinite(ts)) return '';
  const date = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
