# Dice 3D Animation and Delayed Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional full-screen physical dice animation with predetermined outcomes and delay each history-card reveal until animation completion, while guaranteeing that a newer roll interrupts the old animation and immediately reveals the interrupted result.

**Architecture:** Keep 3D behind a small adapter boundary and lazy-load `@3d-dice/dice-box-threejs@0.0.12`. `DiceSessionContext` remains authoritative over roll data and controls a single animation slot; the renderer only visualizes already-known supported dice results. Pending results are stored immediately but withheld from visible history until the renderer finishes, is interrupted, is disabled, or fails.

**Tech Stack:** React 18.3.1, TypeScript 5.7.3, Vite 6.4.3, `@3d-dice/dice-box-threejs@0.0.12` pinned exactly, ThreeJS/Cannon transitive dependencies, localStorage only for the local 3D-enabled preference (not roll history).

**Spec:** `docs/superpowers/specs/2026-08-28-dice-system-design.md`

**Depends on:**
- `docs/superpowers/plans/2026-08-28-dice-core-builder-plan.md`
- `docs/superpowers/plans/2026-08-28-dice-realtime-history-plan.md`

## Global Constraints

- 3D is presentation only; never derive the canonical roll from physics.
- Physical faces must match canonical `RollResult` values whenever animated.
- Card remains hidden while the active animation is running.
- After dice settle, keep them visible for about 1 second before reveal/fade.
- A new roll interrupts the prior animation; the interrupted card reveals immediately.
- No animation queue.
- If 3D is disabled or fails, reveal immediately.
- Unsupported custom dice remain valid but are omitted from the physical animation rather than substituted with a false shape.
- Canvas is transparent and `pointer-events:none`.
- Package must be lazy-loaded so ordinary app startup does not eagerly load the 3D bundle.
- Roll history remains volatile; only the user's local 3D preference may persist.

---

## File Structure

Create:

- `src/app/components/session/dice/dice3dTypes.ts` — adapter interfaces and supported physical-roll projection.
- `src/app/components/session/dice/dice3dProjection.ts` — pure conversion from RollResult to predetermined 3D notation/chunks.
- `src/app/components/session/dice/dice3dRenderer.ts` — lazy adapter around dice-box-threejs.
- `src/app/components/session/dice/Dice3DOverlay.tsx` — full-screen transparent host.
- `scripts/verify-dice-3d.mts` — projection/state-machine verification.

Modify:

- `src/app/components/session/dice/DiceSessionContext.tsx` — pending/animating/revealed state machine and interruption.
- `src/app/components/session/dice/DiceRollHistoryDrawer.tsx` — render only revealed cards.
- `src/app/components/session/dice/SessionDicePanel.tsx` — local 3D toggle.
- `src/app/components/session/SessionRightSidebar.tsx` — mount overlay in provider scope.
- `package.json`
- `package-lock.json`

Potential asset copy:

- `public/assets/dice-box-threejs/` only if the chosen config requires package public assets. Copy only required upstream assets; do not invent custom dice art in this phase.

---

### Task 1: Add exact 3D dependency and audit gate

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Makes `@3d-dice/dice-box-threejs@0.0.12` available only through dynamic import from the adapter.

- [ ] **Step 1: Install exact package version**

Run:

```bash
npm install --save-exact @3d-dice/dice-box-threejs@0.0.12
```

Expected package.json entry:

```json
"@3d-dice/dice-box-threejs": "0.0.12"
```

- [ ] **Step 2: Immediately run supply-chain gate**

```bash
npm audit --audit-level=high
```

If this fails because the package introduces a high/critical advisory that cannot be resolved without replacing the package, stop Plan 3 and leave Plans 1-2 intact. Do not weaken audit policy.

- [ ] **Step 3: Verify package can be resolved by Vite**

Create no UI yet; run:

```bash
npm run typecheck
npm run build
```

