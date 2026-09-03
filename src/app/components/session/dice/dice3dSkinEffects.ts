import type { Dice3DAppearanceDescriptor } from './dice3dProjection.ts';

type MaterialLike = {
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
  roughness?: number;
  metalness?: number;
  shininess?: number;
  opacity?: number;
}

function materialsOf(mesh: MeshLike): MaterialLike[] {
  if (!mesh.material) return [];
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function effectAmplitude(skinId: Dice3DAppearanceDescriptor['appearance']['skinId']): number {
  switch (skinId) {
    case 'fire': return 0.7;
    case 'lightning': return 1;
    case 'poison': return 0.45;
    case 'obsidian': return 0.4;
    case 'arcane': return 0.75;
    case 'ice': return 0.28;
    case 'metal': return 0.18;
    case 'stone': return 0.08;
    default: return 0;
  }
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
        const baseAmplitude = effectAmplitude(entry.descriptor.appearance.skinId);
        const amplitude = baseAmplitude * (entry.descriptor.preserveFaceColors ? 0.35 : 1);
        const wave = (Math.sin(elapsed * (entry.descriptor.appearance.skinId === 'lightning' ? 13 : 5)) + 1) / 2;

        for (const material of materialsOf(entry.mesh)) {
          if (!this.baselines.has(material as object)) {
            this.baselines.set(material as object, {
              roughness: material.roughness,
              metalness: material.metalness,
              shininess: material.shininess,
              opacity: material.opacity,
            });
          }

          const baseline = this.baselines.get(material as object)!;
          if (typeof material.roughness === 'number') {
            material.roughness = Math.max(
              0.05,
              Math.min(1, (baseline.roughness ?? material.roughness) - wave * amplitude * 0.12),
            );
          }
          if (typeof material.shininess === 'number') {
            material.shininess = Math.max(
              1,
              (baseline.shininess ?? material.shininess) + wave * amplitude * 18,
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
