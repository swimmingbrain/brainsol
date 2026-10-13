// the english words of the admin tools. every key starts with admin. and needs the same
// key in admin.de.ts, the type check and the tests hold the two together

export const adminEn = {} satisfies Record<`admin.${string}`, string>;
