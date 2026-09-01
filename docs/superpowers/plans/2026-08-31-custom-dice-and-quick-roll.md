# Custom Dice and Quick Roll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add map-first Quick Roll and campaign-scoped Custom Dice with symbolic/image faces, optional numeric semantics, shared formula-library organization, realtime/history support, and deterministic custom 3D visualization.

**Architecture:** Keep the existing dice engine as the canonical source of random outcomes and make 3D a projection-only layer. Persist custom-die definitions separately from formulas, resolve them into immutable roll-time snapshots before rolling, extend the existing mixed library from two to three node types, and move map Quick Roll/history controls into a dedicated floating surface that never changes history visibility as a side effect of rolling.

**Tech Stack:** React, TypeScript, Tailwind, Supabase PostgreSQL/RLS/Storage, Supabase Realtime/Edge Functions, `@3d-dice/dice-box-threejs` 0.0.12, existing Node verification scripts.

**Spec:** `docs/superpowers/specs/2026-08-31-custom-dice-and-quick-roll-design.md`

## Global Constraints

- Supported custom geometries are exactly d4, d6, d8, d10, d12, d20, d100.
- A custom d100 has two 10-face physical definitions and displays both landed symbols.
- Quantity belongs to a roll/formula, never to the saved custom-die definition.
- Purely symbolic custom dice are valid; numeric operators are rejected unless every relevant face has numeric metadata.
- Existing formulas, standard dice, saved folders, public/secret transport, and reroll behavior remain backward compatible.
- Quick Roll is transient local state and clears after a successful roll.
- Roll completion never opens history. Opening/closing history is exclusively user-controlled.
- Uploaded face images are square-normalized before upload and stored as generated asset paths, never local file paths.
- The canonical roll result is determined before 3D animation. 3D failure may only degrade presentation.
- Do not introduce advanced fire/ice/stone/glow shaders in this release; body color and symbol color are sufficient.
- Do not create any Git branch or Vercel Preview deployment.
- During implementation use local/synthetic RED-GREEN checks and unreferenced Git objects only. Move `main` exactly once after all checks pass.
- The final integration commit must include this plan, the approved spec, migrations, tests, and implementation in one clean commit whose parent is the then-current `main`.

---

### Task 1: Custom-die contracts, validation model, and permanent RED verifier

**Files:**
- Modify: `src/app/components/session/dice/diceTypes.ts`
- Create: `src/app/components/session/dice/diceCustomDie.ts`
- Modify: `src/app/components/session/dice/diceFormulaValidation.ts`
- Modify: `src/app/components/session/dice/diceFormulaText.ts`
- Create: `scripts/verify-custom-dice-quick-roll.mts`
- Modify: `package.json`

**Interfaces:**
- Produces `CustomDieSides = 4 | 6 | 8 | 10 | 12 | 20 | 100`.
- Produces `CustomDieFaceVisual = { kind: 'icon'; iconName: string } | { kind: 'image'; assetPath: string; publicUrl: string }`.
- Produces `CustomDieFace`, `SavedCustomDie`, `CustomDieRollSnapshot` and `ResolvedCustomDieFormulaItem`.
- Extends persisted `DiceFormulaItem` with `{ id; kind: 'custom-die'; customDieId; quantity }` only; saved formulas do not embed a mutable definition.
- Extends roll-time request items through `ResolvedDiceFormulaItem`, where a custom item contains an immutable `customDie` snapshot. `DiceRollRequest.items` uses resolved items; saved formula storage continues using `DiceFormulaItem[]`.
- Extends `DiceLibraryNodeType` to `'formula' | 'custom-die' | 'folder'`.
- Extends `RollDie` with optional `customFace`, `customDieId`, `physicalRole`, and `logicalRollIndex`; contribution becomes `number | null`.
- Extends `RollDiceGroup.contribution` and `RollResult.total` to `number | null`.

- [ ] **Step 1: Write the failing verifier before implementation**

Add assertions to `scripts/verify-custom-dice-quick-roll.mts` that import the future helper and require exact geometry/face rules:

