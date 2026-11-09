// the experiment results this page has seen since the admin tools opened. in
// the simulation nothing is stored anywhere else, so this list is all there
// is. it keeps listening when the dock goes away, presentation mode hides it
// while an experiment may well finish

import { untrack } from 'svelte';
import { telemetry } from '$lib/stores/telemetry.svelte';
import type { ExpMessage, ExperimentRecord } from '$lib/link/protocol';

export const SESSION_LIMIT = 30;

export class Session {
  records = $state.raw<ExperimentRecord[]>([]);
  private watching = false;

  // a finished experiment goes on top, each id once
  add(message: ExpMessage | null, ts = Date.now() / 1000): boolean {
    if (!message || !message.result || !message.id) return false;
    if (this.records.some((r) => r.id === message.id)) return false;
    const record: ExperimentRecord = { id: message.id, kind: message.kind, ts, result: message.result };
    this.records = [record, ...this.records].slice(0, SESSION_LIMIT);
    return true;
  }

  clear(): void {
    this.records = [];
  }

  // starts once and runs for the life of the page
  watch(): void {
    if (this.watching) return;
    this.watching = true;
    $effect.root(() => {
      $effect(() => {
        const message = telemetry.exp;
        untrack(() => this.add(message));
      });
    });
  }
}

export const session = new Session();
