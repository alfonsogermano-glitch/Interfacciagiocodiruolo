import { buildSimultaneousAppearanceQueue, installDiceAppearanceAdapter } from './dice3dAppearanceMaterials.ts';
import { buildSimultaneousMaterialQueue, installCustomDiceMaterialAdapter } from './dice3dCustomMaterials.ts';
import { boostDice3DSpin, DICE_3D_THROW_STRENGTH, type Dice3DNotationVectors } from './dice3dMotion.ts';
import { projectRollTo3D, type Dice3DProjectionChunk } from './dice3dProjection.ts';
import { Dice3DAbortError, type Dice3DRenderer } from './dice3dTypes.ts';
import type { RollResult } from './diceTypes.ts';

type DiceBoxInstance = {
  initialize: () => Promise<void>;
  roll: (notation: string) => Promise<unknown>;
  clearDice: () => void;
  DiceFactory?: unknown;
  getNotationVectors?: (...args: unknown[]) => unknown;
  renderer?: { render: (scene: unknown, camera: unknown) => void };
  scene?: unknown;
  camera?: unknown;
};

type DiceBoxConstructor = new (selector: string, options?: Record<string, unknown>) => DiceBoxInstance;
let containerSequence = 0;

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new Dice3DAbortError();
}

function installDice3DSpinAdapter(box: DiceBoxInstance) {
  const original = box.getNotationVectors?.bind(box);
  if (!original) return;
  box.getNotationVectors = (...args: unknown[]) => boostDice3DSpin(original(...args) as Dice3DNotationVectors);
}

export function buildSimultaneousDice3DNotation(chunks: Dice3DProjectionChunk[]): string | null {
  if (chunks.length === 0) return null;
  const grouped = new Map<number, number[]>();
  for (const chunk of chunks) {
    if (chunk.values.length === 0) continue;
    const values = grouped.get(chunk.sides);
    if (values) values.push(...chunk.values);
    else grouped.set(chunk.sides, [...chunk.values]);
  }
  if (grouped.size === 0) return null;
  const diceSets: string[] = [];
  const values: number[] = [];
  for (const [sides, faces] of grouped) {
    diceSets.push(`${faces.length}d${sides}`);
    values.push(...faces);
  }
  return `${diceSets.join('+')}@${values.join(',')}`;
}

export class HollowgateDice3DRenderer implements Dice3DRenderer {
  private box: DiceBoxInstance | null = null;
  private container: HTMLElement | null = null;
  private selector: string | null = null;
  private restoreAppearanceEffects: (() => void) | null = null;
  private settledRenderRaf: number | null = null;

  private releaseAppearanceEffects(): void {
    this.restoreAppearanceEffects?.();
    this.restoreAppearanceEffects = null;
  }

  private stopSettledRenderLoop(): void {
    if (typeof window !== 'undefined' && this.settledRenderRaf !== null) {
      window.cancelAnimationFrame(this.settledRenderRaf);
    }
    this.settledRenderRaf = null;
  }

  private startSettledRenderLoop(): void {
    this.stopSettledRenderLoop();
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const frame = () => {
      const box = this.box;
      if (!box?.renderer || box.scene === undefined || box.camera === undefined) {
        this.settledRenderRaf = null;
        return;
      }
      box.renderer.render(box.scene, box.camera);
      this.settledRenderRaf = window.requestAnimationFrame(frame);
    };

    this.settledRenderRaf = window.requestAnimationFrame(frame);
  }

  async init(container: HTMLElement): Promise<void> {
    if (this.box && this.container === container) return;
    this.dispose();
    this.container = container;
    if (!container.id) {
      containerSequence += 1;
      container.id = `hollowgate-dice-3d-${containerSequence}`;
    }
    this.selector = `#${container.id}`;
    const module = await import('@3d-dice/dice-box-threejs');
    const DiceBox = (module.default ?? module) as unknown as DiceBoxConstructor;
    const box = new DiceBox(this.selector, {
      sounds: false,
      shadows: true,
      theme_colorset: 'white',
      theme_material: 'plastic',
      theme_surface: 'green-felt',
      strength: DICE_3D_THROW_STRENGTH,
    });
    await box.initialize();
    installDice3DSpinAdapter(box);
    this.box = box;
  }

  async play(result: RollResult, signal: AbortSignal): Promise<void> {
    if (!this.box) throw new Error('Dice 3D renderer not initialized');
    const chunks = projectRollTo3D(result);
    const notation = buildSimultaneousDice3DNotation(chunks);
    if (!notation) return;

    let restoreCustomMaterials: (() => void) | null = null;
    let keepEffectsRendering = false;
    this.stopSettledRenderLoop();
    this.releaseAppearanceEffects();
    const stopEffectsOnAbort = () => this.releaseAppearanceEffects();
    try {
      const appearanceQueue = buildSimultaneousAppearanceQueue(chunks);
      keepEffectsRendering = appearanceQueue.some((descriptor) => descriptor?.appearance.effectsEnabled);
      if (appearanceQueue.some(Boolean)) {
        try {
          const installed = installDiceAppearanceAdapter(this.box, appearanceQueue);
          this.restoreAppearanceEffects = installed.restore;
          installed.effects.start();
          signal.addEventListener('abort', stopEffectsOnAbort, { once: true });
        } catch (error) {
          console.error('Personalizzazione 3D dei dadi non disponibile, uso il materiale base:', error);
        }
      }

      const materialQueue = buildSimultaneousMaterialQueue(chunks);
      if (materialQueue.some(Boolean)) {
        try {
          restoreCustomMaterials = await installCustomDiceMaterialAdapter(this.box, materialQueue);
        } catch (error) {
          console.error('Texture 3D del dado Custom non disponibile, uso il materiale standard:', error);
        }
      }

      throwIfAborted(signal);
      await this.box.roll(notation);
      throwIfAborted(signal);
      if (keepEffectsRendering) this.startSettledRenderLoop();
    } finally {
      signal.removeEventListener('abort', stopEffectsOnAbort);
      restoreCustomMaterials?.();
      if (signal.aborted) this.releaseAppearanceEffects();
    }
  }

  clear(): void {
    this.stopSettledRenderLoop();
    try {
      this.box?.clearDice();
    } catch {
      // Presentation-only.
    } finally {
      this.releaseAppearanceEffects();
    }
  }

  dispose(): void {
    this.clear();
    this.box = null;
    if (this.container) this.container.replaceChildren();
    this.container = null;
    this.selector = null;
  }
}
