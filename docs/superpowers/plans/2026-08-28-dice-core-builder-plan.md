# Dice Core Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a complete single-client dice system: formula builder, deterministic formula text/validation, pure roll engine, campaign-scoped personal formula persistence, and volatile local roll history.

**Architecture:** Build a typed dice domain under `src/app/components/session/dice/`, keep the roll engine pure and RNG-injectable, persist only saved formulas in Supabase, and keep roll history in React memory. Integrate the new panel into the existing `SessionRightSidebar`/`SlideOverPanel` without using the legacy `DiceRoller.tsx` as the new source of truth.

**Tech Stack:** React 18.3.1, TypeScript 5.7.3, Vite 6.4.3, Tailwind CSS 4, `react-dnd` 16.0.1, `lucide-react` 0.487.0, Supabase JS 2.108.1, PostgreSQL/Supabase RLS.

**Spec:** `docs/superpowers/specs/2026-08-28-dice-system-design.md`

## Global Constraints

- Toolbar order is exactly `d4 -> d6 -> d8 -> d10 -> d12 -> d20 -> d100`.
- The central `+` inserts a formula/modifier row, not a standard die row.
- Formula order is user-controlled and execution order matches visual order.
- Supported items: Dice, Keep, Drop, Exploding, Compare, Arithmetic Modifier.
- Compare supports per-die mode and `Totale` mode.
- Builder `Roll` is always public; saved-formula visibility is persisted separately.
- Saved formulas are personal and campaign-scoped.
- Roll results are volatile and never persisted.
- Use palette CSS variables; do not introduce hardcoded application colors.
- Use `crypto.getRandomValues` with rejection sampling for production RNG.
- Maximum 100 explosions per chain and 1000 rolled/generated dice per RollResult.
- Keep UI, engine, persistence, history, Realtime, and 3D boundaries separate.

---

## File Structure

Create:

- `src/app/components/session/dice/diceTypes.ts` — all formula, validation, result, persistence DTO types.
- `src/app/components/session/dice/diceFormulaText.ts` — pure compact-formula serializer.
- `src/app/components/session/dice/diceFormulaValidation.ts` — pure ordered-scope validation.
- `src/app/components/session/dice/diceEngine.ts` — pure roll evaluation with injected RNG.
- `src/app/components/session/dice/DiceSessionContext.tsx` — volatile local history + roll submission boundary.
- `src/app/components/session/dice/DiceToolbar.tsx` — d4..d100 quick-add controls and badges.
- `src/app/components/session/dice/DiceFormulaRow.tsx` — one editable/reorderable formula row.
- `src/app/components/session/dice/DiceFormulaBuilder.tsx` — ordered builder list, modifier add menu, drag/drop.
- `src/app/components/session/dice/SavedDiceFormulaCard.tsx` — saved formula roll button, visibility toggle, kebab menu.
- `src/app/components/session/dice/DiceRollHistoryCard.tsx` — one volatile roll result card.
- `src/app/components/session/dice/DiceRollHistoryDrawer.tsx` — local history drawer and local Clear.
- `src/app/components/session/dice/SessionDicePanel.tsx` — page/panel composition.
- `src/services/supabase/diceFormulasService.ts` — campaign-scoped CRUD.
- `supabase-dice-formulas.sql` — table/index/RLS migration source.
- `scripts/verify-dice-engine.mts` — executable deterministic engine verification.
- `scripts/verify-dice-ui.mjs` — static integration guard for panel wiring and required UI hooks.

Modify:

- `src/app/components/session/SessionRightSidebar.tsx` — enable `dice`, mount provider/history/panel, add dice panel width handling.
- `package.json` — add dice verification scripts to `check`.

Do not modify:

- `src/app/components/DiceRoller.tsx` except eventual removal in a later cleanup task; it is not imported by the new feature.

---

### Task 1: Define the dice domain model and compact formula serializer

**Files:**
- Create: `src/app/components/session/dice/diceTypes.ts`
- Create: `src/app/components/session/dice/diceFormulaText.ts`
- Create: `scripts/verify-dice-engine.mts`

