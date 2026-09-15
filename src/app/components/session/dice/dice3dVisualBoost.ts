// three@0.143 is a transitive runtime dependency of dice-box-threejs and ships without TS declarations.
// @ts-ignore Runtime module is present through dice-box-threejs; keep this adapter structurally typed.
import * as THREE from 'three';
import {
  FIRE_FRAME_ATLAS_COLUMNS,
  FIRE_FRAME_ATLAS_DATA_URL,
  FIRE_FRAME_ATLAS_ROWS,
  FIRE_FRAME_COUNT,
  FIRE_FRAME_DURATION_MS,
} from './fireFrameAtlasData.ts';
import type { Dice3DAppearanceDescriptor } from './dice3dProjection.ts';

type ColorLike = { set?: (value: string | number) => unknown; getHex?: () => number };
type MaterialLike = {
  map?: unknown;
  emissive?: ColorLike;
  emissiveMap?: unknown;
  emissiveIntensity?: number;
  needsUpdate?: boolean;
};

type MeshLike = {
  material?: MaterialLike | MaterialLike[];
  geometry?: { boundingSphere?: { radius?: number } | null; computeBoundingSphere?: () => void };
  add: (child: unknown) => void;
  remove: (child: unknown) => void;
};

type FireFaceBaseline = {
  material: MaterialLike;
  emissiveMap: unknown;
  emissiveIntensity: number;
  emissiveHex?: number;
};

type FacePulseBaseline = {
  material: MaterialLike;
  emissiveMap: unknown;
  emissiveIntensity: number;
  emissiveHex?: number;
};

const FIRE_FRAME_EMISSIVE_LIFT = 0.34;
const STONE_FACE_EMISSIVE_PULSE = 0.16;
const ICE_LIGHT_INTENSITY = 0.56;
const FIRE_FRAME_CANVAS_SIZE = 192;
// Fill metallico: solleva le facce argentate senza toccare polish (filtro
// mappa), emissive o luce orbitante, pinnati altrove.
const METAL_FILL_SKY_COLOR = '#e6eef6';
const METAL_FILL_GROUND_COLOR = '#14161c';
const METAL_FILL_INTENSITY = 0.22;

const fireFrameAtlasImage = typeof Image === 'undefined' ? null : new Image();
if (fireFrameAtlasImage) {
  fireFrameAtlasImage.decoding = 'async';
  fireFrameAtlasImage.src = FIRE_FRAME_ATLAS_DATA_URL;
}

function radiusOf(mesh: MeshLike): number {
  if (!mesh.geometry) return 1;
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere?.();
  const radius = mesh.geometry.boundingSphere?.radius;
  return typeof radius === 'number' && Number.isFinite(radius) && radius > 0 ? radius : 1;
}

