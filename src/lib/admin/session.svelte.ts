// the state of the admin tools that outlives the dock: the dock unmounts when
// the tools lock or presentation mode starts, the open tab and what the
// tracker said it cannot do stay here

import { connection } from '$lib/stores/connection.svelte';
import { toast } from '$lib/stores/toasts.svelte';
import { errorText } from '$lib/i18n';
import { Runner } from './runner.svelte';

export type TabId = 'control' | 'tuning' | 'calib' | 'scan' | 'exp' | 'system' | 'link';

export const runner = new Runner({
  send: (command) => connection.send(command),
  notify: (err) => toast(errorText(err), 'warning', 4000)
});

class Session {
  tab = $state<TabId>('control');
}

export const session = new Session();