**Interfaces:**
- Produces `DiceFormulaItem`, `SavedDiceFormula`, `RollResult`, `RollDiceGroup`, `RollComparisonResult`, `DiceRng`, `formatDiceFormula(items)`.
- Later tasks consume these exact types/functions.

- [ ] **Step 1: Write the RED serializer checks in `scripts/verify-dice-engine.mts`**

Use Node assertions and import the TypeScript modules directly:

```ts
import assert from 'node:assert/strict';
import { formatDiceFormula } from '../src/app/components/session/dice/diceFormulaText.ts';
import type { DiceFormulaItem } from '../src/app/components/session/dice/diceTypes.ts';

const items: DiceFormulaItem[] = [
  { id: 'a', kind: 'dice', sides: 20, quantity: 2 },
  { id: 'b', kind: 'dice', sides: 12, quantity: 2 },
  { id: 'c', kind: 'exploding', mode: 'penetrate' },
  { id: 'd', kind: 'compare', operator: 'gte', target: 3, total: false },
  { id: 'e', kind: 'dice', sides: 3, quantity: 1 },
  { id: 'f', kind: 'drop', which: 'highest', count: 1 },
  { id: 'g', kind: 'exploding', mode: 'explode' },
  { id: 'h', kind: 'keep', which: 'highest', count: 1 },
  { id: 'i', kind: 'modifier', operation: 'add', value: 3 },
];

assert.equal(formatDiceFormula(items), '2d20+2d12!p>=3+1d3dh1!kh1+3');
assert.equal(formatDiceFormula([{ id: 'x', kind: 'compare', operator: 'lte', target: 15, total: true }]), 'T<=15');
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --experimental-strip-types scripts/verify-dice-engine.mts
```

Expected: import/module-not-found failure because dice modules do not exist yet.

- [ ] **Step 3: Implement `diceTypes.ts`**

Define discriminated unions exactly:

```ts
export type DiceFormulaItem =
  | { id: string; kind: 'dice'; sides: number; quantity: number }
  | { id: string; kind: 'keep'; which: 'highest' | 'lowest'; count: number }
  | { id: string; kind: 'drop'; which: 'highest' | 'lowest'; count: number }
  | { id: string; kind: 'exploding'; mode: 'explode' | 'compound' | 'penetrate' }
  | { id: string; kind: 'compare'; operator: 'gte' | 'lte' | 'eq'; target: number; total: boolean }
  | { id: string; kind: 'modifier'; operation: 'add' | 'subtract' | 'multiply' | 'divide' | 'exponent'; value: number };

export interface SavedDiceFormula {
  id: string;
  campaignId: string;
  ownerProfileId: string;
  name: string;
  items: DiceFormulaItem[];
  isSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DiceRng = (sides: number) => number;
```

Also define roll detail types with enough information to render natural values, contribution values, active/dropped state, explosion provenance, arithmetic steps, and compare counts.

- [ ] **Step 4: Implement `formatDiceFormula(items)`**

Rules:

```ts
// dice: prepend '+' except for the first numeric term
// keep: khN / klN
// drop: dhN / dlN
// exploding: ! / !! / !p
// compare: >=N / <=N / =N, with T prefix when total=true
// modifier: +N / -N / *N / /N / ^N
```

Do not parse the generated string back into domain objects.

- [ ] **Step 5: Run GREEN**

Run the verifier and confirm all serializer assertions pass.

- [ ] **Step 6: Commit**

Commit message:

```text
feat: define dice formula domain
```

---

### Task 2: Implement ordered validation and deterministic roll engine

**Files:**
- Create: `src/app/components/session/dice/diceFormulaValidation.ts`
- Create: `src/app/components/session/dice/diceEngine.ts`
- Modify: `scripts/verify-dice-engine.mts`

**Interfaces:**
- Produces `validateDiceFormula(items): DiceFormulaValidationResult`.
- Produces `rollDiceFormula(input, rng?): RollResult`.
- Produces `cryptoDiceRng(sides): number`.

