# P2B Bundle Splitting and Recharts 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the initial Hollowgate JavaScript entry by at least 25% through semantic lazy loading, then migrate Recharts 2.15.2 to pinned Recharts 3.10.1 without changing application behavior or intended chart UI.

**Architecture:** P2B is executed in two hard checkpoints. P2B.1 introduces React lazy boundaries around existing conditionally rendered feature areas and removes the misleading mixed static/dynamic `entitiesService` import; no `manualChunks` are added unless post-split evidence proves they are needed. After P2B.1 is independently green, P2B.2 upgrades Recharts and migrates the shared chart wrapper using only Recharts 3 public exports.

**Tech Stack:** React 18.3.1, TypeScript 5.7.3, Vite 6.4.3, Node 22 CI, Recharts 2.15.2 -> 3.10.1, npm lockfile

**Spec:** `docs/superpowers/specs/2026-08-22-p2b-bundle-recharts3-design.md`

## Global Constraints

- Base branch SHA is `998774464f671936c7bedc12f08d039363bb8ca8`.
- Work only on `hardening/p2b-bundle-recharts3`.
- Do not change Supabase schema, RLS, Realtime, Storage, Auth, database data, React major, Vite major or TipTap versions.
- Do not redesign routing/navigation or state persistence.
- Do not intentionally change visual design.
- Do not add `manualChunks` before measuring the semantic lazy-loading result.
- Keep Recharts pinned exactly to `3.10.1`; do not use `^` or `~`.
- `npm audit --audit-level=high` must remain green.
- `npm run check` must remain green at every final checkpoint.
- P2B.2 must not start until P2B.1 passes build, bundle and smoke gates.
- Preserve the branch after merge unless the user explicitly requests deletion.

---

## File map

### P2B.1

- Create: `src/app/components/LazyFeatureFallback.tsx` — palette-aware reusable Suspense fallback for deferred feature surfaces.
- Modify: `src/app/App.tsx` — lazy-load campaign view, GM/dashboard sections and suitable conditional secondary surfaces while preserving existing state ownership.
- Modify: `src/app/home/HomeScreen.tsx` — lazy-load `CharacterCreationWizard` only after explicit character-creation flow.
- Modify: `src/services/campaign/entityReferenceService.ts` — replace the ineffective mixed dynamic import with a static `loadAdventures` import while retaining call-level fallback handling.

### P2B.2

- Modify: `package.json` — pin `recharts` to `3.10.1`.
- Modify: `package-lock.json` — npm-resolved lockfile for the exact dependency update.
- Modify: `src/app/components/ui/chart.tsx` — migrate custom Tooltip/Legend typing to Recharts 3 public exports and preserve wrapper behavior.

### Verification/reporting

- Create: `docs/superpowers/reports/2026-08-22-p2b-bundle-recharts3-report.md` — baseline, P2B.1 and P2B.2 measurements; CI/Vercel/smoke evidence; any justified deviations.

---

## Task 1: Establish an isolated execution workspace and immutable baseline

**Files:**
- Read: `package.json`
- Read: `package-lock.json`
- Read: `vite.config.ts`
- Read: `.github/workflows/ci.yml`
- Read: `src/app/App.tsx`
- Read: `src/app/home/HomeScreen.tsx`
- Read: `src/services/campaign/entityReferenceService.ts`
- Read: `src/app/components/ui/chart.tsx`

**Interfaces:**
- Consumes: branch `hardening/p2b-bundle-recharts3` created from `998774464f671936c7bedc12f08d039363bb8ca8`.
- Produces: a clean isolated worktree, baseline build output and exact pre-change entry size used by Tasks 4 and 8.

- [ ] **Step 1: Create/enter the isolated workspace**

Use the `superpowers:using-git-worktrees` procedure. Verify branch and isolation before editing:

```bash
git rev-parse --show-toplevel
git branch --show-current
git status --short
git rev-parse HEAD
```

Expected branch: `hardening/p2b-bundle-recharts3`.

Expected ancestry: branch contains base `998774464f671936c7bedc12f08d039363bb8ca8` plus only the P2B spec/plan commits before implementation.

- [ ] **Step 2: Install the exact locked baseline**

