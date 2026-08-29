# Contextual Dice Modifiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mathematical modifiers automatically operate on individual dice when a later Keep or per-die Compare needs those values, otherwise keep their existing total-level behavior, and show Keep results as `N (total)`.

**Architecture:** Keep the persisted `DiceFormulaItem` model unchanged and infer modifier scope at roll time with a bounded look-ahead that stops at the next Dice item. Extend the canonical `RollResult` with per-die Keep provenance and arithmetic-step scope metadata, derive the visible summary from that canonical result, and preserve 3D rendering from natural die faces only. Strengthen both client and secret-relay Realtime validators so public and secret delivery accept the same canonical shape.

**Tech Stack:** React 18.3.1, TypeScript 5.7.3, Vite 6.4.3, Supabase JS 2.108.1, Supabase Edge Functions/Deno, `@3d-dice/dice-box-threejs` 0.0.12, Node verification scripts.

**Spec:** `docs/superpowers/specs/2026-08-29-dice-contextual-modifiers-design.md`

## Global Constraints

- Do not add `Totale / Singolo dado` controls to the Modifier UI.
- Do not change the persisted JSON shape of `DiceFormulaItem`; no database migration is required.
- `face` is always the natural physical die face; contextual arithmetic changes only `contribution`.
- 3D animation must continue to project `face`, never `contribution`.
- Keep remains threshold-based: Highest = `>=`, Lowest = `<=`, Equal = `=`.
- Drop remains count-based and does not trigger per-die modifier scope.
- Exploding remains based on natural `face` and does not trigger per-die modifier scope.
- Compare with `total: false` triggers per-die scope; Compare with `total: true` does not.
- A new Dice item is a hard look-ahead boundary.
- Reroll must continue to rebuild from immutable `sourceItems`.
- Implementation work must be delivered as one effective code commit/push after full verification; do not create RED-test, preview, export, or checkpoint commits.
- Before merge, run the complete `npm run check` suite and verify zero failures.

---

### Task 1: Lock contextual modifier semantics with RED engine tests

**Files:**
- Modify: `scripts/verify-dice-engine.mts`

**Interfaces:**
- Consumes: `validateDiceFormula(items)`, `rollDiceFormula(input, rng)`, `RollResult`.
- Produces: deterministic regression cases for modifier scope, arithmetic order, Dice boundaries, Keep provenance, Drop interaction, Compare behavior, and Exploding behavior.

- [ ] **Step 1: Make Modifier -> Keep valid in the expected contract**

Replace the current assertion for `[d6, add2, keep1]` with:

```ts
assert.equal(
  validateDiceFormula([d6, add2, keep1]).valid,
  true,
  'a modifier must no longer close the active dice group before Keep',
);
```

- [ ] **Step 2: Add the three primary examples**

```ts
const totalOnlyModifier = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 4 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
], [12, 15, 10, 3]);
assert.equal(totalOnlyModifier.total, 43);
assert.deepEqual(totalOnlyModifier.diceGroups[0].rolls.map((die) => die.contribution), [12, 15, 10, 3]);
assert.equal(totalOnlyModifier.arithmeticSteps[0].scope, 'total');
assert.equal(totalOnlyModifier.arithmeticSteps[0].groupItemId, undefined);

const modifierBeforeKeep = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 4 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
  { id: 'k', kind: 'keep', which: 'highest', count: 15 },
], [12, 15, 3, 9]);
assert.equal(modifierBeforeKeep.total, 33);
assert.deepEqual(modifierBeforeKeep.diceGroups[0].rolls.map((die) => die.face), [12, 15, 3, 9]);
assert.deepEqual(modifierBeforeKeep.diceGroups[0].rolls.map((die) => die.contribution), [15, 18, 6, 12]);
assert.deepEqual(
  modifierBeforeKeep.diceGroups[0].rolls.filter((die) => die.active).map((die) => die.contribution),
  [15, 18],
);
assert.equal(modifierBeforeKeep.arithmeticSteps[0].scope, 'dice');
assert.equal(modifierBeforeKeep.arithmeticSteps[0].groupItemId, 'd');

const modifierAfterKeep = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 4 },
  { id: 'k', kind: 'keep', which: 'highest', count: 15 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
], [16, 16, 12, 7]);
assert.equal(modifierAfterKeep.total, 35);
assert.deepEqual(
  modifierAfterKeep.diceGroups[0].rolls.filter((die) => die.active).map((die) => die.contribution),
  [16, 16],
);
assert.equal(modifierAfterKeep.arithmeticSteps[0].scope, 'total');
```

