# Hollowgate — P1A Database Function Hardening Report

Date: 2026-08-22
Branch: `hardening/p1a-db-functions`
Base: `main`

## Result

P1A database-function hardening has been applied to the live Supabase project and verified with transactional rollback tests.

No frontend, Edge Function, table schema, RLS policy, Storage policy/object, Realtime policy, trigger binding, or production user data was changed by P1A.

Migration source:

`supabase-p1a-db-function-hardening.sql`

Migration commit:

`7170cb1c2d54cb334983ab58fc829e0f52ce9745`

Supabase migration name:

`p1a_db_function_hardening`

## Documentation/changelog verification

Current Supabase database-function guidance was checked before implementation.

Relevant current guidance:

- `SECURITY DEFINER` functions must use a fixed `search_path`;
- `search_path = ''` requires schema-qualified relation references;
- database functions are executable by default unless `EXECUTE` is explicitly revoked;
- direct function access should be granted only to roles that need it.

The 2026 breaking-change changelog was also reviewed. No current breaking change alters this P1A function-hardening model.

## RED baseline

Before P1A, live catalog inspection showed:

| Function | SECURITY DEFINER | search_path | anon EXECUTE | authenticated EXECUTE |
| --- | --- | --- | --- | --- |
| `characters_broadcast_changes()` | yes | mutable / unset | yes | yes |
| `handle_new_user()` | yes | `public` | yes | yes |
| `lock_characters_origins_in_campaign()` | no | mutable / unset | yes | yes |
| `check_npc_folder_type()` | no | mutable / unset | yes | yes |
| `check_monster_folder_type()` | no | mutable / unset | yes | yes |
| `check_folder_hierarchy()` | no | mutable / unset | yes | yes |
| `check_character_folder_type()` | no | mutable / unset | yes | yes |
| `check_entity_notes_folder_type()` | no | mutable / unset | yes | yes |

Supabase Security Advisor independently reported:

- 7 `function_search_path_mutable` warnings for the P1A target functions;
- `anon_security_definer_function_executable` for `characters_broadcast_changes()` and `handle_new_user()`;
- `authenticated_security_definer_function_executable` for the same two functions.

Repository search found no application RPC calls to either privileged trigger function.

## Trigger bindings before change

All target functions were confirmed to be trigger functions.

Bindings observed:

- `characters_broadcast_changes()` → `characters`, `entity_notes`, `folders`, `monsters`, `npcs`;
- `check_character_folder_type()` → `characters`;
- `check_entity_notes_folder_type()` → `entity_notes`;
- `check_folder_hierarchy()` → `folders`;
- `check_monster_folder_type()` → `monsters`;
- `check_npc_folder_type()` → `npcs`;
- `handle_new_user()` → `auth.users` (`on_auth_user_created`);
- `lock_characters_origins_in_campaign()` → `characters`.

All 12 bindings were enabled (`tgenabled = 'O'`).

## Applied hardening

### `characters_broadcast_changes()`

Preserved:

- signature;
- `SECURITY DEFINER`;
- Realtime broadcast call and payload semantics;
- trigger bindings.

Changed:

- `SET search_path = ''`;
- revoked direct `EXECUTE` from `PUBLIC`, `anon`, and `authenticated`;
- explicitly granted `EXECUTE` to `service_role`.

### `handle_new_user()`

Preserved:

- signature;
- `SECURITY DEFINER`;
- display-name/avatar derivation;
- insert into `public.profiles`;
- `ON CONFLICT (id) DO NOTHING`;
- auth trigger binding.

Changed:

- `search_path=public` → `search_path=''`;
- revoked direct `EXECUTE` from `PUBLIC`, `anon`, and `authenticated`;
- explicitly granted `EXECUTE` to `service_role`.

### Six invoker validation functions

Preserved:

- default/security-invoker execution mode;
- signatures;
- validation logic;
- exception messages;
- trigger bindings.

Changed:

- `SET search_path = ''`;
- relation references changed from unqualified `folders` to `public.folders` where applicable.

Functions:

- `lock_characters_origins_in_campaign()`;
- `check_npc_folder_type()`;
- `check_monster_folder_type()`;
- `check_folder_hierarchy()`;
- `check_character_folder_type()`;
- `check_entity_notes_folder_type()`.

## Post-change privilege/config matrix

| Function | SECURITY DEFINER | search_path | anon EXECUTE | authenticated EXECUTE | service_role EXECUTE |
| --- | --- | --- | --- | --- | --- |
| `characters_broadcast_changes()` | yes | empty | no | no | yes |
| `handle_new_user()` | yes | empty | no | no | yes |
| six invoker helpers | no | empty | unchanged (yes) | unchanged (yes) | yes |

All seven functions that previously had mutable search paths now have an explicit empty search path. `handle_new_user()` also uses the empty path.

## Why the optional six invoker EXECUTE revokes were deferred

A transactional probe proved that an already-installed trigger can still fire under the `authenticated` role after direct `EXECUTE` is temporarily revoked on `check_character_folder_type()`:

- simulated authenticated profile: the real owner of the selected character;
- `auth.uid()` resolved to that owner;
- UPDATE passed RLS;
- one row was updated inside the transaction;
- the transaction was rolled back.

