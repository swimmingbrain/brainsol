// the english words of the 3D scene. every key starts with twin. and needs the same
// key in twin.de.ts, the type check and the tests hold the two together

export const twinEn = {} satisfies Record<`twin.${string}`, string>;