- [ ] **Step 3: Add Compare scope cases**

```ts
const perDieComparedAfterModifier = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 4 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
  { id: 'c', kind: 'compare', operator: 'gte', target: 15, total: false },
], [12, 15, 3, 9]);
assert.deepEqual(perDieComparedAfterModifier.comparisons[0].comparedValues, [15, 18, 6, 12]);
assert.equal(perDieComparedAfterModifier.comparisons[0].successes, 2);
assert.equal(perDieComparedAfterModifier.comparisons[0].failures, 2);
assert.equal(perDieComparedAfterModifier.arithmeticSteps[0].scope, 'dice');

const totalComparedAfterModifier = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 4 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
  { id: 'c', kind: 'compare', operator: 'gte', target: 40, total: true },
], [12, 15, 10, 3]);
assert.equal(totalComparedAfterModifier.total, 43);
assert.deepEqual(totalComparedAfterModifier.comparisons[0].comparedValues, [43]);
assert.equal(totalComparedAfterModifier.comparisons[0].success, true);
assert.equal(totalComparedAfterModifier.arithmeticSteps[0].scope, 'total');
```

- [ ] **Step 4: Cover all arithmetic operations in per-die scope**

```ts
const sequentialPerDie = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 2 },
  { id: 'a', kind: 'modifier', operation: 'add', value: 3 },
  { id: 'b', kind: 'modifier', operation: 'multiply', value: 2 },
  { id: 'k', kind: 'keep', which: 'highest', count: 20 },
], [8, 10]);
assert.deepEqual(sequentialPerDie.diceGroups[0].rolls.map((die) => die.contribution), [22, 26]);
assert.equal(sequentialPerDie.total, 48);
assert.deepEqual(sequentialPerDie.arithmeticSteps.map((step) => step.scope), ['dice', 'dice']);

const perDieSubtract = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 2 },
  { id: 'm', kind: 'modifier', operation: 'subtract', value: 2 },
  { id: 'k', kind: 'keep', which: 'highest', count: 5 },
], [7, 6]);
assert.deepEqual(perDieSubtract.diceGroups[0].rolls.map((die) => die.contribution), [5, 4]);
assert.equal(perDieSubtract.total, 5);

const perDieDivide = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 2 },
  { id: 'm', kind: 'modifier', operation: 'divide', value: 2 },
  { id: 'k', kind: 'keep', which: 'highest', count: 5 },
], [10, 8]);
assert.deepEqual(perDieDivide.diceGroups[0].rolls.map((die) => die.contribution), [5, 4]);
assert.equal(perDieDivide.total, 5);

const perDieExponent = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 2 },
  { id: 'm', kind: 'modifier', operation: 'exponent', value: 2 },
  { id: 'k', kind: 'keep', which: 'highest', count: 20 },
], [5, 4]);
assert.deepEqual(perDieExponent.diceGroups[0].rolls.map((die) => die.contribution), [25, 16]);
assert.equal(perDieExponent.total, 25);
```

Add, multiply, subtract, divide, and exponent are now all covered in per-die scope. The existing arithmetic test continues covering aggregate chaining.

- [ ] **Step 5: Add the next-Dice boundary test**

