import { describe, expect, it } from 'vitest';
import { Session, SESSION_LIMIT } from './session.svelte';
import type { ExpMessage } from '$lib/link/protocol';

const done = (id: string): ExpMessage => ({
  t: 'exp',
  id,
  kind: 'compare',
  phase: 'done',
  progress: 1,
  result: { gain: 1.3, spread: 0.02, rounds: [{ fixed: 100, tracked: 130 }] }
});

describe('the results of this session', () => {
  it('keeps finished experiments, newest first, each once', () => {
    const session = new Session();
    expect(session.add(done('a'), 1)).toBe(true);
    expect(session.add(done('b'), 2)).toBe(true);
    expect(session.add(done('a'), 3)).toBe(false);
    expect(session.records.map((r) => r.id)).toEqual(['b', 'a']);
    expect(session.records[1].ts).toBe(1);
  });

  it('ignores running experiments and empty messages', () => {
    const session = new Session();
    expect(session.add({ ...done('c'), result: null, progress: 0.4 })).toBe(false);
    expect(session.add(null)).toBe(false);
    expect(session.records).toHaveLength(0);
  });

  it('keeps a bounded list', () => {
    const session = new Session();
    for (let i = 0; i < SESSION_LIMIT + 5; i++) session.add(done(`r${i}`), i);
    expect(session.records).toHaveLength(SESSION_LIMIT);
    expect(session.records[0].id).toBe(`r${SESSION_LIMIT + 4}`);
  });
});
