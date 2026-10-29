// the state of the admin tools that outlives the dock: the dock unmounts when
// the tools lock or presentation mode starts, the open tab and what the
// tracker said it cannot do stay here

import { connection } from '$lib/stores/connection.svelte';
import { toast } from '$lib/stores/toasts.svelte';
import { errorText } from '$lib/i18n';
import { Runner } from './runner.svelte';
import type { SunSpeed } from '$lib/link/protocol';
import type { FlowStep } from './calib';
import { SCAN_STEP_DEFAULT } from './commands';

export type StepState = 'running' | 'done' | 'failed' | 'unclear';

// what one calibration step did, as the tab shows it
export interface StepResult {
  state: StepState;
  // the sentence for the person at the tracker
  note?: string;
  tone?: 'ok' | 'info' | 'warn' | 'error';
  // what the tracker itself said, in its own words
  detail?: string;
}

export type TabId = 'control' | 'tuning' | 'calib' | 'scan' | 'exp' | 'system' | 'link';

// today as the date field writes it, in local time
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const runner = new Runner({
  send: (command) => connection.send(command),
  notify: (err) => toast(errorText(err), 'warning', 4000)
});

class Session {
  tab = $state<TabId>('control');
  // the time lapse the admin picked last, the tracker does not report it
  sunSpeed = $state<SunSpeed>(1);
  sunDate = $state(today());
  // the calibration of this visit: each step and where dark and bright landed
  calib = $state<Partial<Record<FlowStep, StepResult>>>({});
  dark = $state.raw<number[] | null>(null);
  bright = $state.raw<number[] | null>(null);
  scanStep = $state(SCAN_STEP_DEFAULT);
  // the pi of config.json, undefined until it was read
  defaultAddress = $state<string | undefined>(undefined);
}

export const session = new Session();
