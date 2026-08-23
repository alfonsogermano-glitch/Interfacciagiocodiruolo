# P2B Bundle Splitting and Recharts 3 Implementation Report

## Scope
- Base SHA: `998774464f671936c7bedc12f08d039363bb8ca8`
- Branch: `hardening/p2b-bundle-recharts3`
- PR: #7
- P2B.1 implements semantic lazy loading and mixed-import cleanup only.
- P2B.2 Recharts 3 migration has not started yet.

## Baseline
- Recharts: `2.15.2`
- Initial entry: `1,841.00 kB`
- Initial entry gzip: `495.86 kB`
- `npm audit --audit-level=high`: 0 vulnerabilities
- TypeScript / canonical campaign / Vite build: PASS
- Vite warning present: `entitiesService.ts` dynamically imported by `entityReferenceService.ts` while also statically imported elsewhere.
- Vite chunk-size warning present.

## P2B.1 semantic splitting
- Added reusable `LazyFeatureFallback`.
- Added lazy boundaries for CampaignHome, GM/dashboard sections, SessionRightSidebar, SettingsModal, ReportBugModal and NewsPage.
- Deferred CharacterCreationWizard from authenticated home.
- Replaced the ineffective runtime import in `entityReferenceService.ts` with a static `loadAdventures` import while preserving existing catch/localStorage fallback semantics.
- Final P2B.1 initial entry: `597.88 kB`
- Final P2B.1 initial entry gzip: `174.70 kB`
- Raw entry reduction: approximately `67.5%` versus baseline; acceptance target was at least 25%.
- CharacterCreationWizard deferred chunk: `43.58 kB` / `8.35 kB` gzip.
- Meaningful deferred chunks produced for CampaignHome, MyCharactersPage, EquipmentCatalogPage, SessionRightSidebar and other feature boundaries.
- `entitiesService.ts` mixed static/dynamic import warning: removed.
- `manualChunks`: not added because semantic splitting exceeded the target and produced meaningful feature chunks.
- Remaining chunk-size warning concerns large deferred/shared chunks and is not evidence that the initial entry failed the acceptance criterion.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- TypeScript / canonical campaign / Vite build: PASS on P2B.1 code head `aab2c67f5fa1812fd5a664e5962119536c692336`.

## P2B.1 deployment gate
- The initial Vercel attempts on P2B.1 were rejected by the team build-rate limit (`upgradeToPro=build-rate-limit`) before a build was attempted.
- This documentation-only checkpoint commit is intentionally used to request a fresh Vercel preview without changing application code.

## P2B.2 Recharts 3
- Status: not started.
- Planned exact version: `3.10.1`.
- P2B.2 begins only after P2B.1 preview/smoke gate is passed or explicitly waived.

## Merge gate
- PR remains draft.
- No merge before final CI, Vercel preview, authenticated smoke and explicit user approval.