```ts
import assert from 'node:assert/strict';
import {
  expectedCustomDieFaceCount,
  isCustomDieFullyNumeric,
  validateCustomDieDefinition,
} from '../src/app/components/session/dice/diceCustomDie.ts';

assert.equal(expectedCustomDieFaceCount(4), 4);
assert.equal(expectedCustomDieFaceCount(20), 20);
assert.equal(expectedCustomDieFaceCount(100), 20);

const symbolicD6 = {
  id: 'custom-d6', campaignId: 'c', ownerProfileId: 'u', name: 'Ferite', sides: 6 as const,
  faces: Array.from({ length: 6 }, (_, index) => ({
    index: index + 1,
    role: 'single' as const,
    visual: { kind: 'icon' as const, iconName: 'Skull' },
    label: `Faccia ${index + 1}`,
    numericValue: null,
  })),
  bodyColor: '#20242f', symbolColor: '#ffffff', iconName: null,
  folderId: null, sortOrder: 0, createdAt: '', updatedAt: '',
};
assert.equal(validateCustomDieDefinition(symbolicD6).valid, true);
assert.equal(isCustomDieFullyNumeric(symbolicD6), false);
assert.equal(validateCustomDieDefinition({ ...symbolicD6, faces: symbolicD6.faces.slice(0, 5) }).valid, false);
```

The verifier must also statically assert that `DiceLibraryNodeType` contains `custom-die`, formula text formats custom items by name when resolved, and `package.json` includes `verify:custom-dice-quick-roll` inside `npm run check`.

- [ ] **Step 2: Run the verifier and confirm RED**

Run:

```bash
node --experimental-strip-types scripts/verify-custom-dice-quick-roll.mts
```

Expected: FAIL because `diceCustomDie.ts` and the new custom-die contracts do not exist.

- [ ] **Step 3: Add the minimal type model and definition helper**

Implement in `diceCustomDie.ts`:

```ts
export const CUSTOM_DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
export function expectedCustomDieFaceCount(sides: CustomDieSides) {
  return sides === 100 ? 20 : sides;
}
export function validateCustomDieDefinition(die: Pick<SavedCustomDie, 'sides' | 'faces' | 'name'>): {
  valid: boolean;
  issues: string[];
};
export function isCustomDieFullyNumeric(die: Pick<SavedCustomDie, 'faces'>): boolean;
export function getCustomDieFace(die: CustomDieRollSnapshot, role: 'single' | 'tens' | 'units', physicalIndex: number): CustomDieFace;
```

Rules: indices must be unique and consecutive inside each physical die, d100 requires 10 `tens` plus 10 `units`, every visual requires a nonblank icon name or asset path/public URL, labels are optional, numeric values are either null or finite numbers.

- [ ] **Step 4: Extend formula validation/text without changing standard behavior**

`validateDiceFormula()` accepts persisted or resolved items. A symbolic custom-die item establishes an active dice group but not a numeric total. `keep`, `drop`, `exploding`, per-die compare, per-die arithmetic, and total arithmetic that depend on that symbolic group return explicit Italian issues such as `Il dado custom “Ferite” non ha valori numerici su tutte le facce.` A resolved fully-numeric custom die behaves as a numeric group. Unresolved `custom-die` returns `Dado custom non disponibile: <id>.`

`formatDiceFormula()` formats resolved custom items as `3×[Ferite]` and unresolved saved items as `3×[custom:<id>]`; standard tokens stay byte-for-byte compatible.

- [ ] **Step 5: Run targeted verifier and existing engine verifier**

Run:

```bash
node --experimental-strip-types scripts/verify-custom-dice-quick-roll.mts
npm run verify:dice-engine
```

Expected: PASS for the new contract assertions and no regression in standard engine tests.

---

### Task 2: Supabase custom-die persistence, Storage, and three-node library RPCs

