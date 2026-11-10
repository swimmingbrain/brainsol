// the tracker as three.js objects. one group per joint carries the parts that
// move with it, the groups get their matrices straight from joints.ts, so the
// stand in and the cad export move by the very same numbers. printed plastic in
// the colour roles of the contract, a glossy panel face with its cell lines,
// and a small disc in the well of each light sensor that shows what the sensor
// sees, the lux window included

import { BufferAttribute, CircleGeometry, Color, Group, Matrix4, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Quaternion, Vector3, Vector4, type BufferGeometry, type Texture, type WebGLProgramParametersWithUniforms } from 'three';
import type { Vec3 } from '$lib/sim/kinematics';
import { EYES, panelJoint, ROLE_COLORS, type Assembly, type Role, type SensorName } from './assembly';
import { identity, poseMatrices, transformDir, transformPoint, type Mat4 } from './joints';
import type { Piece } from './standin';

// how much of the fill light reaches a face right at the table
const TABLE_CONTACT = 0.5;
// up to this many millimetres above the table a face still feels it
const TABLE_REACH = 14;
// how much of the fill light reaches the lid right next to the neck, and how far that reaches
const FOOT_CONTACT = 0.45;
const FOOT_REACH = 7;

export interface Foot {
  // middle and half size of the foot in the frame of its joint at rest
  x: number;
  y: number;
  hw: number;
  hd: number;
  // the height it stands on
  z: number;
}

// where the turning part stands on the fixed one: the outline of its lowest
// two millimetres, null for pieces without vertices
export function footOf(pieces: Piece[]): Foot | null {
  let low = Infinity;
  for (const piece of pieces) {
    const p = piece.geometry.getAttribute('position');
    if (p) for (let i = 0; i < p.count; i++) low = Math.min(low, p.getZ(i));
  }
  if (!Number.isFinite(low)) return null;
  const min = [Infinity, Infinity];
  const max = [-Infinity, -Infinity];
  for (const piece of pieces) {
    const p = piece.geometry.getAttribute('position');
    if (!p) continue;
    for (let i = 0; i < p.count; i++) {
      if (p.getZ(i) > low + 2) continue;
      min[0] = Math.min(min[0], p.getX(i));
      min[1] = Math.min(min[1], p.getY(i));
      max[0] = Math.max(max[0], p.getX(i));
      max[1] = Math.max(max[1], p.getY(i));
    }
  }
  return { x: (min[0] + max[0]) / 2, y: (min[1] + max[1]) / 2, hw: (max[0] - min[0]) / 2, hd: (max[1] - min[1]) / 2, z: low };
}

interface Contact {
  foot: { value: Vector4 };
  frame: { value: Matrix4 };
  lid: { value: number };
}

