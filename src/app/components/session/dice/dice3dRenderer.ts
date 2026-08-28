import { projectRollTo3D } from './dice3dProjection.ts';
import { Dice3DAbortError, type Dice3DRenderer } from './dice3dTypes.ts';
import type { RollResult } from './diceTypes.ts';

type DiceBoxInstance = {
  initialize: () => Promise<void>;
  roll: (notation: string) => Promise<unknown>;
  clearDice: () => void;
};

type DiceBoxConstructor = new (
  selector: string,
  options?: Record<string, unknown>,
) => DiceBoxInstance;

let containerSequence = 0;

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new Dice3DAbortError();
}

export class HollowgateDice3DRenderer implements Dice3DRenderer {
  private box: DiceBoxInstance | null = null;
  private container: HTMLElement | null = null;
  private selector: string | null = null;

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
    });
    await box.initialize();
    this.box = box;
  }

  async play(result: RollResult, signal: AbortSignal): Promise<void> {
    if (!this.box) throw new Error('Dice 3D renderer not initialized');

    const chunks = projectRollTo3D(result);
    if (chunks.length === 0) return;

    for (const chunk of chunks) {
      throwIfAborted(signal);
      await this.box.roll(chunk.notation);
      throwIfAborted(signal);
    }
  }

  clear(): void {
    try {
      this.box?.clearDice();
    } catch {
      // Clearing is best-effort: failure must never affect canonical results.
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