```ts
const nextDiceBoundary = roll([
  { id: 'd20', kind: 'dice', sides: 20, quantity: 1 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
  { id: 'd6', kind: 'dice', sides: 6, quantity: 2 },
  { id: 'k', kind: 'keep', which: 'highest', count: 4 },
], [10, 3, 5]);
assert.equal(nextDiceBoundary.diceGroups[0].rolls[0].contribution, 10);
assert.equal(nextDiceBoundary.arithmeticSteps[0].scope, 'total');
assert.deepEqual(
  nextDiceBoundary.diceGroups[1].rolls.filter((die) => die.active).map((die) => die.contribution),
  [5],
);
```

- [ ] **Step 6: Add Keep provenance, Drop interaction, and zero-success tests**

```ts
const keepThenDrop = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 3 },
  { id: 'k', kind: 'keep', which: 'highest', count: 10 },
  { id: 'drop', kind: 'drop', which: 'highest', count: 1 },
], [12, 15, 8]);
assert.equal(
  keepThenDrop.diceGroups[0].rolls.filter((die) => die.active && die.keepMatched === true).length,
  1,
);

const zeroKeep = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 2 },
  { id: 'k', kind: 'keep', which: 'highest', count: 15 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
], [4, 6]);
assert.equal(
  zeroKeep.diceGroups[0].rolls.filter((die) => die.active && die.keepMatched === true).length,
  0,
);
assert.equal(zeroKeep.total, 3);
```

- [ ] **Step 7: Add exact Exploding/natural-face tests**

A contribution that reaches the die maximum must not create a fake explosion:

```ts
const modifiedToMaximumDoesNotExplode = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 1 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
  { id: 'x', kind: 'exploding', mode: 'explode' },
  { id: 'c', kind: 'compare', operator: 'gte', target: 20, total: false },
], [17]);
assert.equal(modifiedToMaximumDoesNotExplode.diceGroups[0].rolls.length, 1);
assert.equal(modifiedToMaximumDoesNotExplode.diceGroups[0].rolls[0].face, 17);
assert.equal(modifiedToMaximumDoesNotExplode.diceGroups[0].rolls[0].contribution, 20);
assert.equal(modifiedToMaximumDoesNotExplode.comparisons[0].success, true);
```

A natural maximum must still explode, and a Modifier that ran before the explosion must not retroactively modify the new die:

```ts
const naturalMaximumStillExplodes = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 1 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
  { id: 'x', kind: 'exploding', mode: 'explode' },
  { id: 'c', kind: 'compare', operator: 'gte', target: 20, total: false },
], [20, 4]);
assert.deepEqual(naturalMaximumStillExplodes.diceGroups[0].rolls.map((die) => die.face), [20, 4]);
assert.deepEqual(naturalMaximumStillExplodes.diceGroups[0].rolls.map((die) => die.contribution), [23, 4]);
assert.equal(naturalMaximumStillExplodes.diceGroups[0].rolls.length, 2);
```

- [ ] **Step 8: Run the engine verifier and confirm RED for the intended reasons**

Run:

```bash
npm run verify:dice-engine
```

Expected: FAIL because the current validator closes the active group at Modifier, current Modifier always operates on aggregate total, and current result types do not expose `scope`, `groupItemId`, or `keepMatched`. Do not commit or push this RED state.

---

### Task 2: Implement contextual arithmetic and Keep provenance in the canonical engine

**Files:**
- Modify: `src/app/components/session/dice/diceTypes.ts`
- Modify: `src/app/components/session/dice/diceFormulaValidation.ts`
- Modify: `src/app/components/session/dice/diceEngine.ts`
- Test: `scripts/verify-dice-engine.mts`

**Interfaces:**
- Produces: `RollDie.keepMatched?: boolean`.
- Produces: `RollArithmeticStep.scope: 'dice' | 'total'` and `RollArithmeticStep.groupItemId?: string`.
- Produces internal helpers `modifierTargetsActiveDice(items, modifierIndex)` and `applyArithmeticValue(before, operation, value)`.