If TypeScript declarations are absent, add a narrow local declaration file later in Task 3 rather than disabling type checking globally.

- [ ] **Step 4: Commit**

Commit message:

```text
build: add predetermined 3d dice renderer
```

---

### Task 2: Build pure RollResult -> physical dice projection

**Files:**
- Create: `src/app/components/session/dice/dice3dTypes.ts`
- Create: `src/app/components/session/dice/dice3dProjection.ts`
- Create: `scripts/verify-dice-3d.mts`

**Interfaces:**
- Produces `projectRollTo3D(result): Dice3DRollChunk[]`.
- `Dice3DRollChunk` contains `sides`, `values`, and notation such as `2d20@17,4`.

- [ ] **Step 1: Write RED projection tests**

Use synthetic RollResults and assert:

```ts
projectRollTo3D(resultWithD20Values17And4)
// => [{ sides:20, values:[17,4], notation:'2d20@17,4' }]
```

Also cover:

- d4, d6, d8, d10, d12, d20, d100 supported;
- mixed d20+d12 becomes separate chunks if renderer notation cannot combine predetermined values safely;
- d3/d30 omitted;
- dropped/kept values are still physically animated if they were actually rolled;
- explosion-generated supported dice are included with their natural face values;
- compound/penetrating contribution adjustments do not alter the physical natural face shown.

- [ ] **Step 2: Define supported sides**

```ts
export const PHYSICAL_DICE_SIDES = new Set([4, 6, 8, 10, 12, 20, 100]);
```

If runtime testing proves the library cannot correctly render one of these shapes, remove only that side from the physical set and document the fallback; do not change the dice engine.

- [ ] **Step 3: Implement projection from natural roll records**

Use the natural `face`/`naturalValue` captured by the engine, not contribution values after penetrate/compound math.

Group in deterministic `diceGroups` order so animation corresponds to formula order as closely as the renderer permits.

- [ ] **Step 4: Run GREEN**

```bash
node --experimental-strip-types scripts/verify-dice-3d.mts
```

Expected: `Dice 3D projection verification passed.`

- [ ] **Step 5: Commit**

Commit message:

```text
feat: project dice results to 3d notation
```

---

### Task 3: Implement isolated lazy renderer adapter

**Files:**
- Create: `src/app/components/session/dice/dice3dRenderer.ts`
- Create if needed: `src/types/dice-box-threejs.d.ts`
- Modify: `scripts/verify-dice-3d.mts`

**Interfaces:**
- Produces:

```ts
export interface Dice3DRenderer {
  init(container: HTMLElement): Promise<void>;
  play(result: RollResult, signal: AbortSignal): Promise<void>;
  clear(): void;
  dispose(): void;
}
```

- [ ] **Step 1: Add RED static assertions**

Ensure source contains dynamic import:

```ts
await import('@3d-dice/dice-box-threejs')
```

and does not top-level import the package.

- [ ] **Step 2: Initialize exactly once per overlay lifetime**

Renderer owns one DiceBox instance. Configuration starts conservative:

```ts
{
  sounds: false,
  shadows: true,
  theme_colorset: 'white',
  theme_material: 'plastic',
}
```

Use container sizing from its actual bounding rect and update on resize if library requires explicit dimensions.

- [ ] **Step 3: Play predetermined chunks sequentially inside one logical animation**

For every supported chunk call `Box.roll(chunk.notation)`. Await each chunk. Before/after every await check `signal.aborted`; on abort clear visual scene and reject with a dedicated `Dice3DAbortError` rather than treating it as runtime failure.

If the library supports mixed notation with all predetermined values reliably, implementation may combine chunks, but tests must still verify exact face projection.

- [ ] **Step 4: Work around unresolved concurrent-roll behavior**

Never call a new `.roll()` on the same renderer while an earlier play promise is treated as active. Interruption sequence is always:

1. abort controller;
2. `renderer.clear()`;
3. dispose/recreate DiceBox instance if required by runtime behavior;
4. start new play.

This avoids relying on the upstream unresolved concurrent-roll promise behavior.

- [ ] **Step 5: Runtime failure handling**

`play()` may throw normal errors for WebGL/library failures. It must never fabricate a result. Caller decides immediate reveal.

- [ ] **Step 6: Run typecheck/build**

```bash
npm run typecheck
npm run build
```

- [ ] **Step 7: Commit**

Commit message:

```text
feat: add lazy 3d dice renderer adapter
```

---

### Task 4: Add full-screen transparent Dice3DOverlay

**Files:**
- Create: `src/app/components/session/dice/Dice3DOverlay.tsx`
- Modify: `src/app/components/session/SessionRightSidebar.tsx`

**Interfaces:**
- Overlay exposes its container to `DiceSessionContext`/renderer coordinator.
- It has no dice-generation logic.

- [ ] **Step 1: Build overlay host**

Use:

```tsx
<div
  data-dice-3d-overlay
  className="pointer-events-none fixed inset-0 z-[1100]"
  aria-hidden="true"
>
  <div ref={containerRef} className="h-full w-full" />
</div>
```

Choose z-index after checking existing modal/tooltip layers so the dice are above the VTT/session panels but below critical dialogs. If `1100` conflicts, define a documented dice overlay layer rather than escalating arbitrarily.

- [ ] **Step 2: Mount overlay for whole session sidebar lifetime**

It must not unmount merely because the Dadi builder panel closes; remote rolls can animate while the user is viewing other session content.

- [ ] **Step 3: Keep overlay non-interactive**

No pointer handlers, focusable controls, or blocking backdrop.

- [ ] **Step 4: Commit**

Commit message:

```text
feat: mount session dice animation overlay
```

---

### Task 5: Introduce delayed reveal state machine

**Files:**
- Modify: `src/app/components/session/dice/DiceSessionContext.tsx`
- Modify: `src/app/components/session/dice/DiceRollHistoryDrawer.tsx`
- Modify: `scripts/verify-dice-3d.mts`

**Interfaces:**
- Internal stored roll becomes:

```ts
interface SessionRollEntry {
  result: RollResult;
  revealState: 'pending' | 'animating' | 'revealed';
  receivedAt: number;
}
```

- History drawer renders only `revealed` entries.

- [ ] **Step 1: Write state-transition tests against extracted pure reducer/helper**

Extract a small pure coordinator reducer if needed and assert:

```text
NEW A -> A pending
START A -> A animating
FINISH A -> A revealed
NEW B while A animating -> A revealed, B pending
FAIL B -> B revealed
3D disabled NEW C -> C revealed immediately
```

- [ ] **Step 2: Store result before animation**

Every local/remote ingestion inserts the canonical result immediately. It is never recreated by renderer completion.

- [ ] **Step 3: Single active animation slot**

Keep refs:

```ts
activeAnimationRollIdRef
activeAbortControllerRef
```

When a new authorized result is ingested and animations are enabled:

1. reveal current active roll if any;
2. abort/clear current renderer;
3. mark new roll pending/animating;
4. play new result.

- [ ] **Step 4: Finish behavior**

After renderer settles:

```ts
await delay(1000, signal);
reveal(result.id);
renderer.clear();
```

Abort skips the delay and the interrupted result was already revealed by the new-roll path.

- [ ] **Step 5: Failure behavior**

Any non-abort renderer error:

- logs once;
- reveals affected card immediately;
- clears overlay;
- does not disable rolling or Realtime.

- [ ] **Step 6: Drawer filter**

Only revealed entries appear. Ordering remains receipt order; interruption does not move a card.

- [ ] **Step 7: Run GREEN**

```bash
node --experimental-strip-types scripts/verify-dice-3d.mts
npm run typecheck
```

- [ ] **Step 8: Commit**

