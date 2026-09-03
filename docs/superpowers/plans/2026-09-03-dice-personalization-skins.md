# Dice Personalization and Skins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-user, per-campaign visual customization for standard dice and shared skin support for standard/custom dice across quick roll, chat, realtime snapshots, and 3D rendering.

**Architecture:** Introduce a single `DiceAppearance` domain model and shared skin catalog. Persist standard-die styles in a dedicated Supabase table, extend custom-die rows with skin/effects, attach immutable appearance snapshots to `RollResult`, and evolve the current 3D custom-material adapter into a unified per-die appearance adapter while preserving all existing d4 fixes.

**Tech Stack:** React, TypeScript, Tailwind, Supabase, `@3d-dice/dice-box-threejs` 0.0.12, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-03-dice-personalization-skins-design.md`

## Global Constraints

- Work directly on `main` because the user explicitly approved that workflow.
- Exactly one final implementation commit for the effective feature changes; planning/spec commits are process artifacts.
- Do not update dependencies.
- Preserve all existing custom d4 animation, forced-result, and sharp-text fixes.
- Uploaded custom-face images must never be tinted by `symbolColor` or skin overlays.
- Standard style is scoped by `(campaign_id, owner_profile_id, sides)`.
- Initial skin IDs: `none`, `fire`, `ice`, `lightning`, `poison`, `stone`, `metal`, `obsidian`, `arcane`.
- Skin color and user-selected `bodyColor`/`symbolColor` must combine rather than replace one another.
- Animated effects are optional per die and are disabled under `prefers-reduced-motion` or when global 3D animation is disabled.
- A 3D appearance/effect failure must degrade to a safe static/default material without changing RNG or the canonical roll result.
- Realtime consumers render the sender's snapshot; they never fetch the recipient's local standard-die preferences for historical/remote rolls.
- `npm run check` is mandatory when locally executable. CI may still stop at the known pre-existing high-severity browserslist audit before `npm run check`; do not alter dependencies as part of this feature.

---

### Task 1: Domain types, defaults, skin catalog, and pure snapshot helpers

**Files:**
- Modify: `src/app/components/session/dice/diceTypes.ts`
- Create: `src/app/components/session/dice/diceSkins.ts`
- Create: `src/app/components/session/dice/diceAppearance.ts`
- Create: `scripts/verify-dice-appearance.mts`
- Modify: `package.json`

**Interfaces:**
- Produces `DiceSkinId`, `DiceAppearance`, `StandardDieAppearance`, `DICE_SKINS`, `DEFAULT_DICE_APPEARANCE`, `buildDefaultStandardDiceStyles()`, `isDiceSkinId()`, `attachDiceAppearanceSnapshots()`.
- `RollDiceGroup.appearance?: DiceAppearance` becomes the immutable standard-die appearance snapshot carried in roll results.
- `SavedCustomDie` and `CustomDieRollSnapshot` gain `skinId` and `effectsEnabled`.

- [ ] **Step 1: Write the failing verification**

Create `scripts/verify-dice-appearance.mts` to assert that all seven standard sides receive defaults, all nine skin IDs validate, unknown skin IDs fail, standard groups receive snapshots without mutating the source result, custom groups are not overwritten, and d100 uses one logical appearance source.

- [ ] **Step 2: Run RED verification**

Run `node --experimental-strip-types scripts/verify-dice-appearance.mts` and confirm it fails because appearance helpers/types do not exist yet.

- [ ] **Step 3: Implement the domain layer**

Add the approved types to `diceTypes.ts`. In `diceSkins.ts`, export the nine-entry catalog with localized labels and deterministic visual metadata. In `diceAppearance.ts`, centralize defaults and pure cloning/snapshot helpers.

- [ ] **Step 4: Run GREEN verification**

Run `node --experimental-strip-types scripts/verify-dice-appearance.mts` and confirm PASS.

- [ ] **Step 5: Wire the permanent verification**

Add `verify:dice-appearance` to `package.json` and include it in `npm run check` after `verify:dice-engine`.

### Task 2: Database migration and persistence services

**Files:**
- Create: `supabase/migrations/20260903090000_dice_standard_styles_and_custom_skins.sql`
- Create: `src/services/supabase/diceStandardStyleService.ts`
- Modify: `src/services/supabase/diceCustomDiceService.ts`
- Create: `scripts/verify-dice-appearance-persistence.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `loadStandardDiceStyles(campaignId, ownerProfileId)` and `saveStandardDiceStyles(campaignId, ownerProfileId, styles)`.
- Extends custom-die create/update/duplicate mapping with `skinId` and `effectsEnabled`.

- [ ] **Step 1: Write RED persistence verification**