- [ ] **Step 1: Extend the canonical result types**

Keep every current `RollDie` field and add one optional field:

```ts
export interface RollDie {
  id: string;
  groupItemId: string;
  sides: number;
  face: number;
  contribution: number;
  active: boolean;
  source: 'base' | 'explosion';
  explosionDepth: number;
  chainId: string;
  parentRollId?: string;
  keepMatched?: boolean;
}
```

Replace the current arithmetic-step interface with:

```ts
export interface RollArithmeticStep {
  itemId: string;
  operation: DiceModifierOperation;
  value: number;
  before: number;
  after: number;
  scope: 'dice' | 'total';
  groupItemId?: string;
}
```

Do not add scope to `DiceFormulaItem`.

- [ ] **Step 2: Keep the active Dice group open across Modifier validation**

In the `modifier` branch of `diceFormulaValidation.ts`, retain these checks:

```ts
if (!hasNumericTotal) {
  addIssue('missing_total', 'Il modificatore richiede un totale numerico precedente.', item.id);
}
if (!Number.isFinite(item.value)) {
  addIssue('invalid_modifier_value', 'Il valore del modificatore deve essere un numero finito.', item.id);
}
if (item.operation === 'divide' && item.value === 0) {
  addIssue('division_by_zero', 'Non e possibile dividere per zero.', item.id);
}
```

Delete the two current assignments `activeDiceGroup = false` and `explodingSeenInGroup = false`. Dice remains the only item that opens/replaces a group and resets the per-group Exploding flag.

- [ ] **Step 3: Add the bounded look-ahead helper**

Add this exact helper to `diceEngine.ts`:

```ts
function modifierTargetsActiveDice(items: readonly DiceFormulaItem[], modifierIndex: number): boolean {
  for (let index = modifierIndex + 1; index < items.length; index += 1) {
    const next = items[index];
    if (next.kind === 'dice') return false;
    if (next.kind === 'keep') return true;
    if (next.kind === 'compare' && !next.total) return true;
  }
  return false;
}
```

- [ ] **Step 4: Add one scalar arithmetic helper for both scopes**

Import `DiceModifierOperation` from `diceTypes.ts` and add:

```ts
function applyArithmeticValue(
  before: number,
  operation: DiceModifierOperation,
  value: number,
): number {
  let after: number;
  switch (operation) {
    case 'add':
      after = before + value;
      break;
    case 'subtract':
      after = before - value;
      break;
    case 'multiply':
      after = before * value;
      break;
    case 'divide':
      if (value === 0) throw new DiceRollError('Non e possibile dividere per zero.');
      after = before / value;
      break;
    case 'exponent':
      after = before ** value;
      break;
  }
  if (!Number.isFinite(after)) {
    throw new DiceRollError('Il modificatore ha prodotto un risultato numerico non valido.');
  }
  return after;
}
```

- [ ] **Step 5: Mark dice that pass Keep**

Import `DiceKeepWhich` and replace `applyKeepThreshold` with:

```ts
function applyKeepThreshold(
  group: RollDiceGroup,
  which: DiceKeepWhich,
  threshold: number,
): void {
  for (const die of activeRolls(group)) {
    const matches = which === 'highest'
      ? die.contribution >= threshold
      : which === 'lowest'
        ? die.contribution <= threshold
        : die.contribution === threshold;
    die.active = matches;
    if (matches) die.keepMatched = true;
  }
  refreshGroup(group);
}
```

Only currently active dice are considered, so a later Keep cannot reactivate a die filtered out earlier.

- [ ] **Step 6: Iterate formula items with an index**

Replace:

```ts
for (const item of input.request.items) {
```

with:

```ts
for (let itemIndex = 0; itemIndex < input.request.items.length; itemIndex += 1) {
  const item = input.request.items[itemIndex];
```

Keep the existing switch body under the indexed loop.

- [ ] **Step 7: Execute Modifier using inferred scope**

Replace the current `case 'modifier'` body with this behavior:

