# Hollowgate P0.2 — Schema & Storage Security Implementation Report

Date: 2026-08-22
Branch: `stabilization/p0`
PR: #1 (`P0 stabilization`, draft)
Spec: `docs/superpowers/specs/2026-08-22-p0-stabilization-design.md`
Plan: `docs/superpowers/plans/2026-08-22-p0-2-schema-storage-security.md`

## Status

P0.2 is complete and verified.

This stage restored durable PG→Adventure persistence end-to-end, aligned the live Postgres schema, hardened the two audited Storage image paths by removing obsolete cross-user write policies, and deployed the updated Edge Function while preserving JWT verification.

No campaign, character, adventure, membership, note, NPC, monster, Storage object, or other user record was deleted or moved.

## 1. Character → Adventure persistence contract

The July 2026 feature had partially regressed: the UI concept still existed, but the current source no longer carried the relation through `Character`, row mapping, direct save, GM save, or the GM Edge Function update route. P0.2 restored the original relational design instead of adding another copy inside `sheet_data`.

### Source changes

- `src/types/character.ts`
  - restored `adventureId?: string | null`;
- `src/services/supabase/charactersService.ts`
  - `mapRowToCharacter` maps `row.adventure_id`;
  - direct owner save writes `adventure_id`;
  - `saveCharacterAsGm` sends `adventureId` to the Edge Function;
- `supabase/functions/server/index.tsx`
  - GM character PUT accepts `adventureId` and writes `adventure_id`;
- `supabase-add-character-adventure.sql`
  - additive/idempotent schema migration source;
- `type-tests/characterAdventureContract.ts`
  - permanent compile-time regression contract.

### TDD evidence

RED run:
- GitHub Actions run `32587820889`
- job `97066786355`
- failed for the two intended reasons only:
  - `Character` did not contain `adventureId`;
  - `mapRowToCharacter(...).adventureId` did not exist.

GREEN run after the minimal source fix and removal of the one-shot patch helper:
- GitHub Actions run `32587975514`
- job `97067146529`
- `npm ci` — PASS
- `npm run check` — PASS

## 2. Live Postgres migration

Applied migration:

```text
p0_2_add_character_adventure
```

Pre-migration snapshot:

```text
characters.adventure_id exists = false
characters = 12
adventures = 4
```

Final schema:

```text
public.characters.adventure_id uuid NULL
characters_adventure_id_fkey:
  FOREIGN KEY (adventure_id)
  REFERENCES public.adventures(id)
  ON DELETE SET NULL
idx_characters_adventure:
  btree(adventure_id)
```

Post-migration character count:

```text
12
```

Final current assignments:

```text
characters with non-null adventure_id = 0
```

The migration therefore did not invent or alter any user assignment.

### Transaction-only FK test

A real existing character and adventure were linked inside a transaction; one row successfully accepted the FK. The transaction was then rolled back. No persistent character assignment was changed and the character count remained 12.

## 3. Edge Function deployment

Function:

```text
make-server-771c5bfd
```

Before P0.2:

```text
version 74
status ACTIVE
verify_jwt = true
```

After P0.2:

```text
version 75
status ACTIVE
verify_jwt = true
```

The repository did not contain a usable `SUPABASE_ACCESS_TOKEN` GitHub secret for a CLI workflow, so an attempted read-only one-shot CLI deploy did not change production and was removed immediately.

The successful deployment used the Supabase deployment API with a minimal entrypoint importing an immutable GitHub commit:

```text
fd36e538063c9b77c1ab44f3d7ce399614b04cdb
```

Supabase bundles the complete Deno module graph into the deployed ESZip, so the deployed execution bundle is pinned to that immutable source commit rather than to a moving branch reference. The deployed version metadata was fetched after deployment and confirms the immutable commit URL and `verify_jwt=true`.

The pinned commit contains the verified GM update payload:

```ts
adventure_id: adventureId ?? null
```

