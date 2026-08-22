# Hollowgate — P1A Database Function Hardening Design

Date: 2026-08-22
Branch: `hardening/p1a-db-functions`
Base: `main`

## Goal

Reduce the Supabase database-function attack surface without changing Hollowgate user-visible behavior, trigger semantics, Realtime behavior, signup behavior, or data.

P1A is intentionally limited to PostgreSQL trigger functions currently reported by Supabase Security Advisor. RLS performance work, foreign-key indexes, leaked-password protection, npm vulnerabilities, bundle size and feature work remain outside this change.

## Current verified state

Supabase Security Advisor currently reports mutable `search_path` on seven trigger functions:

- `public.characters_broadcast_changes()`
- `public.lock_characters_origins_in_campaign()`
- `public.check_npc_folder_type()`
- `public.check_monster_folder_type()`
- `public.check_folder_hierarchy()`
- `public.check_character_folder_type()`
- `public.check_entity_notes_folder_type()`

It also reports direct execution exposure for the two `SECURITY DEFINER` trigger functions:

- `public.characters_broadcast_changes()`
- `public.handle_new_user()`

`public.handle_new_user()` already has a fixed `search_path=public`, so its P1A problem is direct RPC execution, not mutable search path.

Database inspection confirms all eight functions are trigger functions. `characters_broadcast_changes()` is attached to `characters`, `entity_notes`, `folders`, `monsters`, and `npcs`. `handle_new_user()` is attached to `auth.users`. The remaining six are validation/immutability triggers.

Repository search found no explicit application calls to `characters_broadcast_changes` or `handle_new_user`; they are not application RPC contracts.

## Current Supabase guidance

Current Supabase database-function documentation recommends:

- defaulting to `SECURITY INVOKER` unless elevated privileges are actually required;
- always fixing `search_path` for `SECURITY DEFINER` functions;
- preferably using `search_path = ''` and schema-qualified object references;
- revoking function `EXECUTE` from roles that do not need direct invocation because functions are executable by default.

P1A follows those principles without converting privileged trigger functions to invoker mode unless testing proves that elevation is unnecessary. The objective is hardening, not behavioral redesign.

## Design

### 1. Keep trigger architecture unchanged

No trigger is removed, renamed, moved to another schema, or replaced with application code.

The existing trigger/function bindings remain intact. Function signatures remain unchanged so trigger dependencies do not need recreation.

### 2. `characters_broadcast_changes()`

Keep `SECURITY DEFINER` because it invokes `realtime.broadcast_changes(...)` on behalf of writes originating through normal application roles and existing flows depend on those broadcasts.

Hardening:

- set `search_path = ''`;
- retain the already schema-qualified call to `realtime.broadcast_changes`;
- revoke direct `EXECUTE` from `PUBLIC`, `anon`, and `authenticated`;
- do not add any new client-facing grant.

The function remains executable through its database triggers; it ceases to be a public RPC surface.

### 3. `handle_new_user()`

Keep `SECURITY DEFINER` because the trigger on `auth.users` creates a corresponding row in `public.profiles` and must retain the existing privileged signup behavior.

Hardening:

- change the fixed path from `search_path = public` to `search_path = ''` because the function already writes to `public.profiles` using a schema-qualified relation;
- revoke direct `EXECUTE` from `PUBLIC`, `anon`, and `authenticated`;
- do not add a new client-facing grant.

Signup-trigger behavior must remain unchanged.

### 4. Six non-definer validation trigger functions

Functions:

- `lock_characters_origins_in_campaign()`
- `check_npc_folder_type()`
- `check_monster_folder_type()`
- `check_folder_hierarchy()`
- `check_character_folder_type()`
- `check_entity_notes_folder_type()`

These remain `SECURITY INVOKER`/default security mode.

Hardening:

- set `search_path = ''`;
- schema-qualify every referenced table as `public.<table>` inside each function where necessary;
- preserve all current validation conditions and exception messages;
- do not change function signatures or trigger bindings.

Because these are trigger-only helpers rather than intended RPCs, P1A may also revoke direct `EXECUTE` from `PUBLIC`, `anon`, and `authenticated` if PostgreSQL trigger-runtime verification confirms the triggers continue to execute normally after the revocation. The privilege change for these six is therefore test-gated rather than assumed.

### 5. Privilege policy

The minimum guaranteed P1A privilege change is direct-execution revocation for the two `SECURITY DEFINER` functions flagged by the advisor.