**Files:**
- Create: `supabase/migrations/20260831203000_custom_dice_and_library_nodes.sql`
- Create: `src/services/supabase/diceCustomDiceService.ts`
- Create: `src/services/supabase/diceFaceAssetService.ts`
- Modify: `src/services/supabase/diceFormulaFoldersService.ts`
- Modify: `scripts/verify-dice-formula-library-tree.mjs`
- Modify: `scripts/verify-custom-dice-quick-roll.mts`

**Interfaces:**
- Produces CRUD: `loadCustomDice(campaignId, ownerProfileId)`, `createCustomDie(input)`, `updateCustomDie(id, patch)`, `deleteCustomDie(id)`, `duplicateCustomDie(input)`.
- Produces image helpers: `normalizeDiceFaceImage(file): Promise<Blob>`, `uploadDiceFaceAsset({ campaignId, ownerProfileId, customDieId, file }): Promise<{ assetPath; publicUrl }>`, `removeDiceFaceAsset(assetPath)`.
- Existing `moveDiceLibraryNode(nodeType, id, folderId, index)` accepts `custom-die` without changing its signature.

- [ ] **Step 1: Extend the verifier first**

Require the migration to define `public.dice_custom_dice`, `faces jsonb`, supported-sides check, owner/campaign RLS, folder FK, sort trigger, `custom-die` branches in `next_dice_library_sort_order`, `normalize_dice_library_level`, `move_dice_library_node`, and non-destructive folder deletion. Require creation of bucket `dice-face-assets` and owner-scoped storage insert/update/delete policies.

- [ ] **Step 2: Run verifier and confirm RED**

```bash
node --experimental-strip-types scripts/verify-custom-dice-quick-roll.mts
node scripts/verify-dice-formula-library-tree.mjs
```

Expected: FAIL because the table/service/RPC extension do not exist.

- [ ] **Step 3: Write the migration**

Create a table with columns:

```sql
id uuid primary key default gen_random_uuid(),
campaign_id uuid not null references public.campaigns(id) on delete cascade,
owner_profile_id uuid not null references public.profiles(id) on delete cascade,
name text not null,
sides integer not null check (sides in (4,6,8,10,12,20,100)),
faces jsonb not null,
body_color text not null default '#20242f',
symbol_color text not null default '#ffffff',
icon_name text,
folder_id uuid references public.dice_formula_folders(id) on delete cascade,
sort_order integer not null default -1,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
```

Add a trigger validator that rejects blank names, invalid face counts/roles/indices, non-object visuals, non-finite/non-number JSON numeric values, and folder assignments from another owner/campaign. Match existing formula ownership policies. Extend mixed ordering functions so the order domain is formulas + custom dice + folders. Preserve the public RPC signatures; `move_dice_library_node()` gains `elsif p_node_type = 'custom-die'`. `delete_dice_formula_folder(..., false)` promotes direct custom-die children with formulas/folders. Keep structural RPCs `SECURITY DEFINER` with explicit `auth.uid()` ownership checks.

Create Storage bucket `dice-face-assets` as public for V1 display durability, with a 1 MB object limit and allowed MIME `image/webp`. Storage write/delete policies require `(storage.foldername(name))[1]` to equal an accessible campaign and `[2] = auth.uid()::text`; public bucket reads are URL-based. Object paths are random and never derive from original filenames.

- [ ] **Step 4: Implement Supabase services and browser normalization**

Normalize source images by decoding with `createImageBitmap`, center-cropping to square, drawing at 512×512 to an offscreen/DOM canvas, and `canvas.toBlob('image/webp', 0.88)`. Reject non-image MIME and source files over 8 MB. Upload path:

```ts
`${campaignId}/${ownerProfileId}/${customDieId}/${crypto.randomUUID()}.webp`
```

Create/update service maps snake_case rows to `SavedCustomDie`. Custom-die creation always writes `sort_order: -1` so the DB append trigger decides order.

- [ ] **Step 5: Apply migration to production Supabase and run security checks**

Apply the exact repository migration through the connected Supabase project. Then query catalog metadata to verify RLS, functions, bucket, policies, and security-definer flags. Run a transaction using an authorized test identity to create two temporary folders plus one custom die, move it into/out of a folder, non-destructively delete a folder and verify promotion, then roll back. Do not expose UUIDs in user-facing output.

