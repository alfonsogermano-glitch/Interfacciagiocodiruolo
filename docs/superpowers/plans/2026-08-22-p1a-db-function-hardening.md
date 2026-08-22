# Hollowgate P1A Database Function Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the eight Supabase PostgreSQL trigger functions flagged by Security Advisor without changing Hollowgate behavior, data, trigger bindings, Realtime semantics, or signup/profile creation.

**Architecture:** Keep the existing trigger architecture intact. Harden function definitions in place by fixing `search_path`, schema-qualifying table references where required, and removing unintended direct RPC execution from privileged trigger functions. Every behavioral write test runs inside an explicit transaction ending in `ROLLBACK`, and the migration is accepted only after advisors, trigger-binding checks, row-count checks, CI, and a draft PR review.

**Tech Stack:** Supabase Postgres 17, PL/pgSQL trigger functions, Supabase Realtime, Supabase Auth, GitHub Actions, React/Vite/TypeScript CI.

**Spec:** `docs/superpowers/specs/2026-08-22-p1a-db-function-hardening-design.md`

## Global Constraints

- Work only on branch `hardening/p1a-db-functions`; `main` remains production.
- Do not insert, update, delete, or migrate production user data outside explicit transactions that end in `ROLLBACK`.
- Do not change RLS policies, table schemas, Storage policies/objects, Realtime policies, Edge Function source, frontend behavior, or trigger bindings.
- Keep `characters_broadcast_changes()` and `handle_new_user()` as `SECURITY DEFINER` unless a separate approved design changes that architecture.
- Fix `search_path` for all seven functions currently reported as mutable by Security Advisor.
- Revoke direct `EXECUTE` from `PUBLIC`, `anon`, and `authenticated` for the two privileged trigger functions.
- Revocation on the six invoker trigger helpers is test-gated and must not be retained if trigger execution regresses.
- Preserve exception messages and validation semantics exactly.
- Run Supabase Security Advisor after the DDL change.
- Finish with clean `npm ci` + `npm run check` on the branch HEAD and a draft PR against `main`.

---

### Task 1: Capture the pre-change contract and RED security baseline

**Files:**
- Read: live PostgreSQL catalogs (`pg_proc`, `pg_trigger`, `pg_class`, `pg_namespace`)
- Create later: `supabase-p1a-db-function-hardening.sql`
- Create later: `docs/superpowers/reports/2026-08-22-p1a-db-function-hardening-report.md`

**Interfaces:**
- Consumes: current live definitions and ACLs for the eight target functions.
- Produces: exact rollback definitions, privilege snapshot, trigger-binding snapshot, and RED evidence used by all later tasks.

- [ ] **Step 1: Snapshot all eight function definitions and privileges**

Run a catalog query equivalent to:

```sql
select
  n.nspname as schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  p.prosecdef as security_definer,
  p.proconfig,
  pg_get_userbyid(p.proowner) as owner,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'characters_broadcast_changes',
    'handle_new_user',
    'lock_characters_origins_in_campaign',
    'check_npc_folder_type',
    'check_monster_folder_type',
    'check_folder_hierarchy',
    'check_character_folder_type',
    'check_entity_notes_folder_type'
  )
order by p.proname;
```

Expected RED findings:
- `characters_broadcast_changes`: `security_definer=true`, mutable search path, `anon_execute=true`, `authenticated_execute=true`.
- `handle_new_user`: `security_definer=true`, fixed `search_path=public`, `anon_execute=true`, `authenticated_execute=true`.
- six validation/immutability trigger functions: no fixed `proconfig` search path.

- [ ] **Step 2: Snapshot trigger bindings**

Run:

```sql
select
  tn.nspname as table_schema,
  c.relname as table_name,
  t.tgname as trigger_name,
  fn.nspname as function_schema,
  p.proname as function_name,
  t.tgenabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace tn on tn.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
join pg_namespace fn on fn.oid = p.pronamespace
where not t.tgisinternal
  and p.proname in (
    'characters_broadcast_changes',
    'handle_new_user',
    'lock_characters_origins_in_campaign',
    'check_npc_folder_type',
    'check_monster_folder_type',
    'check_folder_hierarchy',
    'check_character_folder_type',
    'check_entity_notes_folder_type'
  )
order by function_name, table_schema, table_name, trigger_name;
```