```ts
case 'modifier': {
  const perDie = activeGroup !== null && modifierTargetsActiveDice(input.request.items, itemIndex);

  if (perDie && activeGroup) {
    const group = activeGroup;
    const before = group.contribution;
    for (const die of activeRolls(group)) {
      die.contribution = applyArithmeticValue(die.contribution, item.operation, item.value);
    }
    refreshGroup(group);
    const after = group.contribution;
    total += after - before;
    arithmeticSteps.push({
      itemId: item.id,
      operation: item.operation,
      value: item.value,
      before,
      after,
      scope: 'dice',
      groupItemId: group.itemId,
    });
    break;
  }

  const before = total;
  total = applyArithmeticValue(before, item.operation, item.value);
  arithmeticSteps.push({
    itemId: item.id,
    operation: item.operation,
    value: item.value,
    before,
    after: total,
    scope: 'total',
  });
  break;
}
```

Do not clear `activeGroup` after a Modifier.

- [ ] **Step 8: Run engine tests GREEN**

Run:

```bash
npm run verify:dice-engine
npm run typecheck
```

Expected: PASS with all deterministic examples from Task 1.

Do not commit yet.

---

### Task 3: Derive and render `N (total)` from the canonical result

**Files:**
- Create: `src/app/components/session/dice/diceResultSummary.ts`
- Modify: `src/app/components/session/dice/DiceRollHistoryCard.tsx`
- Modify: `scripts/verify-dice-engine.mts`
- Modify: `scripts/verify-dice-ui.mjs`

**Interfaces:**
- Produces: `getKeepCount(result: RollResult): number`.
- Produces: `formatPrimaryRollResult(result: RollResult): string`.

- [ ] **Step 1: Add RED summary assertions**

At the top of `verify-dice-engine.mts`, add:

```ts
import { formatPrimaryRollResult } from '../src/app/components/session/dice/diceResultSummary.ts';
```

After the Task 1 roll fixtures, add:

```ts
assert.equal(formatPrimaryRollResult(totalOnlyModifier), '43');
assert.equal(formatPrimaryRollResult(modifierBeforeKeep), '2 (33)');
assert.equal(formatPrimaryRollResult(modifierAfterKeep), '2 (35)');
assert.equal(formatPrimaryRollResult(zeroKeep), '0 (3)');
```

Run `npm run verify:dice-engine` and expect FAIL because `diceResultSummary.ts` does not exist. Do not commit/push RED.

- [ ] **Step 2: Implement the pure summary helper**

Create `diceResultSummary.ts` with exactly:

```ts
import type { RollResult } from './diceTypes.ts';

function formatResultNumber(value: number): string {
  if (Object.is(value, -0)) return '0';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

export function getKeepCount(result: RollResult): number {
  return result.diceGroups.reduce(
    (count, group) => count + group.rolls.filter(
      (die) => die.active && die.keepMatched === true,
    ).length,
    0,
  );
}

export function formatPrimaryRollResult(result: RollResult): string {
  const total = formatResultNumber(result.total);
  const hasKeep = result.sourceItems.some((item) => item.kind === 'keep');
  return hasKeep ? `${getKeepCount(result)} (${total})` : total;
}
```

- [ ] **Step 3: Render the helper in history**

Add this import to `DiceRollHistoryCard.tsx`:

```ts
import { formatPrimaryRollResult } from './diceResultSummary.ts';
```

Replace only:

```tsx
{result.total}
```

inside the main total display with:

```tsx
{formatPrimaryRollResult(result)}
```

Keep the `Totale` label, natural-face chips, contribution parentheses, Compare output, secret badge, and reroll UI unchanged.

- [ ] **Step 4: Add UI guards and explicitly forbid scope controls**

In `verify-dice-ui.mjs`, read the history card and summary helper:

```js
const historyCard = read('src/app/components/session/dice/DiceRollHistoryCard.tsx');
const summary = read('src/app/components/session/dice/diceResultSummary.ts');
```

