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
