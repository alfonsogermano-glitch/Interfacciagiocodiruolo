# Hollowgate P0.2 Schema and Storage Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore durable PG→Adventure persistence and remove obsolete Supabase Storage policies that currently permit cross-user writes, without deleting user data or changing public asset-read behavior.

**Architecture:** P0.2 has two independently verifiable units. First, restore the already-designed `characters.adventure_id` path end-to-end (type → client mapper/write → GM server write → nullable FK/index). Second, harden `storage.objects` by dropping only the obsolete broad write policies while retaining the existing user-folder-scoped policies and public reads. Live production DDL is additive/restrictive only and is surrounded by read-only pre/post verification queries.

**Tech Stack:** React 18, TypeScript 5.7.3, Supabase Postgres 17, Supabase Storage/RLS, Supabase Edge Functions (Deno + Hono), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-22-p0-stabilization-design.md`

## Global Constraints

- Work only on branch `stabilization/p0`; `main` remains production.
- Do not delete, move, rename, or rewrite any Storage object.
- Do not delete campaign, character, adventure, membership, note, NPC, monster, or other user data.
- `characters.adventure_id` must be nullable and use `ON DELETE SET NULL`.
- Keep existing public-read behavior for the current public image buckets.
- Storage write authorization must remain scoped to the authenticated user's first path segment where that is the current application convention.
- Apply no broad `npm audit fix --force` or unrelated dependency work in P0.2.
- Every live DDL/policy change requires an immediate post-change verification query.
- Run Supabase Security and Performance Advisors after live changes.
- Finish with `npm run check` in GitHub Actions on the current branch head.

---

### Task 1: Restore the PG adventure persistence contract in source

**Files:**
- Modify: `src/types/character.ts`
- Modify: `src/services/supabase/charactersService.ts`
- Modify: `supabase/functions/server/index.tsx`
- Create: `supabase-add-character-adventure.sql`

**Interfaces:**
- Produces `Character.adventureId?: string | null`.
- `mapRowToCharacter(row)` maps `row.adventure_id` to `adventureId`.
- `saveCharacter(...)` writes `adventure_id` for owner/self saves.
- `saveCharacterAsGm(...)` sends `adventureId` in the server payload.
- `PUT /campaigns/:id/characters/:characterId` writes `adventure_id` for GM edits of another player's PG.

- [ ] **Step 1: Add the canonical Character field**

Add to `Character` near campaign/narrative identity fields:

```ts
adventureId?: string | null;
```

Do not put `adventureId` inside `sheet_data`; it is a relational field with a real FK, matching NPC/Monster `adventure_id` semantics.

- [ ] **Step 2: Restore row mapping in `charactersService.ts`**

Add to `mapRowToCharacter`:

```ts
adventureId: row.adventure_id ?? null,
```

- [ ] **Step 3: Restore direct owner save**

Add to `dbData` in `saveCharacter`:

```ts
adventure_id: character.adventureId ?? null,
```

Do not re-add the old PGRST204 fallback for `adventure_id` after the production migration is applied: P0.2's purpose is to remove the schema drift, not keep silently tolerating it forever.

- [ ] **Step 4: Restore GM save payload**

Add to the JSON body in `saveCharacterAsGm`:

```ts
adventureId: character.adventureId ?? null,
```

- [ ] **Step 5: Restore GM Edge Function persistence**

In `PUT /make-server-771c5bfd/campaigns/:id/characters/:characterId`, add `adventureId` to the request-body destructuring and add to the `characters` update payload:

```ts
adventure_id: adventureId ?? null,
```

Keep all existing auth/GM checks unchanged.

- [ ] **Step 6: Add the idempotent repository SQL file**

Create `supabase-add-character-adventure.sql`:

```sql
-- P0.2: PG -> Avventura. NULL significa "tutta la campagna".
-- Additivo e idempotente; nessun dato PG esistente viene modificato.

