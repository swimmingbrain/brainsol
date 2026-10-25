// the tracker as three.js objects. one group per joint carries the parts that
// move with it, the groups get their matrices straight from joints.ts, so the
// stand in and the cad export move by the very same numbers. matte materials in
// the colour roles of the contract, the panel face with its cell lines, and a
// small disc in front of each light sensor that shows what the sensor sees

import { BufferAttribute, CircleGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Vector3, type BufferGeometry, type Texture } from 'three';
import type { Vec3 } from '$lib/sim/kinematics';
import { EYES, panelJoint, ROLE_COLORS, type Assembly, type Role, type SensorName } from './assembly';
import { identity, poseMatrices, transformDir, transformPoint, type Mat4 } from './joints';
import type { Piece } from './standin';

// the sensor discs, about the size of the photoresistor face
const EYE_RADIUS = 2.6;

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
  readonly materials: Record<Role, MeshStandardMaterial>;
  // the panel material without the cell lines, for small dark windows
  private plain: MeshStandardMaterial;
  private groups = new Map<string, Group>();
  private fixed = new Group();
  private matrices: Record<string, Mat4> = {};
  private pose = { pan: NaN, tilt: NaN };
  private panelGroup: string | null;

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

    const matte = (color: string, roughness: number) => new MeshStandardMaterial({ color: new Color(color), roughness, metalness: 0 });
    this.materials = {
      body: matte(ROLE_COLORS.body, 0.88),
      dark: matte(ROLE_COLORS.dark, 0.82),
      accent: matte(ROLE_COLORS.accent, 0.62),
      panel: matte(ROLE_COLORS.panel, 0.72)
    };
    this.plain = matte(ROLE_COLORS.panel, 0.7);
    if (face) {
      this.materials.panel.map = face;
      this.materials.panel.color.set('#ffffff');
    }
    // the panel warms a little the better it faces the light, see setWarmth
    this.materials.panel.emissive.set(0x000000);

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
        group.add(mesh);
        this.meshes.push(mesh);
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
      const material = new MeshBasicMaterial({ color: 0x000000 });
      const mesh = new Mesh(geometry, material);
      mesh.name = `eye ${name}`;
      mesh.quaternion.copy(turn);
      // a hair in front of the sensor face, so the two never fight for a pixel
      mesh.position.set(at[0], at[1], at[2]).addScaledVector(normal, 0.12);
      group.add(mesh);
      this.eyes.push({ name, material });
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
    this.root.removeFromParent();
    this.root.clear();
  }
}