- [ ] **Step 6: Re-run the two targeted verifiers**

Expected: PASS.

---

### Task 3: Canonical custom-die rolling and formula resolution

**Files:**
- Modify: `src/app/components/session/dice/diceEngine.ts`
- Modify: `src/app/components/session/dice/diceTypes.ts`
- Modify: `src/app/components/session/dice/diceFormulaValidation.ts`
- Modify: `src/app/components/session/dice/diceResultSummary.ts`
- Modify: `scripts/verify-dice-engine.mts`
- Modify: `scripts/verify-custom-dice-quick-roll.mts`

**Interfaces:**
- Produces `resolveDiceFormulaItems(items, customDice): ResolvedDiceFormulaItem[]` in `diceCustomDie.ts`.
- `RollDie.customFace` contains immutable `{ index, role, visual, label, numericValue }` copied from the definition at roll time.
- `RollDiceGroup.contribution` and `RollResult.total` are null when the aggregate is undefined.
- d100 custom group contains two physical `RollDie`s per requested logical die, linked by equal `logicalRollIndex` and roles `tens`/`units`.

- [ ] **Step 1: Add deterministic failing engine tests**

Use queued RNG to require:

```ts
// 5 symbolic custom d6 results preserve all five physical faces.
assert.deepEqual(
  rollCustom(symbolicD6, 5, [1, 1, 2, 3, 4]).diceGroups[0].rolls.map(r => r.customFace?.label),
  ['Skull', 'Skull', 'Shield', 'Sword', 'Heart'],
);
assert.equal(rollCustom(symbolicD6, 1, [1]).total, null);

// custom d100 consumes two physical d10 RNG values for each logical die.
const d100 = rollCustom(customD100, 1, [4, 7]);
assert.deepEqual(d100.diceGroups[0].rolls.map(r => r.physicalRole), ['tens', 'units']);
```

Also require fully numeric custom d6 arithmetic/keep to work and symbolic d6 + modifier to fail validation before RNG runs.

- [ ] **Step 2: Run engine tests and confirm RED**

```bash
npm run verify:dice-engine
```

Expected: FAIL on custom-die cases.

- [ ] **Step 3: Implement custom group generation**

For non-d100, physical face index is `rng(sides)`. Copy face metadata; contribution is `numericValue` or null. For d100, each logical die consumes `rng(10)` for tens then units, creating two physical results; numeric contribution for the logical pair uses configured values only when both are numeric. Preserve both symbol records. The group helper must distinguish physical records from logical aggregate contribution so two symbols do not accidentally count as two percentile rolls.

Use a nullable-total accumulator: standard dice remain numeric; a symbolic active contribution makes the aggregate `null`. Any operator already rejected by validation must still guard at runtime and throw `DiceRollError` instead of treating null as zero.

Exploding custom dice are permitted only for fully numeric definitions. Trigger when the landed face has the maximum configured numeric value for that physical role; ties all count as maximum. d100 custom explosion is rejected in this first release because the trigger would span a pair and is not defined by the approved product behavior.

- [ ] **Step 4: Preserve immutable reroll source snapshots**

`RollResult.sourceItems` must contain resolved items with copied `customDie` snapshots. A saved formula still persists only `customDieId`; before `submitLocalRoll`, `SessionDicePanel`/Quick Roll resolve IDs against the current loaded custom-die library. A deleted referenced die produces a clear validation/resolve error. Reroll uses the immutable snapshot from `RollResult.sourceItems`, so it reproduces the same die definition even if the saved definition later changes.

- [ ] **Step 5: Update result formatting**

`formatPrimaryRollResult()` returns a numeric string for `total !== null`; for purely symbolic results it returns an empty/null presentation token consumed by the history card instead of `0`. Existing Keep numeric formatting remains unchanged.

- [ ] **Step 6: Run engine and custom verifier**

Expected: PASS.

---

### Task 4: Custom-die configurator and shared formula-library node