Add:

```js
assert.ok(historyCard.includes('formatPrimaryRollResult(result)'), 'history must use the Keep-aware result summary');
assert.ok(summary.includes("item.kind === 'keep'"), 'Keep presence must control N (total) formatting');
assert.ok(summary.includes('die.active && die.keepMatched === true'), 'Keep count must include only final active Keep matches');
assert.ok(!row.includes('Singolo dado'), 'Modifier UI must not add a per-die radio/checkbox');
assert.ok(!row.includes('data-dice-modifier-scope'), 'Modifier UI must not expose an explicit scope control');
```

- [ ] **Step 5: Run summary/UI verification GREEN**

Run:

```bash
npm run verify:dice-engine
npm run verify:dice-ui
npm run typecheck
```

Expected: PASS.

Do not commit yet.

---

### Task 4: Protect the natural-face and 3D invariants

**Files:**
- Modify: `scripts/verify-dice-3d.mts`
- Test dependency: `src/app/components/session/dice/dice3dProjection.ts`

**Interfaces:**
- Consumes: `projectRollTo3D(result)`.
- Produces: regression proof that contextual `contribution` values never replace physical `face` values in 3D.

- [ ] **Step 1: Add the exact modified-face projection test**

Append:

```ts
const modifiedFaceProjection = projectRollTo3D(result([
  group('modified-d20', 20, [{ face: 12, contribution: 15 }]),
]));
assert.deepEqual(
  modifiedFaceProjection,
  [{ sides: 20, values: [12], notation: '1d20@12' }],
  '3D projection must use natural face even when contextual arithmetic changes contribution',
);
```

This is independent of active/kept status and complements the existing penetrating and discarded-die tests.

- [ ] **Step 2: Run 3D verification**

Run:

```bash
npm run verify:dice-3d
npm run verify:dice-engine
```

Expected: PASS. Do not change `dice3dProjection.ts` if this test passes; its current `group.rolls.map((die) => die.face)` behavior is the intended implementation.

Do not commit yet.

---

### Task 5: Validate the extended canonical result on public and secret Realtime paths

**Files:**
- Modify: `src/services/realtime/diceRealtime.ts`
- Modify: `supabase/functions/dice-secret-roll/index.ts`
- Modify: `scripts/verify-dice-realtime.mjs`
- Read/guard: `src/app/components/session/dice/DiceSessionContext.tsx`

**Interfaces:**
- Consumes: `RollDie.keepMatched?: boolean`, `RollArithmeticStep.scope`, `RollArithmeticStep.groupItemId?`.
- Produces: equivalent client and Edge validation of contextual metadata.

- [ ] **Step 1: Add RED guards for contextual metadata**

In `verify-dice-realtime.mjs`, add:

```js
for (const token of ['keepMatched', 'groupItemId', 'scope']) {
  assert.ok(helper.includes(token), `client RollResult validator must validate ${token}`);
  assert.ok(relay.includes(token), `secret relay RollResult validator must validate ${token}`);
}
assert.ok(helper.includes("value.scope !== 'dice' && value.scope !== 'total'"));
assert.ok(relay.includes("value.scope !== 'dice' && value.scope !== 'total'"));
assert.ok(session.includes('previous.sourceItems.map'), 'reroll must continue rebuilding from sourceItems');
```

Run `npm run verify:dice-realtime` and expect FAIL because the current validators only validate the top-level arrays. Do not commit/push RED.

- [ ] **Step 2: Add client nested validators**

In `src/services/realtime/diceRealtime.ts`, keep `isRecord` and add:

```ts
function isRollDiePayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (typeof value.groupItemId !== 'string' || value.groupItemId.length === 0) return false;
  if (typeof value.sides !== 'number' || !Number.isFinite(value.sides)) return false;
  if (typeof value.face !== 'number' || !Number.isFinite(value.face)) return false;
  if (typeof value.contribution !== 'number' || !Number.isFinite(value.contribution)) return false;
  if (typeof value.active !== 'boolean') return false;
  if (value.keepMatched !== undefined && typeof value.keepMatched !== 'boolean') return false;
  return true;
}

function isDiceGroupPayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.itemId !== 'string' || value.itemId.length === 0) return false;
  if (!Array.isArray(value.rolls) || !value.rolls.every(isRollDiePayload)) return false;
  if (!Array.isArray(value.activeRollIds) || !value.activeRollIds.every((id) => typeof id === 'string')) return false;
  if (typeof value.contribution !== 'number' || !Number.isFinite(value.contribution)) return false;
  return true;
}

function isArithmeticStepPayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.itemId !== 'string' || value.itemId.length === 0) return false;
  if (value.scope !== 'dice' && value.scope !== 'total') return false;
  if (value.scope === 'dice' && (typeof value.groupItemId !== 'string' || value.groupItemId.length === 0)) return false;
  if (value.scope === 'total' && value.groupItemId !== undefined) return false;
  if (typeof value.before !== 'number' || !Number.isFinite(value.before)) return false;
  if (typeof value.after !== 'number' || !Number.isFinite(value.after)) return false;
  return true;
}
```

Then strengthen the existing top-level array checks to:

```ts
if (!Array.isArray(value.diceGroups) || !value.diceGroups.every(isDiceGroupPayload)) return false;
if (!Array.isArray(value.arithmeticSteps) || !value.arithmeticSteps.every(isArithmeticStepPayload)) return false;
```

Retain the existing `sourceItems`, `comparisons`, visibility, campaign/user IDs, total, and timestamp checks.

- [ ] **Step 3: Mirror the same contextual validation in the secret Edge Function**

Add Deno-safe `isRollDiePayload`, `isDiceGroupPayload`, and `isArithmeticStepPayload` functions to `supabase/functions/dice-secret-roll/index.ts` with the same checks from Step 2, then replace its two shallow checks with:

```ts
if (!Array.isArray(value.diceGroups) || !value.diceGroups.every(isDiceGroupPayload)) return false;
if (!Array.isArray(value.arithmeticSteps) || !value.arithmeticSteps.every(isArithmeticStepPayload)) return false;
```

Do not alter these existing security conditions:

```ts
if (result.campaignId !== campaignId) return json({ error: "Campaign mismatch" }, 400);
if (result.visibility !== 'secret') return json({ error: "Only secret rolls may use this relay" }, 400);
if (result.rollerId !== user.id) return json({ error: "Roller mismatch" }, 403);
if (ownerProfileId === user.id) {
  return json({ error: "GM secret rolls must remain local" }, 400);
}
```

Keep membership validation and `profile:${ownerProfileId}` relay routing unchanged.

- [ ] **Step 4: Verify reroll still rebuilds from source definition only**

`DiceSessionContext.tsx` must retain this structure:

```ts
return submitLocalRoll({
  items: previous.sourceItems.map((item) => ({ ...item })) as DiceRollRequest['items'],
  formulaId: previous.formulaId,
  formulaName: previous.formulaName,
  visibility: previous.visibility,
});
```

Do not add prior `diceGroups`, `contribution`, `keepMatched`, `arithmeticSteps`, or `total` to reroll input.

- [ ] **Step 5: Run Realtime verification GREEN**

Run:

```bash
npm run verify:dice-realtime
npm run typecheck
```

Expected: PASS while all pre-existing secret-roll privacy assertions remain green.

Do not commit yet.

---

### Task 6: Full verification, one implementation commit, PR, merge, Supabase function deploy, and production verification

**Files:**
- All implementation/test files changed in Tasks 1-5.
- No unrelated files.

**Interfaces:**
- Produces: one implementation commit, one PR, a `main` merge SHA, matching Vercel deployment, and matching production `dice-secret-roll` Edge Function.

- [ ] **Step 1: Run the complete repository gate**

