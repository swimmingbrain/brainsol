// the day and the year of the simulator as plain csv for a spreadsheet or a
// paper. one header line, a dot as decimal mark, w and kWh per square metre

import type { Day, Year } from './day';

const num = (value: number, digits: number) => (Number.isFinite(value) ? (Math.round(value * 10 ** digits) / 10 ** digits).toString() : '');

export function dayCsv(day: Day): string {
  const rows = ['solar_time_h,sun_elevation_deg,fixed_w_m2,single_axis_w_m2,dual_axis_w_m2'];
  day.hours.forEach((hours, i) => {
    rows.push([num(hours, 4), num(day.elevation[i], 2), num(day.fixed[i], 1), num(day.single[i], 1), num(day.dual[i], 1)].join(','));
  });
  return rows.join('\n') + '\n';
}

export function yearCsv(year: Year): string {
  const rows = ['month,fixed_kwh_m2_day,single_axis_kwh_m2_day,dual_axis_kwh_m2_day'];
  for (const m of year.months) rows.push([m.month + 1, num(m.daily.fixed, 3), num(m.daily.single, 3), num(m.daily.dual, 3)].join(','));
  rows.push(['year', num(year.total.fixed, 1), num(year.total.single, 1), num(year.total.dual, 1)].join(','));
  return rows.join('\n') + '\n';
}
