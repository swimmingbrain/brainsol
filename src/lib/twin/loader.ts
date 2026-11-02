// the model to show. assembly.json and the glb files it names come from
// static/models. without them, or when anything about them is off, the stand
// in takes their place: the stage never stays empty because of a model file

import { Box3, Matrix4, Mesh, Texture, type BufferGeometry, type Material, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { filesOf, readAssembly, ROLES, STANDIN_ASSEMBLY, type Assembly, type Role } from './assembly';
import { chooseFix } from './fit';
import { recast } from './solids';
import { standinPieces, type Piece } from './standin';

export const MODELS = '/models/';
// a model that takes longer than this is not worth waiting for
const TIMEOUT = 15000;

export interface Model {
  assembly: Assembly;
  pieces: Record<string, Piece[]>;
  // standin, or files for the cad export
  source: 'standin' | 'files';
}

export function standin(): Model {
  return { assembly: STANDIN_ASSEMBLY, pieces: standinPieces(), source: 'standin' };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// a material named after a colour role keeps that role, a copper cap inside the head file for example
function roleOf(material: Material | Material[]): Role | null {
  const name = (Array.isArray(material) ? material[0]?.name : material?.name)?.toLowerCase().trim() ?? '';
  return (ROLES as string[]).includes(name) ? (name as Role) : null;
}

// the meshes of one glb in the device frame, node transforms baked in. pieces
// with a role from their material go into named
function piecesOf(scene: Object3D, role: Role, named: Set<Piece>): Piece[] {
  const out: Piece[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (!(object instanceof Mesh) || !object.geometry?.getAttribute('position')) return;
    const geometry = (object.geometry as BufferGeometry).clone();
    geometry.applyMatrix4(object.matrixWorld);
    const own = roleOf(object.material);
    const piece = { geometry, role: own ?? role };
    if (own) named.add(piece);
    out.push(piece);
  });
  return out;
}

function release(scene: Object3D): void {
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry?.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of Object.values(material ?? {})) {
        if (value instanceof Texture) value.dispose();
      }
      material?.dispose();
    }
  });
}

// the stand in when there is nothing better, never throws
export async function loadModel(base = MODELS, fetcher: typeof fetch = fetch): Promise<Model> {
  let assembly: Assembly;
  try {
    const response = await withTimeout(fetcher(`${base}assembly.json`, { cache: 'no-cache' }), TIMEOUT);
    if (!response.ok) return standin();
    const read = readAssembly(await response.json());
    if ('problem' in read) {
      console.warn(`brainsol: models/assembly.json is not usable (${read.problem}), the stand in is shown`);
      return standin();
    }
    assembly = read.assembly;
  } catch {
    return standin();
  }

  const files = filesOf(assembly);
  // parts without a file are drawn by the stand in, by their id
  const builtin = standinPieces();
  if (files.length === 0) return { assembly, pieces: builtin, source: 'standin' };

  const pieces: Record<string, Piece[]> = {};
  const named = new Set<Piece>();
  try {
    const loader = new GLTFLoader();
    await Promise.all(
      assembly.parts.map(async (part) => {
        if (!part.file) {
          pieces[part.id] = builtin[part.id] ?? [];
          return;
        }
        const gltf = await withTimeout(loader.loadAsync(`${base}${part.file}`), TIMEOUT);
        pieces[part.id] = piecesOf(gltf.scene, part.color, named);
        release(gltf.scene);
      })
    );
    // the stand in pieces that were not used go away
    for (const [id, list] of Object.entries(builtin)) {
      if (pieces[id] !== list) for (const piece of list) piece.geometry.dispose();
    }

    const loaded = assembly.parts.filter((part) => part.file).flatMap((part) => pieces[part.id] ?? []);
    if (loaded.length === 0) throw new Error('the files hold no meshes');
    const box = new Box3();
    for (const piece of loaded) {
      piece.geometry.computeBoundingBox();
      if (piece.geometry.boundingBox) box.union(piece.geometry.boundingBox);
    }
    const { fix, misfit } = chooseFix({ min: box.min.toArray(), max: box.max.toArray() }, assembly.bounds);
    if (misfit > 0.25) console.warn(`brainsol: the model files are ${Math.round(misfit * 100)} % off their bounds in assembly.json`);
    const matrix = new Matrix4();
    if (fix.yUp) matrix.makeRotationX(Math.PI / 2);
    matrix.premultiply(new Matrix4().makeScale(fix.scale, fix.scale, fix.scale));
    for (const piece of loaded) {
      if (fix.yUp || fix.scale !== 1) piece.geometry.applyMatrix4(matrix);
      // cad meshes may come without normals, edges sharper than 30 degrees stay sharp
      if (!piece.geometry.getAttribute('normal')) piece.geometry = toCreasedNormals(piece.geometry, Math.PI / 6);
    }
    // the caps and feet come back in their own colour, see solids.ts
    for (const part of assembly.parts) {
      if (part.file && pieces[part.id]) pieces[part.id] = recast(pieces[part.id], part, assembly, named);
    }
    for (const piece of assembly.parts.filter((part) => part.file).flatMap((part) => pieces[part.id] ?? [])) piece.geometry.computeBoundingSphere();
    return { assembly, pieces, source: 'files' };
  } catch (error) {
    console.warn('brainsol: the model files did not load, the stand in is shown', error);
    const all = new Set([...Object.values(builtin), ...Object.values(pieces)].flat().map((piece) => piece.geometry));
    for (const geometry of all) geometry.dispose();
    return standin();
  }
}

// the size of the model at its zero pose, for a model without bounds
export function measure(pieces: Record<string, Piece[]>): { min: [number, number, number]; max: [number, number, number] } | null {
  const box = new Box3();
  for (const list of Object.values(pieces)) {
    for (const piece of list) {
      piece.geometry.computeBoundingBox();
      if (piece.geometry.boundingBox) box.union(piece.geometry.boundingBox);
    }
  }
  if (box.isEmpty()) return null;
  return { min: box.min.toArray(), max: box.max.toArray() };
}