Commit message:

```text
feat: delay dice history reveal until animation
```

---

### Task 6: Add local 3D preference and immediate fallback

**Files:**
- Modify: `src/app/components/session/dice/DiceSessionContext.tsx`
- Modify: `src/app/components/session/dice/SessionDicePanel.tsx`
- Modify: `scripts/verify-dice-3d.mts`

**Interfaces:**
- Produces `animationsEnabled`, `setAnimationsEnabled` in dice session context.

- [ ] **Step 1: Use one preference key**

```ts
const DICE_3D_ENABLED_KEY = 'hollowgate.dice.3d-enabled';
```

Default true unless storage explicitly contains `false`.

This is the only localStorage added by Plan 3; history/results remain memory-only.

- [ ] **Step 2: Add palette-aware toggle in Dadi panel**

Label: `Animazione dadi 3D`.

- [ ] **Step 3: Switching OFF during an animation**

Immediately:

1. reveal current active card;
2. abort and clear renderer;
3. persist false.

- [ ] **Step 4: OFF behavior**

All newly ingested rolls reveal immediately with zero renderer work.

- [ ] **Step 5: Commit**

Commit message:

```text
feat: add optional 3d dice animation setting
```

---

### Task 7: Validate interruption, multiplayer consistency, and repository gates

**Files:**
- Modify: `package.json`
- Modify: `scripts/verify-dice-3d.mts`

**Interfaces:**
- Adds `verify:dice-3d` to `check`.

- [ ] **Step 1: Add verification script**

```json
"verify:dice-3d": "node --experimental-strip-types scripts/verify-dice-3d.mts"
```

- [ ] **Step 2: Run full automated gate**

```bash
npm ci
npm audit --audit-level=high
npm run check
```

- [ ] **Step 3: Single-client visual smoke**

Verify each supported standard die visually terminates on the exact face recorded in the eventual history card.

- [ ] **Step 4: Complex formula visual smoke**

Use a formula containing multiple dice groups, Keep/Drop, Exploding and arithmetic. Confirm physical dice show natural rolls; history shows all processed details and final total.

- [ ] **Step 5: Interruption smoke**

Client A rolls; before animation ends, Client B rolls. On every authorized client:

- A animation stops;
- A card becomes visible immediately;
- B animation starts;
- B card stays hidden until B completes or is interrupted.

- [ ] **Step 6: Rapid triple-roll smoke**

A, B, C in rapid sequence. Histories contain A/B/C exactly once. Only the newest animation remains visible.

- [ ] **Step 7: Secret-roll visual matrix**

- Player A secret: animation/card on A and GM only.
- GM secret: animation/card on GM only.
- Player B sees neither unauthorized animation nor card.

- [ ] **Step 8: Disable/failure fallback**

With animation toggle OFF, cards appear immediately. Simulate renderer init failure (temporary dev stub) and confirm result/history/Realtime remain functional with immediate reveal; restore real adapter before commit.

- [ ] **Step 9: Bundle inspection**

Confirm the 3D package is split into a lazy Vite chunk and not pulled into the initial session bundle. Existing bundle-size warnings may remain but no new eager 3D load is acceptable.

- [ ] **Step 10: CI/Vercel exact SHA**

Both must report success for the final commit.

- [ ] **Step 11: Commit**

Commit message:

```text
feat: complete physical dice animations
```

---

## Plan 3 Completion Gate

Plan 3 is complete only when:

- dependency audit remains green;
- standard supported physical dice match canonical results;
- unsupported custom dice degrade without falsification;
- delayed reveal works;
- interruption reveals prior card immediately and never drops results;
- rapid multiplayer rolls preserve all authorized history entries;
- secret roll animation visibility matches result visibility;
- 3D OFF/runtime failure falls back to immediate reveal;
- 3D code is lazy-loaded;
- full `npm run check`, CI, Vercel, and manual multi-client smoke are green.