```bash
npm ci
```

Expected: success with no lockfile mutation.

- [ ] **Step 3: Verify the P2A security gate before any P2B code**

```bash
npm audit --audit-level=high
```

Expected: 0 high/critical vulnerabilities.

- [ ] **Step 4: Verify the baseline project checks**

```bash
npm run check
```

Expected: typecheck, campaign canonical verification and Vite production build all succeed.

- [ ] **Step 5: Capture the exact baseline build output**

Run a fresh build and preserve stdout:

```bash
rm -rf dist
npm run build 2>&1 | tee /tmp/p2b-baseline-build.log
cat /tmp/p2b-baseline-build.log
```

Record in notes/report draft:

- initial HTML entry JS filename
- raw entry size
- gzip entry size if printed by Vite
- largest five JS chunks
- any `Some chunks are larger than 500 kB` warning
- any mixed static/dynamic import warning involving `entitiesService.ts`

Resolve the entry directly from built HTML instead of guessing the hashed filename:

```bash
ENTRY_REL=$(grep -oE 'src="/assets/[^"]+\.js"' dist/index.html | head -1 | cut -d'"' -f2)
ENTRY_FILE="dist${ENTRY_REL}"
printf 'entry=%s\n' "$ENTRY_FILE"
wc -c "$ENTRY_FILE"
gzip -c "$ENTRY_FILE" | wc -c
```

- [ ] **Step 6: Record RED evidence for current eager boundaries**

```bash
rg "^import .*components/gm|^import .*features/gm|CampaignHome|SettingsModal|ReportBugModal|NewsPage|SessionRightSidebar" src/app/App.tsx
rg "CharacterCreationWizard" src/app/home/HomeScreen.tsx
rg "await import\('../supabase/entitiesService'\)" src/services/campaign/entityReferenceService.ts
```

Expected before implementation:

- GM/dashboard feature modules are static imports in `App.tsx`.
- `CharacterCreationWizard` is a static import in `HomeScreen.tsx`.
- `entityReferenceService.ts` contains the dynamic import.

Do not commit baseline-only output files.

---

## Task 2: Add the reusable Suspense fallback

**Files:**
- Create: `src/app/components/LazyFeatureFallback.tsx`

**Interfaces:**
- Consumes: existing CSS variables `--dash-bg`, `--dash-accent`, `--dash-muted`.
- Produces: `LazyFeatureFallback(): JSX.Element`, used by `App.tsx` and `HomeScreen.tsx` Suspense boundaries.

- [ ] **Step 1: Create the minimal palette-aware fallback**

Create `src/app/components/LazyFeatureFallback.tsx` with:

```tsx
export function LazyFeatureFallback() {
  return (
    <div
      data-testid="lazy-feature-fallback"
      className="flex min-h-[12rem] w-full items-center justify-center bg-[var(--dash-bg)]"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--dash-accent)] border-t-transparent" />
        <p className="text-sm text-[var(--dash-muted)]">Caricamento...</p>
      </div>
    </div>
  );
}
```

Do not add new visual tokens or hard-coded palette colors.

- [ ] **Step 2: Verify the new file typechecks before consumers are changed**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit the fallback as an independent unit**

```bash
git add src/app/components/LazyFeatureFallback.tsx
git commit -m "perf: add lazy feature fallback"
```

---

## Task 3: Lazy-load the existing feature boundaries in `App.tsx`

**Files:**
- Modify: `src/app/App.tsx`
- Consume: `src/app/components/LazyFeatureFallback.tsx`

**Interfaces:**
- Consumes: existing named exports and state callbacks in `App.tsx`; no component props change.
- Produces: lazy components with the exact same component names used by existing JSX.

- [ ] **Step 1: Convert the React import to include `lazy` and `Suspense`**

Replace:

```tsx
import { useEffect, useState } from 'react';
```

with:

```tsx
import { lazy, Suspense, useEffect, useState } from 'react';
```

Add:

```tsx
import { LazyFeatureFallback } from './components/LazyFeatureFallback';
```

- [ ] **Step 2: Replace eager feature imports with named lazy adapters**

Remove the eager imports for the conditionally mounted surfaces and define lazy equivalents near the top of the file.

