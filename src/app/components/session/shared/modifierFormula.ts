import { cryptoDiceRng } from '../dice/diceEngine.ts';
import type { DiceRng } from '../dice/diceTypes.ts';

// Formule del Modificatore: calcoli con parentesi annidate, es.
// (1d6+3)-(1d4) oppure ((1d6+1)-1d4)+3. Solo cifre, + - * /, parentesi e "d"
// minuscola con numero prima (opzionale, d6 = 1d6) e dopo: tutto il resto e'
// vietato, come nel Valore numerico.

export class ModifierFormulaError extends Error {
  constructor(message: string) { super(message); this.name = 'ModifierFormulaError'; }
}

export const MODIFIER_FORMULA_MAX_DICE = 1000;
const MAX_SIDES = 1000;
const MAX_COUNT = 100;

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'die' }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') { index += 1; continue; }
    if (isDigit(char)) {
      let end = index;
      while (end < text.length && isDigit(text[end])) end += 1;
      const value = Number.parseInt(text.slice(index, end), 10);
      if (!Number.isSafeInteger(value)) throw new ModifierFormulaError('Numero troppo grande.');
      tokens.push({ kind: 'num', value });
      index = end;
      continue;
    }
    if (char === 'd') { tokens.push({ kind: 'die' }); index += 1; continue; }
    if (char === '+' || char === '-' || char === '*' || char === '/') {
      tokens.push({ kind: 'op', op: char });
      index += 1;
      continue;
    }
    if (char === '(') { tokens.push({ kind: 'lparen' }); index += 1; continue; }
    if (char === ')') { tokens.push({ kind: 'rparen' }); index += 1; continue; }
    throw new ModifierFormulaError(`Carattere non valido "${char}": solo cifre, d, +, -, *, / e parentesi.`);
  }
  return tokens;
}

export type ModifierFormulaNode =
  | { kind: 'num'; value: number }
  | { kind: 'dice'; count: number; sides: number }
  | { kind: 'neg'; node: ModifierFormulaNode }
  | { kind: 'bin'; op: '+' | '-' | '*' | '/'; left: ModifierFormulaNode; right: ModifierFormulaNode };

function checkDiceRange(count: number, sides: number): void {
  if (count < 1 || count > MAX_COUNT) throw new ModifierFormulaError('Il numero di dadi deve stare tra 1 e 100.');
  if (sides < 2 || sides > MAX_SIDES) throw new ModifierFormulaError('Le facce dei dadi devono stare tra 2 e 1000.');
}

export function parseModifierFormula(text: string): ModifierFormulaNode {
  const tokens = tokenize(text);
  let pos = 0;
  const peek = (): Token | null => tokens[pos] ?? null;
  const next = (): Token | null => tokens[pos++] ?? null;

  function parseExpr(): ModifierFormulaNode {
    let left = parseTerm();
    for (;;) {
      const token = peek();
      if (!token || token.kind !== 'op' || (token.op !== '+' && token.op !== '-')) return left;
      next();
      left = { kind: 'bin', op: token.op, left, right: parseTerm() };
    }
  }
  function parseTerm(): ModifierFormulaNode {
    let left = parseFactor();
    for (;;) {
      const token = peek();
      if (!token || token.kind !== 'op' || (token.op !== '*' && token.op !== '/')) return left;
      next();
      left = { kind: 'bin', op: token.op, left, right: parseFactor() };
    }
  }
  function parseFactor(): ModifierFormulaNode {
    const token = next();
    if (!token) throw new ModifierFormulaError('Formula incompleta.');
    if (token.kind === 'op' && (token.op === '+' || token.op === '-')) {
      const node = parseFactor();
      return token.op === '+' ? node : { kind: 'neg', node };
    }
    if (token.kind === 'lparen') {
      const node = parseExpr();
      const closing = next();
      if (!closing || closing.kind !== 'rparen') throw new ModifierFormulaError('Parentesi non chiusa.');
      return node;
    }
    if (token.kind === 'num') {
      const following = peek();
      if (following && following.kind === 'die') {
        next();
        const sidesToken = next();
        if (!sidesToken || sidesToken.kind !== 'num') throw new ModifierFormulaError('Dopo la "d" serve il numero di facce.');
        checkDiceRange(token.value, sidesToken.value);
        return { kind: 'dice', count: token.value, sides: sidesToken.value };
      }
      return { kind: 'num', value: token.value };
    }
    if (token.kind === 'die') {
      const sidesToken = next();
      if (!sidesToken || sidesToken.kind !== 'num') throw new ModifierFormulaError('Dopo la "d" serve il numero di facce.');
      checkDiceRange(1, sidesToken.value);
      return { kind: 'dice', count: 1, sides: sidesToken.value };
    }
    throw new ModifierFormulaError('Termine atteso: numero, dado o parentesi.');
  }

  if (tokens.length === 0) throw new ModifierFormulaError('Formula vuota.');
  const root = parseExpr();
  if (pos < tokens.length) throw new ModifierFormulaError('Espressione non valida.');
  return root;
}

function countDice(node: ModifierFormulaNode): number {
  switch (node.kind) {
    case 'num': return 0;
    case 'dice': return node.count;
    case 'neg': return countDice(node.node);
    case 'bin': return countDice(node.left) + countDice(node.right);
  }
}

export interface EvaluatedModifierFormula {
  groups: Array<{ sides: number; faces: number[] }>;
  total: number;
  diceCount: number;
}

export function evaluateModifierFormula(text: string, rng: DiceRng = cryptoDiceRng): EvaluatedModifierFormula {
  const root = parseModifierFormula(text);
  const totalDice = countDice(root);
  if (totalDice > MODIFIER_FORMULA_MAX_DICE) {
    throw new ModifierFormulaError(`La formula supera il limite di ${MODIFIER_FORMULA_MAX_DICE} dadi.`);
  }
  const groups: Array<{ sides: number; faces: number[] }> = [];
  const evaluate = (node: ModifierFormulaNode): number => {
    switch (node.kind) {
      case 'num': return node.value;
      case 'dice': {
        const faces: number[] = [];
        let sum = 0;
        for (let index = 0; index < node.count; index += 1) {
          const face = rng(node.sides);
          if (!Number.isInteger(face) || face < 1 || face > node.sides) {
            throw new ModifierFormulaError(`Il generatore ha restituito ${face} per d${node.sides}.`);
          }
          faces.push(face);
          sum += face;
        }
        groups.push({ sides: node.sides, faces });
        return sum;
      }
      case 'neg': return -evaluate(node.node);
      case 'bin': {
        const left = evaluate(node.left);
        const right = evaluate(node.right);
        switch (node.op) {
          case '+': return left + right;
          case '-': return left - right;
          case '*': return left * right;
          case '/':
            if (right === 0) throw new ModifierFormulaError('Non è possibile dividere per zero.');
            return left / right;
        }
      }
    }
  };
  const total = evaluate(root);
  if (!Number.isFinite(total)) throw new ModifierFormulaError('La formula produce un risultato non valido.');
  return { groups, total, diceCount: totalDice };
}

function countFormulaDice(text: string): number {
  return countDice(parseModifierFormula(text));
}

/** La formula e' sintatticamente valida (senza tirare alcun dado). */
export function isValidModifierFormula(text: string): boolean {
  try {
    countFormulaDice(text);
    return true;
  } catch {
    return false;
  }
}

/** La formula contiene almeno un dado da tirare. */
export function modifierFormulaHasDice(text: string): boolean {
  try {
    return countFormulaDice(text) > 0;
  } catch {
    return false;
  }
}
