# Extended Note Icon Catalog — Implementation Plan

**Date:** 2026-08-27  
**Design:** `docs/superpowers/specs/2026-08-27-extended-note-icon-catalog-design.md`  
**Target:** production branch `main`

## Goal

Replace the hand-maintained ~60-icon React picker registry with a 210-icon Lucide 0.487.0 catalog shared by title and inline Note icon pickers, while preserving every saved Lucide name and the existing TipTap unknown-icon fallback.

## Constraints

- Exactly 210 icons in 10 approved categories.
- Preserve all 60 legacy names.
- No database/content migration and no new dependency.
- Search by Lucide name, Italian label, Italian aliases, and category; case/accent insensitive.
- `Recenti`: local browser storage only, max 12, shared by title and inline picker.
- Palette-aware shared tooltip system only.
- One final application commit/push to `main`.

## Task A — Manifest and Lucide generator

Files:
- `scripts/extract-lucide-icons.mjs`
- `package.json`

Steps:
1. Define the exact 210-entry manifest in the generator with Italian metadata and category quotas.
2. Validate total, category order/counts, duplicates, legacy names, metadata and public Lucide exports.
3. Generate metadata + raw `__iconNode` primitives into `tiptapIconData.ts` from the installed `lucide-react@0.487.0`.
4. Run generation automatically before dev, typecheck and build so generated data cannot drift from the pinned package.

## Task B — Search and recents

Files:
- `src/app/components/session/shared/noteIconCatalogUtils.ts`

Steps:
1. Implement Unicode NFD/diacritic-insensitive normalization.
2. Implement multi-token AND search across name/label/aliases/category.
3. Implement resilient localStorage read/write using `hollowgate.notes.recent-icons`.
4. Filter stale names, de-duplicate, move reselected icons to the front and cap at 12.

## Task C — Shared SVG rendering and picker UX

Files:
- `src/app/components/session/shared/NoteIconGrid.tsx`

Steps:
1. Render raw SVG primitives directly instead of importing 60 Lucide React components.
2. Keep a derived compatibility adapter for existing title consumers; it must be generated on demand from the same raw data, never manually mapped.
3. Add search field, flat results view, `Recenti`, approved 10 category sections and Italian tooltips.
4. Keep all colors on dashboard CSS variables/shared Tooltip.

## Task D — Compatibility and integration

Existing integration surfaces:
- `src/app/components/session/shared/NoteContextualPickers.tsx`
- `src/app/components/session/shared/NoteListRow.tsx`
- `src/app/components/session/shared/tiptapInlineIcon.ts`

Checks:
1. Inline and title pickers both continue through `NoteIconGrid`.
2. TipTap still saves the Lucide `name`.
3. Unknown inline names still render the existing default fallback.
4. Unknown title names still render no icon and never crash.
5. No new Note picker is introduced outside existing Note surfaces.

## Task E — RED/GREEN regression suite

Files:
- `scripts/verify-note-icon-catalog.mjs`
- `package.json`

Cover:
- exact 210;
- all legacy names;
- unique names/category quotas;
- valid generated SVG primitives from Lucide 0.487.0;
- name/label/alias/category search;
- case/accent normalization;
- recents max/de-dup/reorder/stale filtering;
- shared picker source;
- no hand-maintained React icon registry;
- shared palette Tooltip;
- TipTap/title unknown-name safety.

## Finalization

1. Run focused verifier and available static checks.
2. Run `npm check` only if the local dependency graph is actually available.
3. Compare final tree against the freshly fetched `main`.
4. Fetch `main` again immediately before write.
5. Create one Git Data commit and fast-forward `refs/heads/main` with `force:false`.
6. Verify exact `main` SHA and the Vercel status/deployment attached to that same SHA.
