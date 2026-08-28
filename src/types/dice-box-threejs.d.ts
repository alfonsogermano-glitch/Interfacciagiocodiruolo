declare module '@3d-dice/dice-box-threejs' {
  interface DiceBoxOptions {
    sounds?: boolean;
    shadows?: boolean;
    theme_colorset?: string;
    theme_material?: string;
    theme_surface?: string;
    [key: string]: unknown;
  }

  interface DiceBoxRollResult {
    notation?: string;
    total?: number;
    [key: string]: unknown;
  }

  export default class DiceBox {
    constructor(selector: string, options?: DiceBoxOptions);
    initialize(): Promise<void>;
    roll(notation: string): Promise<DiceBoxRollResult>;
    clearDice(): void;
  }
}
