import { cryptoDiceRng } from '../dice/diceEngine.ts';
import type { DiceRng } from '../dice/diceTypes.ts';

// Formule del Modificatore: calcoli con parentesi annidate, es.
// (1d6+3)-(1d4) oppure ((1d6+1)-1d4)+3, piu' riferimenti ad altri Modificatori
// tramite tag tra virgolette, es. 1d6+"Forza" (= 1d6+3 se Forza vale "+3").
// Solo cifre, + - * /, parentesi, "d" minuscola e tag "...": tutto il resto
// e' vietato. I riferimenti si risolvono al momento del tiro leggendo i
// valori correnti, quindi restano sempre aggiornati; i cicli (A->B->A) e i
// nomi mancanti sono anomalie e bloccano il tiro.

export type ModifierFormulaErrorCode = 'syntax' | 'range' | 'missing' | 'cycle' | 'runtime';

export class ModifierFormulaError extends Error {
  code: ModifierFormulaErrorCode;
  constructor(message: string, code: ModifierFormulaErrorCode = 'syntax') {
    super(message);
    this.name = 'ModifierFormulaError';
    this.code = code;
  }
}

export const MODIFIER_FORMULA_MAX_DICE = 1000;
const MAX_SIDES = 1000;
const MAX_COUNT = 100;

// Valore del Modificatore: testo libero da cui si estraggono dadi e numeri
// con una scansione da sinistra a destra ("hkjfhek1d4" -> 1d4, "+1 Forza" ->
// +1, "Saggezza-2" -> -2, "3d6+3" -> 3d6 e +3). Un segno prima dei dadi li
// rende negativi ("2d6-1d4"). Le lettere sono ignorate, la "d" vale solo
// minuscola e con numero prima (opzionale) e dopo. Serve almeno un numero o
// un dado, altrimenti il valore non e' valido.
export interface ModifierDiceToken {
  sign: 1 | -1;
  count: number;
  sides: number;
}

export type ParsedModifierValue =
  | { kind: 'number'; value: number }
  | { kind: 'dice'; dice: ModifierDiceToken[]; modifier: number };

export const MODIFIER_VALUE_MAX_LENGTH = 64;

function isAsciiDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

function readAsciiDigits(text: string, start: number): { digits: string; end: number } | null {
  let end = start;
  while (end < text.length && isAsciiDigit(text[end])) end += 1;
  if (end === start) return null;
  return { digits: text.slice(start, end), end };
}

function parseAsciiInteger(digits: string): number | null {
  const value = Number.parseInt(digits, 10);
  return Number.isSafeInteger(value) ? value : null;
}

export function parseModifierValue(raw: string): ParsedModifierValue | null {
  const text = raw.trim();
  if (!text || text.length > MODIFIER_VALUE_MAX_LENGTH) return null;
  const dice: ModifierDiceToken[] = [];
  let modifier = 0;
  let found = false;
  let index = 0;
  let diceCount = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '+' || char === '-' || isAsciiDigit(char) || char === 'd') {
      let cursor = index;
      const negative = text[cursor] === '-';
      if (text[cursor] === '+' || text[cursor] === '-') cursor += 1;
      const countRead = readAsciiDigits(text, cursor);
      const afterCount = countRead ? countRead.end : cursor;
      // Dado con segno opzionale: [+-]? cifre? "d" cifre ("-1d4", "d6", "2d6").
      if (text[afterCount] === 'd') {
        const sidesRead = readAsciiDigits(text, afterCount + 1);
        if (sidesRead) {
          const count = countRead ? parseAsciiInteger(countRead.digits) : 1;
          const sides = parseAsciiInteger(sidesRead.digits);
          if (count === null || sides === null) return null;
          if (count < 1 || count > MAX_COUNT || sides < 2 || sides > MAX_SIDES) return null;
          dice.push({ sign: negative ? -1 : 1, count, sides });
          diceCount += count;
          if (diceCount > MODIFIER_FORMULA_MAX_DICE) return null;
          found = true;
          index = sidesRead.end;
          continue;
        }
      }
      // Numero con segno opzionale, non seguito da dado ("Saggezza-2" -> -2).
      if (countRead) {
        const absolute = parseAsciiInteger(countRead.digits);
        if (absolute === null) return null;
        const signed = negative ? -absolute : absolute;
        if (!Number.isSafeInteger(modifier + signed)) return null;
        modifier += signed;
        found = true;
        index = countRead.end;
        continue;
      }
    }
    index += 1;
  }
  if (!found) return null;
  if (dice.length === 0) {
    if (!Number.isSafeInteger(modifier)) return null;
    return { kind: 'number', value: modifier };
  }
  return { kind: 'dice', dice, modifier };
}

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'die' }
  | { kind: 'str'; value: string }
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
      if (!Number.isSafeInteger(value)) throw new ModifierFormulaError('Numero troppo grande.', 'range');
      tokens.push({ kind: 'num', value });
      index = end;
      continue;
    }
    if (char === 'd') { tokens.push({ kind: 'die' }); index += 1; continue; }
    if (char === '"') {
      const closing = text.indexOf('"', index + 1);
      if (closing < 0) throw new ModifierFormulaError('Stringa non chiusa: manca " finale.');
      tokens.push({ kind: 'str', value: text.slice(index + 1, closing) });
      index = closing + 1;
      continue;
    }
    if (char === '+' || char === '-' || char === '*' || char === '/') {
      tokens.push({ kind: 'op', op: char });
      index += 1;
      continue;
    }
    if (char === '(') { tokens.push({ kind: 'lparen' }); index += 1; continue; }
    if (char === ')') { tokens.push({ kind: 'rparen' }); index += 1; continue; }
    throw new ModifierFormulaError(`Carattere non valido "${char}": solo cifre, d, +, -, *, / parentesi e tag "...".`);
  }
  return tokens;
}

