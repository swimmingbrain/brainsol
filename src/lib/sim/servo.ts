// how an angle becomes a servo pulse and back, the mapping of section 3:
// us = centre_us + dir * (angle - angle0) * us_per_deg. the engine keeps one
// map per axis in its calibration, the simulated servos turn with the default
// maps, so a wrong zero shows up the way it would on the real head

// the pulse range the bridge firmware accepts
export const US_MIN = 500;
export const US_MAX = 2500;
// about 180 degrees for 500 to 2500 us
export const US_PER_DEG = 2000 / 180;

export interface ServoMap {
  centreUs: number;
  angle0: number;
  usPerDeg: number;
  dir: number;
}

export function defaultPanMap(): ServoMap {
  return { centreUs: 1500, angle0: 0, usPerDeg: US_PER_DEG, dir: 1 };
}

export function defaultTiltMap(): ServoMap {
  return { centreUs: 1500, angle0: 90, usPerDeg: US_PER_DEG, dir: 1 };
}

// whole microseconds inside the firmware range, the way the pi sends them
export function toUs(map: ServoMap, angle: number): number {
  const us = map.centreUs + map.dir * (angle - map.angle0) * map.usPerDeg;
  return Math.round(us < US_MIN ? US_MIN : us > US_MAX ? US_MAX : us);
}

export function toAngle(map: ServoMap, us: number): number {
  return map.angle0 + (us - map.centreUs) / (map.dir * map.usPerDeg);
}

export function sameMap(a: ServoMap, b: ServoMap): boolean {
  return a.centreUs === b.centreUs && a.angle0 === b.angle0 && a.usPerDeg === b.usPerDeg && a.dir === b.dir;
}
