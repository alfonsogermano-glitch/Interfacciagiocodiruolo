# P2B Bundle Splitting and Recharts 3 Design

**Status:** Approved design; implementation not started

**Date:** 2026-08-22

**Branch:** `hardening/p2b-bundle-recharts3`

**Base `main`:** `998774464f671936c7bedc12f08d039363bb8ca8`

## Objective

Reduce Hollowgate's initial JavaScript cost through semantic lazy loading, then migrate Recharts from `2.15.2` to the current stable `3.10.1`, while preserving application behavior, UI, navigation state, Supabase behavior, and all stabilization guarantees completed in P0/P1/P2A.

P2B is intentionally split into two independently testable checkpoints:

1. **P2B.1 — semantic code splitting**
2. **P2B.2 — Recharts 3 migration**

P2B.2 starts only after P2B.1 is green.

## Current evidence

### Bundle architecture

`src/app/App.tsx` currently imports nearly every dashboard/GM screen statically even though `Dashboard` renders one tab at a time. This forces large feature trees into the initial application graph.

High-value boundaries include:

- `CampaignHome`
- `GamePhases`
- `AdventureManager`
- `PlayerCharacters`
- `MyCharactersPage`
- `CampaignsPage`
- `NPCsManager`
- `GameMap`
- `EnvironmentManager`
- `SceneEncounterManager`
- `CluesManager`
- `SituationsManager`
- `MonstersManager`
- `CombatTracker`
- `EquipmentCatalogPage`
- `VisualAssetsManager`
- conditional secondary surfaces such as settings, bug report, news and session right sidebar

`src/app/home/HomeScreen.tsx` also imports `CharacterCreationWizard` statically although it is mounted only after the user explicitly starts character creation. The source file itself is approximately 73 KB before dependencies.

`src/services/campaign/entityReferenceService.ts` uses a dynamic import for `../supabase/entitiesService`, but that service is statically imported elsewhere in the application. Vite therefore cannot isolate it reliably as a separate lazy chunk; the current dynamic import is not a meaningful code-splitting boundary.

### Recharts

`package.json` pins `recharts` to `2.15.2`.

The official Recharts 3 migration guide identifies breaking changes relevant to the existing wrapper in `src/app/components/ui/chart.tsx`:

- custom Tooltip content types move from `TooltipProps`-style typing to `TooltipContentProps`
- internal `Legend.payload` handling is no longer exposed through the same public type contract
- render order determines z-order for Tooltip/Legend/chart items
- accessibility behavior changed
- minimum supported TypeScript is 5.x, Node is 18+, React is 16.8+, and TS target must be ES6 or newer

The project already satisfies those floors: TypeScript 5.7.3, Node 22 in CI, React 18.3.1 and TS target ES2022.

Official references:

- https://github.com/recharts/recharts/wiki/3.0-migration-guide
- https://www.npmjs.com/package/recharts

## Non-goals

P2B must not:

- change Supabase schema, RLS, Realtime policy, storage, authentication, or database data
- change React major version
- change Vite major version
- change TipTap versions or editor behavior
- redesign navigation or introduce React Router as a prerequisite
- refactor feature business logic merely to make files smaller
- alter dashboard state persistence semantics
- alter campaign membership or ownership behavior
- alter visual design intentionally
- introduce broad dependency upgrades unrelated to Recharts
- add `manualChunks` before measuring the result of semantic lazy boundaries

## P2B.1 architecture — semantic lazy loading

### Principle

Split at feature boundaries that already exist in the UI and are activated conditionally. The goal is to remove code from the initial dependency graph, not merely move code between eagerly requested chunks.

### Static core

Keep the minimum boot path static:

- React boot and `main.tsx`
- authentication/provider stack
- campaign/provider stack required to resolve session state
- landing page and authenticated home shell
- `AppShell`, `LeftSidebar`, `TopBar`
- small shared controls required immediately by the shell

### Lazy feature boundaries

In `src/app/App.tsx`, convert dashboard-only and conditionally mounted feature imports to `React.lazy` imports. Named exports must be adapted to lazy's default-export contract using `.then(module => ({ default: module.NamedExport }))`.

At minimum, all GM/dashboard sections listed in **Current evidence** become lazy boundaries. `CampaignHome` must also become lazy because it is a separate authenticated view and is not required for the initial home screen.

Conditionally opened large secondary surfaces should also be lazy where doing so does not complicate state ownership. Initial candidates:

- `SettingsModal`
- `ReportBugModal`
- `NewsPage`
- `SessionRightSidebar`

In `src/app/home/HomeScreen.tsx`, `CharacterCreationWizard` becomes a lazy named import because it is only needed after explicit user action.

### Suspense behavior

Use one reusable lightweight dashboard fallback rather than a different spinner per lazy screen. It must use the existing dashboard CSS variables so palette behavior remains unchanged.

The fallback must not reset application state. Lazy loading occurs inside the existing component/state tree.

### Mixed import cleanup

`loadAdventureReferences()` in `entityReferenceService.ts` should use a normal static import of `loadAdventures` from `entitiesService`, because the same module is already part of other statically/lazily loaded feature graphs. This removes the misleading mixed static/dynamic import warning and makes chunk ownership deterministic.

