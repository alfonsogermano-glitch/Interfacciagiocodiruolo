import { formatDiceFormula } from './diceFormulaText.ts';
import { getCustomDieFace, isCustomDieFullyNumeric } from './diceCustomDie.ts';
import { validateDiceFormula } from './diceFormulaValidation.ts';
import type {
  CustomDieFace,
  DiceKeepWhich,
  DiceModifierOperation,
  DiceRng,
  DiceRollIdentity,
  DiceRollRequest,
  ResolvedDiceFormulaItem,
  RollComparisonResult,
  RollDiceGroup,
  RollCustomDieFace,
  RollDie,
  RollResult,
} from './diceTypes.ts';

const MAX_EXPLOSIONS_PER_CHAIN = 100;
const MAX_DICE_PER_ROLL = 1000;
const UINT32_RANGE = 0x1_0000_0000;

export class DiceRollError extends Error {
  constructor(message: string) { super(message); this.name = 'DiceRollError'; }
}

export function cryptoDiceRng(sides: number): number {
  if (!Number.isInteger(sides) || sides < 2) throw new DiceRollError(`Dado non valido: d${sides}.`);
  const buffer = new Uint32Array(1);
  const upperExclusive = Math.floor(UINT32_RANGE / sides) * sides;
  do { globalThis.crypto.getRandomValues(buffer); } while (buffer[0] >= upperExclusive);
  return (buffer[0] % sides) + 1;
}

function cloneItems(items: readonly ResolvedDiceFormulaItem[]): ResolvedDiceFormulaItem[] {
  return items.map((item) => item.kind === 'custom-die'
    ? { ...item, customDie: { ...item.customDie, faces: item.customDie.faces.map((face) => ({ ...face, visual: { ...face.visual } })) } }
    : { ...item }) as ResolvedDiceFormulaItem[];
}

function snapshotRolledCustomFace(face: CustomDieFace, symbolColor: string): RollCustomDieFace {
  return {
    ...face,
    visual: { ...face.visual },
    ...(face.visual.kind === 'icon' ? { symbolColor } : {}),
  };
}

function logicalRolls(group: RollDiceGroup): RollDie[] {
  return group.rolls.filter((die) => die.active && die.physicalRole !== 'units');
}
function setLogicalActive(group: RollDiceGroup, representative: RollDie, active: boolean): void {
  representative.active = active;
  if (representative.logicalRollIndex === undefined) return;
  for (const die of group.rolls) {
    if (die.logicalRollIndex === representative.logicalRollIndex) die.active = active;
  }
}
function refreshGroup(group: RollDiceGroup): void {
  group.activeRollIds = group.rolls.filter((die) => die.active).map((die) => die.id);
  const active = logicalRolls(group);
  group.contribution = active.some((die) => die.contribution === null)
    ? null
    : active.reduce((sum, die) => sum + (die.contribution ?? 0), 0);
}
function compareValue(value: number, operator: 'gte' | 'lte' | 'eq', target: number): boolean {
  return operator === 'gte' ? value >= target : operator === 'lte' ? value <= target : value === target;
}
function applyKeepThreshold(group: RollDiceGroup, which: DiceKeepWhich, threshold: number): void {
  for (const die of logicalRolls(group)) {
    if (die.contribution === null) throw new DiceRollError('Mantieni richiede risultati numerici.');
    const matches = which === 'highest' ? die.contribution >= threshold : which === 'lowest' ? die.contribution <= threshold : die.contribution === threshold;
    setLogicalActive(group, die, matches);
    if (matches) die.keepMatched = true;
  }
  refreshGroup(group);
}
function modifierTargetsActiveDice(items: readonly ResolvedDiceFormulaItem[], modifierIndex: number): boolean {
  for (let index = modifierIndex + 1; index < items.length; index += 1) {
    const next = items[index];
    if (next.kind === 'dice' || next.kind === 'custom-die') return false;
    if (next.kind === 'keep') return true;
    if (next.kind === 'compare' && !next.total) return true;
  }
  return false;
}
function applyArithmeticValue(before: number, operation: DiceModifierOperation, value: number): number {
  let after: number;
  switch (operation) {
    case 'add': after = before + value; break;
    case 'subtract': after = before - value; break;
    case 'multiply': after = before * value; break;
    case 'divide': if (value === 0) throw new DiceRollError('Non è possibile dividere per zero.'); after = before / value; break;
    case 'exponent': after = before ** value; break;
  }
  if (!Number.isFinite(after)) throw new DiceRollError('Il modificatore ha prodotto un risultato numerico non valido.');
  return after;
}
function applyDropSelection(group: RollDiceGroup, which: 'highest' | 'lowest', count: number): void {
  const candidates = logicalRolls(group);
  if (candidates.some((die) => die.contribution === null)) throw new DiceRollError('Scarta richiede risultati numerici.');
  const indexed = candidates.map((die, index) => ({ die, index }));
  indexed.sort((a, b) => {
    const av = a.die.contribution as number; const bv = b.die.contribution as number;
    const delta = which === 'highest' ? bv - av : av - bv;
    return delta !== 0 ? delta : a.index - b.index;
  });
  const selected = new Set(indexed.slice(0, Math.min(count, indexed.length)).map(({ die }) => die.id));
  for (const die of candidates) if (selected.has(die.id)) setLogicalActive(group, die, false);
  refreshGroup(group);
}

