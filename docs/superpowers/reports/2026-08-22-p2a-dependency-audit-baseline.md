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

P2A adds the permanent command below to the branch CI before any dependency or lockfile change:

```bash
npm audit --audit-level=high
```

The first run is expected to fail. Its purpose is to capture the exact advisory/package paths before selecting any remediation.

## Advisory classification

To be filled from the failing RED CI log before any package version is changed.

| Package | Severity | Installed/dependency path | Vulnerable range | Fix available | Direct/transitive | Current-major fix? | Runtime/build/tooling |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Non-security baseline

The prior successful CI run confirms:

- `npm ci`: success;
- `npm run typecheck`: success;
- `npm run verify:campaign-canonical`: `P0 canonical campaign contract: PASS`;
- `npm run build`: success;
- bundle baseline: ~1.841 MB minified / ~495.86 KB gzip.

No dependency version has been changed at this point.
