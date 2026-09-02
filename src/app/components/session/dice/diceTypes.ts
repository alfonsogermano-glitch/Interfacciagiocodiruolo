export type DiceKeepWhich = 'highest' | 'lowest' | 'equal';
export type DiceDropWhich = 'highest' | 'lowest';
export type DiceExplodingMode = 'explode' | 'compound' | 'penetrate';
export type DiceCompareOperator = 'gte' | 'lte' | 'eq';
export type DiceModifierOperation = 'add' | 'subtract' | 'multiply' | 'divide' | 'exponent';
export type DiceVisibility = 'public' | 'secret';
export type CustomDieSides = 4 | 6 | 8 | 10 | 12 | 20 | 100;
export type CustomDiePhysicalRole = 'single' | 'tens' | 'units';

export type CustomDieFaceVisual =
  | { kind: 'icon'; iconName: string }
  | { kind: 'image'; assetPath: string; publicUrl: string }
  | { kind: 'text'; text: string };

export interface CustomDieFace {
  index: number;
  role: CustomDiePhysicalRole;
  visual: CustomDieFaceVisual;
  label?: string | null;
  numericValue: number | null;
  isLibraryIcon?: boolean;
}

export interface RollCustomDieFace extends CustomDieFace {
  symbolColor?: string;
}

export interface SavedCustomDie {
  id: string;
  campaignId: string;
  ownerProfileId: string;
  name: string;
  sides: CustomDieSides;
  faces: CustomDieFace[];
  bodyColor: string;
  symbolColor: string;
  iconName?: string | null;
  folderId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomDieRollSnapshot {
  id: string;
  name: string;
  sides: CustomDieSides;
  faces: CustomDieFace[];
  bodyColor: string;
  symbolColor: string;
  iconName?: string | null;
  updatedAt?: string;
}

export type DiceFormulaItem =
  | { id: string; kind: 'dice'; sides: number; quantity: number }
  | { id: string; kind: 'custom-die'; customDieId: string; quantity: number }
  | { id: string; kind: 'keep'; which: DiceKeepWhich; count: number }
  | { id: string; kind: 'drop'; which: DiceDropWhich; count: number }
  | { id: string; kind: 'exploding'; mode: DiceExplodingMode }
  | { id: string; kind: 'compare'; operator: DiceCompareOperator; target: number; total: boolean }
  | { id: string; kind: 'modifier'; operation: DiceModifierOperation; value: number };

export type ResolvedDiceFormulaItem =
  | Exclude<DiceFormulaItem, { kind: 'custom-die' }>
  | { id: string; kind: 'custom-die'; customDieId: string; quantity: number; customDie: CustomDieRollSnapshot };

export interface SavedDiceFormula {
  id: string;
  campaignId: string;
  ownerProfileId: string;
  name: string;
  items: DiceFormulaItem[];
  isSecret: boolean;
  iconName?: string | null;
  folderId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DiceFormulaFolder {
  id: string;
  campaignId: string;
  ownerProfileId: string;
  name: string;
  iconName?: string | null;
  parentFolderId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type DiceLibraryNodeType = 'formula' | 'custom-die' | 'folder';

export interface DiceRollRequest {
  items: ResolvedDiceFormulaItem[];
  formulaId?: string;
  formulaName: string;
  formulaIconName?: string;
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
  face: number;
  contribution: number | null;
  active: boolean;
  source: 'base' | 'explosion';
  explosionDepth: number;
  chainId: string;
  parentRollId?: string;
  keepMatched?: boolean;
  customDieId?: string;
  customDieName?: string;
  customFace?: RollCustomDieFace;
  physicalRole?: CustomDiePhysicalRole;
  logicalRollIndex?: number;
}

export interface RollDiceGroup {
  itemId: string;
  sides: number;
  requestedQuantity: number;
  rolls: RollDie[];
  activeRollIds: string[];
  contribution: number | null;
  customDieId?: string;
  customDieName?: string;
  customDieSnapshot?: CustomDieRollSnapshot;
}

export interface RollArithmeticStep {
  itemId: string;
  operation: DiceModifierOperation;
  value: number;
  before: number;
  after: number;
  scope: 'dice' | 'total';
  groupItemId?: string;
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
  formulaIconName?: string;
  formulaText: string;
  visibility: DiceVisibility;
  sourceItems: ResolvedDiceFormulaItem[];
  diceGroups: RollDiceGroup[];
  arithmeticSteps: RollArithmeticStep[];
  comparisons: RollComparisonResult[];
  total: number | null;
  createdAt: number;
}

export interface DiceFormulaValidationIssue { itemId?: string; code: string; message: string; }
export interface DiceFormulaValidationResult { valid: boolean; issues: DiceFormulaValidationIssue[]; itemErrors: Record<string, string[]>; }
