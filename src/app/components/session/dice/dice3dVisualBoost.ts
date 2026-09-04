// three@0.143 is a transitive runtime dependency of dice-box-threejs and ships without TS declarations.
// @ts-ignore Runtime module is present through dice-box-threejs; keep this adapter structurally typed.
import * as THREE from 'three';
import type { Dice3DAppearanceDescriptor } from './dice3dProjection.ts';

type MaterialLike = {
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

const FIRE_TEXTURE_EMISSIVE_PULSE = 0.38;

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
    case 'poison': return '#7fea55';
    case 'metal': return '#d5ecff';
    case 'obsidian': return '#9a69ff';
    default: return null;
  }
}

export function installDice3DVisualBoost(
  mesh: unknown,
  descriptor: Dice3DAppearanceDescriptor,
): () => void {
  if (!mesh || typeof mesh !== 'object') return () => undefined;
  if (!descriptor.appearance.effectsEnabled || descriptor.appearance.skinId === 'none' || descriptor.appearance.skinId === 'arcane') {
    return () => undefined;
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return () => undefined;
  }

  const skin = descriptor.appearance.skinId;
  const lightColor = boostLightColor(skin);
  if (!lightColor) return () => undefined;

  const typedMesh = mesh as MeshLike;
  const fireFaceBaselines = skin === 'fire' && !descriptor.custom
    ? materialsOf(typedMesh)
      .slice(1)
      .filter((material) => material.emissiveMap && typeof material.emissiveIntensity === 'number')
      .map((material) => ({ material, emissiveIntensity: material.emissiveIntensity as number }))
    : [];
  const radius = radiusOf(typedMesh);
  const group = new THREE.Group();
  group.name = `hollowgate-strong-skin-${skin}`;
  group.renderOrder = 1000;

  const pointLight = new THREE.PointLight(
    lightColor,
    skin === 'lightning' ? 0.85 : 0.55,
    radius * 4.5,
    2,
  );
  group.add(pointLight);

  let raf: number | null = null;
  const startedAt = performance.now();
  const frame = (now: number) => {
    const seconds = (now - startedAt) / 1000;
    const pulse = (Math.sin(seconds * (skin === 'lightning' ? 18 : 7.2)) + 1) / 2;
    const flicker = skin === 'fire'
      ? Math.min(1, pulse * 0.72 + ((Math.sin(seconds * 17.3) + 1) / 2) * 0.28)
      : pulse;
    pointLight.intensity = skin === 'lightning'
      ? 0.55 + pulse * 0.75
      : skin === 'fire'
        ? 0.5 + flicker * 0.9
        : 0.35 + pulse * 0.42;

    if (fireFaceBaselines.length > 0) {
      const texturePulse = Math.min(1, ((Math.sin(seconds * 3.4) + 1) / 2) * 0.76 + flicker * 0.24);
      for (const { material, emissiveIntensity } of fireFaceBaselines) {
        material.emissiveIntensity = emissiveIntensity + texturePulse * FIRE_TEXTURE_EMISSIVE_PULSE;
      }
    }
    raf = window.requestAnimationFrame(frame);
  };

  typedMesh.add(group);
  raf = window.requestAnimationFrame(frame);
  return () => {
    if (raf !== null) window.cancelAnimationFrame(raf);
    for (const { material, emissiveIntensity } of fireFaceBaselines) {
      material.emissiveIntensity = emissiveIntensity;
      material.needsUpdate = true;
    }
    typedMesh.remove(group);
    disposeGroup(group);
  };
}
