// the sun for sun mode, the same as sun.py on the pi. where it stands for the
// site and the heading of the device, how much light it gives, and a clock for
// real time or time lapse

import { getPosition } from 'suncalc';
import { wrap180 } from './kinematics';
import { SUN_LIGHT } from './physics';

// the time lapse speeds the page offers, any speed from 1 to 3600 is taken
export const SUN_SPEEDS = [1, 60, 600, 3600] as const;
export const SPEED_MIN = 1;
export const SPEED_MAX = 3600;

// one date for every position, suncalc only reads its time
const when = new Date(0);

// compass azimuth (north 0, east 90) and elevation in degrees at a unix time in
// seconds. suncalc gives the apparent elevation, refraction included, like astral
export function sunPosition(lat: number, lon: number, time: number): { caz: number; el: number } {
  when.setTime(time * 1000);
  const p = getPosition(when, lat, lon);
  return { caz: p.azimuth, el: p.altitude };
}

// azimuth seen from the device, clockwise from its front
export function relativeAz(caz: number, heading: number): number {
  return wrap180(caz - heading);
}

// direct and ambient lux of the sun scene, thinner near the horizon through
// more air, a dim sky in the dusk and a dark one at night
export function sunLight(el: number): { lux: number; amb: number } {
  const [direct, ambient] = [SUN_LIGHT.lux0, SUN_LIGHT.amb];
  if (el <= 0) return { lux: 0, amb: Math.min(ambient, Math.max(5, ambient * (1 + el / 6))) };
  const air = 1 / Math.max(Math.sin((el * Math.PI) / 180), 0.02);
  return {
    lux: (direct * Math.pow(0.7, Math.pow(air, 0.678))) / 0.7,
    amb: ambient * Math.min(1, 0.3 + el / 30)
  };
}

// real time or time lapse. the time lapse runs on the seconds of the loop, so
// a tab that slept does not make the sun jump, and a new speed never moves it
export class SunClock {
  speed = 1;
  // the simulated unix time in seconds, null while it follows the real clock
  private time: number | null = null;

  get live(): boolean {
    return this.time === null;
  }

  // wall is the real unix time in seconds
  now(wall: number): number {
    return this.time ?? wall;
  }

  // a start time jumps there, speed 1 without one goes back to the real clock
  set(speed: number, start: number | null, wall: number): void {
    const current = this.now(wall);
    this.speed = speed;
    if (start !== null) this.time = start;
    else if (speed === 1) this.time = null;
    else this.time = current;
  }

  advance(dt: number): void {
    if (this.time !== null) this.time += dt * this.speed;
  }
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?$/;

// february 30 and friends would roll over into the next month, they are not dates
function realDay(y: number, m: number, d: number): boolean {
  return m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// an iso date as unix seconds, null when it is not one. a date alone keeps the
// time of day of now, a time without a zone is local time in this browser
export function parseWhen(text: string, now: number): number | null {
  const value = text.trim();
  const day = DATE_ONLY.exec(value);
  if (day) {
    const [y, m, d] = [Number(day[1]), Number(day[2]), Number(day[3])];
    if (!realDay(y, m, d)) return null;
    const date = new Date(now * 1000);
    date.setFullYear(y, m - 1, d);
    return date.getTime() / 1000;
  }
  const full = DATE_TIME.exec(value);
  if (!full || !realDay(Number(full[1]), Number(full[2]), Number(full[3]))) return null;
  if (Number(full[4]) > 23 || Number(full[5]) > 59) return null;
  // the zone is written with a colon so every engine reads it the same way
  const zone = full[8] && full[8] !== 'Z' && !full[8].includes(':') ? `${full[8].slice(0, 3)}:${full[8].slice(3)}` : (full[8] ?? '');
  const ms = Date.parse(value.slice(0, value.length - (full[8]?.length ?? 0)).replace(' ', 'T') + zone);
  return Number.isFinite(ms) ? ms / 1000 : null;
}