export interface RollDiceFormulaInput { identity: DiceRollIdentity; request: DiceRollRequest; }

export function rollDiceFormula(input: RollDiceFormulaInput, rng: DiceRng = cryptoDiceRng): RollResult {
  const validation = validateDiceFormula(input.request.items);
  if (!validation.valid) throw new DiceRollError(validation.issues.map((issue) => issue.message).join(' '));

  const diceGroups: RollDiceGroup[] = [];
  const comparisons: RollComparisonResult[] = [];
  const arithmeticSteps: RollResult['arithmeticSteps'] = [];
  let total: number | null = 0;
  let activeGroup: RollDiceGroup | null = null;
  let generatedDiceCount = 0;
  let rollSequence = 0;
  const nextRollId = (itemId: string) => `${itemId}:r${++rollSequence}`;
  const rollFace = (sides: number): number => {
    if (generatedDiceCount >= MAX_DICE_PER_ROLL) throw new DiceRollError(`Il tiro ha superato il limite di ${MAX_DICE_PER_ROLL} dadi generati.`);
    const face = rng(sides);
    if (!Number.isInteger(face) || face < 1 || face > sides) throw new DiceRollError(`Il generatore ha restituito ${face} per d${sides}.`);
    generatedDiceCount += 1;
    return face;
  };
  const addGroupToTotal = (group: RollDiceGroup) => {
    if (group.contribution === null || total === null) total = null;
    else total += group.contribution;
  };
  const updateTotalForGroupMutation = (group: RollDiceGroup, before: number | null) => {
    refreshGroup(group);
    if (before === null || group.contribution === null || total === null) total = null;
    else total += group.contribution - before;
  };

  for (let itemIndex = 0; itemIndex < input.request.items.length; itemIndex += 1) {
    const item = input.request.items[itemIndex];
    switch (item.kind) {
      case 'dice': {
        const group: RollDiceGroup = { itemId: item.id, sides: item.sides, requestedQuantity: item.quantity, rolls: [], activeRollIds: [], contribution: 0 };
        for (let index = 0; index < item.quantity; index += 1) {
          const face = rollFace(item.sides); const id = nextRollId(item.id);
          group.rolls.push({ id, groupItemId: item.id, sides: item.sides, face, contribution: face, active: true, source: 'base', explosionDepth: 0, chainId: `${item.id}:chain${index + 1}` });
        }
        refreshGroup(group); addGroupToTotal(group); diceGroups.push(group); activeGroup = group; break;
      }
      case 'custom-die': {
        const die = item.customDie;
        const fullyNumeric = isCustomDieFullyNumeric(die);
        const group: RollDiceGroup = { itemId: item.id, sides: die.sides, requestedQuantity: item.quantity, rolls: [], activeRollIds: [], contribution: fullyNumeric ? 0 : null, customDieId: die.id, customDieName: die.name, customDieSnapshot: { ...die, faces: die.faces.map((face) => ({ ...face, visual: { ...face.visual } })) } };
        for (let logicalIndex = 0; logicalIndex < item.quantity; logicalIndex += 1) {
          if (die.sides === 100) {
            const tensIndex = rollFace(10); const unitsIndex = rollFace(10);
            const tensFace = getCustomDieFace(die, 'tens', tensIndex); const unitsFace = getCustomDieFace(die, 'units', unitsIndex);
            const pairValue = fullyNumeric ? (tensFace.numericValue as number) + (unitsFace.numericValue as number) : null;
            const chainId = `${item.id}:chain${logicalIndex + 1}`;
            group.rolls.push({ id: nextRollId(item.id), groupItemId: item.id, sides: 100, face: tensIndex, contribution: pairValue, active: true, source: 'base', explosionDepth: 0, chainId, customDieId: die.id, customDieName: die.name, customFace: snapshotRolledCustomFace(tensFace, die.symbolColor), physicalRole: 'tens', logicalRollIndex: logicalIndex });
            group.rolls.push({ id: nextRollId(item.id), groupItemId: item.id, sides: 10, face: unitsIndex, contribution: fullyNumeric ? 0 : null, active: true, source: 'base', explosionDepth: 0, chainId, customDieId: die.id, customDieName: die.name, customFace: snapshotRolledCustomFace(unitsFace, die.symbolColor), physicalRole: 'units', logicalRollIndex: logicalIndex });
          } else {
            const faceIndex = rollFace(die.sides); const customFace = getCustomDieFace(die, 'single', faceIndex); const id = nextRollId(item.id);
            group.rolls.push({ id, groupItemId: item.id, sides: die.sides, face: faceIndex, contribution: customFace.numericValue, active: true, source: 'base', explosionDepth: 0, chainId: `${item.id}:chain${logicalIndex + 1}`, customDieId: die.id, customDieName: die.name, customFace: snapshotRolledCustomFace(customFace, die.symbolColor), physicalRole: 'single', logicalRollIndex: logicalIndex });
          }
        }
        refreshGroup(group); addGroupToTotal(group); diceGroups.push(group); activeGroup = group; break;
      }
      case 'keep': {
        if (!activeGroup) throw new DiceRollError('Mantieni senza gruppo di dadi attivo.');
        const before = activeGroup.contribution; applyKeepThreshold(activeGroup, item.which, item.count); updateTotalForGroupMutation(activeGroup, before); break;
      }
      case 'drop': {
        if (!activeGroup) throw new DiceRollError('Scarta senza gruppo di dadi attivo.');
        const before = activeGroup.contribution; applyDropSelection(activeGroup, item.which, item.count); updateTotalForGroupMutation(activeGroup, before); break;
      }
      case 'exploding': {
        if (!activeGroup) throw new DiceRollError('Esplosione senza gruppo di dadi attivo.');
        if (activeGroup.sides === 100 && activeGroup.customDieId) throw new DiceRollError('L’esplosione non è disponibile per il d100 Custom.');
        const group = activeGroup; const before = group.contribution; const starters = logicalRolls(group).slice();
        const customItem = input.request.items.find((candidate) => candidate.id === group.itemId && candidate.kind === 'custom-die');
        const customMax = customItem && customItem.kind === 'custom-die'
          ? Math.max(...customItem.customDie.faces.map((face) => face.numericValue ?? Number.NEGATIVE_INFINITY))
          : null;
        for (const starter of starters) {
          const shouldExplode = customMax === null ? starter.face === group.sides : starter.contribution === customMax;
          if (!shouldExplode) continue;
          let parentRollId = starter.id; let explosionDepth = 0; let explosionCount = 0; let continueExplosion = true;
          while (continueExplosion) {
            if (explosionCount >= MAX_EXPLOSIONS_PER_CHAIN) throw new DiceRollError(`Una catena di esplosioni ha superato ${MAX_EXPLOSIONS_PER_CHAIN} rilanci.`);
            const face = rollFace(group.sides); explosionCount += 1; explosionDepth += 1; const id = nextRollId(group.itemId);
            let contribution: number; let customFace = undefined;
            if (customItem && customItem.kind === 'custom-die') {
              customFace = getCustomDieFace(customItem.customDie, 'single', face);
              if (customFace.numericValue === null) throw new DiceRollError('Esplosione Custom richiede facce numeriche.');
              contribution = item.mode === 'penetrate' ? customFace.numericValue - 1 : customFace.numericValue;
              continueExplosion = customFace.numericValue === customMax;
            } else {
              contribution = item.mode === 'penetrate' ? face - 1 : face;
              continueExplosion = face === group.sides;
            }
            const extra: RollDie = { id, groupItemId: group.itemId, sides: group.sides, face, contribution, active: item.mode !== 'compound', source: 'explosion', explosionDepth, chainId: starter.chainId, parentRollId, customDieId: customItem?.kind === 'custom-die' ? customItem.customDie.id : undefined, customDieName: customItem?.kind === 'custom-die' ? customItem.customDie.name : undefined, customFace: customFace && customItem?.kind === 'custom-die' ? snapshotRolledCustomFace(customFace, customItem.customDie.symbolColor) : undefined, physicalRole: customFace ? 'single' : undefined };
            group.rolls.push(extra);
            if (item.mode === 'compound') starter.contribution = (starter.contribution ?? 0) + contribution;
            parentRollId = id;
          }
        }
        updateTotalForGroupMutation(group, before); break;
      }
      case 'compare': {
        if (item.total) {
          if (total === null) throw new DiceRollError('Il confronto sul totale richiede un totale numerico.');
          const success = compareValue(total, item.operator, item.target);
          comparisons.push({ itemId: item.id, mode: 'total', operator: item.operator, target: item.target, comparedValues: [total], success }); break;
        }
        if (!activeGroup) throw new DiceRollError('Confronto per dado senza gruppo di dadi attivo.');
        const active = logicalRolls(activeGroup); if (active.some((die) => die.contribution === null)) throw new DiceRollError('Il confronto per dado richiede risultati numerici.');
        const values = active.map((die) => die.contribution as number); const outcomes = values.map((value) => compareValue(value, item.operator, item.target));
        if (values.length === 1) comparisons.push({ itemId: item.id, mode: 'dice', operator: item.operator, target: item.target, comparedValues: values, success: outcomes[0] });
        else { const successes = outcomes.filter(Boolean).length; comparisons.push({ itemId: item.id, mode: 'dice', operator: item.operator, target: item.target, comparedValues: values, successes, failures: outcomes.length - successes }); }
        break;
      }
      case 'modifier': {
        const perDie = activeGroup !== null && modifierTargetsActiveDice(input.request.items, itemIndex);
        if (perDie && activeGroup) {
          const group = activeGroup; const before = group.contribution; if (before === null) throw new DiceRollError('Il modificatore richiede risultati numerici.');
          for (const die of logicalRolls(group)) { if (die.contribution === null) throw new DiceRollError('Il modificatore richiede risultati numerici.'); die.contribution = applyArithmeticValue(die.contribution, item.operation, item.value); }
          refreshGroup(group); const after = group.contribution; if (after === null) throw new DiceRollError('Il modificatore richiede risultati numerici.');
          if (total === null) throw new DiceRollError('Il modificatore richiede un totale numerico.'); total += after - before;
          arithmeticSteps.push({ itemId: item.id, operation: item.operation, value: item.value, before, after, scope: 'dice', groupItemId: group.itemId }); break;
        }
        if (total === null) throw new DiceRollError('Il modificatore richiede un totale numerico.');
        const before = total; total = applyArithmeticValue(before, item.operation, item.value); arithmeticSteps.push({ itemId: item.id, operation: item.operation, value: item.value, before, after: total, scope: 'total' }); break;
      }
    }
  }

  return {
    id: globalThis.crypto.randomUUID(), campaignId: input.identity.campaignId, rollerId: input.identity.rollerId,
    rollerName: input.identity.rollerName, rollerAvatarUrl: input.identity.rollerAvatarUrl,
    formulaId: input.request.formulaId, formulaName: input.request.formulaName,
    formulaText: formatDiceFormula(input.request.items), visibility: input.request.visibility,
    sourceItems: cloneItems(input.request.items), diceGroups, arithmeticSteps, comparisons, total, createdAt: Date.now(),
  };
}
