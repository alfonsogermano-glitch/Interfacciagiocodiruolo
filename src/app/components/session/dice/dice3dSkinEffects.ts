// three@0.143 is a transitive runtime dependency of dice-box-threejs and ships without TS declarations.
// @ts-ignore Runtime module is present through dice-box-threejs; keep this adapter structurally typed.
import * as THREE from 'three';
import type { Dice3DAppearanceDescriptor } from './dice3dProjection.ts';

type MaterialLike = {
  emissive?: { set?: (value: string | number) => unknown; getHex?: () => number };
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  shininess?: number;
  opacity?: number;
  transparent?: boolean;
  needsUpdate?: boolean;
};

type GeometryLike = {
  boundingSphere?: { radius?: number } | null;
  computeBoundingSphere?: () => void;
};

type MeshLike = {
  material?: MaterialLike | MaterialLike[];
  geometry?: GeometryLike;
  add: (child: unknown) => void;
  remove: (child: unknown) => void;
};

interface MaterialBaseline {
  emissiveHex?: number;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  shininess?: number;
  opacity?: number;
}

interface VisualEffect {
  group: any;
  particleCount: number;
  update: (elapsed: number, wave: number) => void;
  dispose: () => void;
}

interface RegisteredMesh {
  mesh: MeshLike;
  descriptor: Dice3DAppearanceDescriptor;
  visual: VisualEffect | null;
}

export interface Dice3DSkinEffectProfile {
  frequency: number;
  emissiveColor: string | null;
  emissiveBase: number;
  emissivePulse: number;
  roughnessPulse: number;
  metalnessPulse: number;
  shininessPulse: number;
  particleColor: string | null;
  particleCount: number;
  particleOpacity: number;
  particleSize: number;
  orbitSpeed: number;
  lightningBolts: number;
  arcaneRing: boolean;
}

export function getDice3DSkinEffectProfile(
  skinId: Dice3DAppearanceDescriptor['appearance']['skinId'],
): Dice3DSkinEffectProfile {
  switch (skinId) {
    case 'fire':
      return { frequency: 5.8, emissiveColor: '#ff5b14', emissiveBase: 0.04, emissivePulse: 0.2, roughnessPulse: 0.13, metalnessPulse: 0, shininessPulse: 30, particleColor: '#ffb24a', particleCount: 10, particleOpacity: 0.9, particleSize: 0.1, orbitSpeed: 1.8, lightningBolts: 0, arcaneRing: false };
    case 'ice':
      return { frequency: 3.4, emissiveColor: '#66e6ff', emissiveBase: 0.02, emissivePulse: 0.1, roughnessPulse: 0.11, metalnessPulse: 0.03, shininessPulse: 40, particleColor: '#d6faff', particleCount: 8, particleOpacity: 0.72, particleSize: 0.085, orbitSpeed: 0.65, lightningBolts: 0, arcaneRing: false };
    case 'lightning':
      return { frequency: 13.5, emissiveColor: '#37d8ff', emissiveBase: 0.025, emissivePulse: 0.34, roughnessPulse: 0.18, metalnessPulse: 0.02, shininessPulse: 58, particleColor: '#baf5ff', particleCount: 6, particleOpacity: 0.95, particleSize: 0.09, orbitSpeed: 2.8, lightningBolts: 3, arcaneRing: false };
    case 'poison':
      return { frequency: 4.5, emissiveColor: '#61d94e', emissiveBase: 0.02, emissivePulse: 0.15, roughnessPulse: 0.11, metalnessPulse: 0, shininessPulse: 26, particleColor: '#8ff06c', particleCount: 9, particleOpacity: 0.78, particleSize: 0.12, orbitSpeed: 0.9, lightningBolts: 0, arcaneRing: false };
    case 'stone':
      return { frequency: 2.5, emissiveColor: null, emissiveBase: 0, emissivePulse: 0, roughnessPulse: 0.045, metalnessPulse: 0, shininessPulse: 6, particleColor: '#d0cbc0', particleCount: 6, particleOpacity: 0.42, particleSize: 0.065, orbitSpeed: 0.35, lightningBolts: 0, arcaneRing: false };
    case 'metal':
      return { frequency: 6.6, emissiveColor: null, emissiveBase: 0, emissivePulse: 0, roughnessPulse: 0.24, metalnessPulse: 0.13, shininessPulse: 76, particleColor: '#ffffff', particleCount: 3, particleOpacity: 0.9, particleSize: 0.07, orbitSpeed: 2.2, lightningBolts: 0, arcaneRing: false };
    case 'obsidian':
      return { frequency: 4.1, emissiveColor: '#875bff', emissiveBase: 0.025, emissivePulse: 0.15, roughnessPulse: 0.14, metalnessPulse: 0.04, shininessPulse: 48, particleColor: '#a977ff', particleCount: 8, particleOpacity: 0.78, particleSize: 0.085, orbitSpeed: 0.8, lightningBolts: 0, arcaneRing: false };
    case 'arcane':
      return { frequency: 7.1, emissiveColor: '#c05cff', emissiveBase: 0.035, emissivePulse: 0.25, roughnessPulse: 0.15, metalnessPulse: 0.03, shininessPulse: 45, particleColor: '#e2a6ff', particleCount: 12, particleOpacity: 0.9, particleSize: 0.085, orbitSpeed: 1.55, lightningBolts: 0, arcaneRing: true };
    default:
      return { frequency: 0, emissiveColor: null, emissiveBase: 0, emissivePulse: 0, roughnessPulse: 0, metalnessPulse: 0, shininessPulse: 0, particleColor: null, particleCount: 0, particleOpacity: 0, particleSize: 0, orbitSpeed: 0, lightningBolts: 0, arcaneRing: false };
  }
}

