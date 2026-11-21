// what the control tab says under the mode switch while a pi follows the plan:
// the simulated day and time of the planner, how far the panel turns away from
// the sun and why, or why the head holds or parks. tr is t() or translate()

import { reasonText } from '$lib/farm/plan';
import type { Key, Params } from '$lib/i18n';
import type { PlanFollow } from '$lib/link/protocol';

export type Tr = (key: Key, params?: Params) => string;

export function followText(follow: PlanFollow | null | undefined, tr: Tr, fmt: (n: number) => string = String): string[] {
  if (!follow) return [];
  if (follow.lost) return [tr('admin.plan.lost')];
  // nothing came yet, there is no simulated moment to name
  if (!follow.ok && follow.up === null) return [tr('admin.plan.wait')];
  const lines: string[] = [];
  if (follow.date && follow.time) lines.push(tr('admin.plan.at', { date: follow.date, time: follow.time }));
  if (!follow.ok) lines.push(tr('admin.plan.away'));
  else if (follow.up === false) lines.push(tr('admin.plan.night'));
  else if (follow.offset !== null && follow.why) lines.push(tr('admin.plan.pose', { offset: fmt(follow.offset), why: reasonText(follow.why, tr) }));
  if (follow.paused) lines.push(tr('admin.plan.paused'));
  return lines;
}
