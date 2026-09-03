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
      return { frequency: 6.8, emissiveColor: '#ff5b14', emissiveBase: 0.05, emissivePulse: 0.26, roughnessPulse: 0.16, metalnessPulse: 0, shininessPulse: 42, particleColor: '#ffb347', particleCount: 16, particleOpacity: 0.98, particleSize: 0.13, orbitSpeed: 2.35, lightningBolts: 0, arcaneRing: false };
    case 'ice':
      return { frequency: 4.1, emissiveColor: '#70eaff', emissiveBase: 0.025, emissivePulse: 0.14, roughnessPulse: 0.13, metalnessPulse: 0.025, shininessPulse: 56, particleColor: '#e5fbff', particleCount: 12, particleOpacity: 0.84, particleSize: 0.105, orbitSpeed: 1.0, lightningBolts: 0, arcaneRing: false };
    case 'lightning':
      return { frequency: 15.5, emissiveColor: '#43dcff', emissiveBase: 0.04, emissivePulse: 0.4, roughnessPulse: 0.2, metalnessPulse: 0.02, shininessPulse: 74, particleColor: '#d2faff', particleCount: 10, particleOpacity: 1, particleSize: 0.105, orbitSpeed: 3.25, lightningBolts: 5, arcaneRing: false };
    case 'poison':
      return { frequency: 5.4, emissiveColor: '#69df52', emissiveBase: 0.03, emissivePulse: 0.2, roughnessPulse: 0.13, metalnessPulse: 0, shininessPulse: 34, particleColor: '#9aff72', particleCount: 14, particleOpacity: 0.9, particleSize: 0.14, orbitSpeed: 1.2, lightningBolts: 0, arcaneRing: false };
    case 'stone':
      return { frequency: 3, emissiveColor: null, emissiveBase: 0, emissivePulse: 0, roughnessPulse: 0.07, metalnessPulse: 0, shininessPulse: 10, particleColor: '#d8d1c4', particleCount: 9, particleOpacity: 0.58, particleSize: 0.08, orbitSpeed: 0.5, lightningBolts: 0, arcaneRing: false };
    case 'metal':
      return { frequency: 8, emissiveColor: null, emissiveBase: 0, emissivePulse: 0, roughnessPulse: 0.28, metalnessPulse: 0.05, shininessPulse: 94, particleColor: '#ffffff', particleCount: 6, particleOpacity: 0.96, particleSize: 0.075, orbitSpeed: 2.7, lightningBolts: 0, arcaneRing: false };
    case 'obsidian':
      return { frequency: 5, emissiveColor: '#9568ff', emissiveBase: 0.035, emissivePulse: 0.22, roughnessPulse: 0.16, metalnessPulse: 0.03, shininessPulse: 58, particleColor: '#be92ff', particleCount: 11, particleOpacity: 0.86, particleSize: 0.1, orbitSpeed: 1.15, lightningBolts: 0, arcaneRing: false };
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

function createGlowMaterial(color: string, opacity: number, additive = true): any {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

function addOrbitingTorus(
  group: any,
  updaters: Array<(elapsed: number, wave: number) => void>,
  radius: number,
  color: string,
  baseOpacity: number,
  speed: number,
  tilt: number,
  tubeRatio = 0.022,
) {
  const material = createGlowMaterial(color, baseOpacity);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.18, Math.max(radius * tubeRatio, 0.01), 6, 48),
    material,
  );
  ring.rotation.x = tilt;
  group.add(ring);
  updaters.push((elapsed, wave) => {
    ring.rotation.x = tilt + Math.sin(elapsed * speed * 0.35) * 0.22;
    ring.rotation.y = elapsed * speed;
    ring.rotation.z = elapsed * speed * 0.57;
    material.opacity = Math.min(1, baseOpacity * (0.72 + wave * 0.58));
  });
}

