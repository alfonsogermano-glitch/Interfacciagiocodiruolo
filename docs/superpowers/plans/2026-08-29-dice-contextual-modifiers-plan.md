# Contextual Dice Modifiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mathematical modifiers automatically operate on individual dice when a later Keep or per-die Compare needs those values, otherwise keep their existing total-level behavior, and show Keep results as `N (total)`.

**Architecture:** Keep the persisted `DiceFormulaItem` model unchanged and infer modifier scope at roll time with a bounded look-ahead that stops at the next Dice item. Extend the canonical `RollResult` with per-die Keep provenance and arithmetic-step scope metadata, derive the display summary from that canonical result, and keep 3D rendering based only on natural die faces. Strengthen both client and secret-relay Realtime validators so the same canonical shape is trusted everywhere.

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
- Implementation work must be delivered as one effective code commit/push after local/full verification; do not create RED-test, preview, export, or checkpoint commits.
- Before merge, run the complete `npm run check` suite and verify zero failures.

---

### Task 1: Lock the contextual modifier semantics with RED engine tests

**Files:**
- Modify: `scripts/verify-dice-engine.mts`

**Interfaces:**
- Consumes: `validateDiceFormula(items)`, `rollDiceFormula(input, rng)`, `RollResult`.
- Produces: executable regression cases that define modifier scope, order, boundaries, Keep provenance, and arithmetic metadata.

- [ ] **Step 1: Change the validation expectation for Modifier -> Keep**

Replace the existing assertion that expects `[d6, add2, keep1]` to be invalid with:

```ts
assert.equal(
  validateDiceFormula([d6, add2, keep1]).valid,
  true,
  'a modifier must no longer close the active dice group before Keep',
);
```

- [ ] **Step 2: Add deterministic contextual-modifier cases**

Append cases equivalent to the following, using the existing `roll()` and queued RNG helpers:

```ts
const totalOnlyModifier = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 4 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
], [12, 15, 10, 3]);
assert.equal(totalOnlyModifier.total, 43);
assert.deepEqual(totalOnlyModifier.diceGroups[0].rolls.map((die) => die.contribution), [12, 15, 10, 3]);
assert.equal(totalOnlyModifier.arithmeticSteps[0].scope, 'total');

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

- [ ] **Step 3: Add per-die Compare and total Compare cases**

```ts
const perDieComparedAfterModifier = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 4 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
  { id: 'c', kind: 'compare', operator: 'gte', target: 15, total: false },
], [12, 15, 3, 9]);
assert.deepEqual(perDieComparedAfterModifier.comparisons[0].comparedValues, [15, 18, 6, 12]);
assert.equal(perDieComparedAfterModifier.comparisons[0].successes, 2);
assert.equal(perDieComparedAfterModifier.arithmeticSteps[0].scope, 'dice');

const totalComparedAfterModifier = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 4 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
  { id: 'c', kind: 'compare', operator: 'gte', target: 40, total: true },
], [12, 15, 10, 3]);
assert.equal(totalComparedAfterModifier.total, 43);
assert.deepEqual(totalComparedAfterModifier.comparisons[0].comparedValues, [43]);
assert.equal(totalComparedAfterModifier.arithmeticSteps[0].scope, 'total');
```

- [ ] **Step 4: Add sequencing and next-Dice boundary cases**

Cover all five arithmetic operations through the shared arithmetic helper, and explicitly test two sequential modifiers before Keep plus a new-Dice boundary:

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

const nextDiceBoundary = roll([
  { id: 'd20', kind: 'dice', sides: 20, quantity: 1 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
  { id: 'd6', kind: 'dice', sides: 6, quantity: 2 },
  { id: 'k', kind: 'keep', which: 'highest', count: 4 },
], [10, 3, 5]);
assert.equal(nextDiceBoundary.diceGroups[0].rolls[0].contribution, 10);
assert.equal(nextDiceBoundary.arithmeticSteps[0].scope, 'total');
assert.deepEqual(nextDiceBoundary.diceGroups[1].rolls.filter((die) => die.active).map((die) => die.contribution), [5]);
```

