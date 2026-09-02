import type {
  CustomDieFace,
  CustomDieFaceVisual,
  CustomDiePhysicalRole,
  CustomDieRollSnapshot,
  CustomDieSides,
  DiceFormulaItem,
  ResolvedDiceFormulaItem,
  SavedCustomDie,
} from './diceTypes.ts';

export const CUSTOM_DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;

const CUSTOM_DIE_TEXT_WIDTH = 84;
const CUSTOM_DIE_TEXT_MAX_SINGLE_FONT = 48;
const CUSTOM_DIE_TEXT_MIN_SINGLE_FONT = 20;
const CUSTOM_DIE_TEXT_MAX_DOUBLE_FONT = 32;
const CUSTOM_DIE_TEXT_MIN_DOUBLE_FONT = 15;

export interface CustomDieTextLayout {
  lines: string[];
  fontSize: number;
  lineYs: number[];
}

export function expectedCustomDieFaceCount(sides: CustomDieSides): number {
  return sides === 100 ? 20 : sides;
}

export function expectedRoleFaceCount(sides: CustomDieSides, role: CustomDiePhysicalRole): number {
  if (sides === 100) return role === 'single' ? 0 : 10;
  return role === 'single' ? sides : 0;
}

function customDieTextCharacterUnits(character: string): number {
  if (/\s/.test(character)) return 0.34;
  if ("ilI1|!.,:;'`".includes(character)) return 0.32;
  if ('mwMW@#%&QO'.includes(character)) return 0.9;
  if (character === character.toUpperCase() && character !== character.toLowerCase()) return 0.68;
  return 0.56;
}

function customDieTextUnits(value: string): number {
  return [...value].reduce((sum, character) => sum + customDieTextCharacterUnits(character), 0);
}

function takeCustomDieTextPrefix(value: string, maxUnits: number): [string, string] {
  if (customDieTextUnits(value) <= maxUnits) return [value, ''];
  let used = 0;
  let lastSpace = -1;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = used + customDieTextCharacterUnits(character);
    if (next > maxUnits) {
      if (/\s/.test(character)) return [value.slice(0, index).trimEnd(), value.slice(index + 1).trimStart()];
      if (lastSpace > 0) return [value.slice(0, lastSpace).trimEnd(), value.slice(lastSpace + 1).trimStart()];
      return [value.slice(0, index), value.slice(index)];
    }
    used = next;
    if (/\s/.test(character)) lastSpace = index;
  }
  return [value, ''];
}

function truncateCustomDieText(value: string, maxUnits: number): string {
  if (customDieTextUnits(value) <= maxUnits) return value;
  const ellipsis = '…';
  let result = '';
  for (const character of value) {
    if (customDieTextUnits(result + character + ellipsis) > maxUnits) break;
    result += character;
  }
  return result.trimEnd() ? `${result.trimEnd()}${ellipsis}` : ellipsis;
}

export function layoutCustomDieFaceText(rawText: string): CustomDieTextLayout {
  const text = rawText.trim().replace(/\s+/g, ' ');
  if (!text) return { lines: [''], fontSize: 34, lineYs: [50] };

  const singleFont = Math.max(1, Math.min(
    CUSTOM_DIE_TEXT_MAX_SINGLE_FONT,
    Math.floor(CUSTOM_DIE_TEXT_WIDTH / Math.max(customDieTextUnits(text), 0.01)),
  ));
  if (singleFont >= CUSTOM_DIE_TEXT_MIN_SINGLE_FONT) {
    return { lines: [text], fontSize: singleFont, lineYs: [50] };
  }

  const maxLineUnits = CUSTOM_DIE_TEXT_WIDTH / CUSTOM_DIE_TEXT_MIN_DOUBLE_FONT;
  const [firstLine, remainder] = takeCustomDieTextPrefix(text, maxLineUnits);
  const secondLine = remainder ? truncateCustomDieText(remainder, maxLineUnits) : '';
  const lines = secondLine ? [firstLine, secondLine] : [firstLine];
  const widestLine = Math.max(...lines.map(customDieTextUnits), 1);
  const fontSize = Math.max(CUSTOM_DIE_TEXT_MIN_DOUBLE_FONT, Math.min(
    CUSTOM_DIE_TEXT_MAX_DOUBLE_FONT,
    Math.floor(CUSTOM_DIE_TEXT_WIDTH / widestLine),
  ));
  if (lines.length === 1) return { lines, fontSize, lineYs: [50] };
  const offset = fontSize * 0.58;
  return { lines, fontSize, lineYs: [50 - offset, 50 + offset] };
}