**Files:**
- Create: `src/app/components/session/dice/CustomDieConfigurator.tsx`
- Create: `src/app/components/session/dice/CustomDieFaceEditor.tsx`
- Create: `src/app/components/session/dice/CustomDieFaceVisualPicker.tsx`
- Create: `src/app/components/session/dice/SavedCustomDieCard.tsx`
- Create: `src/app/components/session/dice/CustomDieSelector.tsx`
- Modify: `src/app/components/session/dice/DiceToolbar.tsx`
- Modify: `src/app/components/session/dice/DiceTypeIcon.tsx`
- Modify: `src/app/components/session/dice/DiceFormulaBuilder.tsx`
- Modify: `src/app/components/session/dice/DiceFormulaRow.tsx`
- Modify: `src/app/components/session/dice/diceFormulaLibrary.ts`
- Modify: `src/app/components/session/dice/DiceFormulaLibraryTree.tsx`
- Modify: `src/app/components/session/dice/SessionDicePanel.tsx`
- Modify: `scripts/verify-dice-ui.mjs`
- Modify: `scripts/verify-dice-formula-library-tree.mjs`
- Modify: `scripts/verify-custom-dice-quick-roll.mts`

**Interfaces:**
- `DiceToolbar` gets `customDice` and `onAddCustomDie(customDie)`; custom `?` button follows d100.
- `CustomDieSelector` consumes `SavedCustomDie[]` and returns one chosen definition.
- `CustomDieConfigurator` supports create/edit and returns a saved `SavedCustomDie` after successful persistence.
- `getDiceLibraryNodes(formulas, customDice, folders, parentId)` returns all three kinds.
- `applyDiceLibraryMove(formulas, customDice, folders, ...)` returns all three arrays.

- [ ] **Step 1: Extend static UI/library verifiers first**

Require stable hooks: `data-dice-custom-toolbar`, `data-custom-die-configurator`, `data-custom-die-face`, `data-custom-die-upload`, `data-saved-custom-die`, `data-custom-die-selector`. Assert custom button occurs after the d100 mapping and uses a die outline with `?`, not a plain text button. Assert library helper contains a `custom-die` node and move rollback includes `setCustomDice(previousCustomDice)`.

- [ ] **Step 2: Run UI/library verifiers and confirm RED**

Expected: FAIL.

- [ ] **Step 3: Build configurator**

The configurator is inside the existing Dice panel, not a new app route. It has name, geometry selector, appearance controls, and one face editor per physical face. Changing geometry regenerates the required empty face slots only after confirmation if existing configured faces would be lost. d100 displays two labelled groups `Decine` and `Unità`, ten faces each.

Each face editor allows exactly one visual source. `Icone Hollowgate` opens the existing `NoteIconGrid`; `Carica immagine` normalizes/uploads a file and stores the returned asset data. A nullable numeric input and optional label sit beside the visual. Save is disabled until `validateCustomDieDefinition` passes. Keep the local draft after save failure.

- [ ] **Step 4: Integrate custom nodes into the existing tree**

`SavedCustomDieCard` mirrors the formula card interaction model: direct click rolls exactly one die; menu has Modifica, Duplica, Icona, Elimina. It has no permanent secret/public toggle because visibility belongs to the roll; direct library click is public, while a saved formula may remain secret as today. Custom nodes participate in drag ghost, before/after/inside/root ordering and folder deletion.

`SessionDicePanel.loadLibrary()` becomes one `Promise.all` for formulas, custom dice, folders. Folder direct-content count includes custom dice. Structural optimistic move and rollback include the custom array.

- [ ] **Step 5: Integrate custom die in formula builder**

The `?` toolbar button opens `CustomDieSelector`. Choosing a die appends or increments `{ kind:'custom-die', customDieId, quantity }`. `DiceFormulaRow` renders quantity plus custom-die name/geometry and lets the user choose another custom die. Formula save persists IDs only. Formula run/edit resolves IDs using the loaded custom-die library.

- [ ] **Step 6: Run UI, library, custom and type checks**