- [ ] **Step 5: Add Keep provenance / Drop interaction / zero-success cases**

```ts
const keepThenDrop = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 3 },
  { id: 'k', kind: 'keep', which: 'highest', count: 10 },
  { id: 'drop', kind: 'drop', which: 'highest', count: 1 },
], [12, 15, 8]);
assert.equal(keepThenDrop.diceGroups[0].rolls.filter((die) => die.active && die.keepMatched).length, 1);

const zeroKeep = roll([
  { id: 'd', kind: 'dice', sides: 20, quantity: 2 },
  { id: 'k', kind: 'keep', which: 'highest', count: 15 },
  { id: 'm', kind: 'modifier', operation: 'add', value: 3 },
], [4, 6]);
assert.equal(zeroKeep.diceGroups[0].rolls.filter((die) => die.active && die.keepMatched).length, 0);
assert.equal(zeroKeep.total, 3);
```

- [ ] **Step 6: Run the engine verifier and confirm RED for the intended reasons**

Run:

```bash
npm run verify:dice-engine
```

Expected: FAIL because current validation rejects Modifier -> Keep and current Modifier always mutates only the aggregate total / lacks `scope`, `groupItemId`, and `keepMatched` metadata. Do not commit or push this RED state.

---

### Task 2: Implement contextual arithmetic and Keep provenance in the canonical engine

**Files:**
- Modify: `src/app/components/session/dice/diceTypes.ts`
- Modify: `src/app/components/session/dice/diceFormulaValidation.ts`
- Modify: `src/app/components/session/dice/diceEngine.ts`
- Test: `scripts/verify-dice-engine.mts`

**Interfaces:**
- Produces: `RollDie.keepMatched?: boolean`.
- Produces: `RollArithmeticStep.scope: 'dice' | 'total'` and optional `groupItemId?: string`.
- Produces internal helpers equivalent to `modifierTargetsActiveDice(...)` and `applyArithmeticValue(...)`.

- [ ] **Step 1: Extend the canonical result types**

In `diceTypes.ts`, extend the existing interfaces exactly as follows:

```ts
export interface RollDie {
  // existing fields
  keepMatched?: boolean;
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
```

Do not add scope to `DiceFormulaItem`; it is inferred at roll time.

- [ ] **Step 2: Keep the active Dice group open across Modifier validation**

In `diceFormulaValidation.ts`, retain all existing modifier number/division checks but remove only these state resets from the `modifier` case:

```ts
activeDiceGroup = false;
explodingSeenInGroup = false;
```

A new Dice item remains the event that changes the active group and resets `explodingSeenInGroup`.

- [ ] **Step 3: Add a bounded look-ahead helper**

In `diceEngine.ts`, add:

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

This intentionally ignores Drop, Exploding, and Compare Totale.

- [ ] **Step 4: Centralize scalar arithmetic**

Add one helper used by both total-level and per-die modifiers:

```ts
function applyArithmeticValue(
  before: number,
  operation: DiceModifierOperation,
  value: number,
): number {
  let after: number;
  switch (operation) {
    case 'add': after = before + value; break;
    case 'subtract': after = before - value; break;
    case 'multiply': after = before * value; break;
    case 'divide':
      if (value === 0) throw new DiceRollError('Non e possibile dividere per zero.');
      after = before / value;
      break;
    case 'exponent': after = before ** value; break;
  }
  if (!Number.isFinite(after)) {
    throw new DiceRollError('Il modificatore ha prodotto un risultato numerico non valido.');
  }
  return after;
}
```

Import `DiceModifierOperation` as a type if needed.

- [ ] **Step 5: Mark dice that pass Keep**

Update `applyKeepThreshold` so each currently active die is tested against the threshold, becomes inactive when it fails, and receives `keepMatched = true` when it passes:

```ts
function applyKeepThreshold(group: RollDiceGroup, which: DiceKeepWhich, threshold: number): void {
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

Do not reactivate dice excluded by an earlier Keep/Drop.

- [ ] **Step 6: Execute Modifier using the inferred scope**

Change the main formula loop to iterate with an index so the current modifier can look ahead:

```ts
for (let itemIndex = 0; itemIndex < input.request.items.length; itemIndex += 1) {
  const item = input.request.items[itemIndex];
  // existing switch
}
```

For a Modifier with an active group and `modifierTargetsActiveDice(...) === true`:

```ts
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
```

For all other Modifiers, preserve aggregate behavior with the same scalar helper:

```ts
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
```

Do not set `activeGroup = null` after either scope.

- [ ] **Step 7: Run engine tests GREEN**

Run:

```bash
npm run verify:dice-engine
npm run typecheck
```

Expected: PASS. The deterministic cases must prove `4d20 +3` = 43, `4d20 +3 k>=15` = 33 with contributions `[15,18,6,12]`, `4d20 k>=15 +3` = 35, per-die Compare sees modified contributions, total Compare does not force per-die scope, and new Dice is a boundary.

Do not commit yet.

---

### Task 3: Derive and render `N (total)` without duplicating roll logic

**Files:**
- Create: `src/app/components/session/dice/diceResultSummary.ts`
- Modify: `src/app/components/session/dice/DiceRollHistoryCard.tsx`
- Modify: `scripts/verify-dice-engine.mts`
- Modify: `scripts/verify-dice-ui.mjs`

**Interfaces:**
- Produces: `getKeepCount(result: RollResult): number`.
- Produces: `formatPrimaryRollResult(result: RollResult): string`.
- Consumes: `sourceItems`, `diceGroups[].rolls[].active`, `keepMatched`, `total`.

- [ ] **Step 1: Add RED tests for summary formatting**

Import the new helper from `diceResultSummary.ts` in `verify-dice-engine.mts` and assert:

```ts
assert.equal(formatPrimaryRollResult(totalOnlyModifier), '43');
assert.equal(formatPrimaryRollResult(modifierBeforeKeep), '2 (33)');
assert.equal(formatPrimaryRollResult(modifierAfterKeep), '2 (35)');
assert.equal(formatPrimaryRollResult(zeroKeep), '0 (3)');
```

Run `npm run verify:dice-engine` and expect FAIL because the helper does not exist. Do not commit/push RED.

- [ ] **Step 2: Implement the pure summary helper**

Create `diceResultSummary.ts`:

```ts
import type { RollResult } from './diceTypes.ts';

