# P2A Dependency & Supply-Chain Hardening Report

Date: 2026-08-22
Branch: `hardening/p2a-dependency-supply-chain`
Base: `main` after P1B.3 (`616bde71f0862721c34439a1dfd86f8150a8c0ce`)

## Scope

P2A was limited to dependency metadata and CI supply-chain hardening. No application feature, Supabase schema/data/RLS/Auth configuration, or bundle architecture was intentionally changed.

Changed operational files:

- `package.json`
- `package-lock.json`
- `.github/workflows/ci.yml`

Documentation added under `docs/superpowers/`.

No application source file was required for compatibility.

## RED baseline

Node 22 / npm 10 installed 353 packages and audited 354 packages. The baseline reported 5 vulnerabilities: 4 high and 1 critical.

Affected packages and paths:

| Package | Severity | Baseline path | Baseline version/range | Remediation |
| --- | --- | --- | --- | --- |
| `nanoid` | high | `vite -> postcss -> nanoid` | installed `3.3.12`, vulnerable `<=3.3.17` | transitive refresh to `3.3.18` |
| `postcss` | high | `vite -> postcss` | installed `8.5.15`, vulnerable `<=8.5.22` | transitive refresh to `8.5.26` |
| `react-router` | high | direct dependency | installed `7.13.0`, vulnerable through `7.18.1` | same-major update to `7.18.2` |
| `tar` | critical | `@tailwindcss/vite -> @tailwindcss/oxide -> tar` | installed `7.5.16`, vulnerable `<=7.5.20` | transitive refresh to `7.5.22` |
| `vite` | high | direct devDependency | installed `6.3.5`, vulnerable `<=6.4.2` | same-major update to `6.4.3` |

No `npm audit fix --force` was used.

## Dependency changes

Security-relevant effective version changes:

- `react-router`: `7.13.0` -> `7.18.2`
- `vite`: `6.3.5` -> `6.4.3`
- `postcss`: `8.5.15` -> `8.5.26`
- `nanoid`: `3.3.12` -> `3.3.18`
- `tar`: `7.5.16` -> `7.5.22`

All direct dependency declarations are now exact versions. `latest`, `^`, and `~` were removed from project-controlled direct declarations.

Notable pinning-only changes include:

- `@iconify/react` -> exact locked `6.0.2`
- `@supabase/supabase-js` -> exact locked `2.108.1`
- direct TipTap packages -> exact locked `3.29.1`
- `react-easy-crop` -> exact locked `6.0.2`

`@supabase/supabase-js` did not change the actually installed lockfile version during P2A; the project already resolved `2.108.1`. P2A only made that existing resolved version explicit in `package.json`, so no Supabase client runtime migration was performed.

No package was moved to a new major version.

## CI hardening

`.github/workflows/ci.yml` now uses:

- `actions/checkout@v7`
- `actions/setup-node@v7`
- application Node runtime remains `22`
- deterministic `npm ci`
- permanent `npm audit --audit-level=high` gate
- existing `npm run check` gate

The earlier GitHub warning that checkout/setup-node targeted the deprecated Node 20 action runtime is absent in the final run.

## Final verification

Final PR-head verification on Node `22.23.2` / npm `10.9.8`:

- `npm ci`: PASS
- install audit: `found 0 vulnerabilities`
- `npm audit --audit-level=high`: PASS, `found 0 vulnerabilities`
- `npm run typecheck`: PASS
- `npm run verify:campaign-canonical`: PASS (`P0 canonical campaign contract: PASS`)
- `npm run build`: PASS with Vite `6.4.3`
- GitHub Actions CI: PASS
- Vercel preview: PASS

The manually uploaded `package-lock.json` was checked after upload and has Git blob SHA `e895cd35afdd0018535bd181f97bfcec72ab0f78`, exactly matching the CI-generated candidate artifact that previously passed audit, clean install and `npm run check`.

## Bundle comparison

Baseline and final primary bundle are effectively identical:

- JS: `1,841.00 kB` minified
- JS gzip: `495.86 kB`
- CSS: `158.14 kB`
- CSS gzip: `24.92 kB`

Existing warnings remain intentionally deferred to P2B:

- Recharts 2.x deprecation notice
- `entitiesService.ts` mixed static/dynamic import prevents code splitting
- chunk-size warning over 500 kB

P2A introduced no material bundle regression.

## Explicit non-changes

P2A did not perform:

- Vite major migration
- Recharts 2 -> 3 migration
- React major migration
- TipTap major migration
- Tailwind major migration
- source-code refactor
- bundle/code-splitting optimization
- Supabase database/Auth changes
- `npm audit fix --force`

## Rollback

Repository-only rollback:

1. restore pre-P2A `package.json`;
2. restore pre-P2A `package-lock.json`;
3. restore pre-P2A `.github/workflows/ci.yml`.

No database or data rollback is required.

## Remaining gate

P2A is ready for authenticated application smoke. Merge remains blocked until smoke succeeds and the user explicitly approves the merge.
