import { describe, expect, it } from 'vitest';
import { Runner } from './runner.svelte';
import type { AckMessage, Command } from '$lib/link/protocol';

// a fake connection: every send waits until the test answers it
function fakeLink() {
  const sent: Command[] = [];
  const answers: ((ack: AckMessage) => void)[] = [];
  const notes: string[] = [];
  const runner = new Runner({
    send(command) {
      sent.push(command);
      return new Promise((resolve) => answers.push(resolve));
    },
    notify(err) {
      notes.push(err);
    }
  });
  const answer = (ack: Partial<AckMessage>) => answers.shift()!({ t: 'ack', id: 'c1', ok: true, ...ack } as AckMessage);
  return { runner, sent, notes, answer };
}

describe('Runner', () => {
  it('passes the command through and marks it pending until the ack', async () => {
    const { runner, sent, answer } = fakeLink();
    const done = runner.run({ op: 'mode', mode: 'park' });
    expect(sent).toEqual([{ op: 'mode', mode: 'park' }]);
    expect(runner.pending('mode')).toBe(true);
    answer({ ok: true });
    const ack = await done;
    expect(ack.ok).toBe(true);
    expect(runner.pending('mode')).toBe(false);
  });

  it('keeps a key pending while any of two commands under it is out', async () => {
    const { runner, answer } = fakeLink();
    const a = runner.run({ op: 'stop' }, { key: 'activity' });
    const b = runner.run({ op: 'stop' }, { key: 'activity' });
    answer({ ok: true });
    await a;
    expect(runner.pending('activity')).toBe(true);
    answer({ ok: true });
    await b;
    expect(runner.pending('activity')).toBe(false);
  });

  it('turns a failed ack into one note and remembers what is unsupported', async () => {
    const { runner, notes, answer } = fakeLink();
    const done = runner.run({ op: 'scan', step: 15 });
    answer({ ok: false, err: 'unsupported' });
    await done;
    expect(notes).toEqual(['unsupported']);
    expect(runner.unsupported('scan')).toBe(true);
    expect(runner.unsupported('exp')).toBe(false);
  });

  it('files unsupported under the feature name when one is given', async () => {
    const { runner, answer } = fakeLink();
    const done = runner.run({ op: 'mode', mode: 'sun' }, { key: 'mode', feature: 'mode.sun' });
    answer({ ok: false, err: 'unknown' });
    await done;
    expect(runner.unsupported('mode.sun')).toBe(true);
    expect(runner.unsupported('mode')).toBe(false);
  });

  it('does not count busy or bad answers as missing features', async () => {
    const { runner, notes, answer } = fakeLink();
    const a = runner.run({ op: 'exp', kind: 'step' });
    answer({ ok: false, err: 'busy' });
    await a;
    const b = runner.run({ op: 'set', key: 'kp', value: 5 }, { quiet: true });
    answer({ ok: false, err: 'bad' });
    await b;
    expect(runner.unsupported('exp')).toBe(false);
    expect(runner.unsupported('set')).toBe(false);
    // the quiet one leaves the note to the caller
    expect(notes).toEqual(['busy']);
  });

  it('leaves the pending state alone for untracked commands', async () => {
    const { runner, answer } = fakeLink();
    const done = runner.run({ op: 'rate', pan: 1, tilt: 0 }, { track: false });
    expect(runner.pending('rate')).toBe(false);
    answer({ ok: true });
    await done;
  });

  it('answers offline when the link throws after all', async () => {
    const notes: string[] = [];
    const runner = new Runner({
      send: () => Promise.reject(new Error('gone')),
      notify: (err) => notes.push(err)
    });
    const ack = await runner.run({ op: 'stop' });
    expect(ack).toMatchObject({ ok: false, err: 'offline' });
    expect(notes).toEqual(['offline']);
    expect(runner.pending('stop')).toBe(false);
  });

  it('forgets everything on reset', async () => {
    const { runner, answer } = fakeLink();
    const done = runner.run({ op: 'calib', step: 'dark' });
    answer({ ok: false, err: 'unsupported' });
    await done;
    runner.run({ op: 'stop' });
    runner.reset();
    expect(runner.unsupported('calib')).toBe(false);
    expect(runner.pending('stop')).toBe(false);
  });
});