```bash
npm run typecheck
npm run verify:dice-ui
npm run verify:dice-formula-library-tree
node --experimental-strip-types scripts/verify-custom-dice-quick-roll.mts
```

Expected: PASS.

---

### Task 5: Map-first Quick Roll and user-controlled history/unread state

**Files:**
- Create: `src/app/components/session/dice/DiceQuickRollFloating.tsx`
- Create: `src/app/components/session/dice/diceQuickRollState.ts`
- Modify: `src/app/components/session/dice/DiceSessionContext.tsx`
- Modify: `src/app/components/session/dice/DiceRollHistoryDrawer.tsx`
- Modify: `src/app/components/session/SessionRightSidebar.tsx`
- Modify: `scripts/verify-dice-ui.mjs`
- Modify: `scripts/verify-dice-realtime.mjs`
- Modify: `scripts/verify-custom-dice-quick-roll.mts`

**Interfaces:**
- `diceQuickRollState.ts` exports pure `addStandardQuickDie`, `addCustomQuickDie`, `clearQuickRoll`, `buildQuickRollItems` for deterministic testing.
- `DiceSessionValue` adds `historyUnread: boolean`, `openHistory()`, `closeHistory()`, `markHistoryRead()` while retaining `setHistoryOpen` only if other callers still require it.
- `DiceQuickRollFloating` consumes the custom-die library for the current campaign/user and submits through `submitLocalRoll`.

- [ ] **Step 1: Write pure Quick Roll state tests and static history tests**

Require repeated d6 clicks to produce quantity 5, mixed standard types to stay distinct, repeated same custom ID to increment, different custom IDs to remain separate, clear to return empty state, and successful roll handler source to clear only after `submitLocalRoll` returns.

Static session assertions must reject `setHistoryOpen(true)` inside `revealRoll`, require unread setting when reveal occurs while closed, and require opening history to clear unread.

- [ ] **Step 2: Run and confirm RED**

Expected: FAIL.

- [ ] **Step 3: Decouple reveal from history visibility**

`revealRoll(resultId)` only marks revealed and sets unread if `historyOpenRef.current` is false. `openHistory()` sets open true + unread false. `closeHistory()` only sets open false. Campaign change resets entries, unread and history to closed. Animation completion, local/remote ingest and reroll never call openHistory.

Use a ref synchronized with `historyOpen` to avoid stale callback closure during realtime/animation completion.

- [ ] **Step 4: Build the floating Quick Roll UI**

Always render a purple dice button at the current bottom-left map position. Clicking it toggles the vertical palette above it, not history. Palette order is d4,d6,d8,d10,d12,d20,d100,custom `?`; each selected type shows a numeric badge. Footer is `X`, `Tira`, eye public/secret. Use existing `DiceTypeIcon`; custom uses a new `CustomDiceQuestionIcon` built from the same visual language.

A separate compact chevron immediately beside the purple die button controls history. Down when closed, up when open. `historyUnread` renders a small accent dot only while closed. The floating controls stay visible when the history drawer is open.

Quick Roll uses formula name `Tiro rapido` but remains unsaved (`formulaId` omitted). After a successful submit, clear the pool. On thrown validation/submit error, preserve pool and toast the message.

- [ ] **Step 5: Make history drawer drawer-only**

Remove its closed-state purple dice replacement. Render the drawer only when `historyOpen`; keep its current scrollbar, cards, Pulisci and 3D toggle. Its X calls `closeHistory()`.

- [ ] **Step 6: Run targeted checks**

Expected: PASS for custom, UI and realtime verifiers.

---

### Task 6: Custom face history, realtime payloads, and secret relay

**Files:**
- Create: `src/app/components/session/dice/CustomDieFaceResult.tsx`
- Modify: `src/app/components/session/dice/DiceRollHistoryCard.tsx`
- Modify: `src/app/components/session/dice/diceResultSummary.ts`
- Modify: `src/services/realtime/diceRealtime.ts`
- Modify: `supabase/functions/dice-secret-roll/index.ts`
- Modify: `scripts/verify-dice-realtime.mjs`
- Modify: `scripts/verify-dice-ui.mjs`
- Modify: `scripts/verify-custom-dice-quick-roll.mts`

