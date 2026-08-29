import type { DiceFormulaItem } from './diceTypes.ts';

function formatNumber(value: number): string {
  if (Object.is(value, -0)) return '0';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

function compareToken(item: Extract<DiceFormulaItem, { kind: 'compare' }>): string {
  const operator = item.operator === 'gte' ? '>=' : item.operator === 'lte' ? '<=' : '=';
  return `${item.total ? 'T' : ''}${operator}${formatNumber(item.target)}`;
}

function keepToken(item: Extract<DiceFormulaItem, { kind: 'keep' }>): string {
  const operator = item.which === 'highest' ? '>=' : item.which === 'lowest' ? '<=' : '=';
  return `k${operator}${formatNumber(item.count)}`;
}

function modifierToken(item: Extract<DiceFormulaItem, { kind: 'modifier' }>): string {
  const value = formatNumber(item.value);
  switch (item.operation) {
    case 'add':
      return item.value >= 0 ? `+${value}` : value;
    case 'subtract':
      return item.value >= 0 ? `-${value}` : `+${formatNumber(Math.abs(item.value))}`;
    case 'multiply':
      return `*${value}`;
    case 'divide':
      return `/${value}`;
    case 'exponent':
      return `^${value}`;
  }
}

export function formatDiceFormula(items: readonly DiceFormulaItem[]): string {
  let text = '';
  let hasNumericTerm = false;

  for (const item of items) {
    switch (item.kind) {
      case 'dice': {
        const token = `${item.quantity}d${item.sides}`;
        text += hasNumericTerm ? `+${token}` : token;
        hasNumericTerm = true;
        break;
      }
      case 'keep':
        text += keepToken(item);
        break;
      case 'drop':
        text += `${item.which === 'highest' ? 'dh' : 'dl'}${item.count}`;
        break;
      case 'exploding':
        text += item.mode === 'explode' ? '!' : item.mode === 'compound' ? '!!' : '!p';
        break;
      case 'compare':
        text += compareToken(item);
        break;
      case 'modifier':
        text += modifierToken(item);
        hasNumericTerm = true;
        break;
    }
  }

  return text;
}