Assert migration text contains the `dice_standard_styles` composite primary key, supported-side check, skin allowlist, RLS policies, and new custom-die columns; assert service mapping contains all four appearance fields.

- [ ] **Step 2: Run RED verification**

Run `node scripts/verify-dice-appearance-persistence.mjs`; expect failure because migration/service do not exist.

- [ ] **Step 3: Implement migration**

Create `dice_standard_styles` with owner/campaign-scoped RLS mirroring the existing custom-die campaign membership rules. Add `skin_id` and `effects_enabled` to `dice_custom_dice`, safe defaults, and skin allowlist checks.

- [ ] **Step 4: Implement services**

Map DB rows to `StandardDieAppearance[]`, return only stored rows (default completion remains a domain/context concern), and batch-upsert seven styles. Extend custom-die service mapping/create/update/duplicate.

- [ ] **Step 5: Run GREEN verification**

Run `node scripts/verify-dice-appearance-persistence.mjs`; confirm PASS and add it to `npm run check`.

### Task 3: Campaign-scoped React appearance context

**Files:**
- Create: `src/app/components/session/dice/DiceAppearanceContext.tsx`
- Modify: `src/app/components/session/SessionRightSidebar.tsx`
- Create: `scripts/verify-dice-appearance-context.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `DiceAppearanceProvider`, `useDiceAppearance()`, `getStandardAppearance(sides)`, `saveStyles(styles)` and `isLoading`.
- Provider wraps the existing dice session subtree so quick roll, history, panel and 3D session logic share one loaded style map.

- [ ] **Step 1: Write RED context verification**

Check provider reads `useAuth()` and `useCampaign()`, reloads on user/campaign change, completes missing rows from `buildDefaultStandardDiceStyles()`, and exposes seven immutable style entries.

- [ ] **Step 2: Run RED verification**

Run `node scripts/verify-dice-appearance-context.mjs`; expect failure.

- [ ] **Step 3: Implement context and provider placement**

Load stored rows only when both IDs exist; merge them onto defaults; clear to defaults when campaign/user disappears; batch-save and replace local state only after a successful save. Nest `DiceSessionProvider` inside `DiceAppearanceProvider` in `SessionRightSidebar`.

- [ ] **Step 4: Run GREEN verification**

Run the context verifier and existing dice panel/quick-roll verifiers.

### Task 4: Roll snapshots, reroll semantics, and realtime validation

**Files:**
- Modify: `src/app/components/session/dice/DiceSessionContext.tsx`
- Modify: `src/services/realtime/diceRealtime.ts`
- Modify: `scripts/verify-dice-realtime.mjs`
- Modify: `scripts/verify-dice-appearance.mts`

**Interfaces:**
- `DiceSessionContext.buildResult()` calls `attachDiceAppearanceSnapshots(result, standardStyles)` after canonical RNG resolution.
- Realtime validator accepts optional legacy absence of `appearance`, but validates present snapshots strictly.
- Reroll uses current standard styles while old results stay unchanged; custom-die source item snapshots retain their own saved appearance.

- [ ] **Step 1: Extend RED verifications**

Add tests for valid/invalid appearance payloads, legacy payload compatibility, snapshot immutability, and reroll semantics.

- [ ] **Step 2: Run RED verifications**

Run `npm run verify:dice-realtime` and `npm run verify:dice-appearance`; confirm new checks fail.

- [ ] **Step 3: Implement snapshot attachment**

Read current styles from `useDiceAppearance()` inside `DiceSessionProvider`; attach appearance after `rollDiceFormula()` returns. Preserve canonical roll data and formula semantics.

- [ ] **Step 4: Implement realtime validation**

Validate hex/color strings as strings, `skinId` by allowlist, `effectsEnabled` boolean, and custom snapshot fields when present; keep older payloads accepted.

- [ ] **Step 5: Run GREEN verifications**

Run both verifiers and `npm run verify:dice-engine`.

### Task 5: Shared static skin visuals and standard/custom icons

**Files:**
- Create: `src/app/components/session/dice/DiceSkinSurface.tsx`
- Create: `src/app/components/session/dice/StyledStandardDieIcon.tsx`
- Modify: `src/app/components/session/dice/CustomDieLibraryIcon.tsx`
- Modify: `src/app/components/session/dice/CustomDieFaceResult.tsx`
- Modify: `src/app/components/session/dice/DiceRollHistoryCard.tsx`
- Create: `scripts/verify-dice-skin-icons.mjs`
- Modify: `package.json`

**Interfaces:**
- `DiceSkinSurface` provides a deterministic tintable static pattern for the nine skins with no remote assets.
- `StyledStandardDieIcon` composes `DiceTypeIcon` with `DiceAppearance`.
- Custom image faces remain raw `<img>` and never receive tint/filter styles.

- [ ] **Step 1: Write RED icon verification**

Assert standard history cards consume `group.appearance`, custom result/library icons consume custom skin fields, and image-face branches do not use `symbolColor`/CSS filter on the image element.

- [ ] **Step 2: Run RED verification**

Run `node scripts/verify-dice-skin-icons.mjs`; expect failure.

- [ ] **Step 3: Implement shared static surface**

Use CSS gradients/patterns driven by skin ID and CSS variables for `bodyColor`; keep `symbolColor` independent. No animation in tiny quick-roll/chat icons.

- [ ] **Step 4: Integrate icons/history**

Standard chat result receives `appearance`; custom result and library icon receive skin data. Preserve existing size/layout behavior for d100.

- [ ] **Step 5: Run GREEN verification**

Run the new verifier plus `verify:custom-dice-chat-symbol-color` and `verify:dice-icon-style`.

### Task 6: Standard-dice Personalizza UI and quick-roll integration

**Files:**
- Create: `src/app/components/session/dice/DiceAppearanceCustomizer.tsx`
- Modify: `src/app/components/session/dice/DiceQuickRollFloating.tsx`
- Modify: `scripts/verify-custom-dice-quick-roll.mts`
- Modify: `scripts/verify-dice-ui.mjs`

**Interfaces:**
- New `Palette` button is immediately after the Custom-die toolbar control and opens the customizer.
- Customizer edits a local seven-die draft; `Applica a tutti` copies one selected appearance to all sides; `Salva` calls context persistence; `Annulla` discards draft.
- Quick-roll standard buttons render `StyledStandardDieIcon` with current campaign/user style.

- [ ] **Step 1: Extend RED UI verifications**

Assert `data-dice-appearance-toolbar` follows `data-dice-custom-toolbar`, seven standard selectors exist, nine skin options exist, toggle/save/cancel/apply-all markers exist, and standard quick-roll icons read context styles.

- [ ] **Step 2: Run RED verifications**

Run `npm run verify:dice-ui` and `npm run verify:custom-dice-quick-roll`; expect new assertions to fail.

- [ ] **Step 3: Build the customizer**

Use Hollowgate palette variables, a modal/panel consistent with `CustomDieConfigurator`, one large preview, color inputs, skin grid, `Switch`, `Applica a tutti`, `Annulla`, `Salva`, busy/error handling and campaign/user guards.

- [ ] **Step 4: Insert Personalizza in quick roll**

Add `Palette` icon + tooltip directly after Custom; keep the custom selector behavior unchanged and close it when customizer opens.

- [ ] **Step 5: Run GREEN verifications**

Run both UI verifiers and `npm run typecheck` if the full workspace is locally available.

### Task 7: Custom-die configurator skin/effect editing and save path

**Files:**
- Modify: `src/app/components/session/dice/CustomDieConfigurator.tsx`
- Modify: `src/app/components/session/dice/SessionDicePanel.tsx`
- Modify: `src/app/components/session/dice/SavedCustomDieCard.tsx` if its edit/create draft typing requires the new fields
- Modify: `scripts/verify-dice-ui.mjs`
- Modify: `scripts/verify-custom-dice-chat-symbol-color.mjs`

**Interfaces:**
- `CustomDieConfigurator.onSave` draft gains `skinId` and `effectsEnabled`.
- Existing body/symbol colors, face visuals, library-icon radio, upload lifecycle, drag-copy and validation stay intact.

- [ ] **Step 1: Extend RED verification**

Assert Custom configurator initializes saved skin/effects, exposes nine skin choices + switch, and passes fields through save/create/update/duplicate paths.

- [ ] **Step 2: Run RED verification**

Run UI/custom-chat verifiers and confirm failure.

- [ ] **Step 3: Implement custom appearance controls**

Add shared skin picker and switch in the left aside. Apply skin only to preview background/surface; icon/text still use `symbolColor`; uploaded images remain untouched.

- [ ] **Step 4: Thread save fields through SessionDicePanel**

Create/update custom dice with `skinId` and `effectsEnabled`; existing dice without fields fallback to `none/false`.

- [ ] **Step 5: Run GREEN verification**

Run affected verifiers.

### Task 8: Unified 3D projection and static material adapter

**Files:**
- Modify: `src/app/components/session/dice/dice3dProjection.ts`
- Modify: `src/app/components/session/dice/dice3dCustomMaterials.ts`
- Modify: `src/app/components/session/dice/dice3dRenderer.ts`
- Create: `src/app/components/session/dice/dice3dSkinTextures.ts`
- Modify: `scripts/verify-dice-3d.mts`

**Interfaces:**
- Projection descriptor carries `appearance` for every physical die and optional custom labels/role.
- d100 standard appearance is duplicated consistently onto tens and units physical dice.
- Texture generator returns cached deterministic texture descriptors keyed by `(skinId, bodyColor)`.
- Unified adapter temporarily applies body/symbol color, material and static skin texture per mesh and restores factory state in `finally`.

- [ ] **Step 1: Extend RED 3D verifier**

Assert standard chunks carry appearance, mixed standard/custom queues align one descriptor per physical die, d100 styles both dice, custom d4 special paths remain present, and image faces remain untinted.

- [ ] **Step 2: Run RED verification**

Run `npm run verify:dice-3d`; confirm new assertions fail while existing baseline checks still pass.

- [ ] **Step 3: Implement texture generator**

Use local canvas-generated, deterministic, tintable patterns. `none` returns neutral texture. Cache by skin/body color.

- [ ] **Step 4: Generalize material queue/adapter**

Preserve `createTextMaterial` custom-d4 direct-text interception and `swapDiceFace_D4` forced-result repair. For custom labels, skin changes only the body/material; labels still come from the existing prepared arrays.

- [ ] **Step 5: Update renderer**

Install unified adapter whenever any descriptor needs non-default appearance or custom labels, with presentation-only fallback logging.

- [ ] **Step 6: Run GREEN verification**

Run `npm run verify:dice-3d` and `npm run verify:dice-engine`.

### Task 9: Animated 3D skin effects with safe fallback

**Files:**
- Create: `src/app/components/session/dice/dice3dSkinEffects.ts`
- Modify: `src/app/components/session/dice/dice3dCustomMaterials.ts`
- Modify: `src/app/components/session/dice/dice3dRenderer.ts`
- Modify: `scripts/verify-dice-3d.mts`

**Interfaces:**
- Produces a per-roll controller with `registerMesh(mesh, appearance)`, `start()`, `stop()`.
- One RAF loop per roll. It respects `matchMedia('(prefers-reduced-motion: reduce)')`.
- Effects use only runtime mesh/material capabilities already available; unsupported effects degrade to lightweight emissive/material modulation rather than adding dependencies.

- [ ] **Step 1: Extend RED verifier**

Assert controller has one RAF loop, reduced-motion guard, no remote assets/new dependency, per-skin effect dispatch, and cleanup on roll completion/abort/dispose.

- [ ] **Step 2: Run RED verification**

Run `npm run verify:dice-3d`; confirm failure.

- [ ] **Step 3: Implement effect controller**

Use conservative material/emissive/opacity/scale modulation and small scene-attached effects only when runtime objects expose the required methods. Cap work per frame and per roll.

- [ ] **Step 4: Register meshes and lifecycle**

The material adapter registers each created mesh with its appearance. Renderer starts after adapter install and stops in `finally`; abort/dispose also stop the controller.

- [ ] **Step 5: Run GREEN verification**

Run `npm run verify:dice-3d`.

### Task 10: Full verification, atomic implementation commit, DB apply, and Production verification

**Files:**
- All files changed by Tasks 1-9

**Interfaces:**
- Final implementation must be one atomic Git commit on top of the plan commit.

- [ ] **Step 1: Run targeted verification suite**

Run all dice verifiers: `verify:dice-appearance`, `verify:dice-appearance-persistence`, `verify:dice-appearance-context`, `verify:dice-engine`, `verify:dice-ui`, `verify:custom-dice-quick-roll`, `verify:custom-dice-chat-symbol-color`, `verify:dice-icon-style`, `verify:dice-realtime`, `verify:dice-3d`.

- [ ] **Step 2: Run project verification**

Run `npm run check` when the local workspace is available. Record any failure exactly; do not conflate the known audit gate with feature failures.

- [ ] **Step 3: Self-review diff**

Check no dependency changes, no accidental unrelated files, no loss of d4 code, no image tinting, all migrations are forward-only, and all new UI copy is Italian.

- [ ] **Step 4: Create one atomic implementation commit**

Use Git data (`create_blob` → `create_tree` → `create_commit` → fast-forward `main`) so all feature files land in exactly one implementation commit, e.g. `feat: add dice personalization and skins`.

- [ ] **Step 5: Apply the approved Supabase migration**

Apply exactly `20260903090000_dice_standard_styles_and_custom_skins.sql` to project `njcnkovruynhtsgzgrxi`; do not alter unrelated schema/data.

- [ ] **Step 6: Verify CI and Vercel**

Confirm GitHub Actions status for the exact final SHA and confirm Vercel Production reports success for that exact SHA before asking the user to refresh.
