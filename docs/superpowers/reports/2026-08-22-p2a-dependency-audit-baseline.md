# P2A dependency audit baseline

Date: 2026-08-22
Branch: `hardening/p2a-dependency-supply-chain`
Base: `main` after P1B.3 (`616bde71f0862721c34439a1dfd86f8150a8c0ce`)

## Baseline source

The pre-change CI baseline on Node 22 / npm 10 reports:

- 353 packages installed / 354 packages audited;
- 5 vulnerabilities total;
- 4 high severity;
- 1 critical severity;
- production build succeeds;
- canonical campaign verification passes;
- Recharts 2.x deprecation warning is present;
- primary JS bundle is about 1.841 MB minified / 495.86 KB gzip;
- Vite reports the pre-existing mixed static/dynamic `entitiesService.ts` import warning.

## RED harness

P2A added `npm audit --audit-level=high` before changing the dependency graph.

RED CI run `32598737715`, job `97093651538` behaved as required:

- `npm ci`: success;
- `npm audit --audit-level=high`: failure;
- `npm run check`: skipped after the failing security gate.

A second read-only diagnostic run (`32598827908`) added `npm ls nanoid postcss react-router tar vite` to establish exact dependency paths.

## Advisory classification

| Package | Severity | Installed / dependency path | Vulnerable range | Selected remediation | Direct/transitive | Same-major fix? | Role |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `nanoid` | High | `vite@6.3.5 -> postcss@8.5.15 -> nanoid@3.3.12` | `<=3.3.17` | `3.3.18` through normal lockfile audit fix | transitive | yes | build tooling |
| `postcss` | High | `vite@6.3.5 -> postcss@8.5.15` | `<=8.5.22` | `8.5.26` through normal lockfile audit fix | transitive | yes | build tooling |
| `react-router` | High | root direct `react-router@7.13.0` | `6.0.0 - 7.18.1` | exact `7.18.2` | direct | yes, major 7 | runtime |
| `tar` | Critical | `@tailwindcss/vite@4.1.12 -> @tailwindcss/oxide@4.1.12 -> tar@7.5.16` | `<=7.5.20` | `7.5.22` through normal lockfile audit fix | transitive | yes | build tooling |
| `vite` | High | root `vite@6.3.5`; also deduped beneath `@tailwindcss/vite` and `@vitejs/plugin-react` | `<=6.4.2` | exact `6.4.3` | direct | yes, major 6 | build tooling |

The RED audit included multiple GHSA records across those five affected packages, including RCE/XSS/DoS/open-redirect issues in the affected React Router range and a critical tar advisory set. No `--force` remediation was required.

## Candidate generation and GREEN pre-commit verification

A CI workspace generated a candidate without repository write permission:

```bash
npm install --package-lock-only --save-exact react-router@7.18.2 vite@6.4.3
npm audit fix --package-lock-only
```

The candidate then pinned every direct dependency/devDependency to its exact already-resolved lock version and retained React/ReactDOM peers at exact `18.3.1`.

Candidate CI run `32598905898`, job `97094062494` verified before artifact upload:

- `npm audit --audit-level=high`: success;
- audit total: `0 vulnerabilities`;
- clean `rm -rf node_modules && npm ci`: success;
- clean install: 353 packages / 354 audited / `0 vulnerabilities`;
- `npm run check`: success;
- canonical campaign contract: PASS;
- Vite production build: success using `vite 6.4.3`;
- JS bundle unchanged at about 1.841 MB minified / 495.86 KB gzip;
- only the pre-existing mixed import and chunk-size warnings remain;
- no application source edit was required.

The candidate package graph includes:

- `react-router 7.18.2`;
- `vite 6.4.3`;
- `postcss 8.5.26`;
- `nanoid 3.3.18`;
- `tar 7.5.22`.

`@supabase/supabase-js` was already resolved by the pre-P2A lockfile to `2.108.1`; P2A only makes that already-installed major-2 version explicit in `package.json`, so it does not introduce a Supabase client graph upgrade.

## Direct version pinning

The verified candidate removes floating direct declarations:

- `@iconify/react`: `latest` -> exact `6.0.2` (the version already resolved by the prior lockfile);
- `@supabase/supabase-js`: `^2.49.8` -> exact `2.108.1` (already resolved by the prior lockfile);
- direct TipTap packages: `^3.29.1` -> exact `3.29.1`;
- `react-easy-crop`: `^6.0.2` -> exact `6.0.2`;
- security fixes: `react-router 7.18.2`, `vite 6.4.3`.

No Vite major, React major, Recharts major, Tailwind major, TipTap major, or Supabase major change is part of P2A.

## Non-security baseline

The prior successful CI run confirms:

- `npm ci`: success;
- `npm run typecheck`: success;
- `npm run verify:campaign-canonical`: `P0 canonical campaign contract: PASS`;
- `npm run build`: success;
- bundle baseline: ~1.841 MB minified / ~495.86 KB gzip.

The verified candidate preserves the same bundle measurements and existing build-warning profile.
