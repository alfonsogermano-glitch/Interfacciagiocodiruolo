import { isCustomDieFullyNumeric } from './diceCustomDie.ts';
import type { DiceFormulaItem, DiceFormulaValidationIssue, DiceFormulaValidationResult, ResolvedDiceFormulaItem } from './diceTypes.ts';

const MAX_DICE_PER_ROLL = 1000;
type ValidationItem = DiceFormulaItem | ResolvedDiceFormulaItem;
function isPositiveInteger(value: number) { return Number.isInteger(value) && value >= 1; }

export function validateDiceFormula(items: readonly ValidationItem[]): DiceFormulaValidationResult {
  const issues: DiceFormulaValidationIssue[] = [];
  const itemErrors: Record<string, string[]> = {};
  const addIssue = (code: string, message: string, itemId?: string) => {
    issues.push({ code, message, itemId });
    if (itemId) (itemErrors[itemId] ??= []).push(message);
  };
  if (items.length === 0) {
    addIssue('empty_formula', 'Aggiungi almeno un dado alla formula.');
    return { valid: false, issues, itemErrors };
  }

  let hasAnyTerm = false;
  let totalNumeric = true;
  let activeDiceGroup = false;
  let activeGroupNumeric = true;
  let activeCustomName: string | null = null;
  let activeCustomD100 = false;
  let explodingSeenInGroup = false;
  let requestedDiceCount = 0;

  const requireNumericGroup = (itemId: string) => {
    if (activeDiceGroup && !activeGroupNumeric) {
      addIssue('symbolic_custom_operation', `Il dado custom “${activeCustomName ?? 'Custom'}” non ha valori numerici su tutte le facce.`, itemId);
    }
  };

  for (const item of items) {
    switch (item.kind) {
      case 'dice': {
        if (!Number.isInteger(item.sides) || item.sides < 2) addIssue('invalid_die_sides', 'Il dado deve avere almeno 2 facce intere.', item.id);
        if (!isPositiveInteger(item.quantity)) addIssue('invalid_die_quantity', 'La quantità di dadi deve essere almeno 1.', item.id);
        else requestedDiceCount += item.quantity;
        hasAnyTerm = true; activeDiceGroup = true; activeGroupNumeric = true; activeCustomName = null; activeCustomD100 = false; explodingSeenInGroup = false;
        break;
      }
      case 'custom-die': {
        if (!item.customDieId.trim()) addIssue('missing_custom_die', 'Seleziona un dado Custom.', item.id);
        if (!isPositiveInteger(item.quantity)) addIssue('invalid_die_quantity', 'La quantità di dadi deve essere almeno 1.', item.id);
        else requestedDiceCount += item.quantity * (('customDie' in item && item.customDie.sides === 100) ? 2 : 1);
        hasAnyTerm = true; activeDiceGroup = true; explodingSeenInGroup = false;
        if ('customDie' in item) {
          activeGroupNumeric = isCustomDieFullyNumeric(item.customDie);
          activeCustomName = item.customDie.name;
          activeCustomD100 = item.customDie.sides === 100;
          if (!activeGroupNumeric) totalNumeric = false;
        } else {
          // Persisted formulas intentionally store only the ID; availability is resolved before execution.
          activeGroupNumeric = true; activeCustomName = 'Custom'; activeCustomD100 = false;
        }
        break;
      }
      case 'keep': {
        if (!activeDiceGroup) addIssue('missing_active_dice_group', 'Mantieni richiede un gruppo di dadi attivo.', item.id);
        requireNumericGroup(item.id);
        if (!isPositiveInteger(item.count)) addIssue('invalid_keep_threshold', 'La soglia di Mantieni deve essere un intero maggiore o uguale a 1.', item.id);
        break;
      }
      case 'drop': {
        if (!activeDiceGroup) addIssue('missing_active_dice_group', 'Scarta richiede un gruppo di dadi attivo.', item.id);
        requireNumericGroup(item.id);
        if (!isPositiveInteger(item.count)) addIssue('invalid_selection_count', 'Il numero di risultati deve essere un intero maggiore o uguale a 1.', item.id);
        break;
      }
      case 'exploding': {
        if (!activeDiceGroup) addIssue('missing_active_dice_group', 'Esplosione richiede un gruppo di dadi attivo.', item.id);
        requireNumericGroup(item.id);
        if (activeCustomD100) addIssue('custom_d100_exploding_unsupported', 'L’esplosione non è disponibile per il d100 Custom.', item.id);
        if (explodingSeenInGroup) addIssue('duplicate_exploding', 'È consentito un solo modificatore Esplosione per gruppo di dadi.', item.id);
        explodingSeenInGroup = true;
        break;
      }
      case 'compare': {
        if (!Number.isFinite(item.target)) addIssue('invalid_compare_target', 'La soglia di confronto deve essere un numero finito.', item.id);
        if (item.total) {
          if (!hasAnyTerm) addIssue('missing_total', 'Confronto sul totale richiede un totale numerico precedente.', item.id);
          else if (!totalNumeric) addIssue('symbolic_total', 'Il totale contiene risultati simbolici senza valore numerico.', item.id);
        } else {
          if (!activeDiceGroup) addIssue('missing_active_dice_group', 'Confronto per dado richiede un gruppo di dadi attivo.', item.id);
          requireNumericGroup(item.id);
        }
        break;
      }
      case 'modifier': {
        if (!hasAnyTerm) addIssue('missing_total', 'Il modificatore richiede un totale numerico precedente.', item.id);
        if (!totalNumeric) addIssue('symbolic_total', 'Il modificatore non può essere applicato a un totale con risultati simbolici.', item.id);
        if (!Number.isFinite(item.value)) addIssue('invalid_modifier_value', 'Il valore del modificatore deve essere un numero finito.', item.id);
        if (item.operation === 'divide' && item.value === 0) addIssue('division_by_zero', 'Non è possibile dividere per zero.', item.id);
        break;
      }
    }
    if (requestedDiceCount > MAX_DICE_PER_ROLL) addIssue('too_many_dice', `Un tiro non può generare più di ${MAX_DICE_PER_ROLL} dadi.`, item.id);
  }
  if (!hasAnyTerm) addIssue('missing_numeric_term', 'La formula deve contenere almeno un dado.');
  return { valid: issues.length === 0, issues, itemErrors };
}
