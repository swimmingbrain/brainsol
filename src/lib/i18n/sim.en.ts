// the english words of the simulation. every key starts with sim. and needs the same
// key in sim.de.ts, the type check and the tests hold the two together

export const simEn = {} satisfies Record<`sim.${string}`, string>;
