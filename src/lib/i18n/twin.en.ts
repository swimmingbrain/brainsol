// the english words of the 3D scene. every key starts with twin. and needs the same
// key in twin.de.ts, the type check and the tests hold the two together

export const twinEn = {
  'twin.lampLabel': 'Lamp at azimuth {az} degrees and elevation {el} degrees. Drag it or use the arrow keys to move the light.'
} satisfies Record<`twin.${string}`, string>;
