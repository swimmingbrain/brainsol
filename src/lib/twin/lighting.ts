// the light on the tracker. the key light comes from where the lamp or the sun
// stands on the sky, so the side that looks at it is bright, the far side falls
// off and the panel catches the light once it has turned to it. a soft fill
// from the room keeps every face readable and gives the plastic its sheen, and
// the key throws a soft shadow on the table and from part to part. without a
// lamp or a sun a quiet room light from the front left stands in.
//
// the shadow map is only drawn again when the light or the pose has moved, a
// turn of the camera alone does not need it

import { BackSide, CircleGeometry, Color, CustomBlending, DirectionalLight, Group, Mesh, OneFactor, OneMinusSrcAlphaFactor, PMREMGenerator, Scene, ShaderChunk, ShaderMaterial, ShadowMaterial, SphereGeometry, Vector3, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { clamp, direction, type Vec3 } from '$lib/sim/kinematics';
import { follow } from './damp';
import type { Sky } from './light';
import type { Palette } from './palette';

// room is the light of the room when nothing else is known, off a lamp that was switched off
export type LightKind = 'lamp' | 'sun' | 'room' | 'off';

// a lamp on the horizon would throw an endless shadow, the key stays a little above it
export const MIN_EL = 4;
// where the room light comes from when no lamp or sun is known
export const ROOM: Sky = { az: -55, el: 52 };
// how strong each kind of light is against the lamp
const STRENGTH: Record<LightKind, number> = { lamp: 1, sun: 1.05, room: 0.45, off: 0.28 };
// a desk lamp is a touch warm, the sun a little less, the room plain
const TINT: Record<LightKind, number> = { lamp: 0xfff8f0, sun: 0xfffaf4, room: 0xf8f8f8, off: 0xf8f8f8 };
const POOL = new Color(TINT.lamp);
// seconds a change of light takes, from the lamp to the sun or the lamp going off
const BLEND = 0.6;
// how far the light sits from the middle of the sky, in millimetres
const DISTANCE = 600;
// softness of the shadows in millimetres, on the tracker and on the table
const SOFT_PART = 1.2;
const SOFT_TABLE = 5;

// the direction from the middle of the sky towards a light, never below MIN_EL
export function keyDirection(sky: Sky): Vec3 {
  return direction(sky.az, clamp(sky.el, MIN_EL, 90));
}

// how dark the shadow on the table is against a light straight above. a low
// light hardly lights the table, so its long shadow is faint too
export function tableShade(el: number): number {
  const e = clamp(el, MIN_EL, 90);
  return Math.sqrt(Math.sin((e * Math.PI) / 180));
}

const CUSTOM_STUB = 'vec3 CustomToneMapping( vec3 color ) { return color; }';

// the tone mapping of the lit parts: the neutral curve of khronos that three.js
// has built in, without its toe. the toe pulls every colour below 0.08 down
// towards black, which turns the charcoal head into a black blob in the
// shade. here dark colours stay as they are and only the bright end is
// rolled off softly, so the light grey of the base never burns out
const SHOULDER = `vec3 CustomToneMapping( vec3 color ) {
	const float start = 0.8;
	const float desaturation = 0.15;
	color *= toneMappingExposure;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < start ) return color;
	float d = 1.0 - start;
	float top = 1.0 - d * d / ( peak + d - start );
	color *= top / peak;
	float g = 1.0 - 1.0 / ( desaturation * ( peak - top ) + 1.0 );
	return mix( color, vec3( top ), g );
}`;

// puts SHOULDER in place of the empty custom tone mapping of three.js, once
// and before the first material is compiled
export function useShoulder(): void {
  const chunk = ShaderChunk.tonemapping_pars_fragment;
  if (chunk.includes(CUSTOM_STUB)) ShaderChunk.tonemapping_pars_fragment = chunk.replace(CUSTOM_STUB, SHOULDER);
}

// a quiet room around the tracker for the fill light and the sheen of the
// plastic: bright above, grey at the horizon, darker below where the table is.
// nothing in it has a shape, so no studio shows up in a reflection. drawn
// once, the context has to draw it again after it was lost
export function roomEnvironment(renderer: WebGLRenderer): WebGLRenderTarget {
  const scene = new Scene();
  const geometry = new SphereGeometry(10, 32, 16);
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    vertexShader: `varying vec3 vDir;
void main() {
	vDir = position;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,
    fragmentShader: `varying vec3 vDir;
void main() {
	float up = normalize( vDir ).z;
	vec3 c = mix( vec3( 0.18, 0.175, 0.17 ), vec3( 0.55 ), smoothstep( -0.3, 0.05, up ) );
	gl_FragColor = vec4( mix( c, vec3( 0.85 ), smoothstep( 0.05, 0.85, up ) ), 1.0 );
}`
  });
  scene.add(new Mesh(geometry, material));
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.04);
  pmrem.dispose();
  geometry.dispose();
  material.dispose();
  return target;
}

export interface Tier {
  // edge of the shadow map in texels, 0 for no shadows
  shadow: number;
  // most canvas pixels per css pixel
  ratio: number;
}

// from the full picture down to the cheapest, the scene steps down when frames get slow
export const TIERS: Tier[] = [
  { shadow: 2048, ratio: 2 },
  { shadow: 1024, ratio: 2 },
  { shadow: 1024, ratio: 1.5 },
  { shadow: 0, ratio: 1.25 }
];

export interface Device {
  // css pixels of the screen
  width: number;
  height: number;
  // a finger instead of a mouse
  coarse: boolean;
  cores?: number;
  // gigabytes, only some browsers tell
  memory?: number;
}

// the tier to start with. a phone or a small or weak machine starts a step
// lower, the pacer takes it further down if frames still get slow
export function firstTier(device: Device): number {
  const small = Math.min(device.width, device.height) < 600 || device.coarse;
  const weak = (device.cores !== undefined && device.cores <= 4) || (device.memory !== undefined && device.memory <= 4);
  if (small && weak) return 2;
  if (small || weak) return 1;
  return 0;
}

// watches the time between frames while the scene moves. when the middle frame
// of a stretch takes longer than slow ms, the scene should get cheaper
export class Pacer {
  private times: number[] = [];
  private skip = 0;

  constructor(
    private size = 45,
    private slow = 26
  ) {}

  // ms since the frame before, true when it is time for a cheaper tier
  add(ms: number): boolean {
    // a pause or a hidden tab says nothing about drawing, a slow frame of up
    // to a second still counts
    if (!(ms > 0) || ms > 1000) return false;
    if (this.skip > 0) {
      this.skip--;
      return false;
    }
    this.times.push(ms);
    if (this.times.length < this.size) return false;
    const sorted = [...this.times].sort((a, b) => a - b);
    this.times = [];
    return sorted[sorted.length >> 1] > this.slow;
  }

  // the first frames after a change compile shaders and do not count
  reset(skip = 20): void {
    this.times = [];
    this.skip = skip;
  }
}

interface TableUniforms {
  lamp: { value: Vector3 };
  norm: { value: number };
  pool: { value: Color };
  dim: { value: number };
  centre: { value: Vector3 };
  radius: { value: number };
  soft: { value: number };
}

// the table under the light. it darkens where the shadow falls, filtered wider
// than the shadows on the tracker so it lies soft on the table, and it adds
// the pool of the lamp: a dark table brightens most right under the lamp, a
// bright one gets a little dimmer on the far side. the output is premultiplied,
// rgb is light to add and alpha how much it darkens the table
function tableMaterial(u: TableUniforms): ShadowMaterial {
  const material = new ShadowMaterial({ transparent: true, depthWrite: false, toneMapped: false });
  material.blending = CustomBlending;
  material.blendSrc = OneFactor;
  material.blendDst = OneMinusSrcAlphaFactor;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tableLamp = u.lamp;
    shader.uniforms.tableNorm = u.norm;
    shader.uniforms.tablePool = u.pool;
    shader.uniforms.tableDim = u.dim;
    shader.uniforms.tableCentre = u.centre;
    shader.uniforms.tableRadius = u.radius;
    shader.uniforms.tableSoft = u.soft;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTable;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n\tvTable = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <shadowmask_pars_fragment>',
        `#include <shadowmask_pars_fragment>
varying vec3 vTable;
uniform vec3 tableLamp;
uniform float tableNorm;
uniform vec3 tablePool;
uniform float tableDim;
uniform vec3 tableCentre;
uniform float tableRadius;
uniform float tableSoft;
float tableShadow() {
	#if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_PCF ) && NUM_DIR_LIGHT_SHADOWS > 0
	vec4 at = vDirectionalShadowCoord[ 0 ];
	at.xyz /= at.w;
	at.z += directionalLightShadows[ 0 ].shadowBias;
	if ( at.x < 0.0 || at.x > 1.0 || at.y < 0.0 || at.y > 1.0 || at.z > 1.0 ) return 1.0;
	// a fixed spiral of taps, many and close enough that their steps do not
	// show, a noisy one would leave grain on a plain table. written out by
	// three.js, a real loop around the lookups upsets some drivers
	float lit = 0.0;
	#pragma unroll_loop_start
	for ( int i = 0; i < 24; i ++ ) {
		lit += texture( directionalShadowMap[ 0 ], vec3( at.xy + vogelDiskSample( UNROLLED_LOOP_INDEX, 24, 0.0 ) * tableSoft, at.z ) );
	}
	#pragma unroll_loop_end
	return lit / 24.0;
	#else
	return 1.0;
	#endif
}`
      )
      .replace(
        'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );',
        `float lit = tableShadow();
	vec3 toLamp = tableLamp - vTable;
	float far = length( toLamp );
	float pool = clamp( tableNorm * toLamp.z / ( far * far * far ), 0.0, 2.0 );
	float edge = smoothstep( tableRadius, tableRadius * 0.55, length( vTable.xy - tableCentre.xy ) );
	gl_FragColor = vec4( tablePool * pool * lit * edge, opacity * ( 1.0 - lit ) + tableDim * ( 1.0 - min( pool, 1.0 ) ) * edge );`
      );
  };
  material.customProgramCacheKey = () => 'table';
  return material;
}

export class Lighting {
  readonly object = new Group();
  readonly key = new DirectionalLight(0xffffff, 1);
  // the table as the light sees it, see tableMaterial
  readonly table: Mesh<CircleGeometry, ShadowMaterial>;
  private uniforms: TableUniforms;
  private dir = new Vector3(0, 0, 1);
  private from = new Vector3(0, 0, 1);
  private goal = new Vector3(0, 0, 1);
  private blend = 1;
  private kind: LightKind | null = null;
  private level = { now: 0, goal: 0 };
  private el = 90;
  private power = { key: 3, room: 1, shade: 0.5, pool: 0, dim: 0 };
  private tint = new Color();
  private tintGoal = new Color();
  // true when the shadow map has to be drawn again
  moved = true;

  constructor(
    readonly centre: Vec3,
    // everything that casts or catches a shadow lies inside this sphere around the centre
    readonly reach: number,
    groundRadius: number
  ) {
    this.object.name = 'lighting';
    const key = this.key;
    key.castShadow = true;
    const camera = key.shadow.camera;
    camera.left = -reach;
    camera.right = reach;
    camera.top = reach;
    camera.bottom = -reach;
    camera.near = DISTANCE - reach;
    camera.far = DISTANCE + reach;
    camera.updateProjectionMatrix();
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.35;
    key.target.position.set(...centre);
    this.uniforms = {
      lamp: { value: new Vector3() },
      norm: { value: 1 },
      pool: { value: new Color(0, 0, 0) },
      dim: { value: 0 },
      centre: { value: new Vector3(centre[0], centre[1], 0) },
      radius: { value: groundRadius },
      soft: { value: 0 }
    };
    this.table = new Mesh(new CircleGeometry(groundRadius, 96), tableMaterial(this.uniforms));
    this.table.name = 'table light';
    this.table.receiveShadow = true;
    this.table.position.set(centre[0], centre[1], 0.05);
    // drawn before the arcs and the beam, they lie on top of it
    this.table.renderOrder = -1;
    this.object.add(key, key.target, this.table);
    this.setShadow(TIERS[0].shadow);
    this.place();
  }

  // the light the tracker sees right now, a lamp or the sun with where it
  // stands, or the room. returns true while it still eases
  aim(kind: LightKind, sky: Sky | null, dt: number): boolean {
    const use: LightKind = (kind === 'lamp' || kind === 'sun') && !sky ? 'room' : kind;
    const at = (use === 'lamp' || use === 'sun') && sky ? sky : ROOM;
    this.goal.set(...keyDirection(at));
    this.level.goal = STRENGTH[use];
    this.tintGoal.set(TINT[use]);
    if (this.kind === null) {
      // the very first light is simply there
      this.kind = use;
      this.dir.copy(this.goal);
      this.level.now = this.level.goal;
      this.tint.copy(this.tintGoal);
      this.blend = 1;
      this.moved = true;
    } else if (use !== this.kind) {
      this.kind = use;
      this.from.copy(this.dir);
      this.blend = 0;
    }

    let busy = false;
    const before = this.dir.clone();
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / BLEND);
      const k = this.blend * this.blend * (3 - 2 * this.blend);
      this.dir.copy(this.from).lerp(this.goal, k);
      if (this.dir.lengthSq() < 1e-6) this.dir.copy(this.goal);
      this.dir.normalize();
      busy = this.blend < 1;
    } else {
      this.dir.copy(this.goal);
    }
    const lvl = this.level;
    lvl.now += (lvl.goal - lvl.now) * follow(5, dt);
    if (Math.abs(lvl.goal - lvl.now) < 0.002) lvl.now = lvl.goal;
    else busy = true;
    this.tint.lerp(this.tintGoal, follow(5, dt));

    if (before.angleTo(this.dir) > 1e-5 || this.moved) {
      this.moved = true;
      this.place();
    }
    this.apply();
    return busy;
  }

  // a value that changes whenever the picture of the light changes
  get signature(): string {
    return `${this.dir.x.toFixed(4)} ${this.dir.y.toFixed(4)} ${this.dir.z.toFixed(4)} ${this.level.now.toFixed(3)}`;
  }

  private place(): void {
    const c = this.centre;
    this.key.position.set(c[0] + this.dir.x * DISTANCE, c[1] + this.dir.y * DISTANCE, c[2] + this.dir.z * DISTANCE);
    this.key.updateMatrixWorld();
    this.key.target.updateMatrixWorld();
    this.el = (Math.asin(clamp(this.dir.z, -1, 1)) * 180) / Math.PI;
    // the lamp stands on the sky sphere and lights the table near it most, a
    // sun or the room light is far away and lights it evenly
    const u = this.uniforms;
    const away = this.kind === 'lamp' ? this.reach : 1e5;
    u.lamp.value.set(c[0] + this.dir.x * away, c[1] + this.dir.y * away, c[2] + this.dir.z * away);
    const toCentre = u.lamp.value.clone().sub(u.centre.value);
    u.norm.value = toCentre.length() ** 3 / Math.max(1, toCentre.z);
  }

  private apply(): void {
    const level = Math.min(1, this.level.now);
    this.key.intensity = this.power.key * this.level.now;
    this.key.color.copy(this.tint);
    const shade = tableShade(this.el);
    this.table.material.opacity = this.power.shade * level * shade;
    this.uniforms.pool.value.copy(POOL).multiplyScalar(this.power.pool * level * shade);
    this.uniforms.dim.value = this.power.dim * level;
  }

  setPalette(p: Palette): void {
    // a dark page reads like a dim room with the lamp as the main light, a
    // bright page like a lit room with softer contrast
    this.power = p.light ? { key: 2.6, room: 1.3, shade: 0.34, pool: 0, dim: 0.07 } : { key: 3, room: 1.05, shade: 0.5, pool: 0.012, dim: 0 };
    this.apply();
  }

  // how strong the room light is in this theme, for scene.environmentIntensity
  get room(): number {
    return this.power.room;
  }

  // the size of the shadow map, 0 turns the shadow off
  setShadow(size: number): void {
    const on = size > 0;
    if (this.key.castShadow !== on) this.key.castShadow = on;
    if (on && this.key.shadow.mapSize.x !== size) {
      this.key.shadow.mapSize.set(size, size);
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
    // the same softness in millimetres at every size of the map
    const texel = (2 * this.reach) / Math.max(1, size);
    this.key.shadow.radius = Math.max(1, SOFT_PART / texel);
    this.uniforms.soft.value = SOFT_TABLE / (2 * this.reach);
    this.moved = true;
  }

  dispose(): void {
    this.key.shadow.map?.dispose();
    this.key.dispose();
    this.table.geometry.dispose();
    this.table.material.dispose();
    this.object.removeFromParent();
  }
}
