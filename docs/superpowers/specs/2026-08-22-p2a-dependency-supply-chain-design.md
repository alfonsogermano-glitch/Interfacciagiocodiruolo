# P2A — Dependency & supply-chain hardening design

Date: 2026-08-22
Branch: `hardening/p2a-dependency-supply-chain`
Base: `main` after P1B.3 (`616bde71f0862721c34439a1dfd86f8150a8c0ce`)

## Goal

Reduce the repository's current dependency and CI supply-chain risk without turning the work into a broad framework migration.

P2A is security-first. It fixes confirmed npm vulnerabilities, removes floating direct dependency declarations, refreshes selected same-major dependencies only where justified, and updates GitHub Actions away from deprecated action runtimes while preserving the application's current Node 22 execution target.

Bundle restructuring and major UI/library migrations are deferred to P2B.

## Baseline

Current CI on Node 22 reports:

- 353 installed packages / 354 audited packages;
- 5 npm vulnerabilities: 4 high and 1 critical;
- `recharts@2.15.2` deprecation warning because Recharts 2.x is no longer active;
- GitHub Actions warning that action versions currently used target deprecated Node 20 runtimes;
- production build succeeds;
- primary JavaScript bundle is about 1.841 MB minified / 495.86 KB gzip;
- Vite warns that `entitiesService.ts` is both statically and dynamically imported, preventing the dynamic import from creating a separate chunk.

Current package metadata also contains floating direct dependency declarations:

- `@iconify/react`: `latest`;
- `@supabase/supabase-js`: `^2.49.8`;
- TipTap packages: `^3.29.1`;
- `react-easy-crop`: `^6.0.2`.

Most other direct dependencies are already exact versions.

## Scope

P2A may modify only dependency/CI metadata and the minimum source code required by a security-compatible dependency update.

Expected files include:

- `package.json`;
- `package-lock.json`;
- `.github/workflows/ci.yml`;
- only source files that are demonstrably required to preserve behavior after an approved dependency update;
- P2A spec/plan/report documents.

P2A must not intentionally change application features, database schema, RLS, Supabase project configuration, data, UX, or business rules.

## Explicit exclusions

P2A does **not** include:

- Vite 6 -> newer major migration;
- Recharts 2 -> 3 migration;
- React major migration;
- Tailwind major migration;
- TipTap major migration;
- `npm audit fix --force`;
- automatic mass-upgrade of every outdated package;
- bundle chunking or route/component lazy-loading redesign;
- extraction of large base64 assets;
- removal of unused application dependencies unless independently proven safe and required for a security fix;
- changes to Supabase database/Auth configuration;
- remediation of Supabase `Leaked Password Protection Disabled`, which is treated separately as a plan/platform capability decision.

Those bundle/major-migration items belong to P2B or a later dedicated change.

## Implementation strategy

### 1. Reproduce and classify the npm audit findings

The first implementation task must run a fresh install from the committed lockfile and capture machine-readable and human-readable `npm audit` output.

For every high/critical finding record:

- advisory/package name;
- installed vulnerable version;
- dependency path from the project root;
- affected version range;
- patched version range;
- whether the fix is direct or transitive;
- whether the available fix stays within the package's current major version;
- whether the package is used at runtime, build time, or only through tooling.

No package update is accepted merely because it is "latest" or "outdated".

### 2. Resolve high/critical vulnerabilities with the narrowest safe update

Preferred order:

1. patch update;
2. minor update within the current major;
3. transitive resolution caused by a safe direct dependency update;
4. explicit lockfile refresh where no direct package declaration needs to change.

A major-version update is out of P2A unless the audit proves there is no patched version within the current major. If that occurs, stop and redesign that package as a separate migration rather than forcing it into P2A.

`npm audit fix --force` is forbidden.

### 3. Pin all direct dependency declarations

After the vetted dependency set is chosen, every direct `dependencies`, `devDependencies`, and project-controlled peer dependency version in `package.json` must be deterministic.

Rules:

- remove `latest`;
- remove `^` and `~` from direct declarations;
- use the exact version represented by the regenerated lockfile;
- preserve package-lock v3 and npm as the package manager;
- do not introduce pnpm/yarn lockfiles.