export function validateCustomDieDefinition(
  die: Pick<SavedCustomDie, 'name' | 'sides' | 'faces'>,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!die.name.trim()) issues.push('Inserisci un nome per il dado custom.');
  if (!CUSTOM_DIE_SIDES.includes(die.sides)) issues.push('Geometria del dado custom non supportata.');
  if (die.faces.length !== expectedCustomDieFaceCount(die.sides)) {
    issues.push(`Il d${die.sides} custom richiede ${expectedCustomDieFaceCount(die.sides)} facce configurate.`);
  }

  for (const role of ['single', 'tens', 'units'] as const) {
    const faces = die.faces.filter((face) => face.role === role).sort((a, b) => a.index - b.index);
    const expected = expectedRoleFaceCount(die.sides, role);
    if (faces.length !== expected) {
      if (expected > 0) issues.push(`Il gruppo ${role} richiede ${expected} facce.`);
      continue;
    }
    faces.forEach((face, index) => {
      if (face.index !== index + 1) issues.push(`Indice faccia non valido nel gruppo ${role}.`);
    });
  }

  for (const face of die.faces) {
    if (!Number.isInteger(face.index) || face.index < 1) issues.push('Ogni faccia deve avere un indice positivo.');
    if (face.numericValue !== null && !Number.isFinite(face.numericValue)) issues.push('I valori numerici delle facce devono essere finiti.');
    if (face.visual.kind === 'icon' && !face.visual.iconName.trim()) issues.push('Seleziona una icona per ogni faccia.');
    if (face.visual.kind === 'image' && (!face.visual.assetPath.trim() || !face.visual.publicUrl.trim())) {
      issues.push('L’immagine di una faccia non è stata caricata correttamente.');
    }
    if (face.visual.kind === 'text' && !face.visual.text.trim()) issues.push('Inserisci il testo per ogni faccia testuale.');
  }

  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

export function copyCustomDieFaceVisual(
  faces: readonly CustomDieFace[],
  sourcePosition: number,
  targetPosition: number,
): CustomDieFace[] {
  const source = faces[sourcePosition];
  const target = faces[targetPosition];
  if (!source || !target) throw new RangeError('Posizione faccia custom non valida.');
  if (sourcePosition === targetPosition) return faces.slice() as CustomDieFace[];
  return faces.map((face, position) => position === targetPosition
    ? { ...face, visual: { ...source.visual } as CustomDieFaceVisual }
    : face
  );
}

export function isCustomDieImageAssetUsed(faces: readonly CustomDieFace[], assetPath: string): boolean {
  return faces.some((face) => face.visual.kind === 'image' && face.visual.assetPath === assetPath);
}

export function isCustomDieFullyNumeric(die: Pick<SavedCustomDie, 'faces'> | CustomDieRollSnapshot): boolean {
  return die.faces.length > 0 && die.faces.every((face) => face.numericValue !== null && Number.isFinite(face.numericValue));
}

export function toCustomDieRollSnapshot(die: SavedCustomDie): CustomDieRollSnapshot {
  return {
    id: die.id,
    name: die.name,
    sides: die.sides,
    faces: die.faces.map((face) => ({
      ...face,
      visual: { ...face.visual },
    })) as CustomDieFace[],
    bodyColor: die.bodyColor,
    symbolColor: die.symbolColor,
    iconName: die.iconName ?? null,
    updatedAt: die.updatedAt,
  };
}

export function getCustomDieFace(
  die: CustomDieRollSnapshot,
  role: CustomDiePhysicalRole,
  physicalIndex: number,
): CustomDieFace {
  const face = die.faces.find((candidate) => candidate.role === role && candidate.index === physicalIndex);
  if (!face) throw new Error(`Faccia ${role}:${physicalIndex} non trovata nel dado custom “${die.name}”.`);
  return face;
}

export function resolveDiceFormulaItems(
  items: readonly DiceFormulaItem[],
  customDice: readonly SavedCustomDie[],
): ResolvedDiceFormulaItem[] {
  const byId = new Map(customDice.map((die) => [die.id, die]));
  return items.map((item): ResolvedDiceFormulaItem => {
    if (item.kind !== 'custom-die') return { ...item } as ResolvedDiceFormulaItem;
    const die = byId.get(item.customDieId);
    if (!die) throw new Error(`Dado custom non disponibile: ${item.customDieId}.`);
    const validation = validateCustomDieDefinition(die);
    if (!validation.valid) throw new Error(validation.issues.join(' '));
    return { ...item, customDie: toCustomDieRollSnapshot(die) };
  });
}