Expected: all current bindings remain enabled with `tgenabled='O'`.

- [ ] **Step 3: Record baseline row counts used by rollback verification**

Run:

```sql
select
  (select count(*) from public.characters) as characters,
  (select count(*) from public.npcs) as npcs,
  (select count(*) from public.monsters) as monsters,
  (select count(*) from public.folders) as folders,
  (select count(*) from public.entity_notes) as entity_notes,
  (select count(*) from public.profiles) as profiles;
```

Save these counts in the implementation report.

- [ ] **Step 4: Run Security Advisor and record the exact P1A warnings**

Expected before change:
- seven `function_search_path_mutable` warnings for the P1A target set;
- direct execution warnings for both privileged trigger functions.

- [ ] **Step 5: Commit only documentation if the snapshot reveals unexpected architecture**

If any target is not trigger-only, has a different signature, or is explicitly called from application code, stop implementation and revise the design before changing DDL.

---

### Task 2: Write the hardening migration and make the security contract GREEN

**Files:**
- Create: `supabase-p1a-db-function-hardening.sql`

**Interfaces:**
- Consumes: exact live definitions captured in Task 1.
- Produces: in-place hardened definitions with unchanged signatures and trigger bindings.

- [ ] **Step 1: Create the migration file with the exact target definitions**

The migration must use `CREATE OR REPLACE FUNCTION` and preserve function signatures.

`characters_broadcast_changes()`:

```sql
create or replace function public.characters_broadcast_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'campaign:' || coalesce(new.campaign_id, old.campaign_id)::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

revoke all on function public.characters_broadcast_changes() from public;
revoke all on function public.characters_broadcast_changes() from anon;
revoke all on function public.characters_broadcast_changes() from authenticated;
grant execute on function public.characters_broadcast_changes() to service_role;
```

`handle_new_user()`:

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
  v_avatar_url text;
  v_meta jsonb := new.raw_user_meta_data;
begin
  v_display_name := coalesce(
    v_meta->'custom_claims'->>'global_name',
    v_meta->>'full_name',
    v_meta->>'name',
    v_meta->>'nickname',
    v_meta->>'display_name',
    split_part(new.email, '@', 1),
    'Utente'
  );
  v_avatar_url := coalesce(v_meta->>'avatar_url', v_meta->>'picture');

  insert into public.profiles (id, display_name, avatar_url, email)
  values (new.id, v_display_name, v_avatar_url, new.email)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;
grant execute on function public.handle_new_user() to service_role;
```

The six invoker functions must retain their current bodies and exception text, but use `set search_path = ''` and schema-qualify table references:

```sql
create or replace function public.check_character_folder_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.folder_id is not null then
    if not exists (
      select 1 from public.folders
      where id = new.folder_id
        and campaign_id = new.campaign_id
        and entity_type = case when new.available_for_players then 'premade' else 'character' end
    ) then
      raise exception 'folder_id non valido per questo personaggio (tipo o campagna non corrispondenti)';
    end if;
  end if;
  return new;
end;
$$;
```

```sql
create or replace function public.check_npc_folder_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.folder_id is not null then
    if not exists (
      select 1 from public.folders
      where id = new.folder_id
        and campaign_id = new.campaign_id
        and entity_type = 'npc'
    ) then
      raise exception 'folder_id non valido per questo PNG (tipo o campagna non corrispondenti)';
    end if;
  end if;
  return new;
end;
$$;
```

```sql
create or replace function public.check_monster_folder_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.folder_id is not null then
    if not exists (
      select 1 from public.folders
      where id = new.folder_id
        and campaign_id = new.campaign_id
        and entity_type = 'monster'
    ) then
      raise exception 'folder_id non valido per questo mostro (tipo o campagna non corrispondenti)';
    end if;
  end if;
  return new;
