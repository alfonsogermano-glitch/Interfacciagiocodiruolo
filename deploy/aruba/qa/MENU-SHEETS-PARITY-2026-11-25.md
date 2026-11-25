# Original menus and right-column Sheets parity

User requests complete old-site functional parity without manually listing
individual features. The original source is the acceptance reference. This is
not complete yet; avoid describing the current incremental candidate as 100%.

## Original sources / coverage

- `src/app/components/session/SessionCharactersPanel.tsx`: entity list, selection,
  folders, copy/remove/delete/visibility menus, confirmation dialogs, token drag.
- `src/app/components/session/SessionRightSidebar.tsx`: panel and list resize
  handles, persisted widths, docking and session navigation.
- `src/app/components/session/shared/EntityDetailView.tsx`: core fields, rich
  custom tabs, image/token sections, ruleset-specific fields and link pickers.
- `src/app/components/session/shared/EntityKebabMenu.tsx`: original portal menu,
  disabled reasons, single-open coordination and styled tooltips.
- `src/app/components/shared/useFolderSection.tsx`: folder menu CRUD, nesting,
  reorder, icon picker, move/breadcrumb and deletion confirmation.
- Other site menu call sites are inventoried by
  `node deploy/aruba/qa/menu-parity-inventory.mjs`; private working report:
  `.local/original-menu-parity-inventory.json`. Static inventory is a checklist,
  not a claim of runtime coverage.

## First frontend candidate

- Restores original inline Scheda/Immagine/Token rail for embedded PG/NPC/
  Monster details. Previously fixed to Scheda with showRail=false.
- Passes authenticated image editor to embedded narrative details, which
  previously had no image-editor slot.
- Adds real authenticated PG thumbnails and native NPC/Monster thumbnails to
  the list, retaining the existing split layout and save/leave guards.
- Restores panel/list resize and original local-storage width keys/desktop
  limits. Narrow displays remain clamped. Pointer and keyboard handles exist.
- No copy/delete menu placeholders or no-op handlers are added.
- 547 frontend tests pass; focused Chromium fixture with recovered images and
  sheet-parity mode verifies PG/NPC token changes are actually persisted,
  Immagine/Token/Scheda navigation for all three entity kinds, resize handles,
  existing save failure/retry and image decoding. Fixture requests preserve
  authorized campaign/entity identity and store canonical narrative writes.
- No production change for this candidate yet.
- Canonical successful saves update entity names in the list without requiring
  a full reload. Older narrative save responses cannot overwrite newer edits.
- Original menu inventory currently identifies 48 primitive call sites in
  14 source files; handwritten/custom menus still require the source review.

Frontend handoff: `/home/hgadmin/hg-sheet-panels-08.tar.gz`, top directory
`hg-sheet-panels-08`, release `20261125-sheet-panels-08`. Baseline entity-images-07.
SHA256 `6b330a8e07a9479dd882c3d919eb8b42d0633655932264ded772ff60ff7b2196`.
Runner has frontend backup/index rollback and read-only media audit. No DB/API
changes, no enablement of quarantined catalog/global-editor features.

## Acceptance matrix / remaining work

| Area | State and required proof |
|---|---|
| PG/NPC/Monster detail navigation | Local candidate verified; live acceptance pending |
| Panel/sidebar sizing and persistence | Local candidate verified; live acceptance pending |
| Core sheet fields | Existing adapters; expand tests to actual imported records/rulesets |
| Images and token styling | Candidate exposes original editors; fixture token writes verified; real upload/frame regression still required |
| Custom tabs/notes menus | Original tab/menu components with native note adapters; full create/rename/duplicate/visibility/subtab/delete acceptance needed |
| PG copy to another campaign | Needs source/target authorization, full notes/media copy and atomic SQL; do not approximate by JSON-only PUT |
| PG remove from campaign | Needs catalog/lifecycle semantics and assignment/last-character safeguards; archiving is NOT equivalent |
| Remove player | Roster currently read-only; must implement server authorization and linked assignment cleanup |
| NPC/Monster cross-campaign copy | Needs atomic payload/notes/media remapping and target authorization |
| NPC/Monster remove from campaign | Current documents require campaign ID; preserve detached content before exposing the action |
| NPC/Monster player visibility | Validate real player read projections/permissions, not merely saving a boolean |
| NPC/Monster delete including tabs | Need atomic entity+notes handling and confirmations, not client-side sequential deletion |
| Folders / folder menus | Original hook has richer generic semantics; current native note folders do not imply NPC/Monster folder support |
| Ordering / nesting / drag-to-map | Persist ordering and native map token drop; verify pointer lifecycle and save guards |
| Other site menus | Audit original manager/card/notes/dice/equipment/chapter/scene call sites and verify each action with native transport |

## Historical record blockers discovered during source replay

Private source-derived recovered narrative replay accepts 32 models under the
current full-write contract; remaining models fail placement, oversized legacy
inline media, or legacy crop validation. Generic recursive snake-to-camel
conversion makes acceptance worse (25 accepted), because it activates unsupported
references and historical identifiers. Do NOT blindly normalize/drop fields or
loosen write validation to make menus appear functional.

Native actions must preserve provenance and data. Archived source records and
backup are not a substitute for correct ordinary editing semantics.

## Deployment constraints

Preserve images and campaign/member ownership. Keep global/historical catalog
and global editor quarantined; do not enable old 037/040/catalog-007 as a shortcut.
Any new DB/API release needs its own reviewed migrations, backup and clone
rehearsal. Do not label simulated/local-only or disabled actions restored.