Run:

```bash
npm ci
npm audit --audit-level=high
npm run check
```

Expected: install success, no audit failure at high severity, TypeScript success, every Dice verifier success, every unrelated verifier success, and Vite production build success.

- [ ] **Step 2: Perform a spec acceptance diff review**

Confirm all fourteen conditions explicitly:

1. no Modifier radio/checkbox exists;
2. no database schema or migration changed;
3. `4d20 +3` stays aggregate and returns `43` for `12,15,10,3`;
4. `4d20 +3 k>=15` produces contributions `15,18,6,12` and summary `2 (33)` for `12,15,3,9`;
5. `4d20 k>=15 +3` produces `2 (35)` for `16,16,12,7`;
6. per-die Compare sees contextual contributions;
7. total Compare leaves Modifier aggregate;
8. new Dice terminates look-ahead;
9. all five arithmetic operations work in per-die scope;
10. Drop does not trigger scope and can remove a Keep-counted die;
11. Exploding uses natural `face`, including the `17 +3` no-fake-explosion case;
12. 3D uses natural `face` when `contribution` differs;
13. public/client and secret/Edge Realtime validators accept and validate contextual metadata;
14. reroll remains based solely on `sourceItems`.

- [ ] **Step 3: Create the single effective implementation commit**

Stage only these implementation/test paths:

```bash
git add \
  src/app/components/session/dice/diceTypes.ts \
  src/app/components/session/dice/diceFormulaValidation.ts \
  src/app/components/session/dice/diceEngine.ts \
  src/app/components/session/dice/diceResultSummary.ts \
  src/app/components/session/dice/DiceRollHistoryCard.tsx \
  src/services/realtime/diceRealtime.ts \
  supabase/functions/dice-secret-roll/index.ts \
  scripts/verify-dice-engine.mts \
  scripts/verify-dice-ui.mjs \
  scripts/verify-dice-realtime.mjs \
  scripts/verify-dice-3d.mts

git commit -m "feat: add contextual dice modifiers"
```

Do not create separate test/fix/checkpoint commits.

- [ ] **Step 4: Push the implementation SHA and require green branch CI**

Push `feat/dice-contextual-modifiers`. Confirm GitHub Actions finishes `success` for the exact implementation SHA and that its `npm run check` step passed.

- [ ] **Step 5: Open the PR**

Use title:

```text
feat: add contextual dice modifiers
```

The PR body must state:

- Modifier scope is inferred from future Keep/per-die Compare before the next Dice;
- the persisted formula shape is unchanged;
- Keep history display is `N (total)`;
- natural `face` remains authoritative for 3D and Exploding;
- public and secret Realtime validators understand the extended canonical result;
- branch CI is green.

- [ ] **Step 6: Merge only after PR CI is green**

Merge into `main` using the repository's normal merge method. Record the resulting `main` merge SHA.

- [ ] **Step 7: Deploy the updated secret relay**

Deploy `supabase/functions/dice-secret-roll/index.ts` as Edge Function `dice-secret-roll` to production Supabase project `njcnkovruynhtsgzgrxi`. This is a function deployment only; do not run a SQL migration.

- [ ] **Step 8: Verify production on the merge SHA**

Require all three before declaring completion:

```text
GitHub Actions main CI: success
Vercel deployment for the same main merge SHA: success
Supabase dice-secret-roll deployment: success
```

## Final Acceptance Examples

```text
4d20 +3
faces: 12,15,10,3
result: 43

4d20 +3 k>=15
faces: 12,15,3,9
contributions: 15,18,6,12
kept: 15,18
result: 2 (33)

4d20 k>=15 +3
faces: 16,16,12,7
kept: 16,16
result: 2 (35)

4d20 +3 >=15   [Compare per-die]
faces: 12,15,3,9
compared values: 15,18,6,12
successes: 2

4d20 +3 T>=40
faces: 12,15,10,3
aggregate total: 43
Compare Total: success
```