end;
$$;
```

```sql
create or replace function public.check_folder_hierarchy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_id uuid;
  depth integer := 1;
  parent_entity_type text;
  parent_campaign_id uuid;
begin
  if new.parent_folder_id is null then
    return new;
  end if;

  if new.parent_folder_id = new.id then
    raise exception 'una cartella non puo essere genitore di se stessa';
  end if;

  select entity_type, campaign_id into parent_entity_type, parent_campaign_id
  from public.folders where id = new.parent_folder_id;

  if parent_entity_type is null then
    raise exception 'cartella genitore non trovata';
  end if;
  if parent_entity_type <> new.entity_type or parent_campaign_id <> new.campaign_id then
    raise exception 'la sotto-cartella deve avere lo stesso tipo e la stessa campagna della cartella genitore';
  end if;

  current_id := new.parent_folder_id;
  while current_id is not null loop
    depth := depth + 1;
    if current_id = new.id then
      raise exception 'riferimento circolare tra cartelle';
    end if;
    if depth > 5 then
      raise exception 'profondita massima di annidamento (5 livelli) superata';
    end if;
    select parent_folder_id into current_id from public.folders where id = current_id;
  end loop;

  return new;
end;
$$;
```

```sql
create or replace function public.check_entity_notes_folder_type()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expected_entity_type text;
begin
  if new.folder_id is null then
    return new;
  end if;

  if new.entity_type <> 'campaign' then
    raise exception 'folder_id ammesso solo per note di campagna (Note del GM/Note della Campagna)';
  end if;

  expected_entity_type := case when new.hidden then 'gmnotes' else 'campaignnotes' end;

  if not exists (
    select 1 from public.folders
    where id = new.folder_id
      and campaign_id = new.campaign_id
      and entity_type = expected_entity_type
  ) then
    raise exception 'folder_id non valido per questa nota (sezione o campagna non corrispondenti)';
  end if;

  return new;
end;
$$;
```

```sql
create or replace function public.lock_characters_origins_in_campaign()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.campaign_id is not null then
    if new.style is distinct from old.style
       or new.viaggio is distinct from old.viaggio
       or new.sheet_data->'tratti' is distinct from old.sheet_data->'tratti'
    then
      raise exception 'ORIGINI_LOCKED: impossibile modificare Stile, Viaggio o Tratti: il personaggio è già assegnato a una campagna.';
    end if;
  end if;
  return new;
