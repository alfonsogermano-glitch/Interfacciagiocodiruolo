# Hollowgate P0.1 Code Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable TypeScript/build verification path and CI guardrail without changing Hollowgate runtime behavior.

**Architecture:** Keep Vite as the production transpiler and add TypeScript only as a `noEmit` static check. Bootstrap the lockfile once through GitHub Actions because this session cannot run `npm install` against the registry locally, then replace that bootstrap workflow with permanent CI based on `npm ci` and `npm run check`.

**Tech Stack:** React 18, Vite 6.3.5, TypeScript 5.7.3, npm/package-lock v3, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-22-p0-stabilization-design.md`

## Global Constraints

- Work only on branch `stabilization/p0`; `main` remains production.
- P0.1 must not change user-visible application behavior.
- Keep `strict: false` initially; do not turn this stage into a broad typing refactor.
- Keep npm and the committed `package-lock.json` as the package manager source of truth.
- Fix real type errors; do not hide them with broad `exclude`, `@ts-ignore`, or `skipDefaultLibCheck` workarounds.
- The final permanent workflow must use `npm ci` and `npm run check`.

---

### Task 1: Introduce the TypeScript check surface

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`
- Create temporarily: `.github/workflows/p0-lockfile-bootstrap.yml`
- Modify after bootstrap: `package-lock.json`

**Interfaces:**
- Produces npm scripts `typecheck` and `check` used by CI and developers.
- Produces a checked-in TypeScript 5.7.3 dependency in both `package.json` and `package-lock.json`.

- [ ] **Step 1: Update `package.json` with pinned TypeScript and scripts**

The scripts must become:

```json
"scripts": {
  "build": "vite build",
  "dev": "vite",
  "typecheck": "tsc --noEmit",
  "check": "npm run typecheck && npm run build"
}
```

Add the exact dev dependency:

```json
"typescript": "5.7.3"
```

Keep all existing dependency versions unchanged.

- [ ] **Step 2: Create the minimal `tsconfig.json`**