- [ ] **Step 1: Extend verifier with RED validation cases**

Assert at least:

```ts
validateDiceFormula([]).valid === false
validateDiceFormula([{ kind:'keep', ... }]).valid === false
validateDiceFormula([dice, modifier, keep]).valid === false
validateDiceFormula([dice, { kind:'modifier', operation:'divide', value:0 }]).valid === false
validateDiceFormula([dice, explode, explode]).valid === false
```

Also assert a complex sequence from the spec is valid.

- [ ] **Step 2: Implement validation as a single ordered pass**

Track:

```ts
let hasNumericTotal = false;
let activeDiceGroup = false;
let explodingSeenInGroup = false;
let requestedDiceCount = 0;
```

Rules:

- Dice: integer sides >=2; integer quantity >=1; opens active group; resets `explodingSeenInGroup`; increments requested count.
- Keep/Drop: require active group and integer count >=1.
- Exploding: require active group; reject second exploding in same group.
- Compare per-die: require active group.
- Compare total: require numeric total.
- Modifier: require numeric total; reject non-finite values; reject divide by zero; closes active group.
- Reject total requested dice count >1000.

Return row-specific errors keyed by `item.id` plus general errors.

- [ ] **Step 3: Extend verifier with RED engine cases using injected RNG**

Use queue RNG:

```ts
function queued(values: number[]) {
  let i = 0;
  return (sides: number) => {
    const value = values[i++];
    assert.ok(value >= 1 && value <= sides);
    return value;
  };
}
```

Cover exactly:

- `2d6` with `[3,5]` -> total 8.
- `4d6kh2` with `[1,6,4,2]` -> active 6,4 -> total 10.
- `4d6dl1` -> total 12 for the same queue.
- `1d6!` with `[6,6,3]` -> contributions 6+6+3 -> total 15.
- `1d6!!` with `[6,6,3]` -> one compound result value 15.
- `1d6!p` with `[6,6,3]` -> contribution 6 + 5 + 2 = 13; explosion decision uses natural 6/6/3.
- per-die Compare counts success/failure without changing total.
- total Compare after `1d20 + 3` evaluates the modified total.
- subtract/multiply/divide/exponent execute in visual order.

- [ ] **Step 4: Implement engine with mutable internal evaluation state but immutable output**

Maintain each dice group as an internal structure:

```ts
{
  itemId,
  sides,
  rolls: InternalRoll[],
  activeRollIds: Set<string>,
  contribution
}
```

On Keep/Drop, recalculate group contribution and apply only the delta to accumulated total. On Exploding, apply only to currently active rolls so visual ordering changes behavior naturally. On a new Dice item, add its contribution to the accumulated total and make it active group. On arithmetic Modifier, transform accumulated total and close group scope.

- [ ] **Step 5: Implement production RNG**

Use one `Uint32Array(1)` and rejection sampling:

```ts
const UINT32_RANGE = 0x1_0000_0000;
const max = Math.floor(UINT32_RANGE / sides) * sides;
do crypto.getRandomValues(buf); while (buf[0] >= max);
return (buf[0] % sides) + 1;
```

Throw for non-integer sides <2.

- [ ] **Step 6: Enforce explosion safety**

Track per-chain extra roll count and total generated dice. Throw a typed `DiceRollError` if either 100 explosions for one chain or 1000 total dice would be exceeded.

- [ ] **Step 7: Run GREEN**

Run:

```bash
node --experimental-strip-types scripts/verify-dice-engine.mts
```

Expected final line:

```text
Dice engine verification passed.
```

- [ ] **Step 8: Commit**

Commit message:

```text
feat: add ordered dice formula engine
```

---

### Task 3: Create campaign-scoped saved formula persistence

**Files:**
- Create: `supabase-dice-formulas.sql`
- Create: `src/services/supabase/diceFormulasService.ts`
- Modify: `scripts/verify-dice-engine.mts` only if row-shape helpers need runtime assertions.

