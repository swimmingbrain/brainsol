// every admin action goes through here. it marks the action as pending while
// the ack is out, turns a failed ack into one short note and remembers what the
// tracker said it cannot do, so that control can switch itself off with a reason

import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { AckMessage, Command } from '$lib/link/protocol';

export interface RunnerDeps {
  // resolves with the ack, never throws in the page (connection.send)
  send(command: Command): Promise<AckMessage>;
  // a failed ack, the page shows errorText(err) as a toast
  notify(err: string, command: Command): void;
}

export interface RunOptions {
  // what shows as pending, the op when left out
  key?: string;
  // what an unsupported answer switches off, the key when left out
  feature?: string;
  // the caller shows the failure in place, no toast
  quiet?: boolean;
  // false for the joystick stream, it would only flicker
  track?: boolean;
}

// these answers mean the tracker will never do it, a retry does not help
const MISSING = new Set(['unsupported', 'unknown']);

export class Runner {
  private busy = new SvelteMap<string, number>();
  private missing = new SvelteSet<string>();
  private deps: RunnerDeps;

  constructor(deps: RunnerDeps) {
    this.deps = deps;
  }

  pending(key: string): boolean {
    return (this.busy.get(key) ?? 0) > 0;
  }

  unsupported(feature: string): boolean {
    return this.missing.has(feature);
  }

  async run(command: Command, options: RunOptions = {}): Promise<AckMessage> {
    const key = options.key ?? command.op;
    const feature = options.feature ?? key;
    const track = options.track ?? true;
    if (track) this.busy.set(key, (this.busy.get(key) ?? 0) + 1);
    let ack: AckMessage;
    try {
      ack = await this.deps.send(command);
    } catch {
      ack = { t: 'ack', id: '', ok: false, err: 'offline' };
    } finally {
      if (track) {
        const left = (this.busy.get(key) ?? 1) - 1;
        if (left > 0) this.busy.set(key, left);
        else this.busy.delete(key);
      }
    }
    if (!ack.ok) {
      if (MISSING.has(ack.err)) this.missing.add(feature);
      if (!options.quiet) this.deps.notify(ack.err, command);
    }
    return ack;
  }

  // a new tracker or a fresh hello: what it can do is found out again
  reset(): void {
    this.missing.clear();
    this.busy.clear();
  }
}