However, the six functions are not `SECURITY DEFINER` and are not reported as direct-execution vulnerabilities by Security Advisor. Revoking `EXECUTE` from `PUBLIC` would also remove the inherited grant from `service_role` unless every required server role were re-granted explicitly.

P1A therefore keeps their direct grants unchanged and limits this phase to the advisor-backed security issue: fixed search paths. This avoids an unnecessary privilege redesign with no current vulnerability finding.

## Transactional behavior tests

Every write test ended with `ROLLBACK`.

### Broadcast trigger

A no-op-safe UPDATE on an existing campaign-bound character fired the normal trigger chain successfully after `characters_broadcast_changes()` lost direct anon/authenticated EXECUTE.

Result: PASS.

### Locked character origins

Attempted to change `style` on an existing campaign-bound character.

Observed exact historical exception:

`ORIGINI_LOCKED: impossibile modificare Stile, Viaggio o Tratti: il personaggio è già assegnato a una campagna.`

Result: PASS.

### Character folder validation

Synthetic folders were inserted inside a transaction.

- matching campaign/type: PASS;
- wrong folder type: rejected with the existing character-folder exception.

### NPC folder validation

- matching campaign/type: PASS;
- wrong folder type: rejected with the existing PNG-folder exception.

### Monster folder validation

- matching campaign/type: PASS;
- wrong folder type: rejected with the existing monster-folder exception.

### Folder hierarchy

- valid same-campaign/same-type child: PASS;
- mismatched type: rejected with existing hierarchy exception;
- self-parent: rejected with existing self-parent exception;
- sixth nesting level: rejected with existing five-level-depth exception.

### Entity-note folder validation

- `hidden=false` + `campaignnotes`: PASS;
- `hidden=true` + `gmnotes`: PASS;
- `hidden=false` + `gmnotes`: rejected with the existing section/campaign mismatch exception.

### Auth signup/profile trigger

A synthetic `auth.users` row with a fixed non-production UUID and `.invalid` email was inserted inside a transaction.

Inside that transaction, `on_auth_user_created` invoked the hardened `handle_new_user()` and created the expected `public.profiles` row with display name and email.

The transaction was rolled back.

Post-test verification:

- synthetic `auth.users` rows remaining: 0;
- synthetic `public.profiles` rows remaining: 0.

Result: PASS.

## Data invariants

Baseline before tests:

- characters: 12;
- NPCs: 10;
- monsters: 10;
- folders: 0;
- entity notes: 78;
- profiles: 51.

After all rollback tests:

- characters: 12;
- NPCs: 10;
- monsters: 10;
- folders: 0;
- entity notes: 78;
- profiles: 51.

No synthetic auth/profile row remained.

## Trigger binding invariants

Post-migration catalog verification found the same 12 target trigger bindings, all still enabled.

No trigger was recreated, renamed, disabled, or moved.

## Security Advisor after P1A

All P1A warnings are resolved.

The Security Advisor no longer reports:

- `function_search_path_mutable` for any P1A target;
- anonymous direct execution of `characters_broadcast_changes()`;
- authenticated direct execution of `characters_broadcast_changes()`;
- anonymous direct execution of `handle_new_user()`;
- authenticated direct execution of `handle_new_user()`.

Remaining security findings are intentionally outside P1A:

- INFO: RLS enabled with no client policy on `campaign_invite_codes`, `entity_notes`, and legacy KV; these are server/service-role paths in the current architecture;
- WARN: leaked-password protection is disabled in Supabase Auth.

## Performance Advisor observation

P1A introduced no new performance class of change. Existing findings remain:

- unindexed historical foreign keys;
- RLS `auth.uid()` init-plan warnings;
- duplicate legacy KV indexes;
- unused-index informational findings.

These belong to P1B and are not mass-fixed here.

## Rollback

P1A changes are function-definition/configuration and grants only; no data rollback is required.

Effective rollback to the pre-P1A security/config state can be performed with:

```sql
alter function public.characters_broadcast_changes() reset search_path;
grant execute on function public.characters_broadcast_changes() to public;

alter function public.handle_new_user() set search_path = public;
grant execute on function public.handle_new_user() to public;

alter function public.lock_characters_origins_in_campaign() reset search_path;
alter function public.check_npc_folder_type() reset search_path;
alter function public.check_monster_folder_type() reset search_path;
alter function public.check_folder_hierarchy() reset search_path;
alter function public.check_character_folder_type() reset search_path;
alter function public.check_entity_notes_folder_type() reset search_path;
```

The only textual body difference on the six invoker helpers is schema qualification (`public.folders` instead of `folders`), which is behavior-equivalent to the original body under the former `public`-resolving path. The exact original `pg_get_functiondef` definitions were captured before migration and can be restored if byte-for-byte definition rollback is ever required.

## Merge gate

P1A must still satisfy repository integration gates before merge:

1. final branch CI from a clean install;
2. successful Vercel preview build;
3. complete diff review against `main`;
4. draft PR;
5. authenticated Hollowgate smoke test;
6. explicit human merge approval.