end;
$$;
```

Do not revoke direct `EXECUTE` from these six invoker functions in the first migration pass. That optional tightening is handled only after Task 3 proves trigger behavior under explicit revocation.

- [ ] **Step 2: Commit the migration file before applying it live**

Commit message:

```text
security: harden database trigger functions
```

- [ ] **Step 3: Apply the migration to Supabase**

Use a single named DDL migration. Do not split the eight definitions across multiple production migrations unless an error requires redesign.

Expected: DDL succeeds without recreating or disabling triggers.

- [ ] **Step 4: Re-run the Task 1 catalog snapshot immediately**

Expected:
- all seven formerly mutable target functions have `search_path` fixed to an empty path;
- `handle_new_user()` also has empty fixed path;
- both privileged functions have `anon_execute=false` and `authenticated_execute=false`;
- both still have `service_role_execute=true`;
- signatures, owners, `prosecdef`, and trigger bindings remain unchanged.

---

### Task 3: Verify trigger behavior transactionally and decide invoker-function EXECUTE policy

**Files:**
- Read: live data only to select existing safe reference IDs.
- Modify only if GREEN: `supabase-p1a-db-function-hardening.sql` with optional six-function revokes.

**Interfaces:**
- Consumes: hardened functions from Task 2.
- Produces: behavioral evidence and the final decision on direct invocation of six invoker trigger helpers.

- [ ] **Step 1: Test broadcast-trigger DML inside a rollback transaction**

Select one existing character row and perform a no-op-safe update inside:

```sql
begin;
-- capture an existing character id into the test statement
update public.characters
set updated_at = updated_at
where id = '<existing-character-uuid>';
rollback;
```

Expected: UPDATE completes without permission/search-path error; rollback leaves data unchanged.

- [ ] **Step 2: Test origin-lock rejection**

Select a character with non-null `campaign_id`. In a transaction, attempt to change `style`, `viaggio`, or `sheet_data->tratti`.

Expected error contains exactly:

```text
ORIGINI_LOCKED: impossibile modificare Stile, Viaggio o Tratti: il personaggio è già assegnato a una campagna.
```

Rollback the transaction regardless of result.

- [ ] **Step 3: Test character folder validation with synthetic rows in one transaction**

Use an existing active campaign id and insert a synthetic `public.folders` row of the correct `entity_type`; point a synthetic or safely selected character update at it.

Expected:
- valid same-campaign/same-type folder assignment succeeds;
- a mismatched folder type or campaign causes the existing character-folder exception;
- transaction rolls back completely.

- [ ] **Step 4: Test NPC and monster folder validation**

Within separate rollback transactions, create synthetic `npc` and `monster` folders using an existing active campaign id and verify:
- matching assignments succeed;
- mismatched entity type/campaign raises the existing exception message.

Do not leave any folder or entity row behind.

- [ ] **Step 5: Test folder hierarchy rules**

Inside one rollback transaction, insert synthetic folders for an existing active campaign and verify:
- child with same campaign/type is accepted;
- mismatched type/campaign is rejected;
- self-parent is rejected;
- a chain exceeding five levels is rejected.

Rollback all synthetic rows.

- [ ] **Step 6: Test entity-note folder validation**

Inside a rollback transaction, create synthetic `campaignnotes` and `gmnotes` folders and a synthetic `entity_notes` row or safe update.

Expected:
- hidden=false accepts only `campaignnotes`;
- hidden=true accepts only `gmnotes`;
- mismatched folder causes the existing exception.

Rollback completely.

- [ ] **Step 7: Verify `handle_new_user()` without creating a production account**

First inspect whether an `auth.users` insert can be performed safely inside a single SQL transaction with all required columns/defaults and can be rolled back.

If safe, execute a synthetic auth-user insert inside `BEGIN ... ROLLBACK` and assert the corresponding `public.profiles` row is created inside the transaction.

If not safe, do not create a user. Verify instead:
- trigger `on_auth_user_created` remains enabled and points to `public.handle_new_user()`;
- the function definition is unchanged apart from search path/grants;
- existing authenticated smoke test after PR is the behavioral gate.

- [ ] **Step 8: Probe direct EXECUTE revocation for one invoker trigger helper in a rollback-safe way**

Temporarily, inside a transaction:

```sql
begin;
revoke execute on function public.check_character_folder_type() from public, anon, authenticated;
-- execute a DML statement that fires trg_check_character_folder_type
rollback;
```

Interpretation:
- if trigger-fired DML still succeeds/rejects according to validation logic rather than privilege denial, trigger runtime does not depend on caller EXECUTE;
- if a privilege error appears, keep direct EXECUTE unchanged for all six invoker helpers.

- [ ] **Step 9: If Step 8 is GREEN, test-gate all six invoker revokes before making them permanent**

Repeat the transactional revocation + trigger-DML check for each helper. Only if all six behave normally, append permanent revokes to the migration file:

```sql
revoke all on function public.lock_characters_origins_in_campaign() from public, anon, authenticated;
revoke all on function public.check_npc_folder_type() from public, anon, authenticated;
revoke all on function public.check_monster_folder_type() from public, anon, authenticated;
revoke all on function public.check_folder_hierarchy() from public, anon, authenticated;
revoke all on function public.check_character_folder_type() from public, anon, authenticated;
revoke all on function public.check_entity_notes_folder_type() from public, anon, authenticated;
```

If this optional hardening is accepted, apply it as a second small migration and record why it is safe. If any one test fails, do not apply these six revokes.

---

### Task 4: Run post-change security and data-integrity verification

**Files:**
- Modify: `docs/superpowers/reports/2026-08-22-p1a-db-function-hardening-report.md`

**Interfaces:**
- Consumes: final live function state.
- Produces: acceptance evidence for the PR.

- [ ] **Step 1: Re-run the function/ACL snapshot**

Expected minimum final state:
- `characters_broadcast_changes`: fixed empty search path, `SECURITY DEFINER`, not executable by `anon`/`authenticated`;
- `handle_new_user`: fixed empty search path, `SECURITY DEFINER`, not executable by `anon`/`authenticated`;
- six invoker helpers: fixed empty search path and schema-qualified references;
- optional direct revokes only if Task 3 proved them safe.

- [ ] **Step 2: Re-run trigger-binding snapshot**

Expected: exact same set of bindings as Task 1, all enabled.

- [ ] **Step 3: Re-run baseline row counts**

Expected: exact equality with Task 1 counts after all rollback tests.

- [ ] **Step 4: Run Supabase Security Advisor**

Expected P1A-specific result:
- no `function_search_path_mutable` warnings for the seven targeted functions;
- no `anon_security_definer_function_executable` or `authenticated_security_definer_function_executable` warnings for `characters_broadcast_changes()` or `handle_new_user()`.

Pre-existing unrelated warnings may remain and must be documented rather than mass-fixed.

- [ ] **Step 5: Run Supabase Performance Advisor only as regression observation**

Expected: no P1A-specific performance regression. Do not fix RLS init-plan, unindexed-FK, duplicate-index, or unused-index findings in P1A.

- [ ] **Step 6: Write the implementation report**

Include:
- branch and migration commit SHA;
- exact before/after function privilege matrix;
- exact before/after trigger binding counts;
- transactional tests performed and results;
- whether six invoker direct-execution revokes were retained or deliberately deferred;
- before/after row counts;
- final advisor findings and explicitly deferred debt;
- rollback instructions using the exact Task 1 definitions/grants.

- [ ] **Step 7: Commit the report**

Commit message:

```text
docs: record P1A database hardening verification
```

---

### Task 5: Verify the branch, create the draft PR, and stop before merge

**Files:**
- Read: `.github/workflows/ci.yml`
- Compare: `main...hardening/p1a-db-functions`

**Interfaces:**
- Consumes: migration and report from Tasks 2–4.
- Produces: reviewable draft PR with no automatic merge.

- [ ] **Step 1: Run branch CI from the committed HEAD**

Required workflow sequence:

```text
npm ci
npm run check
  npm run typecheck
  node scripts/verify-campaign-canonical.mjs
  npm run build
