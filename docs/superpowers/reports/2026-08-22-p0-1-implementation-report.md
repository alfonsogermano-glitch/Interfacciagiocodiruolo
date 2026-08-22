# Hollowgate P0.1 — Implementation Report

Date: 2026-08-22
Branch: `stabilization/p0`
PR: #1 (`P0 stabilization`, draft)
Spec: `docs/superpowers/specs/2026-08-22-p0-stabilization-design.md`
Plan: `docs/superpowers/plans/2026-08-22-p0-1-code-guardrails.md`

## Status

P0.1 code guardrails are complete.

The project now has a repeatable clean-install verification path based on TypeScript no-emit checking plus the existing Vite production build. No Supabase schema, Edge Function, Storage policy, or product-feature change is included in P0.1.

## Guardrails added

- TypeScript pinned to `5.7.3` in both `package.json` and `package-lock.json`.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run check` runs type-check followed by the production build.
- Minimal `tsconfig.json` added with `strict: false` to establish a baseline without turning P0.1 into a broad legacy refactor.
- Permanent GitHub Actions workflow `.github/workflows/ci.yml` added with read-only repository permissions.
- CI uses Node 22, `npm ci`, then `npm run check`.
- Temporary bootstrap/diagnostic workflows and files used during stabilization were removed from the final changeset.

## Source-level corrections required by the baseline

The full-project type-check exposed a set of pre-existing inconsistencies. Fixes were kept narrow and preserve the current runtime intent:

- corrected `character.prodigio` to the canonical `character.prodigi` field;
- fixed `EnvironmentManager.normalizeEnvironment` so the campaign fallback is passed explicitly instead of referring to an out-of-scope identifier;
- aligned `OwnedCharacter` timestamp typing with data actually returned by services;
- corrected `ImageCrop` type import/re-export in monster types;
- aligned monster critical-box lookups with the existing `caselleFrischezzaCruciali` catalog field;
- added `campaign-home` to the real LeftSidebar view union;
- completed missing equipment-catalog row mappings and database row typings;
- removed the explicit `.tsx` suffix from the application entry import for the configured TypeScript module-resolution model;
- made the entity-reference Supabase result conversion explicit at the service boundary;
- corrected the Tauri equipment delete call to the actual `deleteTauriEntity(entityKey, id)` signature;
- rewrote the visual-assets promise assignment to satisfy the declared cache-promise type while preserving fallback/cache behavior;
- removed the unused legacy `src/services/supabase/campaignService.ts`, which referenced undefined defaults and contained an obsolete `owner_profile_id: 'demo-user'` creation path;
- aligned `loadCharacters` return typing with the local-storage representation, where owner/ruleset may be absent;
- aligned Monster/Adventure service interfaces with the data returned by the current mappers.

## Verification evidence

GitHub Actions workflow: `CI`
Run ID: `32587403564`
Job ID: `97065779075`
Verified merge ref: `23d2951e47a0812084057afe6b5862a653a3b4d2`
Branch head verified in that run: `9ceb147e5929b5f3a71961428a06bf74c7824c58`
Base: `95d482313d2bb792c3904f8a4edcb359e510d791`

Observed results from a clean GitHub-hosted Ubuntu runner:

- `npm ci` — PASS
- `npm run typecheck` — PASS
- `npm run build` — PASS
- Vite 6.3.5 transformed 1,945 modules and completed the production build successfully.

The workflow was run against GitHub's pull-request merge ref, so it verifies the P0.1 branch integrated on top of the current `main`, not only the branch in isolation.

## Deferred findings

These were discovered by P0.1 verification but are intentionally not changed blindly inside this stage:

1. `npm ci` reports 5 dependency vulnerabilities: 4 high and 1 critical. A targeted dependency/security audit is required. `npm audit fix --force` must not be applied without reviewing the affected packages and breaking-change risk.
2. Recharts 2.15.2 is reported as deprecated; v3 is the maintained line. Migration is deferred because it can affect rendering/API behavior.
3. The main JavaScript bundle is approximately 1.84 MB before gzip (~496 KB gzip) and Vite reports chunks over 500 KB. This is consistent with already-known asset/bundle technical debt and should be handled as a dedicated performance task.
4. `entitiesService.ts` is both statically and dynamically imported, so the dynamic import currently cannot create a separate chunk. This is a performance warning, not a P0.1 correctness failure.
5. GitHub Actions warns that the internals of `actions/checkout@v4` / `actions/setup-node@v4` target deprecated Node 20 while the runner forces Node 24. The workflow itself runs successfully; action-version maintenance can be handled separately.

## Data and production safety

- No production database operation was performed in P0.1.
- No Supabase Storage object or policy was changed.
- No Edge Function was changed or deployed.
- `main` was not modified or merged.
- PR #1 remains draft while the broader P0 stabilization continues.

## P0.1 definition of done

Satisfied:

- clean dependency install via committed lockfile;
- project-wide TypeScript check succeeds;
- production Vite build succeeds;
- CI automatically repeats both checks;
- temporary bootstrap machinery removed;
- compiler-discovered source errors corrected without broad suppression;
- current production branch remains untouched.

The next stabilization stage is P0.2: Supabase schema alignment (`characters.adventure_id`) and Storage-policy hardening, with pre/post migration verification and no deletion or relocation of user assets.