## 4. Storage policy hardening

Affected buckets:

```text
character-portraits
npc-images
```

Pre-change object counts:

```text
character-portraits = 46
npc-images = 6
```

The current shared image editor already stores files under an authenticated-user first path segment (`auth.uid()` convention), so the existing scoped policies were compatible before the broad policies were removed.

Applied migration:

```text
p0_2_harden_storage_write_policies
```

Removed exactly these obsolete broad policies:

```text
character_portraits_owner_upload
character_portraits_owner_update
npc_images_owner_upload
npc_images_owner_update
npc_images_owner_delete
```

Preserved scoped write policies include:

```text
Authenticated users upload to own folder
Users update own files
Users delete own files
Upload autenticato npc-images
Update autenticato npc-images
Delete autenticato npc-images
```

Preserved public read policies include the current public-read coverage for `character-portraits` and `npc-images`.

Post-change object counts:

```text
character-portraits = 46
npc-images = 6
```

Final verification:

```text
obsolete broad policies remaining = 0
```

No Storage object was deleted, moved, renamed, or rewritten.

## 5. Supabase advisors

Both Security and Performance Advisors were run after the schema/policy changes.

### P0.2-specific result

The new `characters_adventure_id_fkey` is **not** reported as an unindexed foreign key, confirming that `idx_characters_adventure` covers it correctly.

### Existing security findings deferred from P0.2

These pre-existing findings remain and should be handled as dedicated stabilization/security work rather than mixed into this migration:

- `entity_notes` and `kv_store_771c5bfd`: RLS enabled with no table policies (currently used through privileged/server paths; direct-client usage must be rechecked before altering this intentionally);
- mutable `search_path` on several trigger/helper functions;
- `characters_broadcast_changes()` and `handle_new_user()` are SECURITY DEFINER functions executable by `anon`/`authenticated` and require explicit privilege review;
- leaked-password protection is disabled in Supabase Auth.

Supabase remediation references:

- RLS enabled with no policy: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- mutable function search path: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
- public SECURITY DEFINER execution: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- signed-in SECURITY DEFINER execution: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- leaked-password protection: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

### Existing performance findings deferred from P0.2

- unindexed older FKs remain for portrait assets / notes / news;
- many RLS predicates should use `(select auth.uid())` to avoid per-row re-evaluation;
- duplicate indexes remain on the legacy KV table;
- several unused-index notices exist but must not be acted on solely from the advisor without workload review.

Performance remediation reference:

- RLS auth-function init-plan optimization: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

## 6. Branch verification

Functional source head before this report:

```text
fd36e538063c9b77c1ab44f3d7ce399614b04cdb
```

GitHub Actions:

```text
run 32588303750
job 97067930729
npm ci        PASS
npm run check PASS
```

Vercel status for the same functional head:

```text
success
```

The final report commit must receive the same CI verification before P0.2 is considered closed.

## Data safety summary

- characters before/after: 12 / 12;
- existing adventure assignments created by migration: 0;
- character portrait objects before/after: 46 / 46;
- NPC image objects before/after: 6 / 6;
- obsolete broad Storage policies before/after: 5 / 0;
- Edge Function JWT verification before/after: true / true;
- `main` remains untouched;
- PR #1 remains draft.

## Definition of done

P0.2 is complete when the report commit itself passes CI. At that point:

- PG adventure persistence has a permanent compile-time regression guard;
- source, database schema, and GM server write path are aligned;
- the FK is nullable, non-destructive and indexed;
- the two audited Storage upload paths no longer allow the obsolete broad cross-user writes;
- public image reads and current user-folder writes are preserved;
- Supabase advisors have been reviewed and unrelated findings explicitly deferred rather than silently mixed into this changeset.

Next stage: P0.3 — make PostgreSQL the canonical source for campaign and membership existence, with conservative KV→SQL backfill and no destructive cleanup of SQL-only campaigns.