// writes soft contact into the standard shader of three.js: faces close to the
// table, and the lid around the foot of the neck, get less of the fill light,
// the way a corner of a room is darker. the light of the lamp is not touched,
// its shadow does that part. rim adds the edge light of the charcoal parts
function shade(material: MeshStandardMaterial, contact: Contact, options: { lid?: boolean; rim?: { value: Color } } = {}): void {
  const { lid = false, rim } = options;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.contactFoot = contact.foot;
    shader.uniforms.contactFrame = contact.frame;
    shader.uniforms.contactLid = contact.lid;
    if (rim) shader.uniforms.rimColor = rim;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vContact;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tvContact = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    let near = `float contact = mix( ${TABLE_CONTACT.toFixed(3)}, 1.0, smoothstep( 0.0, ${TABLE_REACH.toFixed(1)}, vContact.z ) );`;
    if (lid) {
      near += `
\tvec2 footAt = ( contactFrame * vec4( vContact, 1.0 ) ).xy - contactFoot.xy;
\tvec2 footOut = abs( footAt ) - contactFoot.zw;
\tfloat footGap = max( length( max( footOut, 0.0 ) ) + min( max( footOut.x, footOut.y ), 0.0 ), 0.0 );
\tfloat onLid = smoothstep( contactLid - 1.5, contactLid - 0.2, vContact.z );
\tcontact *= 1.0 - ${FOOT_CONTACT.toFixed(3)} * onLid * exp( - footGap / ${FOOT_REACH.toFixed(1)} );`;
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vContact;\nuniform vec4 contactFoot;\nuniform mat4 contactFrame;\nuniform float contactLid;${rim ? '\nuniform vec3 rimColor;' : ''}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n\t${near}\n\treflectedLight.indirectDiffuse *= contact;`);
    if (rim) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += rimColor * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);'
      );
    }
  };
  material.customProgramCacheKey = () => `contact${lid ? ' lid' : ''}${rim ? ' rim' : ''}`;
}

// the sensor discs, about the size of the photoresistor face
const EYE_RADIUS = 2.6;
// the window of the lux sensor is smaller and has no shade wall
const LUX_RADIUS = 1.7;
// the cad wells are narrow up to the back face of the panel, 2.5 mm behind its
// front, and open up from there
const WELL_OPEN = 2.5;

// where a sensor disc goes. a sensor deep in its well would only show from
// straight ahead, so its disc sits where the well opens and the glow reads
// from the side too, the shade wall still hides it from the far side
export function eyeSpot(at: Vec3, panel: Assembly['panel']): Vec3 {
  const n = new Vector3(...(panel?.normal ?? [0, 1, 0])).normalize();
  const p = new Vector3(...at);
  if (panel) {
    const depth = new Vector3(...panel.center).sub(p).dot(n);
    if (depth > WELL_OPEN) p.addScaledVector(n, depth - WELL_OPEN);
  }
  // a hair in front, so the disc never fights a face for a pixel
  return p.addScaledVector(n, 0.12).toArray();
}

export interface Eye {
  name: SensorName;
  material: MeshBasicMaterial;
}

// projects the panel face onto its own plane for the texture, so a glb panel
// needs no uv coordinates of its own
export function planarUv(geometry: BufferGeometry, panel: NonNullable<Assembly['panel']>): void {
  const position = geometry.getAttribute('position');
  if (!position) return;
  const n = new Vector3(...panel.normal).normalize();
  const up = new Vector3(...panel.up).normalize();
  const right = new Vector3().crossVectors(n, up).normalize();
  const c = new Vector3(...panel.center);
  const p = new Vector3();
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).sub(c);
    uv[i * 2] = p.dot(right) / panel.size[0] + 0.5;
    uv[i * 2 + 1] = p.dot(up) / panel.size[1] + 0.5;
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
}

export class Rig {
  readonly root = new Group();
  readonly meshes: Mesh[] = [];
  readonly eyes: Eye[] = [];
  // the fifth window, the lux sensor, null when the model has none
  lux: Eye | null = null;
  readonly materials: Record<Role, MeshStandardMaterial>;
  // the panel material without the cell lines, for small dark windows
  private plain: MeshStandardMaterial;
  private groups = new Map<string, Group>();
  private fixed = new Group();
  private matrices: Record<string, Mat4> = {};
  private pose = { pan: NaN, tilt: NaN };
  private panelGroup: string | null;
  private rim = { value: new Color(0x000000) };
  private contact: Contact = { foot: { value: new Vector4(0, 0, 0, 0) }, frame: { value: new Matrix4() }, lid: { value: -1000 } };
  // the joint whose part stands on the base, its foot darkens the lid
  private footJoint: string | null = null;

  constructor(
    readonly assembly: Assembly,
    pieces: Record<string, Piece[]>,
    face: Texture | null
  ) {
    this.root.name = 'tracker';
    this.root.add(this.fixed);
    for (const name of Object.keys(assembly.joints)) {
      const group = new Group();
      group.name = `joint ${name}`;
      group.matrixAutoUpdate = false;
      this.groups.set(name, group);
      this.root.add(group);
    }
    this.panelGroup = panelJoint(assembly);

    // printed plastic is matte with a soft sheen that shows the form, the cells
    // sit under a thin glossy layer that catches the lamp
    const plastic = (color: string, roughness: number) => new MeshStandardMaterial({ color: new Color(color), roughness, metalness: 0 });
    this.materials = {
      body: plastic(ROLE_COLORS.body, 0.78),
      dark: plastic(ROLE_COLORS.dark, 0.62),
      accent: plastic(ROLE_COLORS.accent, 0.55),
      panel: new MeshPhysicalMaterial({ color: new Color(ROLE_COLORS.panel), roughness: 0.55, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.25 })
    };
    this.plain = plastic(ROLE_COLORS.panel, 0.7);
    if (face) {
      this.materials.panel.map = face;
      this.materials.panel.color.set('#ffffff');
    }
    // the panel warms a little the better it faces the light, see setWarmth
    this.materials.panel.emissive.set(0x000000);
    // soft contact on every part, the lid also around the neck. the charcoal
    // parts get a faint light on the edges that turn away from the camera, so
    // they keep their outline on the dark page, see setRim
    shade(this.materials.body, this.contact, { lid: true });
    shade(this.materials.dark, this.contact, { rim: this.rim });
    shade(this.materials.accent, this.contact);
    shade(this.materials.panel, this.contact);
    shade(this.plain, this.contact);

    for (const part of assembly.parts) {
      const group = this.group(part.joint);
      for (const piece of pieces[part.id] ?? []) {
        let material = this.materials[piece.role];
        if (piece.role === 'panel') {
          if (assembly.panel && face && part.color === 'panel') planarUv(piece.geometry, assembly.panel);
          else material = this.plain;
        }
        const mesh = new Mesh(piece.geometry, material);
        mesh.name = `${part.id} ${piece.role}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        this.meshes.push(mesh);
      }
    }

    // the part that turns on the base, the neck, stands on the lid with its foot
    const root = Object.entries(assembly.joints).find(([, joint]) => joint.parent === null);
    if (root) {
      const foot = footOf(assembly.parts.filter((part) => part.joint === root[0]).flatMap((part) => pieces[part.id] ?? []));
      if (foot) {
        this.footJoint = root[0];
        this.contact.foot.value.set(foot.x, foot.y, foot.hw, foot.hd);
        this.contact.lid.value = foot.z;
      }
    }

    this.addEyes();
    this.setPose(0, 90);
  }

  // the group that moves with a joint, the fixed group for none
  group(joint: string | null): Group {
    return (joint && this.groups.get(joint)) || this.fixed;
  }

  private addEyes(): void {
    const normal = new Vector3(...(this.assembly.panel?.normal ?? [0, 1, 0])).normalize();
    const turn = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal);
    const geometry = new CircleGeometry(EYE_RADIUS, 28);
    const group = this.group(this.panelGroup);
    for (const name of EYES) {
      const at = this.assembly.sensors[name];
      if (!at) continue;
      const material = new MeshBasicMaterial({ color: 0x000000, toneMapped: false });
      const mesh = new Mesh(geometry, material);
      mesh.name = `eye ${name}`;
      mesh.quaternion.copy(turn);
      mesh.position.set(...eyeSpot(at, this.assembly.panel));
      group.add(mesh);
      this.eyes.push({ name, material });
    }
    const at = this.assembly.sensors.lux;
    if (at) {
      const material = new MeshBasicMaterial({ color: 0x000000, toneMapped: false });
      const mesh = new Mesh(new CircleGeometry(LUX_RADIUS, 24), material);
      mesh.name = 'eye lux';
      mesh.quaternion.copy(turn);
      mesh.position.set(...eyeSpot(at, this.assembly.panel));
      group.add(mesh);
      this.lux = { name: 'lux', material };
    }
  }

  // returns false when nothing moved
  setPose(pan: number, tilt: number): boolean {
    if (!Number.isFinite(pan) || !Number.isFinite(tilt)) return false;
    if (pan === this.pose.pan && tilt === this.pose.tilt) return false;
    this.pose.pan = pan;
    this.pose.tilt = tilt;
    this.matrices = poseMatrices(this.assembly.joints, { pan, tilt });
    for (const [name, group] of this.groups) {
      group.matrix.fromArray(this.matrices[name] ?? identity());
      group.matrixWorldNeedsUpdate = true;
    }
    // the shader finds the foot in the frame of its joint
    if (this.footJoint) this.contact.frame.value.fromArray(this.matrixOf(this.footJoint)).invert();
    return true;
  }

  // the matrix of a joint group at the current pose, identity for the base
  matrixOf(joint: string | null): Mat4 {
    return (joint && this.matrices[joint]) || identity();
  }

  get panelMatrix(): Mat4 {
    return this.matrixOf(this.panelGroup);
  }

  panelCentre(): Vec3 {
    const centre = this.assembly.panel?.center ?? this.assembly.joints.tilt?.origin ?? [0, 0, 100];
    return transformPoint(this.panelMatrix, centre);
  }

  panelNormal(): Vec3 {
    return transformDir(this.panelMatrix, this.assembly.panel?.normal ?? [0, 1, 0]);
  }

  // 0 for no light on the panel, 1 for the panel square to the light
  setWarmth(amount: number, accent: Color): void {
    this.materials.panel.emissive.copy(accent).multiplyScalar(0.035 * amount);
  }

  // the edge light of the charcoal parts, black turns it off
  setRim(color: Color): void {
    this.rim.value.copy(color);
  }

  dispose(): void {
    const geometries = new Set<BufferGeometry>();
    this.root.traverse((object) => {
      if (object instanceof Mesh) geometries.add(object.geometry);
    });
    for (const geometry of geometries) geometry.dispose();
    this.materials.panel.map?.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.plain.dispose();
    for (const eye of this.eyes) eye.material.dispose();
    this.lux?.material.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}