function materialsOf(mesh: MeshLike): MaterialLike[] {
  if (!mesh.material) return [];
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function disposeGroup(group: any) {
  group.traverse((child: any) => {
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    materials.forEach((material: any) => material.dispose?.());
  });
}

function boostLightColor(skin: Dice3DAppearanceDescriptor['appearance']['skinId']): string | null {
  switch (skin) {
    case 'fire': return '#ff641f';
    case 'ice': return '#8eeeff';
    case 'lightning': return '#55e6ff';
    case 'poison': return '#a6ff4f';
    case 'stone': return '#d8c7a8';
    case 'metal': return '#d5ecff';
    case 'obsidian': return '#9a69ff';
    default: return null;
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function drawFireAtlasFrame(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  frameIndex: number,
): void {
  if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
  const sourceWidth = image.naturalWidth / FIRE_FRAME_ATLAS_COLUMNS;
  const sourceHeight = image.naturalHeight / FIRE_FRAME_ATLAS_ROWS;
  const column = frameIndex % FIRE_FRAME_ATLAS_COLUMNS;
  const row = Math.floor(frameIndex / FIRE_FRAME_ATLAS_COLUMNS);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.drawImage(
    image,
    column * sourceWidth,
    row * sourceHeight,
    sourceWidth,
    sourceHeight,
    0,
    0,
    context.canvas.width,
    context.canvas.height,
  );
}

type FillLightLike = {
  color?: { set?: (value: string) => unknown };
  groundColor?: { set?: (value: string) => unknown };
  intensity?: number;
};

export function installDice3DVisualBoost(
  mesh: unknown,
  descriptor: Dice3DAppearanceDescriptor,
  isSettled: () => boolean = () => false,
  createFillLight: () => unknown = () => null,
): () => void {
  if (!mesh || typeof mesh !== 'object') return () => undefined;
  const typedMeshEarly = mesh as MeshLike;
  // Fill metallico dedicato (anche a effetti spenti o motion ridotta): luce
  // emisferica morbida che solleva le facce senza appiattire la spazzolatura
  // come farebbe un emissive. Solo metallo standard (mai custom, mai altre
  // skin: l'ossidiana deve restare vetro quasi nero). La luce VIENE CLONATA
  // dalla scena (stessa copia di three del renderer): crearla con la nostra
  // copia avvelenerebbe la cache luci (id in collisione) e farebbe fallire il
  // primo tiro. Senza template in scena: niente fill, mai un crash.
  let fillCleanup = () => undefined;
  if (descriptor.appearance.skinId === 'metal' && !descriptor.custom) {
    const fill = createFillLight() as FillLightLike | null;
    if (fill) {
      try {
        fill.color?.set?.(METAL_FILL_SKY_COLOR);
        fill.groundColor?.set?.(METAL_FILL_GROUND_COLOR);
        if (typeof fill.intensity === 'number') fill.intensity = METAL_FILL_INTENSITY;
        typedMeshEarly.add(fill);
        fillCleanup = () => { typedMeshEarly.remove(fill); };
      } catch {
        // Senza fill: il metallo resta piu' scuro ma il tiro non muore.
      }
    }
  }
  if (!descriptor.appearance.effectsEnabled || descriptor.appearance.skinId === 'none' || descriptor.appearance.skinId === 'arcane') {
    return fillCleanup;
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return fillCleanup;
  }

  const skin = descriptor.appearance.skinId;
  const lightColor = boostLightColor(skin);
  if (!lightColor) return fillCleanup;

  const typedMesh = mesh as MeshLike;
  const fireFaceBaselines: FireFaceBaseline[] = skin === 'fire' && !descriptor.custom
    ? materialsOf(typedMesh)
      .slice(1)
      .filter((material) => material.emissiveMap && typeof material.emissiveIntensity === 'number')
      .map((material) => ({
        material,
        emissiveMap: material.emissiveMap,
        emissiveIntensity: material.emissiveIntensity as number,
        emissiveHex: material.emissive?.getHex?.(),
      }))
    : [];
  const facePulseBaselines: FacePulseBaseline[] = skin === 'stone' && !descriptor.custom
    ? materialsOf(typedMesh)
      .slice(1)
      .filter((material) => material.map && material.emissive && typeof material.emissiveIntensity === 'number')
      .map((material) => ({
        material,
        emissiveMap: material.emissiveMap,
        emissiveIntensity: material.emissiveIntensity as number,
        emissiveHex: material.emissive?.getHex?.(),
      }))
    : [];

  for (const { material } of facePulseBaselines) {
    material.emissiveMap = material.map;
    material.emissive?.set?.('#c9bda9');
    material.needsUpdate = true;
  }

  let fireFrameTexture: any = null;
  let fireFrameContext: CanvasRenderingContext2D | null = null;
  let lastFireFrameIndex = -1;
  let onFireAtlasLoad: (() => void) | null = null;

  if (fireFaceBaselines.length > 0 && typeof document !== 'undefined' && fireFrameAtlasImage) {
    const canvas = document.createElement('canvas');
    canvas.width = FIRE_FRAME_CANVAS_SIZE;
    canvas.height = FIRE_FRAME_CANVAS_SIZE;
    fireFrameContext = canvas.getContext('2d', { alpha: false });
    if (fireFrameContext) {
      fireFrameTexture = new THREE.CanvasTexture(canvas);
      fireFrameTexture.generateMipmaps = true;
      fireFrameTexture.needsUpdate = true;
      const applyAnimatedMap = () => {
        if (!fireFrameContext || !fireFrameTexture || !fireFrameAtlasImage) return;
        drawFireAtlasFrame(fireFrameContext, fireFrameAtlasImage, 0);
        fireFrameTexture.needsUpdate = true;
        for (const { material, emissiveIntensity } of fireFaceBaselines) {
          material.emissiveMap = fireFrameTexture;
          material.emissive?.set?.('#ff5a18');
          material.emissiveIntensity = emissiveIntensity + FIRE_FRAME_EMISSIVE_LIFT;
          material.needsUpdate = true;
        }
        lastFireFrameIndex = 0;
      };
      if (fireFrameAtlasImage.complete && fireFrameAtlasImage.naturalWidth > 0) applyAnimatedMap();
      else {
        onFireAtlasLoad = applyAnimatedMap;
        fireFrameAtlasImage.addEventListener('load', onFireAtlasLoad, { once: true });
      }
    }
  }

  const radius = radiusOf(typedMesh);
  const group = new THREE.Group();
  group.name = `hollowgate-strong-skin-${skin}`;
  group.renderOrder = 1000;

  const pointLight = new THREE.PointLight(
    lightColor,
    skin === 'ice' ? ICE_LIGHT_INTENSITY : skin === 'lightning' ? 0.85 : skin === 'poison' ? 0.82 : skin === 'stone' ? 0.58 : skin === 'metal' ? 0.82 : 0.65,
    radius * 4.9,
    2,
  );
  group.add(pointLight);

  let raf: number | null = null;
  const startedAt = performance.now();
  // A dado fermo la luce orbitante sfuma (non deve abbagliare la faccia
  // finale: il numero resta leggibile). Fade morbido dopo il settle.
  let settleDimStart: number | null = null;
  const frame = (now: number) => {
    const seconds = (now - startedAt) / 1000;
    const fast = (Math.sin(seconds * 15.7) + 1) / 2;
    const medium = (Math.sin(seconds * 5.1 + 0.9) + 1) / 2;
    const slow = (Math.sin(seconds * 1.9 + 2.2) + 1) / 2;
    const rollingPulse = skin === 'fire'
      ? clamp01(0.2 + slow * 0.24 + medium * 0.3 + fast * 0.26 + ((Math.sin(seconds * 29.4 + 0.6) + 1) / 2) * 0.14)
      : clamp01(0.18 + slow * 0.32 + medium * 0.24);

    if (skin === 'stone' || skin === 'metal') {
      const orbitRadius = skin === 'metal' ? radius * 1.62 : radius * 1.48;
      const orbitSpeed = skin === 'metal' ? 1.72 : 0.92;
      pointLight.position.set(
        Math.cos(seconds * orbitSpeed) * orbitRadius,
        Math.sin(seconds * orbitSpeed * 0.83 + 0.6) * orbitRadius * 0.72,
        Math.sin(seconds * orbitSpeed * 1.17 + 1.1) * orbitRadius * 0.86,
      );
    }

    if (settleDimStart === null && isSettled()) settleDimStart = now;
    const settleDimFactor = settleDimStart === null ? 1 : Math.max(0.25, 1 - (now - settleDimStart) / 600);
    pointLight.intensity = (skin === 'lightning'
      ? 0.55 + rollingPulse * 0.75
      : skin === 'fire'
        ? 0.6 + rollingPulse * 1.12
        : skin === 'ice'
          ? ICE_LIGHT_INTENSITY
          : skin === 'poison'
            ? 0.52 + rollingPulse * 0.6
            : skin === 'stone'
              ? 0.44 + rollingPulse * 0.38
              : skin === 'metal'
                ? 0.54 + rollingPulse * 0.76
                : 0.35 + rollingPulse * 0.42) * settleDimFactor;

    if (fireFrameContext && fireFrameTexture && fireFrameAtlasImage?.complete && fireFrameAtlasImage.naturalWidth > 0) {
      const pingPongLength = FIRE_FRAME_COUNT * 2 - 2;
      const sequenceIndex = Math.floor((now - startedAt) / FIRE_FRAME_DURATION_MS) % pingPongLength;
      const frameIndex = sequenceIndex < FIRE_FRAME_COUNT ? sequenceIndex : pingPongLength - sequenceIndex;
      if (frameIndex !== lastFireFrameIndex) {
        drawFireAtlasFrame(fireFrameContext, fireFrameAtlasImage, frameIndex);
        fireFrameTexture.needsUpdate = true;
        lastFireFrameIndex = frameIndex;
      }
    }

    if (facePulseBaselines.length > 0) {
      const facePulse = clamp01(0.18 + slow * 0.5 + medium * 0.32);
      for (const { material, emissiveIntensity } of facePulseBaselines) {
        material.emissiveIntensity = emissiveIntensity + 0.02 + facePulse * STONE_FACE_EMISSIVE_PULSE;
        material.needsUpdate = true;
      }
    }

    raf = window.requestAnimationFrame(frame);
  };

  typedMesh.add(group);
  raf = window.requestAnimationFrame(frame);
  return () => {
    fillCleanup();
    if (raf !== null) window.cancelAnimationFrame(raf);
    if (onFireAtlasLoad && fireFrameAtlasImage) fireFrameAtlasImage.removeEventListener('load', onFireAtlasLoad);
    for (const { material, emissiveMap, emissiveIntensity, emissiveHex } of fireFaceBaselines) {
      material.emissiveMap = emissiveMap;
      material.emissiveIntensity = emissiveIntensity;
      if (emissiveHex !== undefined) material.emissive?.set?.(emissiveHex);
      material.needsUpdate = true;
    }
    fireFrameTexture?.dispose?.();
    for (const { material, emissiveMap, emissiveIntensity, emissiveHex } of facePulseBaselines) {
      material.emissiveMap = emissiveMap;
      material.emissiveIntensity = emissiveIntensity;
      if (emissiveHex !== undefined) material.emissive?.set?.(emissiveHex);
      material.needsUpdate = true;
    }
    typedMesh.remove(group);
    disposeGroup(group);
  };
}