**Interfaces:**
- Produces `loadDiceFormulas(campaignId, ownerProfileId)`.
- Produces `createDiceFormula(input)`.
- Produces `updateDiceFormula(id, patch)`.
- Produces `deleteDiceFormula(id)`.
- Produces `duplicateDiceFormula(formula)`.

- [ ] **Step 1: Write exact migration SQL**

Create table:

```sql
create table if not exists public.dice_formulas (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  is_secret boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dice_formulas_campaign_owner_updated_idx
  on public.dice_formulas (campaign_id, owner_profile_id, updated_at desc);

alter table public.dice_formulas enable row level security;
```

Create four explicit policies. For campaign access, use:

```sql
exists (
  select 1 from public.campaigns c
  where c.id = dice_formulas.campaign_id
    and c.deleted_at is null
    and (
      c.owner_profile_id = (select auth.uid())::text
      or exists (
        select 1 from public.campaign_members cm
        where cm.campaign_id = c.id
          and cm.profile_id = (select auth.uid())::text
      )
    )
)
```

SELECT requires `owner_profile_id = (select auth.uid())`; INSERT/UPDATE WITH CHECK requires same owner plus campaign access; DELETE requires owner.

- [ ] **Step 2: Apply migration with Supabase migration tooling, not raw DDL**

Migration name:

```text
dice_formulas_personal_campaign_scope
```

- [ ] **Step 3: Verify schema/policies from `information_schema` and `pg_policies`**

Expected:

- `campaign_id` uuid;
- `owner_profile_id` uuid;
- RLS enabled;
- exactly four dice-formula policies;
- index present.

- [ ] **Step 4: Implement service mapping**

Map snake_case rows to `SavedDiceFormula`. Every read filters both:

```ts
.eq('campaign_id', campaignId)
.eq('owner_profile_id', ownerProfileId)
.order('updated_at', { ascending: false })
```

Create/update always validate items with `validateDiceFormula` before network write and set `updated_at` explicitly on update.

- [ ] **Step 5: Verify owner/campaign isolation with a transaction-safe SQL matrix**

Use existing owner/member identities from production but do not insert persistent test rows outside an explicit transaction. Expected matrix:

- owner A sees only A's formula in campaign X;
- member B sees only B's formula in X;
- neither sees the other's formula;
- same user formula in campaign Y is absent from X query.

Rollback test rows.

- [ ] **Step 6: Commit**

Commit message:

```text
feat: persist campaign dice formulas
```

---

### Task 4: Build local volatile roll session state and history drawer

**Files:**
- Create: `src/app/components/session/dice/DiceSessionContext.tsx`
- Create: `src/app/components/session/dice/DiceRollHistoryCard.tsx`
- Create: `src/app/components/session/dice/DiceRollHistoryDrawer.tsx`

**Interfaces:**
- Produces `useDiceSession()` with `rolls`, `submitLocalRoll`, `reroll`, `clearLocalHistory`, `historyOpen`, `setHistoryOpen`.
- Task 5 builder calls `submitLocalRoll`.
- Plan 2 extends the submission routing without changing consumer signatures.

- [ ] **Step 1: Define context contract**

```ts
interface DiceSessionValue {
  rolls: RollResult[];
  submitLocalRoll(request: DiceRollRequest): RollResult;
  reroll(resultId: string): RollResult | null;
  clearLocalHistory(): void;
  historyOpen: boolean;
  setHistoryOpen(open: boolean): void;
}
```

Use `useAuth()` and `useCampaign()` in provider to construct identity/campaign metadata.

- [ ] **Step 2: Implement local submission**

`submitLocalRoll` runs `rollDiceFormula`, inserts the new result exactly once, and reveals it immediately in this plan. Do not persist rolls anywhere.

- [ ] **Step 3: Implement reroll**

Store enough source formula items in `RollResult` or an immutable `source` subobject so reroll can create a new result with a new id/timestamp and same visibility/formula definition.

- [ ] **Step 4: Implement drawer semantics**

- hidden/open state is local React state;
- newest card is visually at the bottom;
- `Clear` calls only `clearLocalHistory`;
- no localStorage/sessionStorage;
- drawer remains usable when the Dadi panel itself is closed.

