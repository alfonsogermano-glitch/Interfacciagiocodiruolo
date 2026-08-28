import type { RollResult } from './diceTypes.ts';

export const PHYSICAL_DICE_SIDES = new Set([4, 6, 8, 10, 12, 20, 100]);

export interface Dice3DRollChunk {
  sides: number;
  values: number[];
  notation: string;
}

export interface Dice3DRenderer {
  init(container: HTMLElement): Promise<void>;
  play(result: RollResult, signal: AbortSignal): Promise<void>;
  clear(): void;
  dispose(): void;
}

export class Dice3DAbortError extends Error {
  constructor() {
    super('Dice 3D animation aborted');
    this.name = 'Dice3DAbortError';
  }
}

export function isDice3DAbortError(error: unknown): error is Dice3DAbortError {
  return error instanceof Dice3DAbortError ||
    (error instanceof Error && error.name === 'Dice3DAbortError');
}
