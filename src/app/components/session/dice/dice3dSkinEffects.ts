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

type MeshLike = {
  material?: MaterialLike | MaterialLike[];
};

interface RegisteredMesh {
  mesh: MeshLike;
  descriptor: Dice3DAppearanceDescriptor;
}

interface MaterialBaseline {
  emissiveHex?: number;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  shininess?: number;
  opacity?: number;
}

export interface Dice3DSkinEffectProfile {
  frequency: number;
  emissiveColor: string | null;
  emissiveBase: number;
  emissivePulse: number;
  roughnessPulse: number;
  shininessPulse: number;
}

export function getDice3DSkinEffectProfile(
  skinId: Dice3DAppearanceDescriptor['appearance']['skinId'],
): Dice3DSkinEffectProfile {
  switch (skinId) {
    case 'fire':
      return { frequency: 5.4, emissiveColor: '#ff4d00', emissiveBase: 0.04, emissivePulse: 0.22, roughnessPulse: 0.11, shininessPulse: 28 };
    case 'ice':
      return { frequency: 3.2, emissiveColor: '#32b8d8', emissiveBase: 0.02, emissivePulse: 0.08, roughnessPulse: 0.08, shininessPulse: 34 };
    case 'lightning':
      return { frequency: 13, emissiveColor: '#00aeea', emissiveBase: 0.03, emissivePulse: 0.38, roughnessPulse: 0.16, shininessPulse: 48 };
    case 'poison':
      return { frequency: 4.3, emissiveColor: '#45c83f', emissiveBase: 0.025, emissivePulse: 0.16, roughnessPulse: 0.1, shininessPulse: 24 };
    case 'stone':
      return { frequency: 2.4, emissiveColor: null, emissiveBase: 0, emissivePulse: 0, roughnessPulse: 0.035, shininessPulse: 5 };
    case 'metal':
      return { frequency: 6.2, emissiveColor: null, emissiveBase: 0, emissivePulse: 0, roughnessPulse: 0.18, shininessPulse: 52 };
    case 'obsidian':
      return { frequency: 3.8, emissiveColor: '#6547c9', emissiveBase: 0.02, emissivePulse: 0.12, roughnessPulse: 0.12, shininessPulse: 42 };
    case 'arcane':
      return { frequency: 6.8, emissiveColor: '#a94ee8', emissiveBase: 0.035, emissivePulse: 0.28, roughnessPulse: 0.13, shininessPulse: 38 };
    default:
      return { frequency: 0, emissiveColor: null, emissiveBase: 0, emissivePulse: 0, roughnessPulse: 0, shininessPulse: 0 };
  }
}

function materialsOf(mesh: MeshLike): MaterialLike[] {
  if (!mesh.material) return [];
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

export class Dice3DSkinEffectController {
  private entries: RegisteredMesh[] = [];
  private raf: number | null = null;
  private startedAt = 0;
  private baselines = new WeakMap<object, MaterialBaseline>();

  registerMesh(mesh: unknown, descriptor: Dice3DAppearanceDescriptor | null): void {
    if (!descriptor || !descriptor.appearance.effectsEnabled || descriptor.appearance.skinId === 'none') return;
    if (!mesh || typeof mesh !== 'object') return;
    this.entries.push({ mesh: mesh as MeshLike, descriptor });
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
              0.05,
              Math.min(1, (baseline.roughness ?? material.roughness) - wave * profile.roughnessPulse * preserveFactor),
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
  }
}
