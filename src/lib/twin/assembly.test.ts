import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filesOf, panelJoint, parseAssembly, readAssembly, STANDIN_ASSEMBLY } from './assembly';

// an example assembly.json with every field filled in
const CONTRACT = {
  units: 'mm',
  frame: 'x right, y forward, z up',
  parts: [
    { id: 'base', file: 'base.glb', joint: null, color: 'body' },
    { id: 'neck', file: 'neck.glb', joint: 'pan', color: 'dark' },
    { id: 'head', file: 'head.glb', joint: 'tilt', color: 'dark' },
    { id: 'panel', file: 'panel.glb', joint: 'tilt', color: 'panel' }
  ],
  joints: {
    pan: { origin: [0, -32, 48], axis: [0, 0, -1], parent: null, range: [-90, 90] },
    tilt: { origin: [0, -32, 107.5], axis: [1, 0, 0], parent: 'pan', range: [0, 180] }
  },
  sensors: { L: [-67.5, 6, 107.5], R: [67.5, 6, 107.5], U: [0, 6, 155], D: [0, 6, 60], lux: [-70, 6, 140] },
  panel: { center: [0, 5, 107.5], size: [125, 85], normal: [0, 1, 0], up: [0, 0, 1] },
  bounds: { min: [-78, -78, 0], max: [78, 78, 164] }
};

const clone = () => structuredClone(CONTRACT) as Record<string, unknown> & typeof CONTRACT;

describe('assembly.json', () => {
  it('reads a complete assembly.json', () => {
    const a = parseAssembly(CONTRACT);
    expect(a).not.toBeNull();
    expect(a!.parts.map((p) => p.id)).toEqual(['base', 'neck', 'head', 'panel']);
    expect(a!.joints.tilt.parent).toBe('pan');
    expect(a!.sensors.U).toEqual([0, 6, 155]);
    expect(filesOf(a!)).toEqual(['base.glb', 'neck.glb', 'head.glb', 'panel.glb']);
    expect(panelJoint(a!)).toBe('tilt');
  });

  it('refuses what it cannot draw', () => {
    expect(parseAssembly(null)).toBeNull();
    expect(parseAssembly('base.glb')).toBeNull();
    expect(parseAssembly({ ...clone(), units: 'm' })).toBeNull();
    expect(parseAssembly({ ...clone(), parts: [] })).toBeNull();
    const badJoint = clone();
    badJoint.joints.tilt.axis = [0, 0, 0];
    expect(parseAssembly(badJoint)).toBeNull();
    const unknown = clone();
    unknown.parts[1].joint = 'yaw';
    expect(readAssembly(unknown)).toEqual({ problem: 'part neck moves with an unknown joint yaw' });
    const twice = clone();
    twice.parts[2].id = 'neck';
    expect(parseAssembly(twice)).toBeNull();
  });

  it('keeps file names inside the models folder', () => {
    for (const file of ['../secret.glb', 'https://example.com/a.glb', '/etc/a.glb']) {
      const a = clone();
      a.parts[0].file = file;
      expect(parseAssembly(a), file).toBeNull();
    }
  });

  it('fills what is optional and leaves out what is broken', () => {
    const a = clone() as Record<string, unknown>;
    delete a.units;
    delete a.bounds;
    a.sensors = { L: [1, 2], R: [1, 2, 3] };
    a.panel = { center: [0, 5, 100], size: [125, 85] };
    (a.parts as { color: string }[])[0].color = 'rainbow';
    const parsed = parseAssembly(a)!;
    expect(parsed.bounds).toBeNull();
    expect(parsed.sensors).toEqual({ R: [1, 2, 3] });
    expect(parsed.panel).toEqual({ center: [0, 5, 100], size: [125, 85], normal: [0, 1, 0], up: [0, 0, 1] });
    expect(parsed.parts[0].color).toBe('dark');
  });

  it('ships the cad export with a glb for every part', () => {
    const models = new URL('../../../static/models/', import.meta.url);
    const a = parseAssembly(JSON.parse(readFileSync(new URL('assembly.json', models), 'utf-8')));
    expect(a).not.toBeNull();
    expect(filesOf(a!)).toEqual(['base.glb', 'neck.glb', 'head.glb', 'panel.glb']);
    // the base carries the engraved signature of the lid and gets more room, the export checks the same limits
    const sizes = filesOf(a!).map((file) => statSync(new URL(file, models)).size);
    filesOf(a!).forEach((file, i) => expect(sizes[i], file).toBeLessThan(file === 'base.glb' ? 600_000 : 400_000));
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThan(1_500_000);
    expect(filesOf(STANDIN_ASSEMBLY)).toEqual([]);
  });

  it('places the stand in sensors at the edge centres around the panel', () => {
    const { L, R, U, D } = STANDIN_ASSEMBLY.sensors;
    const c = STANDIN_ASSEMBLY.panel!.center;
    expect(L![0]).toBeLessThan(-125 / 2);
    expect(R![0]).toBeGreaterThan(125 / 2);
    expect(U![2]).toBeGreaterThan(c[2] + 85 / 2);
    expect(D![2]).toBeLessThan(c[2] - 85 / 2);
    expect(L![2]).toBe(c[2]);
    expect(U![0]).toBe(c[0]);
  });
});