Use this exact pattern for named exports:

```tsx
const CampaignHome = lazy(() =>
  import('./campaigns/CampaignHome').then(module => ({ default: module.CampaignHome }))
);
```

Apply the same pattern to:

```tsx
const SettingsModal = lazy(() => import('./components/SettingsModal').then(module => ({ default: module.SettingsModal })));
const ReportBugModal = lazy(() => import('./components/ReportBugModal').then(module => ({ default: module.ReportBugModal })));
const NewsPage = lazy(() => import('./news/NewsPage').then(module => ({ default: module.NewsPage })));
const SessionRightSidebar = lazy(() => import('./components/session/SessionRightSidebar').then(module => ({ default: module.SessionRightSidebar })));

const AdventureManager = lazy(() => import('./components/gm/AdventureManager').then(module => ({ default: module.AdventureManager })));
const PlayerCharacters = lazy(() => import('./components/gm/PlayerCharacters').then(module => ({ default: module.PlayerCharacters })));
const MyCharactersPage = lazy(() => import('./components/gm/MyCharactersPage').then(module => ({ default: module.MyCharactersPage })));
const CampaignsPage = lazy(() => import('./components/gm/CampaignsPage').then(module => ({ default: module.CampaignsPage })));
const NPCsManager = lazy(() => import('./components/gm/NPCsManager').then(module => ({ default: module.NPCsManager })));
const EnvironmentManager = lazy(() => import('./components/gm/EnvironmentManager').then(module => ({ default: module.EnvironmentManager })));
const CluesManager = lazy(() => import('./components/gm/CluesManager').then(module => ({ default: module.CluesManager })));
const SituationsManager = lazy(() => import('./components/gm/SituationsManager').then(module => ({ default: module.SituationsManager })));
const MonstersManager = lazy(() => import('./components/gm/MonstersManager').then(module => ({ default: module.MonstersManager })));
const CombatTracker = lazy(() => import('./components/gm/CombatTracker').then(module => ({ default: module.CombatTracker })));
const GameMap = lazy(() => import('./components/gm/GameMap').then(module => ({ default: module.GameMap })));
const GamePhases = lazy(() => import('./components/gm/GamePhases').then(module => ({ default: module.GamePhases })));
const VisualAssetsManager = lazy(() => import('./components/gm/VisualAssetsManager').then(module => ({ default: module.VisualAssetsManager })));
const SceneEncounterManager = lazy(() => import('./components/gm/SceneEncounterManager').then(module => ({ default: module.SceneEncounterManager })));
const EquipmentCatalogPage = lazy(() => import('../features/gm/pages/EquipmentCatalogPage').then(module => ({ default: module.EquipmentCatalogPage })));
```

Keep `type SessionEntityOpenRequest` as a type-only import from `CampaignHome` so it is erased at runtime:

```tsx
import type { SessionEntityOpenRequest } from './campaigns/CampaignHome';
```

- [ ] **Step 3: Put one Suspense boundary around `Dashboard`'s conditional feature body**

Do not wrap every tab independently. Preserve the current `Dashboard` outer layout and place the conditional tab renders under one boundary:

```tsx
return (
  <div className="px-6 py-6">
    <Suspense fallback={<LazyFeatureFallback />}>
      {/* existing activeTab conditional renders unchanged */}
    </Suspense>
  </div>
);
```

The JSX conditions and props must remain otherwise unchanged.

- [ ] **Step 4: Wrap lazy non-dashboard surfaces at the existing composition point**

Where lazy secondary views/modal components are rendered, use the smallest shared Suspense boundary that does not move their state upward or remount providers. Example:

```tsx
<Suspense fallback={<LazyFeatureFallback />}>
  {view === 'campaign-home' ? (
    <CampaignHome /* existing props unchanged */ />
  ) : null}
</Suspense>
```

For modal-only lazy components, use a Suspense wrapper around the existing conditional render; do not change open/close state or callbacks.

- [ ] **Step 5: Run typecheck as the first GREEN gate**

```bash
npm run typecheck
```

Expected: PASS with no lazy default-export/type errors.

- [ ] **Step 6: Run a production build and inspect actual split output**