**Interfaces:**
- `CustomDieFaceResult` renders `NoteIconGlyph` for icon faces, `<img>` for image faces, and label/placeholder fallback if artwork is unavailable.
- Realtime validator accepts old numeric payloads unchanged plus nullable totals/contributions and optional custom metadata.

- [ ] **Step 1: Add failing transport/history assertions**

Construct a valid symbolic `RollResult` with `total:null`, `contribution:null`, custom face metadata, and ensure `isRollResultPayload` accepts it; malformed custom visuals must be rejected. Existing standard fixture must continue to pass. Mirror exact constraints in the Edge Function source verifier.

- [ ] **Step 2: Run realtime verifier and confirm RED**

Expected: FAIL.

- [ ] **Step 3: Update client and Edge Function validators symmetrically**

Allow `total === null` or finite number; same for group/die contribution. Validate optional custom fields only if present: IDs/nonblank strings, role enum, positive face index, visual discriminant, numericValue null/finite. Preserve all current campaign, JWT and visibility checks in the secret relay.

- [ ] **Step 4: Render symbols as primary results**

History cards render every custom physical result in recorded order. d100 naturally renders its two records together by `logicalRollIndex`. Standard dice keep existing numeric chips. Pure symbolic result does not render a fake primary `0`; instead show a compact `Risultato` line containing the symbols. If the roll has a defined numeric total, show it as today in addition to symbols.

An `<img onError>` face falls back to label or a `?` placeholder without altering roll data.

- [ ] **Step 5: Deploy updated `dice-secret-roll` Edge Function only after source verification**

Use the connected Supabase action to update the existing function. Then run a non-destructive authenticated invocation/validation check if the connector supports it; otherwise introspect the deployed source/version and rely on local verifier plus existing authorization structure.

- [ ] **Step 6: Run realtime/UI/custom verifiers**

Expected: PASS.

---

### Task 7: Deterministic custom 3D face materials

**Files:**
- Create: `src/app/components/session/dice/dice3dCustomMaterials.ts`
- Modify: `src/app/components/session/dice/dice3dProjection.ts`
- Modify: `src/app/components/session/dice/dice3dTypes.ts`
- Modify: `src/app/components/session/dice/dice3dRenderer.ts`
- Modify: `src/app/components/session/shared/tiptapIconData.ts` only through existing generator if required; do not hand-edit generated data
- Modify: `scripts/verify-dice-3d.mts`
- Modify: `scripts/verify-custom-dice-quick-roll.mts`

**Interfaces:**
- `Dice3DProjectionChunk` gains optional `customMaterial` describing the immutable custom definition/physical role for each projected die.
- `dice3dCustomMaterials.ts` exports `buildCustomFaceLabels(snapshot, role)` and `installCustomDiceMaterialAdapter(box, queue)`.
- Renderer still makes exactly one `box.roll(combinedForcedNotation)` call per canonical result.

- [ ] **Step 1: Write projection/material RED tests**

Require custom d6 canonical faces `[2,5]` to project forced values `[2,5]` and carry two matching custom material queue entries. Require one custom d100 logical result to project a d100 tens chunk plus d10 units chunk with independent custom role labels. Require standard projection output to remain unchanged.

Also statically require renderer customization to be wrapped in `try/catch` and fall back to standard materials while still executing the canonical forced roll.

- [ ] **Step 2: Run 3D verifier and confirm RED**

```bash
npm run verify:dice-3d
```

Expected: FAIL on custom metadata/material assertions.

- [ ] **Step 3: Build icon/image label sources**

For Hollowgate icons, serialize the existing `ICON_DATA` primitives into a small SVG data URL using the configured symbol color. For uploaded images, use their durable public URL. `buildCustomFaceLabels` generates exactly the label ordering expected by dice-box; handle the library's special d4 face layout inside this module, not in the engine.

- [ ] **Step 4: Isolate the dice-box adapter**