For the six invoker trigger functions, direct-execution revocation is desirable but will only be retained if transactional trigger tests demonstrate no runtime dependency on caller `EXECUTE` privileges. If any regression is observed, their privilege state will remain unchanged while retaining the fixed `search_path` hardening.

P1A will not change global/default function privileges for the entire schema. That would be broader than this hardening and could break unrelated RPCs.

## Data safety

P1A changes only function definitions/configuration and function privileges.

It will not:

- insert, update, delete, or migrate production user data;
- change RLS policies;
- change table schemas;
- change Storage policies or objects;
- change Edge Function source;
- change Realtime policies;
- change frontend behavior.

All behavioral function tests that need writes will use explicit transactions ending in `ROLLBACK`.

## Verification strategy

### Pre-change snapshot

Record for every target function:

- `pg_get_functiondef`;
- `prosecdef`;
- `proconfig`/search path;
- owner;
- `has_function_privilege` for `anon`, `authenticated`, and `service_role`;
- trigger bindings and enabled state.

Record relevant baseline row counts before transactional tests.

### RED contracts

Before applying the hardening, verification must demonstrate the current advisor findings:

- two privileged trigger functions are directly executable by `anon`/`authenticated`;
- seven functions have no fixed safe search path (`handle_new_user` is the existing exception).

### Transactional behavioral tests

Run synthetic operations inside transactions and roll them back:

1. `characters_broadcast_changes` trigger remains callable during a character write and does not block the DML because of privilege/search-path changes.
2. `lock_characters_origins_in_campaign` still rejects changes to locked origin fields for an already-campaign-bound character.
3. character folder validation still accepts a valid folder/type/campaign combination and rejectss an invalid one.
4. NPC folder validation still rejects mismatched folder/type/campaign combinations.
5. monster folder validation still rejects mismatched folder/type/campaign combinations.
6. folder hierarchy validation still enforces parent type/campaign, cycle protection, and depth limit.
7. entity-note folder validation still enforces GM-note/campaign-note section compatibility.
8. `handle_new_user` behavior is verified without leaving a real auth account behind. If a safe rolled-back `auth.users` trigger test cannot be performed through the available environment, its function definition, trigger attachment, privileges, and existing signup smoke behavior will be used as the gate and no synthetic production account will be created merely for testing.

### Post-change security checks

Verify:

- `anon` and `authenticated` can no longer directly execute `characters_broadcast_changes()` or `handle_new_user()`;
- both remain attached to their triggers;
- all seven previously mutable-search-path functions now have an explicit safe path;
- no target trigger became disabled;
- production row counts are unchanged after rollback tests;
- Supabase Security Advisor no longer reports the corresponding P1A warnings.

### Application checks

Because no application source behavior should change:

- `npm ci` and `npm run check` must pass on the branch;
- Vercel preview build must succeed;
- create a draft PR against `main`;
- perform an authenticated smoke pass before merge, focusing on signup/profile creation if practical, character save, folder assignment, note save, NPC/monster save, and campaign Realtime refresh.

## Rollback

Before modification, preserve exact original definitions and grants from `pg_get_functiondef` and ACL inspection.

Rollback consists of:

- restoring the original function definition/configuration;
- restoring only the previous function grants;
- leaving trigger bindings unchanged.

Because P1A does not alter data or schemas, rollback does not require reverse data migration.

## Explicit non-goals

P1A does not address:

- RLS `auth.uid()` init-plan performance warnings;
- unindexed foreign keys;
- duplicate/unused indexes;
- `campaign_invite_codes`, `entity_notes`, or KV server-only RLS-info warnings;
- leaked-password protection;
- npm audit findings;
- frontend bundle size;
- global `online:all` presence;
- Maps, Combat, inventory migration, requestable NPCs, or other product features.

Those remain separate follow-up work so each risk class can be tested independently.

## Acceptance criteria

P1A is complete only when all of the following are true:

1. branch CI passes from a clean install;
2. target trigger bindings are unchanged and enabled;
3. the two privileged trigger functions are no longer directly callable by `anon` or `authenticated`;
4. all seven mutable-search-path warnings targeted by P1A are resolved;
5. transactional trigger tests preserve existing validation/broadcast behavior and roll back completely;
6. production data counts are unchanged by P1A testing;
7. no new Supabase Security Advisor warning is introduced by the change;
8. a draft PR contains the exact migration/verification evidence and is not merged without authenticated smoke-test approval.