This includes pinning `@iconify/react`, `@supabase/supabase-js`, all direct TipTap packages, and `react-easy-crop` to exact vetted versions.

### 4. Supabase client treatment

`@supabase/supabase-js` remains on major 2.

Before selecting a new 2.x version, implementation must inspect the current Supabase changelog/documentation for relevant Auth, Realtime, PostgREST, and breaking-change notes between the locked version and the proposed version.

The package should be refreshed to a current vetted 2.x release only if the changelog review and project tests show no incompatible behavior. It must then be pinned exactly.

No Supabase API rewrite is part of P2A unless required by that same-major update.

### 5. GitHub Actions supply-chain maintenance

The CI workflow currently uses action releases that GitHub reports as targeting deprecated Node 20 action runtimes.

P2A will move `actions/checkout` and `actions/setup-node` to the current supported major versions verified at implementation time.

The application's CI runtime remains explicitly Node 22 unless a concrete incompatibility is discovered.

The workflow must continue to run:

- `npm ci`;
- the existing `npm run check` gate.

P2A should add a high/critical audit gate after installation, using a deterministic command that fails CI on unresolved high or critical npm advisories while allowing lower severities to be reported for later review.

### 6. Recharts and bundle warnings

`recharts@2.15.2` remains unchanged in P2A unless it is directly implicated in a high/critical advisory with no safe 2.x remediation.

Its deprecation is documented as technical debt for P2B.

Likewise, the existing 1.841 MB JavaScript bundle warning and the mixed static/dynamic `entitiesService.ts` import warning are baseline observations only. P2A must not attempt chunking refactors.

## Testing and regression gates

Before dependency changes, capture a RED/baseline record of:

- `npm ci` result;
- full `npm audit` summary and detailed high/critical advisories;
- `npm run typecheck`;
- `npm run verify:campaign-canonical`;
- `npm run build`;
- build bundle sizes and warnings;
- current Vercel preview status when a PR exists.

After changes, require:

- clean `npm ci` from the committed lockfile;
- zero critical npm advisories;
- zero high npm advisories;
- no use of `npm audit fix --force`;
- `npm run check` success;
- canonical campaign regression PASS;
- production build success;
- no new TypeScript errors;
- no unexpected new build warnings;
- bundle size not materially worse than baseline unless explained by a required security update;
- Vercel preview success;
- authenticated application smoke test before merge.

The audit gate should be reproducible locally and in CI.

## Smoke test

The final human smoke should exercise flows most exposed to dependency changes:

- login/logout and session restore;
- campaign list/open/save;
- GM entity screens;
- player campaign access;
- Realtime campaign updates/presence already stabilized in P1B.2;
- rich text editor content load/save where TipTap is used;
- any screen using Iconify/MUI icons;
- at least one chart screen using Recharts, confirming that leaving Recharts 2 in place caused no regression.

## Rollback

Repository rollback is the exact reversal of the P2A commit(s): restore the prior `package.json`, `package-lock.json`, CI workflow, and any minimal compatibility source edits.

There is no database/data rollback because P2A does not modify Supabase schema or data.

## Acceptance criteria

P2A is complete only when all of the following are true:

1. the original 4 high + 1 critical audit baseline is fully explained by named advisories/dependency paths;
2. `npm audit` reports zero high and zero critical findings on the final lockfile;
3. every direct dependency declaration is pinned to an exact version;
4. no unapproved major package migration was introduced;
5. `@supabase/supabase-js` remains major 2 and any version refresh is backed by changelog review;
6. GitHub Actions no longer emits the deprecated action-runtime warning targeted by this work;
7. existing `npm run check` remains green;
8. CI includes an audit gate for future high/critical advisories;
9. Vercel preview is green;
10. authenticated smoke is green;
11. merge still requires explicit user approval.

## Follow-up P2B

After P2A is merged and stable, P2B will address performance/modernization separately:

- actual code splitting/lazy loading;
- mixed static/dynamic import cleanup;
- large embedded/base64 assets;
- Recharts 2 -> 3 migration;
- bundle-size reduction and optional bundle budgets;
- evaluation of larger framework/toolchain major upgrades only when justified.
