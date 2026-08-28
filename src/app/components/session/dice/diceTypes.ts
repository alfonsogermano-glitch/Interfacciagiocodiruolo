export type DiceKeepDropWhich = 'highest' | 'lowest';
export type DiceExplodingMode = 'explode' | 'compound' | 'penetrate';
export type DiceCompareOperator = 'gte' | 'lte' | 'eq';
export type DiceModifierOperation = 'add' | 'subtract' | 'multiply' | 'divide' | 'exponent';
export type DiceVisibility = 'public' | 'secret';

export type DiceFormulaItem =
  | {
      id: string;
      kind: 'dice';
      sides: number;
      quantity: number;
    }
  | {
      id: string;
      kind: 'keep';
      which: DiceKeepDropWhich;
      count: number;
    }
  | {
      id: string;
      kind: 'drop';
      which: DiceKeepDropWhich;
      count: number;
    }
  | {
      id: string;
      kind: 'exploding';
      mode: DiceExplodingMode;
    }
  | {
      id: string;
      kind: 'compare';
      operator: DiceCompareOperator;
      target: number;
      total: boolean;
    }
  | {
      id: string;
      kind: 'modifier';
      operation: DiceModifierOperation;
      value: number;
    };

export interface SavedDiceFormula {
  id: string;
  campaignId: string;
  ownerProfileId: string;
  name: string;
  items: DiceFormulaItem[];
  isSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DiceRollRequest {
  items: DiceFormulaItem[];
  formulaId?: string;
  formulaName: string;
  visibility: DiceVisibility;
}

export interface DiceRollIdentity {
  campaignId: string;
  rollerId: string;
  rollerName: string;
  rollerAvatarUrl?: string;
}

export type DiceRng = (sides: number) => number;

export interface RollDie {
  id: string;
  groupItemId: string;
  sides: number;
  /** Natural face shown by the physical die. */
  face: number;
  /** Numeric contribution after effects such as penetrating explosions. */
  contribution: number;
  active: boolean;
  source: 'base' | 'explosion';
  explosionDepth: number;
  chainId: string;
  parentRollId?: string;
}

export interface RollDiceGroup {
  itemId: string;
  sides: number;
  requestedQuantity: number;
  rolls: RollDie[];
  activeRollIds: string[];
  contribution: number;
}

export interface RollArithmeticStep {
  itemId: string;
  operation: DiceModifierOperation;
  value: number;
  before: number;
  after: number;
}

export interface RollComparisonResult {
  itemId: string;
  mode: 'dice' | 'total';
  operator: DiceCompareOperator;
  target: number;
  comparedValues: number[];
  success?: boolean;
  successes?: number;
  failures?: number;
}

export interface RollResult {
  id: string;
  campaignId: string;
  rollerId: string;
  rollerName: string;
  rollerAvatarUrl?: string;
  formulaId?: string;
  formulaName: string;
  formulaText: string;
  visibility: DiceVisibility;
  /** Immutable source definition used for reroll; never replaced by rolled values. */
  sourceItems: DiceFormulaItem[];
  diceGroups: RollDiceGroup[];
  arithmeticSteps: RollArithmeticStep[];
  comparisons: RollComparisonResult[];
  total: number;
  createdAt: number;
}

export interface DiceFormulaValidationIssue {
  itemId?: string;
  code: string;
  message: string;
}

export interface DiceFormulaValidationResult {
  valid: boolean;
  issues: DiceFormulaValidationIssue[];
  itemErrors: Record<string, string[]>;
}