alter table public.characters
  add column if not exists adventure_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'characters_adventure_id_fkey'
      and conrelid = 'public.characters'::regclass
  ) then
    alter table public.characters
      add constraint characters_adventure_id_fkey
      foreign key (adventure_id)
      references public.adventures(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_characters_adventure
  on public.characters(adventure_id);
```

The explicit constraint name makes post-verification and future migrations deterministic.

- [ ] **Step 7: Commit the source contract before live DDL**

Commit message:

```text
fix: restore character adventure persistence contract
```

Do not deploy the Edge Function yet; the live column must exist first.

---

### Task 2: Apply and verify the additive character schema migration

**Files:**
- Read/execute: Supabase production project `njcnkovruynhtsgzgrxi`
- Source-of-truth SQL: `supabase-add-character-adventure.sql`

**Interfaces:**
- Produces `public.characters.adventure_id uuid null`.
- Produces FK `characters_adventure_id_fkey` → `public.adventures(id) ON DELETE SET NULL`.
- Produces index `idx_characters_adventure`.

- [ ] **Step 1: Re-run the production precheck immediately before DDL**

Run:

```sql
select
  exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='characters'
      and column_name='adventure_id'
  ) as adventure_id_exists,
  (select count(*) from public.characters) as character_rows,
  (select count(*) from public.adventures) as adventure_rows;
```

Expected before migration in the current audited state:

```text
adventure_id_exists = false
character_rows = 12
adventure_rows = 4
```

If the column already exists when rechecked, inspect its type/FK/index instead of blindly applying assumptions.

- [ ] **Step 2: Apply the migration through Supabase migration tooling**

Apply the exact SQL from `supabase-add-character-adventure.sql` as migration name:

```text
p0_2_add_character_adventure
```

- [ ] **Step 3: Verify schema, FK, index and row preservation**

Run:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public'
  and table_name='characters'
  and column_name='adventure_id';

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid='public.characters'::regclass
  and conname='characters_adventure_id_fkey';

select indexname, indexdef
from pg_indexes
where schemaname='public'
  and tablename='characters'
  and indexname='idx_characters_adventure';

select count(*) as character_rows_after
from public.characters;
```

Expected:

```text
adventure_id uuid YES
FOREIGN KEY (adventure_id) REFERENCES adventures(id) ON DELETE SET NULL
idx_characters_adventure exists
character_rows_after = character_rows_before
```

- [ ] **Step 4: Perform a transaction-only FK behavior test without retaining data changes**

Use an existing character/adventure only inside a transaction and roll it back:

```sql
begin;

with c as (
  select id from public.characters order by created_at nulls last limit 1
), a as (
  select id from public.adventures order by created_at nulls last limit 1
)
update public.characters
set adventure_id = (select id from a)
where id = (select id from c);

select count(*) as linked_rows
from public.characters
where adventure_id is not null;

rollback;
```

This proves the new column accepts a valid FK without permanently changing a user's assignment. Do not test `ON DELETE SET NULL` by deleting a real adventure.

---

### Task 3: Deploy the Edge Function only after the column exists

**Files:**
- Deploy source: `supabase/functions/server/index.tsx`

**Interfaces:**
- Makes GM edits of another player's PG preserve `adventureId` in the same database column as direct owner saves.

- [ ] **Step 1: Confirm repository CI on the source commit**

Expected:

```text
npm ci          PASS
npm run check   PASS
```

- [ ] **Step 2: Deploy `make-server-771c5bfd` from the branch source**

Do not change JWT verification or environment secrets.

- [ ] **Step 3: Fetch the deployed function metadata/source and confirm the deployed version contains `adventure_id: adventureId ?? null` in the GM character update route**

If deployed source does not match branch source, stop before functional testing.

---

### Task 4: Remove only the obsolete permissive Storage write policies

**Files:**
- Create: `supabase-p0-2-storage-policy-hardening.sql`
- Execute against: Supabase production `storage.objects`

**Interfaces:**
- Preserves public SELECT policies.
- Preserves scoped character portrait policies:
  - `Authenticated users upload to own folder`
  - `Users update own files`
  - `Users delete own files`
- Preserves scoped NPC image policies:
  - `Upload autenticato npc-images`
  - `Update autenticato npc-images`
  - `Delete autenticato npc-images`
- Removes broad write policies that allow arbitrary authenticated paths.

- [ ] **Step 1: Re-run the Storage-policy precheck immediately before change**

Capture `policyname`, `roles`, `cmd`, `qual`, and `with_check` for policies mentioning `character-portraits` or `npc-images`.

The policies targeted for removal are exactly:

```text
character_portraits_owner_upload
character_portraits_owner_update
npc_images_owner_upload
npc_images_owner_update
npc_images_owner_delete
```

