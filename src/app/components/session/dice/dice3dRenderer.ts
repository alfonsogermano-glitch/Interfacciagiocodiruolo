import { buildSimultaneousAppearanceQueue, installDiceAppearanceAdapter } from './dice3dAppearanceMaterials.ts';
import { buildSimultaneousMaterialQueue, installCustomDiceMaterialAdapter } from './dice3dCustomMaterials.ts';
import { calibrateDice3DMotion, DICE_3D_ROLL_TIMEOUT_MS, DICE_3D_THROW_STRENGTH, type Dice3DNotationVectors } from './dice3dMotion.ts';
import { projectRollTo3D, type Dice3DProjectionChunk } from './dice3dProjection.ts';
import { waitForDice3DTextureAssets } from './dice3dSkinTextures.ts';
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

function installDice3DMotionAdapter(box: DiceBoxInstance, container: HTMLElement) {
  const original = box.getNotationVectors?.bind(box);
  if (!original) return;
  box.getNotationVectors = (...args: unknown[]) => {
    const shortSide = Math.min(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    return calibrateDice3DMotion(original(...args) as Dice3DNotationVectors, shortSide);
  };
}

function rollDiceWithDeadline(box: DiceBoxInstance, notation: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      signal.removeEventListener('abort', abort);
      callback();
    };
    const stop = () => {
      try { box.clearDice(); } catch { /* Presentation-only. */ }
    };
    const abort = () => finish(() => { stop(); reject(new Dice3DAbortError()); });
    const timeoutId = window.setTimeout(() => finish(() => {
      stop();
      reject(new Error(`Il lancio 3D non si è fermato entro ${DICE_3D_ROLL_TIMEOUT_MS / 1000} secondi.`));
    }), DICE_3D_ROLL_TIMEOUT_MS);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    void Promise.resolve().then(() => box.roll(notation)).then(
      () => finish(resolve),
      (error) => finish(() => reject(error)),
    );
  });
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
    installDice3DMotionAdapter(box, container);
    this.box = box;
  }

  async play(result: RollResult, signal: AbortSignal): Promise<void> {
    if (!this.box) throw new Error('Dice 3D renderer not initialized');
    const chunks = projectRollTo3D(result);
    const notation = buildSimultaneousDice3DNotation(chunks);
    if (!notation) return;

    let restoreCustomMaterials: (() => void) | null = null;
    let installed: ReturnType<typeof installDiceAppearanceAdapter> | null = null;
    let keepEffectsRendering = false;
    let needsRollingEffectsRender = false;
    this.stopSettledRenderLoop();
    this.releaseAppearanceEffects();
    const stopEffectsOnAbort = () => this.releaseAppearanceEffects();
    try {
      const appearanceQueue = buildSimultaneousAppearanceQueue(chunks);
      throwIfAborted(signal);
      await waitForDice3DTextureAssets(appearanceQueue);
      throwIfAborted(signal);
      keepEffectsRendering = appearanceQueue.some((descriptor) => descriptor?.appearance.effectsEnabled);
      needsRollingEffectsRender = appearanceQueue.some((descriptor) => descriptor?.appearance.effectsEnabled
        && (descriptor.appearance.skinId === 'stone' || descriptor.appearance.skinId === 'metal'));
      if (appearanceQueue.some(Boolean)) {
        try {
          installed = installDiceAppearanceAdapter(this.box, appearanceQueue);
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
      if (needsRollingEffectsRender) this.startSettledRenderLoop();
      // Ordering guarantee: texture wait -> appearance adapter -> deadline-bounded roll.
      await rollDiceWithDeadline(this.box, notation, signal);
      throwIfAborted(signal);
      if (installed) installed.effects.settle();
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
