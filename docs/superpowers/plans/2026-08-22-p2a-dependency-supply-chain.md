# P2A Dependency & Supply-Chain Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the repository's current high/critical npm advisories, pin all direct dependency versions, modernize the CI action runtimes, and add a permanent high/critical audit gate without introducing unrelated major migrations.

**Architecture:** Treat P2A as a metadata-first security change. First reproduce and classify every current advisory from the committed lockfile, then apply the narrowest same-major dependency/lockfile changes that remove high/critical findings, pin all direct declarations exactly, and finally update CI actions plus an audit gate. Any source change is permitted only when a vetted same-major dependency update demonstrably requires compatibility work.

**Tech Stack:** npm 10 / package-lock v3, Node 22, React 18.3.1, TypeScript 5.7.3, Vite 6.3.5, Supabase JS major 2, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-22-p2a-dependency-supply-chain-design.md`

## Global Constraints

- Zero high and zero critical npm advisories on the final committed lockfile.
- Never run or accept `npm audit fix --force`.
- Do not introduce Vite, Recharts, React, Tailwind, or TipTap major migrations.
- Keep `@supabase/supabase-js` on major 2 and review current Supabase changelog/docs before selecting a new 2.x release.
- Pin every direct dependency/devDependency/project-controlled peer dependency to an exact version: no `latest`, `^`, or `~`.
- Keep npm/package-lock v3 as the package manager/lockfile.
- Preserve CI application runtime at Node 22.
- P2A does not modify Supabase schema, Auth settings, data, RLS, application features, business rules, or bundle architecture.
- Recharts 2 -> 3 and bundle/code-splitting work remain P2B unless an audit proves they are mandatory for security.
- Merge remains gated by CI, Vercel, authenticated smoke, and explicit user approval.

---

### Task 1: Reproduce and classify the vulnerability baseline

**Files:**
- Read: `package.json`
- Read: `package-lock.json`
- Create: `docs/superpowers/reports/2026-08-22-p2a-dependency-audit-baseline.md`

**Interfaces:**
- Consumes: committed `package-lock.json` at the P2A branch head.
- Produces: a fixed advisory table used by Task 2 to choose allowed fixes.

- [ ] **Step 1: Reproduce installation from the lockfile**

Run on Node 22 / npm 10:

```bash
rm -rf node_modules
npm ci
```

Expected baseline: install succeeds and npm reports the existing vulnerability total (currently 5: 4 high, 1 critical).

- [ ] **Step 2: Capture machine-readable audit evidence**

```bash
npm audit --json > /tmp/p2a-audit-baseline.json || true
node -e "const a=require('/tmp/p2a-audit-baseline.json'); console.log(JSON.stringify(a.metadata?.vulnerabilities ?? {}, null, 2))"
```

Expected baseline totals must reconcile with the human-readable CI baseline before any update is accepted.

- [ ] **Step 3: Capture dependency paths and fix availability**

Run:

```bash
npm audit
npm ls --all > /tmp/p2a-npm-ls.txt
```

For every high/critical advisory, record in the report:

```text
package | severity | installed version | dependency path | vulnerable range | patched/fix version | direct/transitive | current-major fix available? | runtime/build/tooling
```

No advisory may be represented only by the aggregate count.

- [ ] **Step 4: Capture the non-security baseline that P2A must preserve**

Run:

```bash
npm run typecheck
npm run verify:campaign-canonical
npm run build
```

Record build output including the current bundle baseline (~1.841 MB minified / ~495.86 KB gzip) and existing warnings. These are comparison evidence only; P2A does not optimize them.

- [ ] **Step 5: Commit the baseline report**

```bash
git add docs/superpowers/reports/2026-08-22-p2a-dependency-audit-baseline.md
git commit -m "docs: capture P2A dependency audit baseline"
```

---

### Task 2: Select and apply the narrowest security fixes

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify only if proven necessary: source file(s) directly broken by a vetted same-major update
- Update: `docs/superpowers/reports/2026-08-22-p2a-dependency-audit-baseline.md`

**Interfaces:**
- Consumes: advisory classification from Task 1.
- Produces: a deterministic dependency graph with zero high/critical advisories and no unapproved major migration.

- [ ] **Step 1: Map each advisory to its minimum safe remediation**

For each Task 1 advisory, choose fixes in this strict order:

```text
patch within current major
minor within current major
safe direct dependency update that refreshes the transitive vulnerable package
lockfile-only transitive refresh
```

If any high/critical advisory has no patched path inside the affected direct dependency's current major, stop that package and redesign it as a separate migration instead of using `--force`.

- [ ] **Step 2: Review Supabase JS before changing its version**

If `@supabase/supabase-js` is part of the selected remediation or is intentionally refreshed, inspect current Supabase changelog/docs for breaking changes and relevant Auth/Realtime/PostgREST changes from the locked release to the proposed 2.x version.

Record the chosen exact version and compatibility conclusion in the report. Do not move to major 3.

- [ ] **Step 3: Update only approved dependencies**

Use exact versions, for example:

```bash
npm install --save-exact <direct-package>@<approved-version>
npm install --save-dev --save-exact <dev-package>@<approved-version>
```

For a transitive-only remediation where no direct declaration should change, use the smallest deterministic lockfile refresh that resolves that transitive package. Do not run `npm update` without package names and do not run `npm audit fix --force`.

- [ ] **Step 4: Pin every direct declaration**

Edit `package.json` so every direct version under `dependencies`, `devDependencies`, and project-controlled peers is an exact version.

Required removals include:

```text
@iconify/react: latest
@supabase/supabase-js: ^...
all direct @tiptap/*: ^...
react-easy-crop: ^...
```

Do not change packages merely because newer majors exist.

- [ ] **Step 5: Regenerate and validate the lockfile**

```bash
rm -rf node_modules
npm ci
npm audit --audit-level=high
```

Expected: `npm ci` succeeds; audit exits 0 with zero high and zero critical advisories.

- [ ] **Step 6: Run behavioral/build regressions**

```bash
npm run check
```

Expected:

```text
TypeScript: success
P0 canonical campaign contract: PASS
Vite production build: success
```

Any compatibility source edit must be minimal and directly traceable to an approved dependency update.

- [ ] **Step 7: Commit dependency changes**

```bash
git add package.json package-lock.json docs/superpowers/reports/2026-08-22-p2a-dependency-audit-baseline.md
git add <only-any-required-compatibility-source-files>
git commit -m "security: harden npm dependency graph"
```

---

### Task 3: Modernize the CI action runtime and add the permanent audit gate

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: final lockfile from Task 2.
- Produces: CI that installs deterministically, rejects future high/critical npm advisories, and runs on supported GitHub Action runtime majors while keeping Node 22 for the app.

- [ ] **Step 1: Verify current supported action majors**

Check the official `actions/checkout` and `actions/setup-node` release/documentation state at implementation time. Select the current supported major releases that no longer trigger the Node-20-action-runtime warning seen in the baseline.

- [ ] **Step 2: Update the workflow while preserving existing gates**

Resulting workflow shape must remain equivalent to:

```yaml
name: CI

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<supported-major>
      - uses: actions/setup-node@<supported-major>
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm audit --audit-level=high
      - run: npm run check
```

The audit command is intentionally placed after deterministic install and before the application check.

- [ ] **Step 3: Commit the CI change**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: enforce npm high severity audit gate"
```

---

### Task 4: Final verification, report, and draft PR

**Files:**
- Create: `docs/superpowers/reports/2026-08-22-p2a-dependency-supply-chain-report.md`
- Verify: `package.json`
- Verify: `package-lock.json`
- Verify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: final dependency graph and CI workflow.
- Produces: complete evidence for user smoke and merge approval.

- [ ] **Step 1: Run a clean final local verification**

```bash
rm -rf node_modules
npm ci
npm audit --audit-level=high
npm run check
```

Expected: all commands exit 0; zero high/critical advisories.

- [ ] **Step 2: Verify deterministic direct versions**

Run a script/check equivalent to:

```bash
node - <<'NODE'
const p=require('./package.json');
for (const section of ['dependencies','devDependencies','peerDependencies']) {
  for (const [name, version] of Object.entries(p[section] || {})) {
    if (/^(latest|[~^])/.test(version)) {
      throw new Error(`${section}.${name} is not pinned: ${version}`)
    }
  }
}
console.log('direct dependency pinning: PASS')
NODE
```

Expected: `direct dependency pinning: PASS`.

- [ ] **Step 3: Compare bundle/warning baseline**

Record final Vite bundle sizes and warnings. P2A may retain the Recharts deprecation and chunk-size/mixed-import warnings, but must not introduce unexplained new warnings or a material size regression caused by an unnecessary package update.

- [ ] **Step 4: Write the final report**

The report must include:

```text
baseline advisory names/paths
final advisory totals
exact direct dependency changes
Supabase JS changelog review if applicable
CI action version changes
confirmation that no force audit fix or unapproved major migration occurred
build/typecheck/canonical results
bundle comparison
rollback (restore package.json/package-lock/ci workflow/source compatibility edits)
```

- [ ] **Step 5: Commit the report**

```bash
git add docs/superpowers/reports/2026-08-22-p2a-dependency-supply-chain-report.md
git commit -m "docs: report P2A supply-chain verification"
```

- [ ] **Step 6: Open a draft PR and require repository gates**

Open a draft PR from `hardening/p2a-dependency-supply-chain` to `main` and require:

```text
GitHub Actions CI: success on exact head SHA
npm audit gate: success
npm run check: success
Vercel preview: success
```

- [ ] **Step 7: Human authenticated smoke before merge**

Smoke:

```text
login/logout + session restore
campaign list/open/save
GM entity screens
player campaign access
Realtime update/presence
TipTap load/save
Iconify/MUI screen
Recharts screen
```

Do not merge without explicit user approval.