Do not drop any SELECT/public-read policy.

- [ ] **Step 2: Verify current application path convention before policy removal**

The shared image editor must use a path whose first segment is the authenticated user's id:

```ts
`${user?.id ?? 'unknown'}/${entityId}-portrait-${Date.now()}.jpg`
```

This is the convention required by the scoped policies using:

```sql
(storage.foldername(name))[1] = auth.uid()::text
```

If a current upload path for either affected bucket does not follow that convention, fix the client path first and verify CI before restricting the policy.

- [ ] **Step 3: Create the policy-hardening SQL file**

Create `supabase-p0-2-storage-policy-hardening.sql`:

```sql
-- P0.2: remove obsolete permissive write policies.
-- No Storage objects are modified; public read policies are preserved.

drop policy if exists "character_portraits_owner_upload" on storage.objects;
drop policy if exists "character_portraits_owner_update" on storage.objects;

drop policy if exists "npc_images_owner_upload" on storage.objects;
drop policy if exists "npc_images_owner_update" on storage.objects;
drop policy if exists "npc_images_owner_delete" on storage.objects;
```

- [ ] **Step 4: Commit the policy migration source**

Commit message:

```text
security: remove permissive storage write policies
```

- [ ] **Step 5: Apply the production migration**

Migration name:

```text
p0_2_harden_storage_write_policies
```

Apply only the five DROP POLICY statements above.

- [ ] **Step 6: Verify final affected policies**

Re-run the policy query. Confirm:

- no targeted broad write policy remains;
- public read remains available;
- `character-portraits` INSERT/UPDATE/DELETE still has an authenticated user-folder-scoped path;
- `npc-images` INSERT/UPDATE/DELETE still has an authenticated user-folder-scoped path.

- [ ] **Step 7: Verify Storage object counts are unchanged**

Compare before/after counts for affected buckets:

```sql
select bucket_id, count(*) as objects
from storage.objects
where bucket_id in ('character-portraits', 'npc-images')
group by bucket_id
order by bucket_id;
```

Policy DDL must not change these counts.

---

### Task 5: Advisors and final P0.2 verification

**Files:**
- Read: Supabase Security Advisor
- Read: Supabase Performance Advisor
- Read: GitHub Actions CI for final branch head
- Create: `docs/superpowers/reports/2026-08-22-p0-2-implementation-report.md`

**Interfaces:**
- Produces evidence required to mark P0.2 complete.

- [ ] **Step 1: Run Supabase Security Advisor**

Record all notices. Do not expand P0.2 into unrelated fixes; classify unrelated findings for later work.

- [ ] **Step 2: Run Supabase Performance Advisor**

Confirm `characters.adventure_id` is not reported as an unindexed FK. Record other existing notices separately.

- [ ] **Step 3: Verify final schema and Storage-policy snapshots again**

Expected:

```text
characters.adventure_id exists and is nullable UUID
characters_adventure_id_fkey uses ON DELETE SET NULL
idx_characters_adventure exists
five obsolete broad write policies absent
scoped write policies present
public read policies present
Storage object counts unchanged
```

- [ ] **Step 4: Verify final GitHub CI on the final P0.2 branch head**

Expected:

```text
npm ci        PASS
npm run check PASS
```

- [ ] **Step 5: Write the P0.2 implementation report**

Record:

- branch and commit SHA;
- migration names;
- before/after character row counts;
- before/after Storage object counts;
- final affected policy names;
- Edge Function deployed version/source verification;
- CI run id/result;
- advisor findings and deferred items.

- [ ] **Step 6: Commit the report**

Commit message:

```text
docs: record completed P0.2 verification
```

Then run/observe CI once more for that report commit before claiming P0.2 complete.

## Rollback

Schema rollback, if required before the feature is used, is:

```sql
drop index if exists public.idx_characters_adventure;
alter table public.characters drop constraint if exists characters_adventure_id_fkey;
alter table public.characters drop column if exists adventure_id;
```

Do not run this if any non-null `adventure_id` values have begun to be used without first preserving them.

Storage-policy rollback recreates the five prior policy definitions exactly as captured in the P0.2 precheck. Object data is unaffected by either the hardening or its rollback.

Edge Function rollback is a redeploy of the previously verified version; because the database column is additive and nullable, leaving the column present during a server rollback is safe.