The installed package exports DiceBox but internally exposes `box.DiceFactory`. Wrap/patch only the instance's `DiceFactory.create(type)` for the duration of a play. For each physical create call, pop the corresponding queued custom material descriptor after notation grouping, let the factory create standard geometry/physics, then replace mesh materials using its existing `createMaterials` machinery and a preset-like object containing the custom labels/body/symbol colors. Standard queue entries pass through untouched. Restore the original factory method in `finally`.

Do not import private package files by filesystem path. If the runtime object lacks the expected factory methods, throw a presentation-only adapter error so `DiceSessionContext` reveals the already-canonical result normally.

- [ ] **Step 5: Keep combined forced notation ordering deterministic**

Update `buildSimultaneousDice3DNotation`/projection metadata so grouping by side also reorders the material queue in the exact same order as forced values. Mixed ordinary d10 + custom d100 units must not shift results. Add an explicit regression fixture.

- [ ] **Step 6: Run 3D, engine and type checks**

Expected: PASS. Standard existing 3D fixtures must remain identical.

---

### Task 8: Full regression, Supabase verification, single main integration, CI and Production

**Files:**
- Modify as needed only to fix failures found by verification.
- Final tree includes `docs/superpowers/specs/2026-08-31-custom-dice-and-quick-roll-design.md` and `docs/superpowers/plans/2026-08-31-custom-dice-and-quick-roll.md`.

**Interfaces:**
- No new product behavior. This task proves the previous seven tasks satisfy the spec and integrates them exactly once.

- [ ] **Step 1: Run all targeted dice verifiers from the final candidate tree**

```bash
npm run verify:dice-engine
npm run verify:dice-ui
npm run verify:dice-realtime
npm run verify:dice-3d
npm run verify:dice-formula-library-tree
node --experimental-strip-types scripts/verify-custom-dice-quick-roll.mts
```

Expected: all PASS.

- [ ] **Step 2: Run the mandatory full verification**

```bash
npm run check
```

Expected: exit code 0, including typecheck, every existing verifier and Vite production build.

- [ ] **Step 3: Verify production Supabase state against repository migration**

Confirm `dice_custom_dice`, RLS policies, storage bucket/policies, the generalized library RPCs, and deployed secret-roll function are present. Repeat transactional create/move/promote/delete custom-node test and roll it back. Confirm no temporary rows/assets remain.

- [ ] **Step 4: Self-review final diff against the approved spec**

Check: no advanced shader scope creep; no unrelated refactors; no accidental branch references; no `tmp-never-use` operation; no preview configuration; existing formula rows remain backward compatible; custom formula persistence stores IDs rather than mutable definitions; roll-time source snapshot is immutable.

- [ ] **Step 5: Build one final Git tree and commit without moving any ref yet**

Create blobs for every changed/new file, create one tree based on the current `main` tree, then one commit with message:

```text
feat: add custom dice and quick roll
```

Its parent must be the exact current `main` SHA. Compare base→candidate and verify the file list is only the intended scope.

- [ ] **Step 6: Move `refs/heads/main` exactly once**

Only after Steps 1–5 are green, update `main` to the final commit. Do not create or update any other branch.

- [ ] **Step 7: Verify GitHub Actions on the exact final SHA**

Wait for the main workflow. Fetch run/jobs/logs and require `npm run check` and the job conclusion to be `success` for the exact final SHA.

- [ ] **Step 8: Verify Vercel Production on the exact same SHA**

Use the Vercel Production status surfaced through the connected deployment/status integration. Require `success`/deployment completed on the exact final SHA. Do not trigger or inspect a Preview deployment as a substitute.

- [ ] **Step 9: Report completion**

Tell the user the final SHA, CI success and Production success, then ask them to use Ctrl+F5 and test: Quick Roll quantities/mixed pool/secret toggle; history staying closed with unread dot; custom d6 with icon faces; uploaded image face; 5× custom d6 symbol sequence; custom d100 two-symbol result; saved custom die drag/drop and edit; custom die inside a saved formula.
