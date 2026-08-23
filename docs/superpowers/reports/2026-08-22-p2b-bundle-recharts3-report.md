# P2B Bundle Splitting and Recharts 3 Implementation Report

## Scope
- Base SHA: `998774464f671936c7bedc12f08d039363bb8ca8`
- Branch: `hardening/p2b-bundle-recharts3`
- PR: #7
- P2B.1: semantic lazy loading and mixed-import cleanup.
- P2B.2: exact Recharts `3.10.1` migration and shared chart-wrapper type adaptation.
- No Supabase/database/Auth/RLS changes.

## Baseline
- Recharts: `2.15.2`
- Initial entry: `1,841.00 kB`
- Initial entry gzip: `495.86 kB`
- `npm audit --audit-level=high`: 0 vulnerabilities
- TypeScript / canonical campaign / Vite build: PASS
- Vite mixed static/dynamic warning present for `entitiesService.ts`.
- Vite chunk-size warning present.

## P2B.1 semantic splitting
- Added reusable `LazyFeatureFallback`.
- Added lazy boundaries for CampaignHome, GM/dashboard sections, SessionRightSidebar, SettingsModal, ReportBugModal and NewsPage.
- Deferred CharacterCreationWizard from authenticated home.
- Replaced the ineffective runtime import in `entityReferenceService.ts` with a static `loadAdventures` import while preserving catch/localStorage fallback semantics.
- Final P2B.1 initial entry: `597.88 kB`.
- Final P2B.1 initial entry gzip: `174.70 kB`.
- Raw entry reduction: approximately `67.5%` versus baseline; acceptance target was at least 25%.
- CharacterCreationWizard deferred chunk: `43.58 kB` / `8.35 kB` gzip.
- Meaningful deferred chunks produced for CampaignHome, MyCharactersPage, EquipmentCatalogPage, SessionRightSidebar and other feature boundaries.
- `entitiesService.ts` mixed static/dynamic import warning: removed.
- `manualChunks`: not added because semantic splitting exceeded the target and produced meaningful feature chunks.
- Remaining chunk-size warning concerns large deferred/shared chunks, not the initial-entry acceptance target.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- TypeScript / canonical campaign / Vite build: PASS on P2B.1 code head `aab2c67f5fa1812fd5a664e5962119536c692336`.

## P2B.1 deployment and smoke gate
- Initial preview attempts were rejected by the Vercel team build-rate limit before build execution.
- Fresh documentation-only checkpoint `e30b2ea177677beaf39cdb2a9085c1b31f3271ba` produced Vercel SUCCESS and GitHub CI SUCCESS without changing application code.
- Authenticated P2B.1 smoke completed by the user on 2026-08-23: PASS.
- Covered Home, Campaign Home, GM/dashboard lazy sections, repeat navigation, F5/session state, CharacterCreationWizard reopen flow, Settings and Report Bug.

## P2B.2 Recharts 3 RED
- Exact candidate: `recharts@3.10.1`.
- Candidate install: PASS, 0 vulnerabilities.
- Before wrapper migration, TypeScript failed only in `src/app/components/ui/chart.tsx` with five Recharts-3 compatibility errors:
  1. Tooltip custom content no longer received `payload` through the old component-props contract.
  2. Tooltip custom content no longer received `label` through the old component-props contract.
  3. `LegendProps` no longer exposed the old `payload` field used by the wrapper Pick type.
  4. Legend payload consequently became `unknown` for `.length`.
  5. Legend payload consequently became `unknown` for `.map`.
- RED harness run: `32631034826`.

## P2B.2 Recharts 3 GREEN
- Verified migration commit: `fe4712e6f223f8cab8d5abb1d3331a83e33386b7` (`perf: migrate charts to Recharts 3`).
- Commit scope is exactly:
  - `package.json`
  - `package-lock.json`
  - `src/app/components/ui/chart.tsx`
- Direct dependency pinned exactly: `recharts: 3.10.1`.
- Lockfile resolves Recharts 3.10.1 and its npm-resolved transitive graph.
- Wrapper now uses public root exports `TooltipContentProps`, `TooltipValueType`, and `LegendPayload`; no Recharts private-module imports were introduced.
- Tooltip labels accept the Recharts 3 `string | number` contract.
- Tooltip formatter receives the Recharts 3 payload array contract.
- Tooltip item keys were stabilized because Recharts 3 permits functional `dataKey` values.
- Legend content uses a public `ReadonlyArray<LegendPayload>` contract and preserves existing vertical-align behavior.
- `npm audit --audit-level=high`: PASS, 0 vulnerabilities.
- TypeScript: PASS.
- Canonical campaign verification: PASS.
- Production Vite build: PASS.
- Final initial entry remains exactly `597.88 kB` / `174.70 kB` gzip, so P2B.1 bundle gains are fully preserved.
- The old Recharts 2 npm deprecation warning is absent after resolving Recharts 3.
- Vercel preview for migration commit `fe4712e6...`: SUCCESS.
- Temporary RED/GREEN diagnostic workflows were removed after verification; no P2B-added `contents:write` workflow remains.

## Remaining final gate
- Final normal CI and Vercel must pass on the exact cleanup/report HEAD.
- Final visual smoke is still required for reachable chart UI: render, responsive resize, Tooltip, Legend, layering/overlap, keyboard/accessibility where applicable, and browser console warnings.
- PR remains draft until those gates pass.
- No merge before explicit user approval.
