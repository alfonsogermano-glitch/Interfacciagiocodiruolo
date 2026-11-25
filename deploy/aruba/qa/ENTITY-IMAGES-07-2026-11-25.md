# Entity image rendering — 20261125-entity-images-07

Frontend-only follow-up to the native image recovery. The database recovery
succeeded but that did not prove visual acceptance. User reports campaign logo/
cover visible, but no PG/NPC/Monster imagery.

## Reproduced frontend defects

1. Vite still replaced `EntityDetailView`'s `DraggablePortrait` import with
   `ArubaPortraitPending`, which ignores all image URLs and always shows a
   placeholder. Original renderer has no backend/service imports and can safely
   display authenticated native images. Removed this one outdated alias; other
   legacy service isolation remains.
2. Campaign NPC/Monster card calls did not forward `photoUrl`,
   `photoSourceUrl`, or `photoCropArea` to original `EntityCard`.
3. With a real PG portrait enabled, original detail's field updates spread the
   display entity into the save callback. The authenticated data URL then leaked
   into the sheet JSON candidate and was rejected. New presentation filter
   preserves existing sheet field values/absence, strips only overlaid portrait
   presentation and leaves ordinary sheet/cover edits intact.

## Tests

- 545 frontend unit tests pass.
- Two focused browser fixture runs require actual image load and decoding
  (`naturalWidth > 0`), not merely an image URL or component presence.
- PG/NPC/Monster images decode in campaign cards and embedded sheet details.
- PG failed save/retry succeeds and keeps portrait outside persisted sheet JSON.
- Valid imported chapters and invalid chapter scenarios both pass. Notes, dice,
  formula save and selection/navigation regression paths pass.
- Original failing scenario reproduced before the renderer alias correction.
- Production candidate: `.local/vtt-entity-images-candidate`.

These are isolated browser fixtures, not an authenticated production browser
acceptance test. The available in-app live browser tab is logged out.

## Deploy

Bundle `/home/hgadmin/hg-entity-images-07.tar.gz`, directory
`/opt/hg-entity-images-07`. Runner pins chapter-dates-05 index baseline, creates
frontend backup, swaps index atomically and keeps old asset files for rollback.
No database import/cleanup or API change.

Includes already-local visible copy cleanup: PG saved/loading text, player
sheet/image loading/saving, narrative image save and dice panel status. This is
not complete removal of hosting references across the application, nor a context
menu parity release.

Recovery scope remains limited to original source evidence: 1 character
portrait, 2 NPC portraits and 6 Monster portraits; not all existing characters
have recoverable source images. Do not manufacture missing images or reassign
the recovered PG portrait to a different campaign.
