import { describe, expect, it, vi } from 'vitest';
import { STANDIN_ASSEMBLY } from './assembly';
import { loadModel, measure } from './loader';

function answer(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' }
    })) as unknown as typeof fetch;
}

describe('the model loader', () => {
  it('shows the stand in when there is no assembly.json', async () => {
    const model = await loadModel('/models/', answer(404, 'missing'));
    expect(model.source).toBe('standin');
    expect(model.assembly).toEqual(STANDIN_ASSEMBLY);
    expect(Object.keys(model.pieces).sort()).toEqual(['base', 'head', 'neck', 'panel']);
  });

  it('shows the stand in when the request fails', async () => {
    const failing = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect((await loadModel('/models/', failing)).source).toBe('standin');
  });

  it('shows the stand in for a file it cannot use, and says why', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await loadModel('/models/', answer(200, '{ not json'))).source).toBe('standin');
    expect((await loadModel('/models/', answer(200, { units: 'm', parts: [] }))).source).toBe('standin');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('draws parts without a file with the stand in and the joints of the file', async () => {
    const assembly = structuredClone(STANDIN_ASSEMBLY) as unknown as Record<string, unknown>;
    (assembly.joints as Record<string, { origin: number[] }>).tilt.origin = [0, -30, 110];
    const model = await loadModel('/models/', answer(200, { units: 'mm', ...assembly }));
    expect(model.source).toBe('standin');
    expect(model.assembly.joints.tilt.origin).toEqual([0, -30, 110]);
    expect(model.pieces.head.length).toBeGreaterThan(0);
  });

  it('falls back to the stand in when a glb does not load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const files = { ...STANDIN_ASSEMBLY, parts: STANDIN_ASSEMBLY.parts.map((p) => ({ ...p, file: `${p.id}.glb` })) };
    // a scheme nobody serves, the glb request fails without touching the network
    const model = await loadModel('nowhere:/models/', answer(200, files));
    expect(model.source).toBe('standin');
    expect(model.assembly).toEqual(STANDIN_ASSEMBLY);
    warn.mockRestore();
  });

  it('measures the stand in about as large as its bounds', async () => {
    const model = await loadModel('/models/', answer(404, ''));
    const box = measure(model.pieces)!;
    const b = STANDIN_ASSEMBLY.bounds!;
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(box.min[i] - b.min[i])).toBeLessThan(2);
      expect(Math.abs(box.max[i] - b.max[i])).toBeLessThan(2);
    }
  });
});