function addIceCrystals(
  group: any,
  updaters: Array<(elapsed: number, wave: number) => void>,
  radius: number,
) {
  const crystals: any[] = [];
  for (let index = 0; index < 5; index += 1) {
    const material = createGlowMaterial('#dffaff', 0.46);
    material.wireframe = true;
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(radius * (0.075 + (index % 2) * 0.018), 0), material);
    group.add(crystal);
    crystals.push({ crystal, material, phase: index * 1.31 });
  }
  updaters.push((elapsed, wave) => {
    crystals.forEach(({ crystal, material, phase }, index) => {
      const angle = phase + elapsed * (0.7 + index * 0.08);
      const orbit = radius * (1.18 + (index % 2) * 0.1);
      crystal.position.set(
        Math.cos(angle) * orbit,
        Math.sin(angle) * orbit,
        Math.sin(angle * 1.4 + phase) * radius * 0.58,
      );
      crystal.rotation.x = elapsed * 0.7 + phase;
      crystal.rotation.y = elapsed * 0.55 + index;
      material.opacity = 0.3 + wave * 0.28;
    });
  });
}

function addPoisonBubbles(
  group: any,
  updaters: Array<(elapsed: number, wave: number) => void>,
  radius: number,
) {
  const bubbles: any[] = [];
  for (let index = 0; index < 5; index += 1) {
    const material = createGlowMaterial(index % 2 ? '#87ff64' : '#c8ff73', 0.34);
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(radius * (0.06 + index * 0.008), 8, 6), material);
    group.add(bubble);
    bubbles.push({ bubble, material, phase: index * 1.17 });
  }
  updaters.push((elapsed, wave) => {
    bubbles.forEach(({ bubble, material, phase }, index) => {
      const angle = phase + elapsed * (0.62 + index * 0.05);
      const orbit = radius * (1.18 + (index % 3) * 0.08);
      bubble.position.set(
        Math.cos(angle) * orbit,
        Math.sin(angle) * orbit,
        Math.sin(elapsed * 1.2 + phase) * radius * 0.55,
      );
      const scale = 0.78 + wave * 0.4 + Math.sin(elapsed * 2 + phase) * 0.08;
      bubble.scale.setScalar(scale);
      material.opacity = 0.24 + wave * 0.28;
    });
  });
}