export type ModifierFormulaNode =
  | { kind: 'num'; value: number }
  | { kind: 'dice'; count: number; sides: number }
  | { kind: 'ref'; name: string }
  | { kind: 'neg'; node: ModifierFormulaNode }
  | { kind: 'bin'; op: '+' | '-' | '*' | '/'; left: ModifierFormulaNode; right: ModifierFormulaNode };

function checkDiceRange(count: number, sides: number): void {
  if (count < 1 || count > MAX_COUNT) throw new ModifierFormulaError('Il numero di dadi deve stare tra 1 e 100.', 'range');
  if (sides < 2 || sides > MAX_SIDES) throw new ModifierFormulaError('Le facce dei dadi devono stare tra 2 e 1000.', 'range');
}

function literalOrRef(content: string): ModifierFormulaNode {
  if (!content.trim()) throw new ModifierFormulaError('Riferimento vuoto: servono un nome o un valore tra virgolette.');
  // Prima i letterali deterministici (dadi/numeri), poi i nomi dei Modificatori.
  const literal = parseModifierValue(content);
  if (literal) {
    if (literal.kind === 'number') return { kind: 'num', value: literal.value };
    let node: ModifierFormulaNode | null = null;
    const pushTerm = (term: ModifierFormulaNode, sign: 1 | -1) => {
      const signed = sign < 0 ? { kind: 'neg' as const, node: term } : term;
      node = node === null ? signed : { kind: 'bin' as const, op: '+' as const, left: node, right: signed };
    };
    for (const token of literal.dice) {
      pushTerm({ kind: 'dice', count: token.count, sides: token.sides }, token.sign);
    }
    if (literal.modifier !== 0) {
      pushTerm(
        { kind: 'num', value: Math.abs(literal.modifier) },
        literal.modifier > 0 ? 1 : -1,
      );
    }
    if (node === null) throw new ModifierFormulaError('Riferimento vuoto: servono un nome o un valore tra virgolette.');
    return node;
  }
  return { kind: 'ref', name: content.trim() };
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
    if (token.kind === 'str') return literalOrRef(token.value);
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
    throw new ModifierFormulaError('Termine atteso: numero, dado, tag o parentesi.');
  }

  if (tokens.length === 0) throw new ModifierFormulaError('Formula vuota.');
  const root = parseExpr();
  if (pos < tokens.length) throw new ModifierFormulaError('Espressione non valida.');
  return root;
}

/** Nomi referenziati dai tag "..." (null se sintassi non valida). */
export function extractModifierRefs(text: string): string[] | null {
  let root: ModifierFormulaNode;
  try {
    root = parseModifierFormula(text);
  } catch {
    return null;
  }
  const refs: string[] = [];
  const walk = (node: ModifierFormulaNode): void => {
    if (node.kind === 'ref') {
      if (!refs.includes(node.name)) refs.push(node.name);
      return;
    }
    if (node.kind === 'neg') walk(node.node);
    else if (node.kind === 'bin') { walk(node.left); walk(node.right); }
  };
  walk(root);
  return refs;
}

export interface ModifierReference {
  value: string;
  formula: string;
}

export type ModifierReferenceResolver = (name: string) => ModifierReference | null;

export interface EvaluatedModifierFormula {
  groups: Array<{ sides: number; faces: number[] }>;
  total: number;
  diceCount: number;
}

interface EvalContext {
  rng: DiceRng;
  resolve?: ModifierReferenceResolver;
  seen: string[];
  groups: Array<{ sides: number; faces: number[] }>;
}

function countStaticDice(node: ModifierFormulaNode): number {
  switch (node.kind) {
    case 'num': return 0;
    case 'dice': return node.count;
    case 'ref': return 0;
    case 'neg': return countStaticDice(node.node);
    case 'bin': return countStaticDice(node.left) + countStaticDice(node.right);
  }
}

