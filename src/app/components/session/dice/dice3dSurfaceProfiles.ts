// three@0.143 is a transitive runtime dependency of dice-box-threejs and ships without TS declarations.
// @ts-ignore Runtime module is present through dice-box-threejs; keep this adapter structurally typed.
import * as THREE from 'three';
import type { Dice3DAppearanceDescriptor } from './dice3dProjection.ts';
import type { DiceSkinId } from './diceTypes.ts';

export type Dice3DSurfaceProfile = 'photo-lit' | 'photo-unlit' | 'physical';

const OBSIDIAN_LABEL_EMISSIVE_INTENSITY = 0.72;

const SURFACE_PROFILES: Record<DiceSkinId, Dice3DSurfaceProfile> = {
  none: 'photo-lit',
  fire: 'photo-lit',
  ice: 'photo-unlit',
  lightning: 'photo-unlit',
  poison: 'photo-unlit',
  stone: 'photo-lit',
  metal: 'photo-lit',
  obsidian: 'photo-lit',
  arcane: 'photo-unlit',
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

function parseHexColor(color: string): [number, number, number] | null {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return null;
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

function createObsidianLabelMask(sourceMap: any, symbolColor: string): any | null {
  if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') return null;
  const sourceCanvas = sourceMap?.image;
  if (!(sourceCanvas instanceof HTMLCanvasElement) || typeof sourceMap.clone !== 'function') return null;
  const targetColor = parseHexColor(symbolColor);
  if (!targetColor) return null;

  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) return null;
  let sourceImage: ImageData;
  try {
    sourceImage = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  } catch {
    return null;
  }

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = sourceCanvas.width;
  maskCanvas.height = sourceCanvas.height;
  const maskContext = maskCanvas.getContext('2d', { alpha: true });
  if (!maskContext) return null;
  const maskImage = maskContext.createImageData(maskCanvas.width, maskCanvas.height);
  const tolerance = 2;

  for (let offset = 0; offset < sourceImage.data.length; offset += 4) {
    const matches = sourceImage.data[offset + 3] > 0
      && Math.abs(sourceImage.data[offset] - targetColor[0]) <= tolerance
      && Math.abs(sourceImage.data[offset + 1] - targetColor[1]) <= tolerance
      && Math.abs(sourceImage.data[offset + 2] - targetColor[2]) <= tolerance;
    if (!matches) continue;
    maskImage.data[offset] = 255;
    maskImage.data[offset + 1] = 255;
    maskImage.data[offset + 2] = 255;
    maskImage.data[offset + 3] = 255;
  }
  maskContext.putImageData(maskImage, 0, 0);

  const labelMaskTexture = sourceMap.clone();
  labelMaskTexture.image = maskCanvas;
  labelMaskTexture.anisotropy = sourceMap.anisotropy;
  labelMaskTexture.generateMipmaps = sourceMap.generateMipmaps;
  labelMaskTexture.needsUpdate = true;
  return labelMaskTexture;
}

function applyObsidianLabelEmission(
  mesh: MeshWithMaterials,
  descriptor: Dice3DAppearanceDescriptor,
): void {
  if (!Array.isArray(mesh.material)) return;
  mesh.material.forEach((material, index) => {
    if (index === 0 || !material?.map || !material.emissive?.set) return;
    if (material.userData?.hollowgateObsidianLabelEmission === true) return;
    const labelMaskTexture = createObsidianLabelMask(material.map, descriptor.appearance.symbolColor);
    if (!labelMaskTexture) return;
    material.emissive.set(descriptor.appearance.symbolColor);
    material.emissiveMap = labelMaskTexture;
    material.emissiveIntensity = OBSIDIAN_LABEL_EMISSIVE_INTENSITY;
    material.userData = { ...material.userData, hollowgateObsidianLabelEmission: true };
    material.addEventListener?.('dispose', () => labelMaskTexture.dispose?.());
    material.needsUpdate = true;
  });
}

export function applyDice3DSurfaceProfile(
  mesh: unknown,
  descriptor: Dice3DAppearanceDescriptor,
): void {
  if (!mesh || typeof mesh !== 'object') return;

  const typedMesh = mesh as MeshWithMaterials;
  if (descriptor.custom) {
    if (!Array.isArray(typedMesh.material)) return;
    typedMesh.material = typedMesh.material.map((material, index) => (
      index === 0 || !material?.map ? material : createUnlitFaceMaterial(material)
    ));
    return;
  }

  if (descriptor.appearance.skinId === 'obsidian') applyObsidianLabelEmission(typedMesh, descriptor);
  if (getDice3DSurfaceProfile(descriptor.appearance.skinId) !== 'photo-unlit') return;

  if (!Array.isArray(typedMesh.material)) return;
  typedMesh.material = typedMesh.material.map((material, index) => (
    index === 0 || !material?.map ? material : createUnlitFaceMaterial(material)
  ));
}
