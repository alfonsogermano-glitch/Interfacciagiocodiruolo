import type {
  DiceFormulaItem,
  DiceFormulaValidationIssue,
  DiceFormulaValidationResult,
} from './diceTypes.ts';

const MAX_DICE_PER_ROLL = 1000;

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

export function validateDiceFormula(items: readonly DiceFormulaItem[]): DiceFormulaValidationResult {
  const issues: DiceFormulaValidationIssue[] = [];
  const itemErrors: Record<string, string[]> = {};

  const addIssue = (code: string, message: string, itemId?: string) => {
    issues.push({ code, message, itemId });
    if (itemId) {
      (itemErrors[itemId] ??= []).push(message);
    }
  };

  if (items.length === 0) {
    addIssue('empty_formula', 'Aggiungi almeno un dado alla formula.');
    return { valid: false, issues, itemErrors };
  }

  let hasNumericTotal = false;
  let activeDiceGroup = false;
  let explodingSeenInGroup = false;
  let requestedDiceCount = 0;

  for (const item of items) {
    switch (item.kind) {
      case 'dice': {
        if (!Number.isInteger(item.sides) || item.sides < 2) {
          addIssue('invalid_die_sides', 'Il dado deve avere almeno 2 facce intere.', item.id);
        }
        if (!isPositiveInteger(item.quantity)) {
          addIssue('invalid_die_quantity', 'La quantita di dadi deve essere almeno 1.', item.id);
        } else {
          requestedDiceCount += item.quantity;
          if (requestedDiceCount > MAX_DICE_PER_ROLL) {
            addIssue(
              'too_many_dice',
              `Una formula non puo richiedere piu di ${MAX_DICE_PER_ROLL} dadi.`,
              item.id,
            );
          }
        }
        hasNumericTotal = true;
        activeDiceGroup = true;
        explodingSeenInGroup = false;
        break;
      }

      case 'keep': {
        if (!activeDiceGroup) {
          addIssue('missing_active_dice_group', 'Keep richiede un gruppo di dadi attivo.', item.id);
        }
        if (!isPositiveInteger(item.count)) {
          addIssue(
            'invalid_keep_threshold',
            'La soglia Keep deve essere un intero maggiore o uguale a 1.',
            item.id,
          );
        }
        break;
      }

      case 'drop': {
        if (!activeDiceGroup) {
          addIssue('missing_active_dice_group', 'Drop richiede un gruppo di dadi attivo.', item.id);
        }
        if (!isPositiveInteger(item.count)) {
          addIssue(
            'invalid_selection_count',
            'Il numero di risultati deve essere un intero maggiore o uguale a 1.',
            item.id,
          );
        }
        break;
      }

      case 'exploding': {
        if (!activeDiceGroup) {
          addIssue('missing_active_dice_group', 'Exploding richiede un gruppo di dadi attivo.', item.id);
        }
        if (explodingSeenInGroup) {
          addIssue(
            'duplicate_exploding',
            'E consentito un solo modificatore Exploding per gruppo di dadi.',
            item.id,
          );
        }
        explodingSeenInGroup = true;
        break;
      }

      case 'compare': {
        if (!Number.isFinite(item.target)) {
          addIssue('invalid_compare_target', 'La soglia di confronto deve essere un numero finito.', item.id);
        }
        if (item.total) {
          if (!hasNumericTotal) {
            addIssue('missing_total', 'Compare Totale richiede un totale numerico precedente.', item.id);
          }
        } else if (!activeDiceGroup) {
          addIssue(
            'missing_active_dice_group',
            'Compare per dado richiede un gruppo di dadi attivo.',
            item.id,
          );
        }
        break;
      }

      case 'modifier': {
        if (!hasNumericTotal) {
          addIssue('missing_total', 'Il modificatore richiede un totale numerico precedente.', item.id);
        }
        if (!Number.isFinite(item.value)) {
          addIssue('invalid_modifier_value', 'Il valore del modificatore deve essere un numero finito.', item.id);
        }
        if (item.operation === 'divide' && item.value === 0) {
          addIssue('division_by_zero', 'Non e possibile dividere per zero.', item.id);
        }
        activeDiceGroup = false;
        explodingSeenInGroup = false;
        break;
      }
    }
  }

  if (!hasNumericTotal) {
    addIssue('missing_numeric_term', 'La formula deve contenere almeno un dado.');
  }

  return {
    valid: issues.length === 0,
    issues,
    itemErrors,
  };
}
