# Data guards candidate — 20261125-data-guards-04

No production database changes or deletions have been performed.

## Findings

The migration script preserves legacy chapter `mapUrl` values. The local
source export has 17 chapters, 11 with the known legacy public storage origin.
The frontend rejected these URLs before conversion to its packaged Aruba media
path. PNG/Monster detail unnecessarily required this entire chapter request to
succeed before displaying an independently authorized entity.

The `[Recupero]` characters are explicit `recoveredPlaceholder` records created
for notes referring to source entities absent from the export. The technical
campaign `[Recupero] Contenuti non assegnati` is different: migration uses it to
preserve real entities with no campaign ID. Local export contains 5 unassigned
characters, 1 unassigned NPC and 1 unassigned monster. This is not an inventory
of the current production database; deleting such a campaign blindly is unsafe.

## Corrections

- Chapter reads normalize the one known legacy media origin to same-origin
  `/vtt/migrated-media/...` URLs before retaining all strict model validation.
  Unknown legacy origins remain rejected. No Supabase request is issued.
- Narrative detail independently authorizes the entity. Invalid chapter
  metadata gives an explicit warning and disabled placement selectors, not a
  blocked sheet. Expired sessions still revoke the view.
- Placement changes are also rejected by the adapter while chapters are
  unavailable; existing identifiers are not erased.
- Recovery placeholders are never rendered as complete game-sheet models.
- Scoped React boundaries contain malformed historical sheet/campaign render
  failures. They never invent game values or delete data.
- Unnamed narrative list items have an explicit title/fallback label rather
  than an empty clickable row.

## Verification

- Frontend unit tests: 538 passing.
- Production candidate builds in `.local/vtt-data-guards-candidate`.
- Two focused Chromium fixture runs pass with recovery characters and either
  valid legacy chapter maps or malformed chapter records. Includes PG/PNG/
  Monster selection, two-column geometry, failed save/retry, original dice
  library and quick roll, 3D, formula create/update, Notes create/save.
- Cleanup inventory script `audit-recovery-cleanup.sh` uses a READ ONLY
  transaction and outputs only candidate IDs, keys and relationship counts.
  It is not a deletion script and has not been run against production here.

## Handoff

Bundle `/home/hgadmin/hg-data-guards-04.tar.gz`, top-level `hg-data-guards-04`.
Frontend runner supports `--preflight` and `--apply`, exact baseline from
session-sheets-03, atomic index swap with backup/public hashes/rollback.
The separate audit must identify exact live candidates before any cleanup.
Any cleanup requires a fresh verified database backup and must preserve valid
content, not use a broad `[Recupero]%` cascade.