function rollDiceGroup(ctx: EvalContext, count: number, sides: number): number {
  const faces: number[] = [];
  let sum = 0;
  for (let index = 0; index < count; index += 1) {
    const face = ctx.rng(sides);
    if (!Number.isInteger(face) || face < 1 || face > sides) {
      throw new ModifierFormulaError(`Il generatore ha restituito ${face} per d${sides}.`, 'runtime');
    }
    faces.push(face);
    sum += face;
  }
  ctx.groups.push({ sides, faces });
  return sum;
}

function evaluateNode(node: ModifierFormulaNode, ctx: EvalContext): number {
  switch (node.kind) {
    case 'num': return node.value;
    case 'dice': return rollDiceGroup(ctx, node.count, node.sides);
    case 'neg': return -evaluateNode(node.node, ctx);
    case 'bin': {
      const left = evaluateNode(node.left, ctx);
      const right = evaluateNode(node.right, ctx);
      if (node.op === '+') return left + right;
      if (node.op === '-') return left - right;
      if (node.op === '*') return left * right;
      if (right === 0) throw new ModifierFormulaError('Non è possibile dividere per zero.', 'runtime');
      return left / right;
    }
    case 'ref': {
      const target = ctx.resolve ? ctx.resolve(node.name) : null;
      if (!target) throw new ModifierFormulaError(`Modificatore "${node.name}" non trovato.`, 'missing');
      if (ctx.seen.includes(node.name)) {
        throw new ModifierFormulaError(`Riferimento circolare: ${[...ctx.seen, node.name].join(' -> ')}.`, 'cycle');
      }
      const targetFormula = target.formula.trim();
      if (targetFormula) {
        let targetAst: ModifierFormulaNode | null = null;
        try {
          targetAst = parseModifierFormula(targetFormula);
        } catch {
          targetAst = null;
        }
        if (targetAst) return evaluateNode(targetAst, { ...ctx, seen: [...ctx.seen, node.name] });
      }
      const extracted = parseModifierValue(target.value);
      if (!extracted) throw new ModifierFormulaError(`Modificatore "${node.name}" non valido.`, 'missing');
      if (extracted.kind === 'number') return extracted.value;
      let subtotal = extracted.modifier;
      for (const token of extracted.dice) {
        subtotal += token.sign * rollDiceGroup(ctx, token.count, token.sides);
      }
      return subtotal;
    }
  }
}

export function evaluateModifierFormula(
  text: string,
  rng: DiceRng = cryptoDiceRng,
  resolve?: ModifierReferenceResolver,
): EvaluatedModifierFormula {
  const root = parseModifierFormula(text);
  const staticDice = countStaticDice(root);
  if (staticDice > MODIFIER_FORMULA_MAX_DICE) {
    throw new ModifierFormulaError(`La formula supera il limite di ${MODIFIER_FORMULA_MAX_DICE} dadi.`, 'range');
  }
  const ctx: EvalContext = { rng, resolve, seen: [], groups: [] };
  const total = evaluateNode(root, ctx);
  if (!Number.isFinite(total)) throw new ModifierFormulaError('La formula produce un risultato non valido.', 'runtime');
  return { groups: ctx.groups, total, diceCount: ctx.groups.reduce((sum, group) => sum + group.faces.length, 0) };
}

function hasDiceInNode(
  node: ModifierFormulaNode,
  resolve: ModifierReferenceResolver | undefined,
  visiting: string[],
): boolean {
  switch (node.kind) {
    case 'num': return false;
    case 'dice': return node.count > 0;
    case 'neg': return hasDiceInNode(node.node, resolve, visiting);
    case 'bin': return hasDiceInNode(node.left, resolve, visiting) || hasDiceInNode(node.right, resolve, visiting);
    case 'ref': {
      if (!resolve || visiting.includes(node.name)) return false;
      const target = resolve(node.name);
      if (!target) return false;
      if (target.formula.trim()) {
        try {
          return hasDiceInNode(parseModifierFormula(target.formula), resolve, [...visiting, node.name]);
        } catch {
          return valueHasDice(target.value);
        }
      }
      return valueHasDice(target.value);
    }
  }
}

function valueHasDice(value: string): boolean {
  const parsed = parseModifierValue(value);
  return !!parsed && parsed.kind === 'dice';
}

/** La formula e' sintatticamente valida e ogni riferimento diretto esiste. */
export function isValidModifierFormula(text: string, resolve?: ModifierReferenceResolver): boolean {
  let refs: string[] | null;
  try {
    refs = extractModifierRefs(text);
  } catch {
    return false;
  }
  if (refs === null) return false;
  if (!resolve) return true;
  return refs.every((name) => resolve(name) !== null);
}

/** La formula contiene almeno un dado da tirare (i riferimenti si seguono). */
export function modifierFormulaHasDice(text: string, resolve?: ModifierReferenceResolver): boolean {
  try {
    return hasDiceInNode(parseModifierFormula(text), resolve, []);
  } catch {
    return false;
  }
}
