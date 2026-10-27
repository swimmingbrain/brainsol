// the english words of the 3D scene. every key starts with twin. and needs the same
// key in twin.de.ts, the type check and the tests hold the two together

export const twinEn = {
  'twin.label': 'The tracker in 3D',
  'twin.lampAz': 'Lamp azimuth',
  'twin.lampEl': 'Lamp elevation',
  'twin.sunAz': 'Sun azimuth',
  'twin.sunEl': 'Sun elevation',
  'twin.panelAz': 'Panel azimuth',
  'twin.panelEl': 'Panel elevation',
  'twin.hint': 'Drag the lamp to move the light.',
  'twin.hintView': 'Drag to turn the view, scroll to zoom, double click to go back.',
  'twin.hintViewTouch': 'Swipe sideways to turn, pinch to zoom, double tap to go back.',
  'twin.lampLabel': 'Lamp at azimuth {az} degrees and elevation {el} degrees. Drag it or use the arrow keys to move the light.',
  'twin.lost': 'The 3D view paused for a moment. It comes back on its own.',
  'twin.flat': 'This browser cannot show the 3D view, so here is a flat drawing of the pose.'
} satisfies Record<`twin.${string}`, string>;
