import { describe, expect, it } from 'vitest';
import { ShaderChunk } from 'three';
import { direction } from '$lib/sim/kinematics';
import { firstTier, keyDirection, Lighting, MIN_EL, Pacer, ROOM, tableShade, TIERS, useShoulder } from './lighting';

const CENTRE: [number, number, number] = [0, -32, 107.5];

function settle(lighting: Lighting, kind: Parameters<Lighting['aim']>[0], sky: { az: number; el: number } | null) {
  for (let i = 0; i < 240; i++) lighting.aim(kind, sky, 1 / 60);
}

describe('the light on the tracker', () => {
  it('comes from where the lamp stands, never from below the horizon', () => {
    const d = keyDirection({ az: 35, el: 50 });
    direction(35, 50).forEach((v, i) => expect(d[i]).toBeCloseTo(v, 9));
    expect(keyDirection({ az: 80, el: -10 })[2]).toBeCloseTo(Math.sin((MIN_EL * Math.PI) / 180), 9);
    expect(keyDirection({ az: 0, el: 120 })[2]).toBeCloseTo(1, 9);
  });

  it('lays a fainter shadow on the table the lower the light stands', () => {
    expect(tableShade(90)).toBeCloseTo(1, 9);
    expect(tableShade(30)).toBeLessThan(tableShade(60));
    expect(tableShade(MIN_EL)).toBeGreaterThan(0);
    expect(tableShade(-20)).toBe(tableShade(MIN_EL));
  });

  it('starts a phone or a weak machine a step lower and a small weak one two', () => {
    expect(firstTier({ width: 1920, height: 1080, coarse: false, cores: 8, memory: 16 })).toBe(0);
    expect(firstTier({ width: 1920, height: 1080, coarse: false })).toBe(0);
    expect(firstTier({ width: 390, height: 844, coarse: true, cores: 8 })).toBe(1);
    expect(firstTier({ width: 1366, height: 768, coarse: false, cores: 4 })).toBe(1);
    expect(firstTier({ width: 360, height: 740, coarse: true, cores: 4, memory: 2 })).toBe(2);
  });

  it('only gets cheaper down the tiers and ends without shadows', () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i].shadow).toBeLessThanOrEqual(TIERS[i - 1].shadow);
      expect(TIERS[i].ratio).toBeLessThanOrEqual(TIERS[i - 1].ratio);
    }
    expect(TIERS[TIERS.length - 1].shadow).toBe(0);
  });

  it('asks for a cheaper tier only when most frames of a stretch are slow', () => {
    const pacer = new Pacer(10, 26);
    const run = (ms: number[]) => ms.map((m) => pacer.add(m)).some(Boolean);
    expect(run(Array(10).fill(16.7))).toBe(false);
    // a few hitches do not count
    expect(run([16.7, 16.7, 60, 16.7, 16.7, 90, 16.7, 16.7, 16.7, 16.7])).toBe(false);
    expect(run(Array(10).fill(40))).toBe(true);
    // pauses of the page are not frames
    expect(run(Array(30).fill(5000))).toBe(false);
    pacer.reset(5);
    expect(run(Array(14).fill(40))).toBe(false);
    expect(run([40])).toBe(true);
  });

  it('turns the key light to the lamp and draws the shadow again only when it moved', () => {
    const lighting = new Lighting(CENTRE, 190, 160);
    settle(lighting, 'lamp', { az: 30, el: 40 });
    const to = direction(30, 40);
    const at = lighting.key.position.clone().sub(lighting.key.target.position).normalize();
    expect(at.x).toBeCloseTo(to[0], 6);
    expect(at.y).toBeCloseTo(to[1], 6);
    expect(at.z).toBeCloseTo(to[2], 6);
    lighting.moved = false;
    settle(lighting, 'lamp', { az: 30, el: 40 });
    expect(lighting.moved).toBe(false);
    lighting.aim('lamp', { az: 31, el: 40 }, 1 / 60);
    expect(lighting.moved).toBe(true);
    lighting.dispose();
  });

  it('dims to the room light when the lamp goes off and eases there', () => {
    const lighting = new Lighting(CENTRE, 190, 160);
    settle(lighting, 'lamp', { az: 30, el: 40 });
    const lit = lighting.key.intensity;
    expect(lighting.aim('off', null, 1 / 60)).toBe(true);
    settle(lighting, 'off', null);
    expect(lighting.key.intensity).toBeLessThan(lit * 0.5);
    expect(lighting.key.intensity).toBeGreaterThan(0);
    const room = direction(ROOM.az, ROOM.el);
    const at = lighting.key.position.clone().sub(lighting.key.target.position).normalize();
    expect(at.z).toBeCloseTo(room[2], 6);
    expect(lighting.aim('off', null, 1 / 60)).toBe(false);
    lighting.dispose();
  });

  it('falls back to the room when a lamp has no place on the sky', () => {
    const lighting = new Lighting(CENTRE, 190, 160);
    expect(() => settle(lighting, 'lamp', null)).not.toThrow();
    const room = direction(ROOM.az, ROOM.el);
    const at = lighting.key.position.clone().sub(lighting.key.target.position).normalize();
    expect(at.x).toBeCloseTo(room[0], 6);
    lighting.dispose();
  });

  it('turns the shadow off for the cheapest tier and keeps the light', () => {
    const lighting = new Lighting(CENTRE, 190, 160);
    lighting.setShadow(1024);
    expect(lighting.key.castShadow).toBe(true);
    expect(lighting.key.shadow.mapSize.x).toBe(1024);
    lighting.setShadow(0);
    expect(lighting.key.castShadow).toBe(false);
    settle(lighting, 'lamp', { az: 0, el: 60 });
    expect(lighting.key.intensity).toBeGreaterThan(0);
    lighting.dispose();
  });

  it('rolls off only the bright end, once, in place of the empty custom tone mapping', () => {
    useShoulder();
    useShoulder();
    const chunk = ShaderChunk.tonemapping_pars_fragment;
    expect(chunk).not.toContain('vec3 CustomToneMapping( vec3 color ) { return color; }');
    expect(chunk.split('vec3 CustomToneMapping(').length).toBe(2);
    expect(chunk).toContain('if ( peak < start ) return color;');
  });
});