function formatResultNumber(value: number): string {
  if (Object.is(value, -0)) return '0';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

export function getKeepCount(result: RollResult): number {
  return result.diceGroups.reduce(
    (count, group) => count + group.rolls.filter((die) => die.active && die.keepMatched === true).length,
    0,
  );
}

export function formatPrimaryRollResult(result: RollResult): string {
  const total = formatResultNumber(result.total);
  const hasKeep = result.sourceItems.some((item) => item.kind === 'keep');
  return hasKeep ? `${getKeepCount(result)} (${total})` : total;
}
```

The existence of Keep in `sourceItems`, not a non-zero count, controls whether parentheses are shown; this guarantees `0 (3)`.

- [ ] **Step 3: Use the summary in history**

In `DiceRollHistoryCard.tsx`, import `formatPrimaryRollResult` and replace only the displayed `{result.total}` with:

```tsx
{formatPrimaryRollResult(result)}
```

Keep the label `Totale`, die chips, natural faces, contribution parentheses, comparison output, secret indicator, and reroll button unchanged.

- [ ] **Step 4: Add UI guards**

Extend `verify-dice-ui.mjs` to read `DiceRollHistoryCard.tsx` and `diceResultSummary.ts` and require:

```js
assert.ok(historyCard.includes('formatPrimaryRollResult(result)'), 'history must use the canonical Keep-aware result summary');
assert.ok(summary.includes("item.kind === 'keep'"), 'Keep presence must control N (total) formatting');
assert.ok(summary.includes('die.active && die.keepMatched === true'), 'Keep count must include only final active Keep matches');
assert.ok(!row.includes('Singolo dado'), 'Modifier UI must not add a per-die scope control');
```

- [ ] **Step 5: Run engine + UI checks GREEN**

Run:

```bash
npm run verify:dice-engine
npm run verify:dice-ui
npm run typecheck
```

Expected: PASS.

Do not commit yet.

---

### Task 4: Protect the natural-face / 3D invariant

**Files:**
- Modify: `scripts/verify-dice-3d.mts`
- Read-only behavior dependency: `src/app/components/session/dice/dice3dProjection.ts`

**Interfaces:**
- Consumes: canonical `RollResult` from `rollDiceFormula` and `projectRollTo3D(result)`.
- Produces: regression proof that per-die arithmetic cannot change the visual 3D face.

- [ ] **Step 1: Add a deterministic modified-die projection test**

Import `rollDiceFormula` and a deterministic RNG (or construct a `RollResult` whose `face` and `contribution` differ) and assert the projection uses natural face:

```ts
const modifiedFaceProjection = projectRollTo3D(result([
  group('modified-d20', 20, [{ face: 12, contribution: 15 }]),
]));
assert.deepEqual(
  modifiedFaceProjection,
  [{ sides: 20, values: [12], notation: '1d20@12' }],
  '3D projection must use natural face even when a contextual modifier changes contribution',
);
```

Also keep the existing penetrating/excluded-die projection checks.

- [ ] **Step 2: Add an explosion regression in the engine verifier**

Use a d20 natural `17` plus contextual `+3` followed by a per-die condition and Exploding in an order that proves contribution `20` alone does not cause an explosion; separately preserve the existing natural-max explosion test. The assertion must inspect `rolls.length` and natural `face`, not just total.

- [ ] **Step 3: Run 3D and engine verification**

Run:

```bash
npm run verify:dice-engine
npm run verify:dice-3d
```

Expected: PASS, with all deterministic 3D notations still based on `face`.

Do not modify `dice3dProjection.ts` unless the new test exposes a real regression; its current `group.rolls.map((die) => die.face)` behavior already satisfies the design.

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
- Produces: client and Edge validators that reject malformed new metadata while accepting valid contextual roll results.

- [ ] **Step 1: Add RED static/behavioral guards for the new validator fields**

Extend `verify-dice-realtime.mjs` so both client helper and relay source must mention and validate `keepMatched`, `scope`, `dice`, `total`, and `groupItemId`. Also retain all existing privacy assertions for campaign/public and GM-secret routing.

Required guards include at least:

```js
for (const token of ['keepMatched', 'groupItemId', 'scope']) {
  assert.ok(helper.includes(token), `client RollResult validator must validate ${token}`);
  assert.ok(relay.includes(token), `secret relay RollResult validator must validate ${token}`);
}
assert.ok(helper.includes("scope !== 'dice'") || helper.includes("scope === 'dice'"));
assert.ok(helper.includes("scope !== 'total'") || helper.includes("scope === 'total'"));
assert.ok(session.includes('previous.sourceItems.map'), 'reroll must continue rebuilding from canonical sourceItems');
```

Run `npm run verify:dice-realtime` and expect FAIL because current validators only check the top-level arrays. Do not commit/push RED.

- [ ] **Step 2: Add focused nested validators on the client**

In `src/services/realtime/diceRealtime.ts`, add small helpers rather than one monolithic function. The minimum semantics are:

```ts
function isRollDiePayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.face !== 'number' || !Number.isFinite(value.face)) return false;
  if (typeof value.contribution !== 'number' || !Number.isFinite(value.contribution)) return false;
  if (typeof value.active !== 'boolean') return false;
  if (value.keepMatched !== undefined && typeof value.keepMatched !== 'boolean') return false;
  return true;
}

function isArithmeticStepPayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.scope !== 'dice' && value.scope !== 'total') return false;
  if (value.scope === 'dice' && (typeof value.groupItemId !== 'string' || value.groupItemId.length === 0)) return false;
  if (value.scope === 'total' && value.groupItemId !== undefined) return false;
  if (typeof value.before !== 'number' || !Number.isFinite(value.before)) return false;
  if (typeof value.after !== 'number' || !Number.isFinite(value.after)) return false;
  return true;
}
```

Validate every die inside every dice group and every arithmetic step in `isRollResultPayload`. Preserve the existing top-level campaign/user/visibility checks.

- [ ] **Step 3: Mirror the canonical metadata validation in the secret Edge Function**

Add equivalent Deno-safe helpers to `supabase/functions/dice-secret-roll/index.ts`. Keep all existing security behavior unchanged:

- JWT identity binds `result.rollerId`;
- campaign membership is checked;
- GM secret rolls remain local;
- relay sends only to `profile:${ownerProfileId}`;
- no dice result persistence.

- [ ] **Step 4: Run Realtime verification GREEN**

Run:

```bash
npm run verify:dice-realtime
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Verify reroll needs no implementation change**

