// the css tokens as plain strings, for what draws on a canvas (uplot, three).
// read them again when preferences.theme changes, the values follow the theme

export function cssVar(name: string, fallback = ''): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export interface ChartColors {
  // the series in their fixed order
  series: [string, string, string];
  neutral: string;
  track: string;
  grid: string;
  // little to much, five steps of one hue
  heat: [string, string, string, string, string];
  // axis labels and ticks
  text: string;
  background: string;
}

export function chartColors(): ChartColors {
  return {
    series: [cssVar('--chart-1', '#5b8fc9'), cssVar('--chart-2', '#c4853f'), cssVar('--chart-3', '#8f6bb8')],
    neutral: cssVar('--chart-neutral', '#5a5a62'),
    track: cssVar('--chart-track', '#2a2a2e'),
    grid: cssVar('--chart-grid', '#2e2e33'),
    heat: [
      cssVar('--heat-1', '#26221f'),
      cssVar('--heat-2', '#4a3a2b'),
      cssVar('--heat-3', '#7a5c3d'),
      cssVar('--heat-4', '#a87c52'),
      cssVar('--heat-5', '#d19a66')
    ],
    text: cssVar('--text-muted', '#8b8b94'),
    background: cssVar('--bg-surface', '#19191c')
  };
}