Use:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": false,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "/*": ["*"]
    }
  },
  "include": ["src", "utils"]
}
```

Do not include `vite.config.ts` in the first pass because it currently depends on Node globals/types that are outside the runtime application check and would require introducing a second dependency (`@types/node`) unrelated to the P0.1 goal.

- [ ] **Step 3: Create a temporary lockfile bootstrap workflow**

Create `.github/workflows/p0-lockfile-bootstrap.yml`:

```yaml
name: P0 lockfile bootstrap

on:
  push:
    branches:
      - stabilization/p0

permissions:
  contents: read

jobs:
  lockfile:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm install --package-lock-only --ignore-scripts
      - uses: actions/upload-artifact@v4
        with:
          name: p0-package-lock
          path: package-lock.json
          retention-days: 1
```

This workflow exists only to generate npm's canonical lockfile representation; it is removed once the artifact has been committed.

- [ ] **Step 4: Trigger the bootstrap by committing the files to `stabilization/p0`**

Expected: GitHub Actions run `P0 lockfile bootstrap` completes successfully and publishes artifact `p0-package-lock`.

- [ ] **Step 5: Download the workflow artifact and replace `package-lock.json` with the generated file**

Verify the generated root package entry contains:

```json
"devDependencies": {
  "@tailwindcss/vite": "4.1.12",
  "@vitejs/plugin-react": "4.7.0",
  "tailwindcss": "4.1.12",
  "typescript": "5.7.3",
  "vite": "6.3.5"
}
```

and that `packages["node_modules/typescript"].version` is exactly `5.7.3`.

- [ ] **Step 6: Commit the synchronized lockfile**

Commit message:

```text
build: add TypeScript guardrail baseline
```

---

### Task 2: Establish a failing full-project type-check baseline

**Files:**
- Read: GitHub Actions logs for `npm run typecheck`
- Modify only files named by real TypeScript errors.

**Interfaces:**
- Consumes `tsconfig.json` and `typecheck` from Task 1.
- Produces a concrete error list before any fixes are made.

- [ ] **Step 1: Add a temporary diagnostic workflow step after lockfile synchronization**

Before creating permanent CI, run on the branch:

```yaml
- run: npm ci
- run: npm run typecheck
```

Expected initial result: FAIL on the pre-existing application type errors. A passing initial check is also acceptable if current source has already eliminated them; do not manufacture failures.

- [ ] **Step 2: Record every TypeScript diagnostic from the run before editing source**

Classify each diagnostic as one of:

- application bug;
- stale/legacy source bug;
- configuration/resolution bug.

Do not use blanket exclusions to eliminate application or stale-source errors.

---

### Task 3: Fix the known source-level type errors minimally

**Files:**
- Modify: `src/app/components/gm/EnvironmentManager.tsx`
- Modify or remove only if confirmed unused: `src/services/supabase/campaignService.ts`
- Modify additional files only if Task 2 reports real diagnostics.

**Interfaces:**
- Produces a project that passes `npm run typecheck` under the P0.1 config.

- [ ] **Step 1: Fix `normalizeEnvironment` scope explicitly**

Change the helper signature to accept the fallback campaign id:

```ts
function normalizeEnvironment(
  item: Partial<Environment>,
  fallbackCampaignId: string
): Environment {
  return {
    id: item.id ?? generateUUID(),
    campaignId: item.campaignId ?? fallbackCampaignId,
    // remaining fields unchanged
  };
}
```

Change the load call to:

```ts
const normalizedEnvironments = loadedEnvironments.map((env: any) =>
  normalizeEnvironment(env, campaignId)
);
```

This preserves existing runtime intent while removing the out-of-scope identifier.

- [ ] **Step 2: Resolve the stale `campaignService.ts` diagnostics without introducing fake production defaults**

First verify there are no imports of `src/services/supabase/campaignService.ts`. If no consumers exist, delete that obsolete service rather than inventing values for `DEFAULT_CAMPAIGN_NAME` / `DEFAULT_CAMPAIGN_DESCRIPTION` or keeping the unsafe `owner_profile_id: 'demo-user'` creation path.

If a real consumer is discovered, stop this task and redesign that service against the current authenticated campaign flow instead of applying a placeholder fix.

- [ ] **Step 3: Apply only additional minimal fixes demonstrated by the diagnostic run**

For each additional error, preserve runtime behavior and avoid widening types to `any` solely to silence the compiler.

- [ ] **Step 4: Re-run `npm run typecheck`**

Expected: PASS with exit code 0.

- [ ] **Step 5: Re-run `npm run build`**

Expected: PASS with exit code 0 and Vite production bundle generated.

- [ ] **Step 6: Commit source fixes**

Commit message:

```text
fix: clear P0 TypeScript baseline errors
```

---

### Task 4: Replace bootstrap automation with permanent CI

**Files:**
- Delete: `.github/workflows/p0-lockfile-bootstrap.yml`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces the permanent branch/PR guardrail for future development.

- [ ] **Step 1: Delete the temporary bootstrap workflow**

It must not remain in the final P0.1 changeset.

- [ ] **Step 2: Create `.github/workflows/ci.yml`**

Use:

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
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check
```

No deploy step belongs in this workflow.

- [ ] **Step 3: Commit permanent CI**

Commit message:

```text
ci: verify typecheck and production build
```

- [ ] **Step 4: Verify the resulting `CI` workflow run**

Expected sequence:

```text
npm ci       PASS
npm run check
  npm run typecheck  PASS
  npm run build      PASS
```

---

### Task 5: Review the P0.1 changeset

**Files:**
- Compare: `main...stabilization/p0`
- Read: final GitHub Actions run

**Interfaces:**
- Produces the evidence required to mark P0.1 complete and begin P0.2.

- [ ] **Step 1: Review the branch diff**

Confirm the P0.1 implementation changes only tooling/configuration plus compiler-proven source corrections; no Supabase schema, Edge Function, UI design or product feature changes are included.

- [ ] **Step 2: Confirm lockfile/package consistency**

`package.json` and `package-lock.json` must both pin TypeScript to `5.7.3`, and `npm ci` must have passed in CI.

- [ ] **Step 3: Confirm runtime build safety**

The final GitHub Actions run must show a successful `vite build` from a clean `npm ci` installation.

- [ ] **Step 4: Mark P0.1 complete in the implementation report**

Record the final workflow run, commit SHAs, any source errors fixed, and any issue deferred to later P0 stages.
