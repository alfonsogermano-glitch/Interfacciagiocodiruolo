// three@0.143 is a transitive runtime dependency of dice-box-threejs and ships without TS declarations.
// @ts-ignore Runtime module is present through dice-box-threejs; keep this adapter structurally typed.
import * as THREE from 'three';
import type { Dice3DAppearanceDescriptor } from './dice3dProjection.ts';

type MeshLike = {
  geometry?: { boundingSphere?: { radius?: number } | null; computeBoundingSphere?: () => void };
  add: (child: unknown) => void;
  remove: (child: unknown) => void;
};

function radiusOf(mesh: MeshLike): number {
  if (!mesh.geometry) return 1;
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere?.();
  const radius = mesh.geometry.boundingSphere?.radius;
  return typeof radius === 'number' && Number.isFinite(radius) && radius > 0 ? radius : 1;
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

  group.onBeforeRender = () => {
    const seconds = performance.now() / 1000;
    const pulse = (Math.sin(seconds * (skin === 'lightning' ? 18 : 6)) + 1) / 2;
    pointLight.intensity = (skin === 'lightning' ? 0.55 : 0.35) + pulse * (skin === 'lightning' ? 0.75 : 0.42);
  };

  typedMesh.add(group);
  return () => {
    group.onBeforeRender = null;
    typedMesh.remove(group);
    disposeGroup(group);
  };
}