function addStoneFragments(
  group: any,
  updaters: Array<(elapsed: number, wave: number) => void>,
  radius: number,
) {
  const fragments: any[] = [];
  for (let index = 0; index < 5; index += 1) {
    const material = createGlowMaterial(index % 2 ? '#d2cabd' : '#999083', 0.42, false);
    const fragment = new THREE.Mesh(new THREE.TetrahedronGeometry(radius * (0.06 + (index % 3) * 0.012), 0), material);
    group.add(fragment);
    fragments.push({ fragment, material, phase: index * 1.43 });
  }
  updaters.push((elapsed, wave) => {
    fragments.forEach(({ fragment, material, phase }, index) => {
      const angle = phase + elapsed * (0.28 + index * 0.025);
      const orbit = radius * (1.14 + (index % 2) * 0.12);
      fragment.position.set(
        Math.cos(angle) * orbit,
        Math.sin(angle) * orbit,
        Math.sin(angle * 1.7 + phase) * radius * 0.48,
      );
      fragment.rotation.x = elapsed * 0.38 + phase;
      fragment.rotation.z = elapsed * 0.3 + index;
      material.opacity = 0.32 + wave * 0.16;
    });
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
      depthTest: true,
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
          ? 1.12 + ((elapsed * 0.7 + index / Math.max(1, particleCount)) % 1) * 0.48
          : 1.18 + Math.sin(elapsed * phase.pulse + index) * 0.12;
        const verticalDrift = skinId === 'poison'
          ? Math.sin(elapsed * 1.7 + index * 0.7) * 0.42
          : phase.elevation + Math.sin(elapsed * phase.pulse + index * 0.3) * 0.16;
        positions[index * 3] = Math.cos(angle) * radius * outward;
        positions[index * 3 + 1] = Math.sin(angle) * radius * outward;
        positions[index * 3 + 2] = radius * verticalDrift;
      }
      attribute.needsUpdate = true;
      material.opacity = Math.min(1, profile.particleOpacity * (0.68 + wave * 0.48));
    });
  }

  if (profile.lightningBolts > 0) {
    const segmentsPerBolt = 6;
    const boltPositions = new Float32Array(profile.lightningBolts * segmentsPerBolt * 2 * 3);
    const boltGeometry = new THREE.BufferGeometry();
    const boltAttribute = new THREE.BufferAttribute(boltPositions, 3);
    boltAttribute.setUsage(THREE.DynamicDrawUsage);
    boltGeometry.setAttribute('position', boltAttribute);
    const boltMaterial = new THREE.LineBasicMaterial({
      color: '#d9fbff',
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    const bolts = new THREE.LineSegments(boltGeometry, boltMaterial);
    bolts.frustumCulled = false;
    group.add(bolts);

    updaters.push((elapsed) => {
      let cursor = 0;
      for (let bolt = 0; bolt < profile.lightningBolts; bolt += 1) {
        const baseAngle = elapsed * (3 + bolt * 0.31) + bolt * 1.67;
        for (let segment = 0; segment < segmentsPerBolt; segment += 1) {
          for (const endpoint of [segment, segment + 1]) {
            const t = endpoint / segmentsPerBolt;
            const angle = baseAngle + t * (0.95 + bolt * 0.07);
            const jitter = Math.sin(elapsed * 37 + endpoint * 4.9 + bolt * 2.2) * radius * 0.12;
            const radial = radius * (1.08 + t * 0.18) + jitter;
            boltPositions[cursor++] = Math.cos(angle) * radial;
            boltPositions[cursor++] = Math.sin(angle) * radial;
            boltPositions[cursor++] = radius * (-0.75 + t * 1.5) + jitter * 0.55;
          }
        }
      }
      boltAttribute.needsUpdate = true;
      const flash = Math.sin(elapsed * 29) > -0.05 || Math.sin(elapsed * 13.7) > 0.65;
      boltMaterial.opacity = flash ? 1 : 0.32;
    });
  }

  switch (skinId) {
    case 'ice':
      addIceCrystals(group, updaters, radius);
      break;
    case 'poison':
      addPoisonBubbles(group, updaters, radius);
      break;
    case 'stone':
      addStoneFragments(group, updaters, radius);
      break;
  }

  if (profile.arcaneRing) {
    addOrbitingTorus(group, updaters, radius, '#c36cff', 0.48, 1.5, Math.PI / 2.7, 0.022);
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
  private particleBudget = 144;

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
        const wave = profile.frequency > 0 ? (Math.sin(elapsed * profile.frequency) + 1) / 2 : 0;

        entry.visual?.update(elapsed, wave);

        materialsOf(entry.mesh).forEach((material, materialIndex) => {
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
          const isEdgeMaterial = materialIndex === 0;
          const faceMaterialFactor = entry.descriptor.preserveFaceColors ? 0 : 0.06;
          const materialFactor = isEdgeMaterial ? 1 : faceMaterialFactor;

          if (
            isEdgeMaterial
            && profile.emissiveColor
            && material.emissive
            && typeof material.emissive.set === 'function'
          ) {
            material.emissive.set(profile.emissiveColor);
          }
          if (
            isEdgeMaterial
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
              Math.min(1, (baseline.roughness ?? material.roughness) - wave * profile.roughnessPulse * materialFactor),
            );
          }
          if (typeof material.metalness === 'number') {
            material.metalness = Math.max(
              0,
              Math.min(1, (baseline.metalness ?? material.metalness) + wave * profile.metalnessPulse * materialFactor),
            );
          }
          if (typeof material.shininess === 'number') {
            material.shininess = Math.max(
              1,
              (baseline.shininess ?? material.shininess) + wave * profile.shininessPulse * materialFactor,
            );
          }
          material.needsUpdate = true;
        });
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
    this.particleBudget = 144;
  }
}