```bash
rm -rf dist
npm run build 2>&1 | tee /tmp/p2b-app-lazy-build.log
```

Expected:

- build succeeds
- multiple meaningful feature chunks appear
- initial entry shrinks relative to Task 1

Do not add `manualChunks` in response to a generic 500 KB warning at this point.

- [ ] **Step 7: Commit the App feature boundaries**

```bash
git add src/app/App.tsx
git commit -m "perf: lazy load dashboard feature boundaries"
```

---

## Task 4: Lazy-load the character creation wizard on authenticated home

**Files:**
- Modify: `src/app/home/HomeScreen.tsx`
- Consume: `src/app/components/LazyFeatureFallback.tsx`

**Interfaces:**
- Consumes: `CharacterCreationWizard` named export and existing `characterWizardRuleset` state.
- Produces: deferred wizard chunk loaded only after a ruleset is selected.

- [ ] **Step 1: Change React import and replace eager wizard import**

Change:

```tsx
import { useEffect, useRef, useState } from 'react';
```

into:

```tsx
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
```

Remove:

```tsx
import { CharacterCreationWizard } from '../components/gm/CharacterCreationWizard';
```

Add:

```tsx
import { LazyFeatureFallback } from '../components/LazyFeatureFallback';

const CharacterCreationWizard = lazy(() =>
  import('../components/gm/CharacterCreationWizard').then(module => ({
    default: module.CharacterCreationWizard,
  }))
);
```

- [ ] **Step 2: Wrap only the wizard's existing conditional mount**

Replace the current conditional render with:

```tsx
{characterWizardRuleset && (
  <Suspense fallback={<LazyFeatureFallback />}>
    <CharacterCreationWizard
      onClose={() => setCharacterWizardRuleset(null)}
      onAdd={character => void handleAddCharacter(character)}
      existingCharacters={[]}
    />
  </Suspense>
)}
```

Do not alter `chooseRulesetForNewCharacter`, `handleAddCharacter` or save semantics.

- [ ] **Step 3: Verify TypeScript and build**

```bash
npm run typecheck
npm run build
```

Expected: both PASS; wizard appears as a deferred chunk or part of a deferred dependency graph rather than the initial entry.

- [ ] **Step 4: Commit the wizard boundary**

```bash
git add src/app/home/HomeScreen.tsx
git commit -m "perf: defer character creation wizard"
```

---

## Task 5: Remove the ineffective mixed import in `entityReferenceService.ts`

**Files:**
- Modify: `src/services/campaign/entityReferenceService.ts`

**Interfaces:**
- Consumes: public `loadAdventures(campaignId)` from `../supabase/entitiesService`.
- Produces: the same `loadAdventureReferences(campaignId?) -> Promise<EntityReference[]>` behavior without runtime module import.

- [ ] **Step 1: Add the static function import**

At the top of the file add:

```ts
import { loadAdventures } from '../supabase/entitiesService';
```

- [ ] **Step 2: Remove only the runtime import inside `loadAdventureReferences`**

Change:

```ts
try {
  const { loadAdventures } = await import('../supabase/entitiesService');
  const adventures = await loadAdventures(resolvedCampaignId);
```

into:

```ts
try {
  const adventures = await loadAdventures(resolvedCampaignId);
```

Keep the existing `catch`, logging and localStorage fallback unchanged.

- [ ] **Step 3: Verify the RED warning is gone**

```bash
rm -rf dist
npm run build 2>&1 | tee /tmp/p2b-entity-import-build.log
! grep -q "dynamically imported by.*entitiesService" /tmp/p2b-entity-import-build.log
```

Expected: build PASS and grep negation exits 0.

- [ ] **Step 4: Run the full P2A/P2B code gates**

```bash
npm audit --audit-level=high
npm run check
```

Expected: all PASS.

- [ ] **Step 5: Commit the import cleanup**

```bash
git add src/services/campaign/entityReferenceService.ts
git commit -m "perf: make entity service chunk ownership deterministic"
```

---

## Task 6: P2B.1 bundle measurement and checkpoint gate

**Files:**
- No source changes unless evidence requires correction.
- Draft/update later: `docs/superpowers/reports/2026-08-22-p2b-bundle-recharts3-report.md`

