<script lang="ts" module>
  // 16px grid, 1.5 stroke, round caps, shapes that read better solid override the stroke
  const dot = (x: number, y: number, r = 0.9) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;

  export const ICONS = {
    // the tracker
    sun: '<circle cx="8" cy="8" r="2.8"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>',
    lamp: '<path d="M5.8 10.8C4.4 9.9 3.5 8.4 3.5 6.7a4.5 4.5 0 0 1 9 0c0 1.7-.9 3.2-2.3 4.1v1.2H5.8z"/><path d="M6.3 14h3.4"/>',
    panel: '<path d="M2.6 8.4 10.4 3l1.9 2.8-7.8 5.4z"/><path d="M7.6 8.6v5M5 13.6h5.2"/>',
    target: '<circle cx="8" cy="8" r="5"/><path d="M8 1.5v2.6M8 11.9v2.6M1.5 8h2.6M11.9 8h2.6"/>' + dot(8, 8, 1),
    scan: '<path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3"/><path d="M4.5 8h7"/>',
    flask: '<path d="M6.2 2h3.6M6.8 2v4.2L3 12.6a.9.9 0 0 0 .8 1.4h8.4a.9.9 0 0 0 .8-1.4L9.2 6.2V2"/><path d="M4.6 10.2h6.8"/>',
    cube: '<path d="M8 1.8 13.5 4.9v6.2L8 14.2 2.5 11.1V4.9z"/><path d="M2.5 4.9 8 8l5.5-3.1M8 8v6.2"/>',
    chart: '<path d="M2.5 2.5v11h11"/><path d="m5 10 2.6-3 2.2 1.8L13 5"/>',
    sliders: '<path d="M2.5 4.5h3.5M9.6 4.5h3.9M2.5 11.5h7M13 11.5h.5"/><circle cx="7.8" cy="4.5" r="1.8"/><circle cx="11.2" cy="11.5" r="1.8"/>',
    compass: '<circle cx="8" cy="8" r="6"/><path d="M10.6 5.4 9.1 9.1l-3.7 1.5 1.5-3.7z"/>',
    pin: '<path d="M8 14.2s4.5-4.3 4.5-7.8a4.5 4.5 0 0 0-9 0c0 3.5 4.5 7.8 4.5 7.8z"/><circle cx="8" cy="6.3" r="1.6"/>',
    calendar: '<rect x="2.5" y="3.5" width="11" height="10" rx="1"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
    clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4.8V8l2.2 1.4"/>',
    speed: '<path d="M2.5 11.5a5.5 5.5 0 1 1 11 0"/><path d="m8 11.5 2.6-3.4"/>',
    bolt: '<path d="M9 1.8 3.8 9h4l-1 5.2L12.2 7h-4z"/>',
    leaf: '<path d="M3 13c0-6 4-10 10.5-10.5C13 9 9 13 3 13z"/><path d="M3 13l5.5-5.5"/>',
    thermometer: '<path d="M9.5 9.3V3.5a1.5 1.5 0 0 0-3 0v5.8a3 3 0 1 0 3 0z"/>',
    chip: '<rect x="4" y="4" width="8" height="8" rx="1"/><path d="M6 1.8V4M10 1.8V4M6 12v2.2M10 12v2.2M1.8 6H4M1.8 10H4M12 6h2.2M12 10h2.2"/>',
    move: '<path d="M8 2v12M2 8h12M6.2 3.8 8 2l1.8 1.8M6.2 12.2 8 14l1.8-1.8M3.8 6.2 2 8l1.8 1.8M12.2 6.2 14 8l-1.8 1.8"/>',
    arrowUp: '<path d="M8 13V3M4 7l4-4 4 4"/>',
    arrowDown: '<path d="M8 3v10M4 9l4 4 4-4"/>',
    arrowLeft: '<path d="M13 8H3M7 4 3 8l4 4"/>',
    arrowRight: '<path d="M3 8h10M9 4l4 4-4 4"/>',

    // playback and activities
    play: '<path d="M5 3.2v9.6L12.5 8z"/>',
    pause: '<path d="M5.5 3.5v9M10.5 3.5v9"/>',
    stop: '<rect x="4" y="4" width="8" height="8" rx="1"/>',
    record: dot(8, 8, 4),
    refresh: '<path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M13 2.5v3h-3"/>',
    power: '<path d="M8 2v5.5"/><path d="M4.6 4.4a5 5 0 1 0 6.8 0"/>',

    // the page
    lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
    unlock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1"/>',
    gear: '<circle cx="8" cy="8" r="2.2"/><path d="M12.7 9.8a1 1 0 0 0 .2 1.1l.1.1a1.2 1.2 0 1 1-1.7 1.7l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9v.1a1.2 1.2 0 1 1-2.4 0v-.1a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a1.2 1.2 0 1 1-1.7-1.7l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6h-.1a1.2 1.2 0 1 1 0-2.4h.1a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a1.2 1.2 0 1 1 1.7-1.7l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9v-.1a1.2 1.2 0 1 1 2.4 0v.1a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.2 1.2 0 1 1 1.7 1.7l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6h.1a1.2 1.2 0 1 1 0 2.4h-.1a1 1 0 0 0-.9.6z"/>',
    link: '<path d="M6.5 9.5 9.5 6.5"/><path d="M7.5 4.8 9 3.3a2.6 2.6 0 0 1 3.7 3.7l-1.5 1.5M8.5 11.2 7 12.7A2.6 2.6 0 0 1 3.3 9l1.5-1.5"/>',
    signal: '<path d="M2 6a8.5 8.5 0 0 1 12 0M4.2 8.4a5.4 5.4 0 0 1 7.6 0M6.4 10.8a2.3 2.3 0 0 1 3.2 0"/>' + dot(8, 13, 0.8),
    signalOff: '<path d="M2 6a8.5 8.5 0 0 1 12 0M4.2 8.4a5.4 5.4 0 0 1 7.6 0M6.4 10.8a2.3 2.3 0 0 1 3.2 0M2.5 2.5l11 11"/>',
    qr: '<rect x="2.5" y="2.5" width="4" height="4" rx=".5"/><rect x="9.5" y="2.5" width="4" height="4" rx=".5"/><rect x="2.5" y="9.5" width="4" height="4" rx=".5"/><path d="M9.5 9.5H11V11M12 12h1.5v1.5"/>' + dot(13.4, 9.6, 0.7) + dot(9.6, 13.4, 0.7),
    expand: '<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>',
    contract: '<path d="M6 2.5V6H2.5M10 2.5V6h3.5M13.5 10H10v3.5M2.5 10H6v3.5"/>',
    language: '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c1.8 1.7 2.6 3.7 2.6 6S9.8 12.3 8 14M8 2C6.2 3.7 5.4 5.7 5.4 8s.8 4.3 2.6 6"/>',
    theme: '<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5v11a5.5 5.5 0 0 0 0-11z" fill="currentColor" stroke="none"/>',
    moon: '<path d="M13 9.6A5.5 5.5 0 1 1 6.4 3a4.4 4.4 0 0 0 6.6 6.6z"/>',
    eye: '<path d="M1.5 8S3.8 3.8 8 3.8 14.5 8 14.5 8 12.2 12.2 8 12.2 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="1.8"/>',
    download: '<path d="M8 2.5v8M5.2 7.7 8 10.5l2.8-2.8"/><path d="M2.8 10v3.5h10.4V10"/>',
    upload: '<path d="M8 10.5V2.5M5.2 5.3 8 2.5l2.8 2.8"/><path d="M2.8 10v3.5h10.4V10"/>',
    save: '<path d="M2.5 3.5a1 1 0 0 1 1-1h7l3 3v7a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"/><path d="M5 2.5v4h5.5v-4M4.5 13.5v-4h7v4"/>',
    undo: '<path d="M3 5.5h6.5a3.5 3.5 0 0 1 0 7H6"/><path d="M5.5 3 3 5.5 5.5 8"/>',
    trash: '<path d="M2.5 4h11M6 4V2.8h4V4M4 4v9.2h8V4M6.5 6.5v4.5M9.5 6.5v4.5"/>',
    copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>',
    plus: '<path d="M8 3.5v9M3.5 8h9"/>',
    minus: '<path d="M3.5 8h9"/>',
    close: '<path d="M4 4 12 12M12 4 4 12"/>',
    check: '<path d="M3 8.4 6.3 11.6 13 4.8"/>',
    warning: '<path d="M8 2.5 14.5 13.5h-13z"/><path d="M8 6.4v3.2M8 11.6v.4"/>',
    info: '<circle cx="8" cy="8" r="6"/><path d="M8 7.4v4M8 4.8v.4"/>',
    more: dot(3.4, 8, 1.1) + dot(8, 8, 1.1) + dot(12.6, 8, 1.1),
    search: '<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2 13.8 13.8"/>',
    chevronDown: '<path d="M4 6 8 10l4-4"/>',
    chevronUp: '<path d="M4 10 8 6l4 4"/>',
    chevronRight: '<path d="M6 4l4 4-4 4"/>',
    chevronLeft: '<path d="M10 4 6 8l4 4"/>',
    external: '<path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5"/><path d="M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/>',
    github:
      '<path fill="currentColor" stroke="none" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>'
  } satisfies Record<string, string>;

  export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
  let { name, size = 16, title }: { name: IconName; size?: number; title?: string } = $props();

  const markup = $derived(ICONS[name] ?? '');
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden={title ? undefined : 'true'}
  role={title ? 'img' : undefined}
  aria-label={title}
  focusable="false">{@html markup}</svg>

<style>
  svg {
    display: block;
    flex-shrink: 0;
  }
</style>