Confirm `DiceSessionContext.tsx` still builds rerolls from cloned `previous.sourceItems` and feeds them back through `submitLocalRoll` / `rollDiceFormula`. Do not copy `contribution`, `keepMatched`, arithmetic steps, or prior total into a reroll.

Do not commit yet.

---

### Task 6: Full verification, one implementation commit, PR, merge, Edge deploy, and production verification

**Files:**
- All files changed by Tasks 1-5.
- No unrelated files.

**Interfaces:**
- Produces: one reviewed branch state ready for `main`, then production Vercel + Supabase Edge Function consistency.

- [ ] **Step 1: Run the complete repository gate from a clean working tree state**

Run:

```bash
npm ci
npm audit --audit-level=high
npm run check
```

Expected:
- install succeeds;
- audit reports no high-or-greater vulnerability failure;
- typecheck succeeds;
- `verify:dice-engine`, `verify:dice-ui`, `verify:dice-realtime`, `verify:dice-3d` all succeed;
- all unrelated existing verification scripts succeed;
- Vite production build succeeds.

- [ ] **Step 2: Inspect the final diff against the approved spec**

Verify explicitly:

1. no Modifier radio/checkbox was added;
2. no database schema/migration file changed;
3. `4d20 +3` stays total-level;
4. `4d20 +3 k>=15` is per-die and displays `2 (33)` for `12,15,3,9`;
5. `4d20 k>=15 +3` displays `2 (35)` for `16,16,12,7`;
6. per-die Compare sees contextual contributions;
7. total Compare keeps modifiers total-level;
8. new Dice stops modifier look-ahead;
9. Drop does not trigger scope and can remove Keep-counted dice;
10. Exploding remains face-based;
11. 3D remains face-based;
12. Realtime validates the extended canonical result;
13. reroll is still sourceItems-based;
14. history uses `N (total)` only when Keep exists.

- [ ] **Step 3: Create the single effective implementation commit**

Stage only the actual implementation/test files plus this approved plan if it is not already committed. Use one implementation commit such as:

```bash
git add src/app/components/session/dice/diceTypes.ts \
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

Do not create separate RED/GREEN/checkpoint commits.

- [ ] **Step 4: Push branch and require green CI**

Push `feat/dice-contextual-modifiers`. Confirm GitHub Actions runs the same full `npm run check` gate successfully on the exact implementation SHA.

- [ ] **Step 5: Open PR to `main`**

PR title:

```text
feat: add contextual dice modifiers
```

PR body must summarize the contextual scope rule, Keep `N (total)` result format, unchanged persisted formula shape, natural-face 3D invariant, Realtime validation update, and RED/GREEN/full-check evidence.

- [ ] **Step 6: Merge only after PR CI is green**

Use a normal merge consistent with the current repository workflow. Record the resulting `main` merge SHA.

- [ ] **Step 7: Deploy the updated secret relay**

Because `supabase/functions/dice-secret-roll/index.ts` changes, deploy function `dice-secret-roll` to production Supabase project `njcnkovruynhtsgzgrxi` using the repository source after merge. No SQL migration is involved.

Verify the deployed function is active and that its source/revision corresponds to the merged validator logic before calling the rollout complete.

- [ ] **Step 8: Verify production gates**

On the merge SHA:

- GitHub Actions `main` CI must be `success`;
- Vercel status must be `success` for the same merge SHA;
- Supabase `dice-secret-roll` deployment must be successful.

Only after all three are confirmed report the feature as deployed.

## Final Acceptance Examples

The implementation is complete only when these examples are all true:

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