```

Expected: all steps pass.

- [ ] **Step 2: Verify Vercel preview status**

Expected: success. No frontend behavior changed, but the preview is still used as a repository/build integrity check.

- [ ] **Step 3: Review the complete diff against `main`**

Expected changed implementation surface:
- P1A design/spec and plan/report documents;
- one or two P1A SQL migration files depending on optional invoker revokes;
- no frontend source changes;
- no Edge Function changes;
- no unrelated migrations.

- [ ] **Step 4: Create a draft PR against `main`**

PR title:

```text
P1A hardening — PostgreSQL trigger function security
```

PR body must summarize:
- search-path hardening;
- privileged RPC-execution revocation;
- trigger binding preservation;
- transactional rollback tests;
- advisor before/after state;
- row-count invariants;
- CI/Vercel evidence;
- any intentionally deferred invoker revokes or unrelated advisor debt.

- [ ] **Step 5: Perform authenticated smoke test before merge**

Focus on:
- normal login/reload;
- character save;
- character/PNG/monster folder assignment;
- note save/move if relevant;
- campaign Realtime refresh after entity changes;
- signup/profile creation only if a disposable account can be used safely.

- [ ] **Step 6: Do not merge without explicit human approval**

After smoke-test success, report the PR as merge-ready and wait for the user's explicit merge instruction.
