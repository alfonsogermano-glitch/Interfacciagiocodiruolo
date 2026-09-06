// three@0.143 is a transitive runtime dependency of dice-box-threejs and ships without TS declarations.
// @ts-ignore Runtime module is present through dice-box-threejs; keep this adapter structurally typed.
import * as THREE from 'three';
import type { Dice3DAppearanceDescriptor } from './dice3dProjection.ts';
import type { DiceSkinId } from './diceTypes.ts';

export type Dice3DSurfaceProfile = 'photo-lit' | 'photo-unlit' | 'physical';

const SURFACE_PROFILES: Record<DiceSkinId, Dice3DSurfaceProfile> = {
  none: 'photo-lit',
  fire: 'photo-lit',
  ice: 'photo-unlit',
  lightning: 'photo-unlit',
  poison: 'photo-unlit',
  stone: 'photo-lit',
  metal: 'photo-lit',
  obsidian: 'physical',
  arcane: 'photo-lit',
};

type MeshWithMaterials = { material?: any | any[] };

export function getDice3DSurfaceProfile(skinId: DiceSkinId): Dice3DSurfaceProfile {
  return SURFACE_PROFILES[skinId];
}

function createUnlitFaceMaterial(source: any): any {
  const material = new THREE.MeshBasicMaterial({
    map: source.map ?? null,
    color: 0xffffff,
    transparent: source.transparent ?? false,
    opacity: source.opacity ?? 1,
    depthTest: source.depthTest ?? true,
    depthWrite: source.depthWrite ?? true,
    side: source.side,
    alphaTest: source.alphaTest ?? 0,
    blending: source.blending,
  });
  material.name = `${source.name || 'dice-face'}-photo-unlit`;
  material.toneMapped = false;
  return material;
}

export function applyDice3DSurfaceProfile(
  mesh: unknown,
  descriptor: Dice3DAppearanceDescriptor,
): void {
  if (!mesh || typeof mesh !== 'object' || descriptor.custom) return;
  if (getDice3DSurfaceProfile(descriptor.appearance.skinId) !== 'photo-unlit') return;

  const typedMesh = mesh as MeshWithMaterials;
  if (!Array.isArray(typedMesh.material)) return;
  typedMesh.material = typedMesh.material.map((material, index) => (
    index === 0 || !material?.map ? material : createUnlitFaceMaterial(material)
  ));
}