**Interfaces:**
- Consumes: Task 1 baseline and Tasks 2-5 implementation.
- Produces: verified P2B.1 result and an explicit go/no-go decision for P2B.2.

- [ ] **Step 1: Build from a clean dist directory**

```bash
rm -rf dist
npm run build 2>&1 | tee /tmp/p2b1-final-build.log
```

- [ ] **Step 2: Measure the new initial entry exactly as in baseline**

```bash
ENTRY_REL=$(grep -oE 'src="/assets/[^"]+\.js"' dist/index.html | head -1 | cut -d'"' -f2)
ENTRY_FILE="dist${ENTRY_REL}"
P2B1_RAW=$(wc -c < "$ENTRY_FILE")
P2B1_GZIP=$(gzip -c "$ENTRY_FILE" | wc -c)
printf 'entry=%s raw=%s gzip=%s\n' "$ENTRY_FILE" "$P2B1_RAW" "$P2B1_GZIP"
```

Compare to the Task 1 raw baseline:

```bash
node -e "const before=Number(process.argv[1]); const after=Number(process.argv[2]); const pct=((before-after)/before)*100; console.log(pct.toFixed(2)+'%'); if (pct < 25) process.exit(1)" "$BASELINE_RAW" "$P2B1_RAW"
```

Expected: reduction >= 25.00%.

- [ ] **Step 3: Inspect the largest JS files instead of reacting blindly to warnings**

```bash
find dist/assets -type f -name '*.js' -printf '%s %p\n' | sort -nr | head -10
```

Record chunk names and sizes.

If the initial entry reduction is >=25% and there is no structural warning, do **not** add `manualChunks` even if one lazily loaded feature chunk remains >500 KB.

If the threshold fails, stop and investigate the import graph before P2B.2. Any proposal to add `manualChunks` requires evidence and user-visible explanation; do not improvise it silently.

- [ ] **Step 4: Run complete checkpoint verification**

```bash
npm ci
npm audit --audit-level=high
npm run check
```

Expected: all PASS.

- [ ] **Step 5: Perform P2B.1 development smoke before dependency migration**

Verify manually in a branch preview/dev environment:

1. logged-out landing
2. authenticated home
3. campaign home
4. each GM/dashboard tab listed in the spec
5. switch away/back to already-loaded tabs
6. refresh while dashboard state is stored in sessionStorage
7. open/cancel/reopen character creation wizard
8. settings/report bug/news/session sidebar where reachable

If any navigation/state regression appears, debug and fix P2B.1 before proceeding.

- [ ] **Step 6: Commit any P2B.1-only corrective changes**

Use a focused commit message describing the actual correction. Do not mix in Recharts.

---

## Task 7: Introduce Recharts 3.10.1 and capture the migration RED

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: P2B.1 green branch state.
- Produces: exact Recharts 3.10.1 install plus expected compile evidence that identifies wrapper migration work.

- [ ] **Step 1: Change only the Recharts direct dependency**

```bash
npm install --save-exact recharts@3.10.1
```

Verify:

```bash
node -e "const p=require('./package.json'); if(p.dependencies.recharts!=='3.10.1') process.exit(1); console.log(p.dependencies.recharts)"
npm ls recharts
```

Expected: direct and resolved version `3.10.1`.

- [ ] **Step 2: Run security audit immediately after dependency resolution**

```bash
npm audit --audit-level=high
```

Expected: PASS with 0 high/critical findings. If this fails, stop P2B.2 and investigate before modifying wrapper code.

- [ ] **Step 3: Run TypeScript to capture the migration RED**

```bash
npm run typecheck
```

Expected before wrapper migration: compile errors may point to `src/app/components/ui/chart.tsx`, especially Tooltip custom content typing and Legend payload typing.

Save exact errors in `/tmp/p2b2-recharts-red.log` if needed:

```bash
npm run typecheck 2>&1 | tee /tmp/p2b2-recharts-red.log
```

Do not weaken TypeScript globally and do not add `skipLibCheck` changes; existing tsconfig remains unchanged.

- [ ] **Step 4: Confirm package diff scope before wrapper edits**

