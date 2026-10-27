// one day and one year of the clear sky model for a site. the clock is local
// mean solar time, the longitude sets it, so 12:00 is close to solar noon
// anywhere and no time zone is needed

import { getPosition } from 'suncalc';
import { irradiance, type Irradiance, type Panel } from './model';

export interface Site {
  lat: number;
  lon: number;
}

export interface Day {
  // hours of local mean solar time, 0 to 24
  hours: number[];
  fixed: number[];
  single: number[];
  dual: number[];
  // the sun elevation in degrees at each hour
  elevation: number[];
  // the energy of the day in kWh per square metre
  energy: Irradiance;
  // first and last hour with the sun above the horizon, null on a polar night
  sunrise: number | null;
  sunset: number | null;
  // the highest sun of the day in degrees
  noon: number;
}

export const DAY_STEP_MINUTES = 5;

// days of the months in a year without the 29th of february
export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
// the day of each month whose sun is closest to the monthly mean, after klein 1977
export const MEAN_DAYS = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];

// the utc instant of a solar time on a day of the year
export function instant(year: number, dayOfYear: number, hours: number, lon: number): Date {
  return new Date(Date.UTC(year, 0, dayOfYear) + (hours - lon / 15) * 3600_000);
}

// a day of the year as a month and a date, without a leap day
export function dateOf(dayOfYear: number): { month: number; date: number } {
  let rest = Math.min(365, Math.max(1, Math.round(dayOfYear)));
  for (let month = 0; month < 12; month++) {
    if (rest <= MONTH_DAYS[month]) return { month, date: rest };
    rest -= MONTH_DAYS[month];
  }
  return { month: 11, date: 31 };
}

export function dayOfYear(month: number, date: number): number {
  let day = date;
  for (let m = 0; m < month; m++) day += MONTH_DAYS[m];
  return day;
}

export function simulateDay(site: Site, day: number, panel: Panel, year = 2026, stepMinutes = DAY_STEP_MINUTES): Day {
  const steps = Math.round((24 * 60) / stepMinutes);
  const out: Day = {
    hours: [],
    fixed: [],
    single: [],
    dual: [],
    elevation: [],
    energy: { fixed: 0, single: 0, dual: 0 },
    sunrise: null,
    sunset: null,
    noon: -90
  };
  for (let i = 0; i <= steps; i++) {
    const hours = (i * stepMinutes) / 60;
    const sun = getPosition(instant(year, day, hours, site.lon), site.lat, site.lon);
    const power = irradiance(sun.azimuth, sun.altitude, panel);
    out.hours.push(hours);
    out.fixed.push(power.fixed);
    out.single.push(power.single);
    out.dual.push(power.dual);
    out.elevation.push(sun.altitude);
    if (sun.altitude > out.noon) out.noon = sun.altitude;
    if (sun.altitude > 0) {
      out.sunrise ??= hours;
      out.sunset = hours;
    }
  }
  out.energy = {
    fixed: integrate(out.hours, out.fixed),
    single: integrate(out.hours, out.single),
    dual: integrate(out.hours, out.dual)
  };
  return out;
}

// the area under a curve of w per square metre over hours, as kWh per square metre
export function integrate(hours: number[], watts: number[]): number {
  let sum = 0;
  for (let i = 1; i < hours.length; i++) sum += ((watts[i] + watts[i - 1]) / 2) * (hours[i] - hours[i - 1]);
  return sum / 1000;
}

export interface Month {
  month: number;
  // the energy of a mean day of the month, kWh per square metre
  daily: Irradiance;
}

export interface Year {
  months: Month[];
  // the whole year, kWh per square metre
  total: Irradiance;
}

// each month stands for its mean day, a coarser step is plenty for a total
export function simulateYear(site: Site, panel: Panel, year = 2026, stepMinutes = 10): Year {
  const total = { fixed: 0, single: 0, dual: 0 };
  const months = MEAN_DAYS.map((day, month) => {
    const { energy } = simulateDay(site, day, panel, year, stepMinutes);
    total.fixed += energy.fixed * MONTH_DAYS[month];
    total.single += energy.single * MONTH_DAYS[month];
    total.dual += energy.dual * MONTH_DAYS[month];
    return { month, daily: energy };
  });
  return { months, total };
}

// the usual fixed panel of a place: it faces the equator and is tilted a bit
// less than the latitude, after the rule of thumb 0.76 times the latitude plus 3
export function fixedPanelFor(lat: number): Panel {
  return { tilt: Math.round(Math.min(60, Math.abs(lat) * 0.76 + 3.1)), azimuth: lat >= 0 ? 180 : 0 };
}

// how much more a tracker collects than the fixed panel, 0.34 is 34 percent more
export function gain(tracked: number, fixed: number): number | null {
  return fixed > 0 ? tracked / fixed - 1 : null;
}
