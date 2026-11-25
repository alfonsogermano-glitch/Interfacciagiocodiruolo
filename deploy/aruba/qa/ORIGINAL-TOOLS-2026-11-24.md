# Original tools correction — 20261124-original-tools-02

Frontend candidate following the confirmed deployment of functional-ui-01.
No database migration, image recovery or API change is included.

- Dadi now toggles a dedicated slide-over containing the original
  `SessionDicePanel`, not the quick-roll palette.
- Floating quick rolls and history use the original `DiceQuickRollFloating`
  and `DiceRollHistoryDrawer` through an Aruba-scoped React provider.
- Formula create/update/read use existing cookie-authorized Aruba endpoints.
  Update no longer fabricates a saved row: it checks acknowledgement and
  reloads the canonical server record.
- Schede now includes authorized campaign PG, PNG and Monsters; narrative
  selections open the existing original detail editor through its Aruba
  boundary. This does not activate the global or historical catalogs.
- Campaign/user changes remount the dice provider; it never rerolls a result
  just to animate it. Secret rolls are not submitted to public chat.

## Verification

- Frontend Node suite: 531/531.
- Production build: pass, `.local/vtt-original-tools-candidate`.
- Module graph check: no original Supabase client / SDK.
- Focused Chromium fixture scenario passes: campaign logo, PG sheet,
  PNG and Monster selection, original dice library separate from floating
  selector, formula creation and update, 3D canvas, original quick roll,
  original history, Notes creation/sub-tab/rich-text save.
- Screenshots: `.local/tools-dice.png`, `.local/tools-sheets.png`.
  They show synthetic fixture data and are NOT evidence of live records.

## Explicitly incomplete

Custom dice, library folders and cross-device appearance persistence have not
been migrated. Their legacy write adapters reject operations, not fake a
successful save. The formula panel includes a visible limitation notice.
Private GM delivery and multiplayer roll synchronization are not implemented:
secret rolls stay in the current browser.

Historical images remain missing from their live associations. No automatic
historical import or ownership inference is part of this release.

## Handoff

Bundle `/home/hgadmin/hg-original-tools-02.tar.gz`, extracted as root to `/opt`.
Runner `/opt/hg-original-tools-02/release-functional-ui.sh` supports
`--preflight` and `--apply`, using the same frontend-only backup/atomic swap/
public hash verification/rollback procedure as functional-ui-01. Expected
baseline is the exact deployed functional-ui-01 index. API/database untouched.
Live authenticated user acceptance remains required.