This change must preserve the existing catch/fallback behavior around the `loadAdventures()` call; only module loading strategy changes.

### No initial `manualChunks`

Do not add `build.rollupOptions.output.manualChunks` during the first implementation pass.

After semantic splitting, inspect Vite's production build output. Add manual chunk configuration only if a concrete remaining problem is demonstrated, such as a shared vendor chunk dominating the initial request graph or circular chunk warnings. Any manual chunk rule requires evidence in the implementation report.

## P2B.1 acceptance criteria

Before/after measurements must be recorded from `npm run build`.

Required:

- `npm ci` succeeds
- `npm audit --audit-level=high` reports 0 high/critical vulnerabilities
- `npm run typecheck` succeeds
- `npm run verify:campaign-canonical` succeeds
- `npm run build` succeeds
- no mixed static/dynamic import warning for `entitiesService.ts`
- initial entry JavaScript is at least **25% smaller** than the pre-P2B baseline measured from `main`
- lazy chunks are produced for meaningful feature boundaries
- navigating between dashboard sections preserves existing behavior
- refresh/sessionStorage behavior remains unchanged
- reopening an already loaded section works without state corruption

The 25% threshold applies to initial entry JavaScript, not total bytes across all chunks. Total application code may remain similar; deferral is the goal.

## P2B.2 architecture — Recharts 3.10.1

### Dependency change

Update only Recharts and the package lock as required:

- `recharts`: `2.15.2` -> `3.10.1`

Do not loosen the direct dependency pin.

### Wrapper migration

Update `src/app/components/ui/chart.tsx` to compile against Recharts 3 public types without relying on removed internal Legend payload typing.

Requirements:

- use Recharts 3 public Tooltip content types for custom tooltip props
- define the legend-content payload shape locally if the public `LegendProps` no longer exposes the previous payload contract needed by the wrapper
- preserve existing `ChartConfig`, CSS variable generation and visual indicator behavior
- preserve `ChartTooltip`, `ChartLegend`, `ChartContainer` public exports used by application code
- do not reach into Recharts internal/private modules
- do not suppress migration errors with broad `any` unless an isolated unavoidable compatibility boundary is documented

### Visual/behavioral risks to verify

Smoke specifically for Recharts 3 changes:

- Tooltip content and formatting
- Legend labels/colors/order
- Tooltip/Legend z-order and overlap
- responsive sizing
- keyboard/accessibility interaction where the chart is focusable
- axis/grid rendering if used
- active states if used

If a Recharts 3 default visually changes an existing chart and the product relied on the old appearance, preserve the old appearance explicitly with supported public props rather than downgrading.

## P2B.2 acceptance criteria

Required:

- exact `recharts` version is `3.10.1`
- lockfile resolves Recharts 3.10.1
- `npm audit --audit-level=high` remains green
- `npm run check` succeeds
- no TypeScript errors in `chart.tsx`
- no Recharts 2 deprecation/runtime warning remains
- chart UI retains intended Tooltip, Legend, responsive sizing and layering
- P2B.1 bundle gains are not materially regressed

## Measurement protocol

Capture at each checkpoint:

1. production build output file names and raw/gzip sizes when available
2. initial entry chunk size
3. largest five JavaScript chunks
4. whether Vite emits chunk-size or mixed-import warnings
5. `npm audit --audit-level=high` result
6. `npm run check` result

Record the baseline from `main` before implementation, then P2B.1 result, then P2B.2 result.

## Smoke test matrix

### General application

- logged-out landing loads
- login/session restoration works
- authenticated home loads
- campaign selection works
- campaign home opens
- return to home works
- settings open/save/close works
- report bug modal opens/closes
- news surface opens if reachable

### Lazy dashboard sections

Open each reachable dashboard section at least once, then switch away and back:

- phases
- adventures
- players
- characters
- campaigns
- NPCs
- map
- environments
- scene/encounter
- clues
- situations
- monsters
- combat
- equipment catalog
- visual assets

### Character creation lazy boundary

- open ruleset picker
- choose a ruleset
- wizard loads
- cancel wizard
- reopen wizard
- create/save path still behaves as before

### Recharts

For every reachable chart:

- chart renders
- resize window/container
- hover Tooltip
- inspect Legend
- verify no unexpected overlap
- keyboard-focus chart if accessibility layer exposes focus behavior

## Rollback strategy

P2B.1 and P2B.2 must be separately committable.

If P2B.1 regresses navigation or state, revert the lazy-loading commits without touching dependency changes because P2B.2 will not yet have started.

If P2B.2 regresses charts, revert only the Recharts dependency/wrapper migration commits, returning to the already-verified P2B.1 state.

No database rollback is involved.

## Merge gate

Do not merge directly after CI.

Required sequence:

1. branch implementation complete
2. local/branch verification green
3. GitHub CI green on exact branch head
4. Vercel preview green on exact branch head
5. user-authenticated live smoke test
6. explicit user approval
7. squash merge to `main`
8. post-merge CI/Vercel verification

Preserve `hardening/p2b-bundle-recharts3` after merge unless the user explicitly requests deletion.