function materialsOf(mesh: MeshLike): MaterialLike[] {
  if (!mesh.material) return [];
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function meshRadius(mesh: MeshLike): number {
  const geometry = mesh.geometry;
  if (!geometry) return 1;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere?.();
  const radius = geometry.boundingSphere?.radius;
  return typeof radius === 'number' && Number.isFinite(radius) && radius > 0 ? radius : 1;
}

function disposeObject(object: any) {
  object.traverse((child: any) => {
    const candidate = child as {
      geometry?: { dispose?: () => void };
      material?: { dispose?: () => void } | Array<{ dispose?: () => void }>;
    };
    candidate.geometry?.dispose?.();
    const materials = Array.isArray(candidate.material) ? candidate.material : candidate.material ? [candidate.material] : [];
    for (const material of materials) material.dispose?.();
  });
}

function createParticleVisual(
  radius: number,
  profile: Dice3DSkinEffectProfile,
  particleCount: number,
  skinId: Dice3DAppearanceDescriptor['appearance']['skinId'],
): VisualEffect | null {
  const group = new THREE.Group();
  group.name = `hollowgate-skin-effect-${skinId}`;
  const updaters: Array<(elapsed: number, wave: number) => void> = [];

  if (profile.particleColor && particleCount > 0) {
    const positions = new Float32Array(particleCount * 3);
    const geometry = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(positions, 3);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', attribute);
    const energySkin = skinId !== 'stone';
    const material = new THREE.PointsMaterial({
      color: profile.particleColor,
      size: Math.max(0.04, radius * profile.particleSize),
      sizeAttenuation: true,
      transparent: true,
      opacity: profile.particleOpacity,
      depthWrite: false,
      blending: energySkin ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    group.add(points);

    const phases = Array.from({ length: particleCount }, (_, index) => ({
      angle: (Math.PI * 2 * index) / particleCount + (index % 3) * 0.37,
      elevation: Math.sin(index * 1.91) * 0.62,
      speed: profile.orbitSpeed * (0.72 + (index % 5) * 0.11) * (index % 2 ? 1 : -1),
      pulse: 0.8 + (index % 4) * 0.17,
    }));

    updaters.push((elapsed, wave) => {
      for (let index = 0; index < phases.length; index += 1) {
        const phase = phases[index];
        const angle = phase.angle + elapsed * phase.speed;
        const outward = skinId === 'fire'
          ? 1.05 + ((elapsed * 0.55 + index / Math.max(1, particleCount)) % 1) * 0.38
          : 1.12 + Math.sin(elapsed * phase.pulse + index) * 0.09;
        const verticalDrift = skinId === 'poison'
          ? Math.sin(elapsed * 1.5 + index * 0.7) * 0.35
          : phase.elevation + Math.sin(elapsed * phase.pulse + index * 0.3) * 0.12;
        positions[index * 3] = Math.cos(angle) * radius * outward;
        positions[index * 3 + 1] = Math.sin(angle) * radius * outward;
        positions[index * 3 + 2] = radius * verticalDrift;
      }
      attribute.needsUpdate = true;
      material.opacity = Math.min(1, profile.particleOpacity * (0.62 + wave * 0.52));
    });
  }

  if (profile.lightningBolts > 0) {
    const segmentsPerBolt = 5;
    const boltPositions = new Float32Array(profile.lightningBolts * segmentsPerBolt * 2 * 3);
    const boltGeometry = new THREE.BufferGeometry();
    const boltAttribute = new THREE.BufferAttribute(boltPositions, 3);
    boltAttribute.setUsage(THREE.DynamicDrawUsage);
    boltGeometry.setAttribute('position', boltAttribute);
    const boltMaterial = new THREE.LineBasicMaterial({
      color: '#bff7ff',
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const bolts = new THREE.LineSegments(boltGeometry, boltMaterial);
    bolts.frustumCulled = false;
    group.add(bolts);

    updaters.push((elapsed) => {
      let cursor = 0;
      for (let bolt = 0; bolt < profile.lightningBolts; bolt += 1) {
        const baseAngle = elapsed * (2.5 + bolt * 0.25) + bolt * 2.1;
        for (let segment = 0; segment < segmentsPerBolt; segment += 1) {
          for (const endpoint of [segment, segment + 1]) {
            const t = endpoint / segmentsPerBolt;
            const angle = baseAngle + t * (0.8 + bolt * 0.08);
            const jitter = Math.sin(elapsed * 31 + endpoint * 4.7 + bolt * 1.9) * radius * 0.09;
            const radial = radius * (1.05 + t * 0.12) + jitter;
            boltPositions[cursor++] = Math.cos(angle) * radial;
            boltPositions[cursor++] = Math.sin(angle) * radial;
            boltPositions[cursor++] = radius * (-0.65 + t * 1.3) + jitter * 0.45;
          }
        }
      }
      boltAttribute.needsUpdate = true;
      const flash = Math.sin(elapsed * 24) > 0.25 || Math.sin(elapsed * 11.3) > 0.72;
      boltMaterial.opacity = flash ? 0.95 : 0.2;
    });
  }

  if (profile.arcaneRing) {
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: '#c36cff',
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.17, Math.max(radius * 0.022, 0.01), 6, 48),
      ringMaterial,
    );
    ring.rotation.x = Math.PI / 2.7;
    group.add(ring);
    updaters.push((elapsed, wave) => {
      ring.rotation.x = Math.PI / 2.7 + Math.sin(elapsed * 0.9) * 0.35;
      ring.rotation.y = elapsed * 1.5;
      ring.rotation.z = elapsed * 0.75;
      ringMaterial.opacity = 0.34 + wave * 0.3;
    });
  }

  if (group.children.length === 0) return null;
  return {
    group,
    particleCount,
    update: (elapsed, wave) => {
      for (const update of updaters) update(elapsed, wave);
    },
    dispose: () => disposeObject(group),
  };
}

export class Dice3DSkinEffectController {
  private entries: RegisteredMesh[] = [];
  private raf: number | null = null;
  private startedAt = 0;
  private baselines = new WeakMap<object, MaterialBaseline>();
  private particleBudget = 96;

  registerMesh(mesh: unknown, descriptor: Dice3DAppearanceDescriptor | null): void {
    if (!descriptor || !descriptor.appearance.effectsEnabled || descriptor.appearance.skinId === 'none') return;
    if (!mesh || typeof mesh !== 'object') return;
    const typedMesh = mesh as MeshLike;
    const reducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const profile = getDice3DSkinEffectProfile(descriptor.appearance.skinId);
    const particleCount = Math.max(0, Math.min(profile.particleCount, this.particleBudget));
    this.particleBudget -= particleCount;
    const visual = reducedMotion ? null : createParticleVisual(meshRadius(typedMesh), profile, particleCount, descriptor.appearance.skinId);
    if (visual) typedMesh.add(visual.group);
    this.entries.push({ mesh: typedMesh, descriptor, visual });
    this.start();
  }

  start(): void {
    if (this.raf !== null || this.entries.length === 0) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this.startedAt = performance.now();

    const frame = (now: number) => {
      const elapsed = (now - this.startedAt) / 1000;
      for (const entry of this.entries) {
        const profile = getDice3DSkinEffectProfile(entry.descriptor.appearance.skinId);
        const preserveFactor = entry.descriptor.preserveFaceColors ? 0.35 : 1;
        const wave = profile.frequency > 0 ? (Math.sin(elapsed * profile.frequency) + 1) / 2 : 0;

        entry.visual?.update(elapsed, wave);

        for (const material of materialsOf(entry.mesh)) {
          if (!this.baselines.has(material as object)) {
            this.baselines.set(material as object, {
              emissiveHex: material.emissive?.getHex?.(),
              emissiveIntensity: material.emissiveIntensity,
              roughness: material.roughness,
              metalness: material.metalness,
              shininess: material.shininess,
              opacity: material.opacity,
            });
          }

          const baseline = this.baselines.get(material as object)!;
          if (
            !entry.descriptor.preserveFaceColors
            && profile.emissiveColor
            && material.emissive
            && typeof material.emissive.set === 'function'
          ) {
            material.emissive.set(profile.emissiveColor);
          }
          if (
            !entry.descriptor.preserveFaceColors
            && profile.emissiveColor
            && typeof material.emissiveIntensity === 'number'
          ) {
            material.emissiveIntensity = Math.max(
              0,
              (baseline.emissiveIntensity ?? profile.emissiveBase) + wave * profile.emissivePulse,
            );
          }
          if (typeof material.roughness === 'number') {
            material.roughness = Math.max(
              0.04,
              Math.min(1, (baseline.roughness ?? material.roughness) - wave * profile.roughnessPulse * preserveFactor),
            );
          }
          if (typeof material.metalness === 'number') {
            material.metalness = Math.max(
              0,
              Math.min(1, (baseline.metalness ?? material.metalness) + wave * profile.metalnessPulse * preserveFactor),
            );
          }
          if (typeof material.shininess === 'number') {
            material.shininess = Math.max(
              1,
              (baseline.shininess ?? material.shininess) + wave * profile.shininessPulse * preserveFactor,
            );
          }
          material.needsUpdate = true;
        }
      }
      this.raf = window.requestAnimationFrame(frame);
    };

    this.raf = window.requestAnimationFrame(frame);
  }

  stop(): void {
    if (typeof window !== 'undefined' && this.raf !== null) window.cancelAnimationFrame(this.raf);
    this.raf = null;

    for (const entry of this.entries) {
      if (entry.visual) {
        entry.mesh.remove(entry.visual.group);
        entry.visual.dispose();
      }
      for (const material of materialsOf(entry.mesh)) {
        const baseline = this.baselines.get(material as object);
        if (!baseline) continue;
        if (baseline.emissiveHex !== undefined) material.emissive?.set?.(baseline.emissiveHex);
        if (baseline.emissiveIntensity !== undefined) material.emissiveIntensity = baseline.emissiveIntensity;
        if (baseline.roughness !== undefined) material.roughness = baseline.roughness;
        if (baseline.metalness !== undefined) material.metalness = baseline.metalness;
        if (baseline.shininess !== undefined) material.shininess = baseline.shininess;
        if (baseline.opacity !== undefined) material.opacity = baseline.opacity;
        material.needsUpdate = true;
      }
    }
    this.entries = [];
    this.baselines = new WeakMap<object, MaterialBaseline>();
    this.particleBudget = 96;
  }
}
