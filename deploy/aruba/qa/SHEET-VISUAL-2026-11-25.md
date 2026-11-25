# Session sheets visual refinement (owner row, panel background, stat steppers, scrollbars, folder placeholder)

User requests visual parity of the right-column Schede panel against the original
site, after the functional release `20261125-sheet-panels-08`.

## Changes in candidate `20261125-sheet-visual-09`

- Restored the owner row in the embedded PG detail ("Giocatore sconosciuto" fallback),
  passed from the campaign owner down through the session panel and the entity detail.
- Session sheet detail now uses the controlled rail (`activeSection` / `onSectionChange`)
  for Scheda/Immagine/Token while embedded in the session panel; the standalone sheet
  overlay keeps the contextual rail.
- Standalone entity detail keeps the original three-icon rail (`showRail` now depends on
  `sessionDetail`); session-embedded details keep it hidden.
- Folder placeholder aligned with the original SectionHeader contract: disabled
  `FolderPlus` button with tooltip, only while the PNG/Mostri section group is open.
- Session slide-over background forced opaque (no live campaign bleed-through),
  scrollbar hidden for list/sheet content.
- Stat steppers (`+/-`) styled as outlined squares, not filled accent blocks.

## Verification

- `npm test`: 547 frontend tests pass, 0 failures.
- Focused Chromium scenario: original geometry comparison
  (`ORIGINAL_SHEET_VISUAL_GEOMETRY_OK: ... match within 1px`),
  image decoding, sheet parity flows.
- Production build in `.local/vtt-sheet-visual-candidate`.

## Release

- Release: `20261125-sheet-visual-09`. Baseline `20261125-sheet-panels-08`
  (public index sha256 `d3935822...a32e`).
- Frontend handoff: `/home/hgadmin/hg-sheet-visual-09.tar.gz`, top directory
  `hg-sheet-visual-09`, release `20261125-sheet-visual-09`.
- SHA256 archive: `957b71deb3a8285ae706058efe31822e8df05772e1c256f8d449cf9c9abab5af`.
- Runner performs frontend preflight, backup, apply, public hash check, rollback.
  No database changes.

## Remaining work

- Functional parity of menus (copy/remove/delete/campaign transitions, notes,
  dice, equipment, chapters/scenes) is pending atomic backend transports.
- Live authenticated visual acceptance on the user session.
