// the state of the admin tools that outlives the dock: the dock unmounts when
// the tools lock or presentation mode starts, the open tab and what the
// tracker said it cannot do stay here

import { connection } from '$lib/stores/connection.svelte';
import { toast } from '$lib/stores/toasts.svelte';
import { errorText } from '$lib/i18n';
import { Runner } from './runner.svelte';
import type { SunSpeed } from '$lib/link/protocol';

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
}

export const session = new Session();
