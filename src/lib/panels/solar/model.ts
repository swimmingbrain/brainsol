// the clear sky model of the day simulator. where the sun is comes from
// suncalc, how strong its beam is from the meinel model with the kasten young
// air mass, and the sky adds a small diffuse share that comes from every
// direction alike. no clouds, no horizon, no ground reflection
//
// vectors are east, north, up. azimuths are compass bearings, 0 north, 90 east

export const SOLAR_CONSTANT = 1353;
// diffuse light from the clear sky as a share of the direct beam
export const DIFFUSE_SHARE = 0.1;

const DEG = Math.PI / 180;

export type Vec3 = [number, number, number];

// how much air the beam crosses compared with the sun straight overhead.
// kasten and young 1989, finite at the horizon where 1 / cos z is not
export function airMass(zenith: number): number {
  const z = Math.min(Math.max(zenith, 0), 90);
  return 1 / (Math.cos(z * DEG) + 0.50572 * (96.07995 - z) ** -1.6364);
}

// the direct beam on a surface that faces the sun, w per square metre. meinel
// and meinel 1976: 1353 * 0.7 ^ (AM ^ 0.678). zero with the sun below the horizon
export function directNormal(elevation: number): number {
  if (!(elevation > 0)) return 0;
  const am = airMass(90 - elevation);
  return SOLAR_CONSTANT * 0.7 ** (am ** 0.678);
}

// the unit vector towards the sun
export function sunVector(azimuth: number, elevation: number): Vec3 {
  const a = azimuth * DEG;
  const e = elevation * DEG;
  return [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
}

// the normal of a panel tilted by tilt degrees from flat, its face turned to a compass bearing
export function panelNormal(tilt: number, azimuth: number): Vec3 {
  const b = tilt * DEG;
  const a = azimuth * DEG;
  return [Math.sin(b) * Math.sin(a), Math.sin(b) * Math.cos(a), Math.cos(b)];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export interface Panel {
  // degrees from flat, 0 lies flat, 90 stands upright
  tilt: number;
  // the compass bearing the face looks to, 180 is south
  azimuth: number;
}

export interface Irradiance {
  fixed: number;
  single: number;
  dual: number;
}

// what a panel of each kind gets, w per square metre: the beam times the
// cosine of the angle to the sun, plus the share of the sky it can see
export function irradiance(sunAzimuth: number, sunElevation: number, panel: Panel): Irradiance {
  const beam = directNormal(sunElevation);
  if (beam <= 0) return { fixed: 0, single: 0, dual: 0 };
  const diffuse = DIFFUSE_SHARE * beam;
  const s = sunVector(sunAzimuth, sunElevation);
  // the sky a panel tilted by beta sees, isotropic: (1 + cos beta) / 2
  const sky = (cosTilt: number) => (diffuse * (1 + cosTilt)) / 2;

  const n = panelNormal(panel.tilt, panel.azimuth);
  const fixed = beam * Math.max(0, dot(n, s)) + sky(n[2]);

  // single axis, the axis lies flat and runs north to south, the panel rolls
  // east and west. it ends up facing the sun as far as one axis can: the
  // north south part of the sun direction is all that is left over
  const roll = Math.atan2(s[0], s[2]);
  const single = beam * Math.hypot(s[0], s[2]) + sky(Math.cos(roll));

  // dual axis, the panel faces the sun, its tilt from flat is the zenith angle
  const dual = beam + sky(s[2]);

  return { fixed, single, dual };
}

// the sun declination in degrees, the fourier series of spencer 1971, good to
// a few hundredths of a degree. only for checks, suncalc does the real work
export function declination(dayOfYear: number): number {
  const g = (2 * Math.PI * (dayOfYear - 1)) / 365;
  const rad =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  return rad / DEG;
}
