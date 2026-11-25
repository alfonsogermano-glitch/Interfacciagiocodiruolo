# Image recovery: current work

Priority requested by user: images first, remove hosting references in visible
copy, then restore original context menus and their working actions.

## Offline evidence

`node deploy/aruba/qa/image-recovery-inventory.mjs` checks packaged file lengths
and SHA256 against the private manifest and inventories inline image bytes
without logging private source URLs or inline content. Report stays in
`.local/image-recovery-inventory.json`. No network or DB access.

Verified historical references:

- Campaigns: 1 logo and 2 covers.
- Characters: 1 portrait (3 fields are references/variants, not 3 characters).
- NPCs: 2 portraits and 1 source-image reference.
- Monsters: 6 portraits, 2 source-image references and 3 covers.

Counts overlap; not a count of unique files. Inline values pass base64 encoding
checks, not image decoding. Files pass manifest integrity checks, not rendering
verification. Do not claim restoration or render success from this inventory.

## Causes and constraints

- Campaign list branding uses native visual-asset associations; historical
  `logo_url`/`cover_image_url` are not enough.
- Character cards intentionally use authenticated portrait reads, not legacy
  sourceRecord image URLs. Keep this authorization boundary.
- Narrative migration preserved snake_case image fields but the original
  renderer expects camelCase. URL conversion alone does not map those fields.
- Before restoring, check current associations on production, not just the
  export. `audit-image-recovery.sh` is read-only and emits IDs/field names/
  booleans, not image contents. No restore/deletion is included.
- Restore must back up and verify the DB, add only missing native associations,
  validate entity/campaign ownership and preserve newer images.

## Context menus: initial findings, not complete audit

- Campaign home has only Settings and Campaign Management in its context menu.
- Campaign PG/PNG/Monster `EntityCard` calls have an open callback, not the
  original action wiring. `EntityCard` is presentation-only.
- Folder section headers are rendered without their original action callbacks.
- The help text references a character availability menu; this does not prove
  the menu exists in each location.
- Review original campaign/character/narrative managers, folders, chapters/
  scenes, notes, equipment and dice separately. Do not expose buttons that call
  disabled legacy services, simulate persistence or bypass ownership.

## Visible copy

Removed hosting name locally from PG save/loading messages, player sheet/image
save/loading, narrative image saving and the dice panel status. Other visible
technical references still need review. No new frontend release yet.

Verification: 543 frontend tests and 3 inventory tests pass.