- [ ] **Step 5: Commit**

Commit message:

```text
feat: add volatile dice roll history
```

---

### Task 5: Build the formula builder UI

**Files:**
- Create: `src/app/components/session/dice/DiceToolbar.tsx`
- Create: `src/app/components/session/dice/DiceFormulaRow.tsx`
- Create: `src/app/components/session/dice/DiceFormulaBuilder.tsx`
- Create: `src/app/components/session/dice/SessionDicePanel.tsx`
- Create: `scripts/verify-dice-ui.mjs`

**Interfaces:**
- `DiceFormulaBuilder` owns/edit items and reports `onChange(items)`.
- `SessionDicePanel` composes builder, saved formulas, local roll submit.

- [ ] **Step 1: Write RED static UI verifier**

Read source text and assert:

- `SessionDicePanel` exists;
- toolbar constant is `[4, 6, 8, 10, 12, 20, 100]`;
- builder has `data-dice-modifier-add`;
- rows expose `data-dice-formula-row`;
- Roll, Save formula, Clear buttons have stable `data-*` hooks;
- central plus does not directly create a fixed d20/d6 row.

- [ ] **Step 2: Implement toolbar**

Click behavior:

```ts
const existingIndex = items.findIndex(i => i.kind === 'dice' && i.sides === sides);
if (existingIndex >= 0) increment that first row;
else append { kind:'dice', sides, quantity:1 };
```

Badge = sum quantity across all matching Dice rows.

- [ ] **Step 3: Implement modifier add menu**

The central `+` opens options exactly:

- Compare
- Dice
- Drop
- Exploding
- Keep
- Modifier

Insert a fully valid default row at the chosen list position/end:

- Compare: `gte`, target 1, total false;
- Dice: d20 x1;
- Drop: highest 1;
- Exploding: explode;
- Keep: highest 1;
- Modifier: add 1.

- [ ] **Step 4: Implement row editors**

Use native number inputs/select components styled with `--dash-*`. Quantity/count controls have minus/input/plus. A separate trash/minus remove control deletes the row. Compare includes a `Totale` checkbox. Exploding includes the three modes.

- [ ] **Step 5: Implement drag/drop + accessible reorder**

Use existing `react-dnd`/HTML5 backend already in dependencies. Each row has a drag handle. Also provide `Sposta su` and `Sposta giu` actions through a small row menu/button so keyboard users are not dependent on drag.

- [ ] **Step 6: Surface validation**

Call `validateDiceFormula(items)` on every render. Invalid rows show an inline palette-aware error; `Roll` and `Save formula` are disabled if invalid.

- [ ] **Step 7: Wire live compact formula**

Header displays `formatDiceFormula(items)` under editable name. `Clear` resets name to `Untitled dice formula`, items to `[]`, and current edit id to null.

- [ ] **Step 8: Wire builder Roll**

Always call `submitLocalRoll` with `visibility: 'public'`, regardless of any currently edited saved formula visibility.

- [ ] **Step 9: Run verifier**

```bash
node scripts/verify-dice-ui.mjs
```

Expected: `Dice UI verification passed.`

- [ ] **Step 10: Commit**

Commit message:

```text
feat: build dice formula editor
```

---

### Task 6: Add saved formula cards and CRUD UX

**Files:**
- Create: `src/app/components/session/dice/SavedDiceFormulaCard.tsx`
- Modify: `src/app/components/session/dice/SessionDicePanel.tsx`
- Modify: `scripts/verify-dice-ui.mjs`

**Interfaces:**
- Saved card primary click invokes roll.
- Eye toggle persists `isSecret` without rolling.
- Kebab actions: Edit, Duplicate, Delete.

- [ ] **Step 1: Extend RED verifier**

Assert stable hooks:

- `data-saved-dice-formula`;
- `data-dice-visibility-toggle`;
- menu actions for edit/duplicate/delete;
- primary roll button separate from eye/menu controls.

