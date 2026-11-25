# Default portrait fallback fix (session sheet list)

User reports: the default portrait (site logo) shows correctly in the campaign
screen and inside an open sheet, but not in the session right-rail Schede list
(first block: PG/PNG/Mostri).

Root cause: `apps/aruba-vtt-pilot/src/ArubaSessionSheetPortrait.tsx` rendered
the fallback with `src="/icon-source-1024.png"` (site-root path). The Vite
`aruba-original-shell-assets` plugin rewrites `src="/icon-source-1024.png"` to
`src="/vtt/icon-source-1024.png"` only for files whose id contains
`/src/app/`. Pilot-local components bypass that rewrite, so the fallback image
pointed to a non-existent URL and the default portrait did not render.

Fix: use the base-correct fallback `src="/vtt/icon-source-1024.png"` in
`ArubaSessionSheetPortrait`.

## Verification

- 548 frontend tests pass (including the new regression test asserting the
  base-correct fallback).
- Focused Chromium scenario re-run after rebuild: sheet geometry, image decoding,
  functional flows all OK.

## Release

- Release: `20261125-sheet-visual-10`. Baseline `20261125-sheet-visual-09`
  (public index sha256 `d3935822...a32e`).
- Archive SHA256: `c5fc9462587bfa4ffca33fbc9b4f19a4b0634c0d81789a29f15f6a61247ccbea`.
- Frontend-only release; no database changes.