```bash
git diff -- package.json package-lock.json
```

Expected: Recharts-related dependency resolution only. If npm changes unrelated direct dependency pins, investigate before continuing.

Do not commit yet; keep dependency and wrapper migration in the same Recharts checkpoint unless a reviewer specifically needs the RED dependency commit separated.

---

## Task 8: Migrate `chart.tsx` to Recharts 3 public types

**Files:**
- Modify: `src/app/components/ui/chart.tsx`

**Interfaces:**
- Consumes public root exports from Recharts 3.10.1: `TooltipContentProps`, `TooltipValueType`, `LegendPayload` plus runtime `Tooltip`, `Legend`, `ResponsiveContainer` through the existing namespace import.
- Produces unchanged Hollowgate wrapper exports: `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, `ChartLegendContent`, `ChartStyle`.

- [ ] **Step 1: Add Recharts 3 public type imports**

Keep the runtime namespace import and add root type imports only:

```tsx
import * as RechartsPrimitive from "recharts";
import type {
  LegendPayload,
  TooltipContentProps,
  TooltipValueType,
} from "recharts";
```

Do not import from `recharts/lib/*`, `recharts/es6/*` or other private paths.

- [ ] **Step 2: Replace custom Tooltip props typing**

Replace the Recharts portion of:

```tsx
React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<"div"> & {
```

with a Recharts 3 content-props contract:

```tsx
TooltipContentProps<TooltipValueType, string | number> &
  React.ComponentProps<"div"> & {
```

Retain the existing Hollowgate extension fields:

```tsx
hideLabel?: boolean;
hideIndicator?: boolean;
indicator?: "line" | "dot" | "dashed";
nameKey?: string;
labelKey?: string;
```

If the exact installed public generic constrains the name type differently, inspect `node_modules/recharts/types/index.d.ts` and use the public root-exported compatible type; do not use a private module path.

- [ ] **Step 3: Replace removed LegendProps payload dependence with public `LegendPayload`**

Replace:

```tsx
React.ComponentProps<"div"> &
  Pick<RechartsPrimitive.LegendProps, "payload" | "verticalAlign"> & {
```

with:

```tsx
React.ComponentProps<"div"> & {
  payload?: ReadonlyArray<LegendPayload>;
  verticalAlign?: "top" | "middle" | "bottom";
  hideIcon?: boolean;
  nameKey?: string;
}
```

Do not use a locally invented payload shape while `LegendPayload` is publicly exported by Recharts 3.

- [ ] **Step 4: Resolve label widening deliberately**

Recharts 3 permits Tooltip labels to be `undefined | string | number`. Preserve existing display semantics by treating number labels as renderable values instead of assuming `string`.

The existing branch:

```tsx
!labelKey && typeof label === "string"
```

may stay if its purpose is specifically config-key lookup, but downstream rendering/formatter calls must typecheck for number labels. Do not stringify values solely to silence TypeScript unless the UI previously displayed strings.

- [ ] **Step 5: Run the migration GREEN typecheck**

```bash
npm run typecheck
```

Expected: PASS, including `chart.tsx`.

If errors reveal changed public types, fix narrowly in the wrapper. Do not cast the entire payload or component props to `any`.

- [ ] **Step 6: Run full build/security verification**

```bash
npm audit --audit-level=high
npm run check
```

Expected: all PASS.

- [ ] **Step 7: Commit the Recharts checkpoint**

```bash
git add package.json package-lock.json src/app/components/ui/chart.tsx
git commit -m "perf: migrate charts to Recharts 3"
```

---

## Task 9: Verify Recharts behavior and ensure P2B.1 bundle gains survive

**Files:**
- No source changes unless a verified Recharts 3 regression requires a supported public-prop correction.

**Interfaces:**
- Consumes: P2B.1 baseline/result and Recharts 3 wrapper migration.
- Produces: final technical evidence before branch PR.

- [ ] **Step 1: Repeat the clean production build measurement**

```bash
rm -rf dist
npm run build 2>&1 | tee /tmp/p2b2-final-build.log
ENTRY_REL=$(grep -oE 'src="/assets/[^"]+\.js"' dist/index.html | head -1 | cut -d'"' -f2)
ENTRY_FILE="dist${ENTRY_REL}"
P2B2_RAW=$(wc -c < "$ENTRY_FILE")
P2B2_GZIP=$(gzip -c "$ENTRY_FILE" | wc -c)
printf 'entry=%s raw=%s gzip=%s\n' "$ENTRY_FILE" "$P2B2_RAW" "$P2B2_GZIP"
find dist/assets -type f -name '*.js' -printf '%s %p\n' | sort -nr | head -10
```

Expected: P2B.1 entry reduction remains materially intact. A small Recharts-related shift in deferred chunks is acceptable; a major entry regression is not.

- [ ] **Step 2: Verify no mixed-import warning returned**

```bash
! grep -q "dynamically imported by.*entitiesService" /tmp/p2b2-final-build.log
```

Expected: PASS.

- [ ] **Step 3: Search for unsupported/private Recharts imports**

```bash
rg "recharts/(lib|es6|types)/" src || true
```

Expected: no matches introduced by P2B.

- [ ] **Step 4: Search for removed/known risky Recharts 2 APIs in application source**

```bash
rg "activeIndex=|blendStroke=|alwaysShow=|isFront=" src || true
```

Review any match manually against the Recharts 3 migration guide; do not mass-edit unrelated text matches.

- [ ] **Step 5: Perform chart-specific visual smoke**

For every reachable chart:

1. render at normal width
2. resize narrower/wider
3. hover Tooltip values
4. verify formatter output
5. verify Legend labels/colors/order
6. verify Tooltip/Legend overlap and render order
7. keyboard-focus/interact where Recharts accessibility layer provides focus behavior
8. inspect console for Recharts warnings/errors

If Tooltip/Legend layering differs, correct JSX ordering using supported Recharts 3 behavior; do not use DOM hacks.

- [ ] **Step 6: Run final local branch gates**

```bash
npm ci
npm audit --audit-level=high
npm run check
git status --short
```

Expected: all gates PASS and working tree clean.

---

## Task 10: Write the implementation report and self-review branch scope

**Files:**
- Create: `docs/superpowers/reports/2026-08-22-p2b-bundle-recharts3-report.md`

**Interfaces:**
- Consumes: all baseline/checkpoint measurements and smoke results.
- Produces: reviewable evidence for PR/merge decision.

- [ ] **Step 1: Create the report with exact measured data**

Use this structure and replace bracketed measurement labels with the actual values gathered during Tasks 1, 6 and 9; do not leave placeholders in the committed file:

```markdown
# P2B Bundle Splitting and Recharts 3 Implementation Report

## Scope
- Base SHA
- Branch/head SHA
- Changed files

## Baseline
- Recharts version
- Initial entry raw/gzip
- Largest chunks
- Vite warnings
- Audit/check status

## P2B.1 semantic splitting
- Lazy boundaries introduced
- Mixed import cleanup
- Entry raw/gzip after
- Percent reduction
- Largest chunks after
- manualChunks decision and evidence
- smoke result

## P2B.2 Recharts 3
- exact installed version
- RED type errors observed after dependency bump
- wrapper migration performed
- final entry raw/gzip
- audit/check status
- chart smoke result

## Risks / intentional non-changes
- no Supabase/database changes
- no routing redesign
- no React/Vite major changes

## Rollback
- P2B.1 commit boundary
- P2B.2 commit boundary
```

- [ ] **Step 2: Commit the report**

```bash
git add docs/superpowers/reports/2026-08-22-p2b-bundle-recharts3-report.md
git commit -m "docs: report P2B bundle and Recharts results"
```

- [ ] **Step 3: Review the complete diff against `main`**

```bash
git diff --stat main...HEAD
git diff --name-only main...HEAD
git log --oneline --decorate main..HEAD
```

Expected source/package scope is limited to the planned files plus P2B docs. Investigate any unrelated file before PR creation.

- [ ] **Step 4: Final verification-before-completion**

Use `superpowers:verification-before-completion`, then rerun fresh:

```bash
npm ci
npm audit --audit-level=high
npm run check
```

Do not claim completion from earlier cached results.

---

## Task 11: Open draft PR and run exact-head CI/Vercel gates

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: clean verified branch HEAD.
- Produces: draft PR ready for user-authenticated preview smoke.

- [ ] **Step 1: Open a draft PR to `main`**

Title:

```text
P2B: semantic bundle splitting and Recharts 3 migration
```

PR body must summarize:

- P2B.1 entry baseline -> final reduction
- lazy boundaries
- no `manualChunks` unless evidence required it
- Recharts `2.15.2 -> 3.10.1`
- audit/check results
- no Supabase/database changes
- smoke still required before merge

- [ ] **Step 2: Fetch the exact PR head SHA after creation**

Record it. All subsequent CI/Vercel success must match this exact SHA.

- [ ] **Step 3: Verify GitHub Actions CI on exact head**

Required workflow result:

- `npm ci`
- `npm audit --audit-level=high`
- `npm run check`
- conclusion `success`
- commit SHA exactly equals current PR head

- [ ] **Step 4: Verify Vercel preview deployment on exact head**

Required: deployment/status success tied to current PR head SHA. If branch moves, discard stale status evidence and re-check the new head.

- [ ] **Step 5: Keep PR draft/open for user smoke**

Do not merge yet.

---

## Task 12: User-authenticated live smoke and explicit merge gate

**Files:**
- No changes unless smoke identifies a regression.

**Interfaces:**
- Consumes: exact-head green PR preview.
- Produces: explicit user approval or a debugging cycle.

- [ ] **Step 1: Ask the user to smoke the preview**

Checklist:

1. landing/login/session restore
2. authenticated home
3. open campaign home and return
4. open every reachable dashboard/GM section once
5. switch among already-loaded sections
6. refresh and confirm expected sessionStorage navigation restoration
7. character creation ruleset -> wizard -> cancel -> reopen
8. settings/report bug/news/session sidebar as reachable
9. every reachable chart: resize, Tooltip, Legend, overlap, console
10. core campaign Realtime behavior remains normal as a regression sanity check

- [ ] **Step 2: If any failure is reported, do not merge**

Use `superpowers:systematic-debugging`. Identify whether the regression belongs to lazy loading, component remount/state ownership, Recharts typing/runtime, chunk loading or deployment caching. Add focused fixes, rerun all exact-head gates, then request smoke again.

- [ ] **Step 3: Merge only after explicit approval**

Use `superpowers:finishing-a-development-branch` and `superpowers:verification-before-completion`.

Before squash merge, freshly verify:

- PR open and mergeable
- current exact head SHA
- CI success on exact head
- Vercel success on exact head
- diff scope still expected
- user explicitly approved smoke

Squash merge to `main` with expected head SHA. Do not delete `hardening/p2b-bundle-recharts3`.

- [ ] **Step 4: Post-merge verification**

Fetch new `main` SHA and verify:

- PR merged
- `main` contains the squash commit
- GitHub CI success on merged `main` SHA
- Vercel production/main deployment success on merged SHA when available

Report final main SHA, P2B bundle reduction, Recharts version and preserved branch.

---

## Plan self-review

### Spec coverage

- Semantic lazy loading: Tasks 2-6.
- `CharacterCreationWizard` deferral: Task 4.
- mixed `entitiesService` import cleanup: Task 5.
- no premature `manualChunks`: Tasks 6 and Global Constraints.
- >=25% initial-entry target: Tasks 1 and 6.
- Recharts exact 3.10.1 migration: Tasks 7-9.
- Tooltip/Legend public type migration: Task 8.
- visual Recharts 3 risks: Task 9.
- audit/check preservation: Tasks 1, 5-11.
- user smoke before merge: Task 12.
- branch preservation: Global Constraints and Task 12.
- rollback independence: checkpoint commit structure in Tasks 2-8 and spec.

### Placeholder scan

The committed implementation report created in Task 10 must contain actual measured values; no bracketed placeholders may remain. This plan itself contains no implementation TODO/TBD markers.

### Type/interface consistency

- Lazy named-export adapters preserve the exact existing component identifiers and props.
- `SessionEntityOpenRequest` remains a type-only import.
- Recharts 3 types come from the public package root.
- `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, `ChartLegendContent`, and `ChartStyle` remain exported under their current names.