- [ ] **Step 2: Load formulas on campaign/user change**

Use `activeCampaign.id` and `user.id`. Clear formula list immediately when campaign changes before loading the new scope.

- [ ] **Step 3: Save formula**

If no edit id: create. If editing: update same row. Save name trimmed, items structured JSON, and persisted `isSecret` from the saved formula being edited or default false for new formula.

- [ ] **Step 4: Primary click rolls saved formula**

Use formula `isSecret` as requested visibility. In Plan 1 all results remain local, but keep the visibility field accurate because Plan 2 uses it.

- [ ] **Step 5: Eye toggle**

Prevent event propagation, persist only `isSecret`, update card optimistically, rollback on error and show a Sonner toast.

- [ ] **Step 6: Kebab actions**

- Edit loads name/items/id into builder.
- Duplicate calls service with `Copia di ${name}` and same visibility/items.
- Delete uses existing confirmation-dialog pattern and removes only that formula.

- [ ] **Step 7: Run verifiers**

```bash
node --experimental-strip-types scripts/verify-dice-engine.mts
node scripts/verify-dice-ui.mjs
npm run typecheck
```

- [ ] **Step 8: Commit**

Commit message:

```text
feat: manage saved dice formulas
```

---

### Task 7: Integrate Dadi into the session rail and repository gates

**Files:**
- Modify: `src/app/components/session/SessionRightSidebar.tsx`
- Modify: `package.json`
- Modify: `scripts/verify-dice-ui.mjs`

**Interfaces:**
- Rail `dice` entry becomes enabled.
- `DiceSessionProvider` wraps panel/history scope for the lifetime of `SessionRightSidebar`.

- [ ] **Step 1: Add dice panel width constants**

Use a separate key:

```ts
const DICE_PANEL_STORAGE_KEY = 'hollowgate.dice.panel-width';
const DICE_PANEL_DEFAULT_WIDTH = 760;
const DICE_PANEL_MIN_WIDTH = 560;
```

Use the same viewport clamping/resizer pattern already used by Notes/Schede.

- [ ] **Step 2: Enable rail item**

Change only:

```ts
{ id: 'dice', label: 'Dadi', icon: Dices, enabled: true }
```

- [ ] **Step 3: Mount provider and global drawer**

Render `DiceRollHistoryDrawer` in the provider scope so it remains available while `openPanel !== 'dice'`.

- [ ] **Step 4: Render panel**

When `openPanel === 'dice'`, render `SessionDicePanel` inside the existing `SlideOverPanel` with dice panel width and resizer.

- [ ] **Step 5: Add package scripts**

```json
"verify:dice-engine": "node --experimental-strip-types scripts/verify-dice-engine.mts",
"verify:dice-ui": "node scripts/verify-dice-ui.mjs"
```

Insert both before build in `check`.

- [ ] **Step 6: Full GREEN gate**

Run:

```bash
npm ci
npm audit --audit-level=high
npm run check
```

Expected: zero command failures; existing note/campaign verifiers remain green.

- [ ] **Step 7: Production smoke checklist for Plan 1**

Verify manually:

1. Dadi rail opens/closes and resizes.
2. d4..d100 order and badges.
3. Complex formula matches compact syntax.
4. Reordering changes formula/result semantics.
5. Builder Roll creates local history card.
6. Save/reload retains formula only in current campaign/user.
7. Eye toggle does not roll.
8. Edit/Duplicate/Delete work.
9. History Clear is local and volatile across page refresh.

- [ ] **Step 8: Commit**

Commit message:

```text
feat: enable campaign dice builder
```

---

## Plan 1 Completion Gate

Plan 1 is complete only when:

- engine verifier passes;
- UI verifier passes;
- production dice_formulas migration and RLS matrix are verified;
- `npm audit --audit-level=high` passes;
- full `npm run check` passes;
- CI and Vercel succeed on the exact final SHA;
- manual single-client smoke checklist passes.

At that point Hollowgate already has a fully usable local dice builder and saved formulas. Realtime multiplayer behavior is added only by Plan 2.