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

function glowMaterial(color: string, opacity: number) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

function addRing(group: any, radius: number, color: string, opacity: number, tube = 0.022) {
  const material = glowMaterial(color, opacity);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, Math.max(radius * tube, 0.01), 6, 48),
    material,
  );
  group.add(ring);
  return { ring, material };
}

function disposeGroup(group: any) {
  group.traverse((child: any) => {
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    materials.forEach((material: any) => material.dispose?.());
  });
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

  const typedMesh = mesh as MeshLike;
  const radius = radiusOf(typedMesh);
  const group = new THREE.Group();
  group.name = `hollowgate-strong-skin-${descriptor.appearance.skinId}`;
  group.renderOrder = 1000;

  const rings: Array<{ ring: any; material: any; speed: number; wobble: number }> = [];
  const skin = descriptor.appearance.skinId;

  const pushRing = (scale: number, color: string, opacity: number, speed: number, wobble: number, tube?: number) => {
    const created = addRing(group, radius * scale, color, opacity, tube);
    created.ring.rotation.x = Math.PI / (2.2 + rings.length * 0.35);
    rings.push({ ...created, speed, wobble });
  };

  switch (skin) {
    case 'fire':
      pushRing(1.24, '#ff5d19', 0.72, 2.5, 0.34, 0.03);
      pushRing(1.38, '#ffc34f', 0.46, -1.7, 0.27, 0.018);
      break;
    case 'ice':
      pushRing(1.25, '#d8fbff', 0.62, 1.05, 0.24, 0.018);
      pushRing(1.36, '#62ddff', 0.38, -0.72, 0.2, 0.014);
      break;
    case 'lightning':
      pushRing(1.28, '#e4fdff', 0.78, 4.4, 0.46, 0.018);
      pushRing(1.43, '#38dfff', 0.58, -3.1, 0.38, 0.014);
      break;
    case 'poison':
      pushRing(1.24, '#92ff68', 0.6, 1.45, 0.3, 0.025);
      pushRing(1.39, '#d4ff79', 0.34, -0.9, 0.22, 0.016);
      break;
    case 'stone':
      pushRing(1.22, '#d7d0c3', 0.34, 0.45, 0.15, 0.016);
      break;
    case 'metal':
      pushRing(1.24, '#ffffff', 0.72, 4.2, 0.34, 0.012);
      pushRing(1.39, '#9ed8ff', 0.42, -2.8, 0.28, 0.009);
      break;
    case 'obsidian':
      pushRing(1.25, '#b889ff', 0.62, 1.7, 0.28, 0.022);
      pushRing(1.39, '#6d35d8', 0.38, -1.15, 0.24, 0.014);
      break;
  }

  const pointLight = skin === 'stone' ? null : new THREE.PointLight(
    skin === 'fire' ? '#ff641f'
      : skin === 'ice' ? '#8eeeff'
        : skin === 'lightning' ? '#55e6ff'
          : skin === 'poison' ? '#7fea55'
            : skin === 'metal' ? '#d5ecff'
              : '#9a69ff',
    skin === 'lightning' ? 0.85 : 0.55,
    radius * 4.5,
    2,
  );
  if (pointLight) group.add(pointLight);

  group.onBeforeRender = () => {
    const seconds = performance.now() / 1000;
    rings.forEach(({ ring, material, speed, wobble }, index) => {
      ring.rotation.y = seconds * speed;
      ring.rotation.z = seconds * speed * (index % 2 ? -0.47 : 0.61);
      ring.rotation.x += Math.sin(seconds * (1.4 + index * 0.3)) * 0.004 * wobble;
      const pulse = 0.72 + (Math.sin(seconds * (skin === 'lightning' ? 12 : 4.8) + index) + 1) * 0.18;
      material.opacity = Math.min(1, material.opacity * 0.86 + pulse * 0.14);
    });
    if (pointLight) {
      const pulse = (Math.sin(seconds * (skin === 'lightning' ? 18 : 6)) + 1) / 2;
      pointLight.intensity = (skin === 'lightning' ? 0.55 : 0.35) + pulse * (skin === 'lightning' ? 0.75 : 0.42);
    }
  };

  typedMesh.add(group);
  return () => {
    group.onBeforeRender = null;
    typedMesh.remove(group);
    disposeGroup(group);
  };
}
