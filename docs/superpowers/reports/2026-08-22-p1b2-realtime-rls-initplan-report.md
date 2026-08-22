# P1B.2 — Realtime RLS init-plan and safe UUID guard report

Date: 2026-08-22
Branch: `hardening/p1b2-realtime-rls-initplan`
Base `main`: `64bb1c773387b931720644cc7a550db20634c6eb`
Migration: `p1b2_realtime_rls_initplan_safe_uuid`

## Scope

P1B.2 changed exactly four existing policies on `realtime.messages`:

- `authenticated can listen to own profile channel`
- `campaign_presence_member_write`
- `campaign_presence_owner_write`
- `characters_broadcast_select`

No application source, Edge Function, public-schema RLS policy, Realtime table/function/trigger, or `online:all` policy was changed.

## RED discovery

The initial P1B.2 design assumed the existing UUID regex before the cast was sufficient to protect malformed/non-campaign topics.

A live RED probe disproved this assumption.

With:

```text
realtime.topic = campaign:not-a-uuid
```

the current campaign policy expression raised:

```text
22P02: invalid input syntax for type uuid: "not-a-uuid"
```

The same class of failure was reproduced with `online:all`, where the second topic segment could still reach the UUID cast inside the `EXISTS` subquery.

The approved design and implementation plan were revised before live DDL.

## Revised implementation

The profile policy received only init-plan optimization:

- `auth.uid()` -> `(select auth.uid())`
- `realtime.topic()` -> `(select realtime.topic())`

The three campaign policies received the same init-plan optimization plus a runtime `CASE` boundary. The UUID cast is now reachable only when the topic:

1. starts with `campaign:`; and
2. has a second segment matching the existing UUID regex.

For malformed or unrelated topics, the campaign policy expression returns `false` without evaluating the UUID cast.

The owner/member UUID comparisons remain against UUID columns, preserving the index-friendly comparison shape for valid campaign topics.

## RED structural baseline

Immediately before migration:

- total `realtime.messages` policies: 6
- target policies: 4
- direct `auth.uid()` calls in targets: 5
- direct `realtime.topic()` calls in targets: 12

The two `online:all` policies were snapshotted before migration:

- `authenticated can listen to online:all` — SELECT — `extension = 'presence'` plus scalar-subquery topic equality.
- `authenticated can track online:all` — INSERT — same effective predicate in `WITH CHECK`.

## Test identities

An existing active campaign was used, without creating persistent test data:

- campaign: `43bbd6a1-ba17-40c2-bbd8-7391924e74c4`
- owner: `53a1a998-32f0-4f35-8900-75e41e020815`
- non-owner member: `d39d11a1-e50a-44b2-8a67-11197274fd5a`
- outsider: `e1fc02ec-e67f-4908-9b56-addeb0f73551`

These identifiers are recorded only as migration-test evidence; no rows were altered by the probes.

## Valid-topic authorization matrix

RED and GREEN matched exactly:

| Identity | owner_write | member_write | campaign_read |
|---|---:|---:|---:|
| owner | true | false | true |
| member | false | true | true |
| outsider | false | false | false |

Profile-channel behavior also matched:

- own `profile:{id}` -> `true`
- another `profile:{id}` -> `false`

## Malformed-topic behavior

Before migration:

- `campaign:not-a-uuid` -> `22P02` UUID cast error
- `online:all` -> same class of UUID cast failure when campaign expression is evaluated

After migration:

- `campaign:not-a-uuid` -> campaign logic `false`, no exception
- `online:all` -> campaign logic `false`, no exception

This is an intentional correctness improvement. Valid campaign authorization behavior did not change.

## GREEN structural verification

Immediately after migration:

- total Realtime policies: 6
- target policies: 4
- direct `auth.uid()` calls in targets: 0
- direct `realtime.topic()` calls in targets: 0
- campaign policies containing safe `CASE`: 3
- campaign policies retaining UUID regex: 3
- target policies containing `extension` predicates: 0

The two `online:all` policy definitions remained unchanged.

Policy names, commands, and roles remained unchanged.

## Data invariants

Immediate pre- and post-migration counts were identical:

| Table | Count |
|---|---:|
| characters | 12 |
| npcs | 10 |
| monsters | 10 |
| adventures | 4 |
| environments | 5 |
| clues | 1 |
| situations | 1 |
| entity_notes | 78 |
| folders | 0 |
| visual_assets | 9 |
| notifications | 9 |
| profiles | 51 |
| campaigns | 45 |
| campaign_members | 13 |

No P1B.2 data mutation occurred.

## Advisor results

### Performance Advisor

After migration there are no remaining `auth_rls_initplan` findings, including the four Realtime findings targeted by P1B.2.

The remaining performance findings are outside P1B.2:

- INFO unused-index notices;
- WARN duplicate indexes on `public.kv_store_771c5bfd`.

The KV duplicate-index item remains deferred to P1B.3.

Supabase remediation reference for unused indexes:
https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

Supabase remediation reference for duplicate indexes:
https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index

### Security Advisor

No new P1B.2 security warning appeared.

Remaining findings are unchanged/out of scope:

- INFO RLS enabled with no public policies on intentional server-only tables `campaign_invite_codes`, `entity_notes`, `kv_store_771c5bfd`;
- WARN Leaked Password Protection disabled.

Supabase remediation reference for leaked-password protection:
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Rollback

Rollback restores the four exact pre-P1B.2 expressions captured in the RED snapshot:

- profile SELECT with direct `realtime.topic()` / `auth.uid()`;
- member INSERT with original regex + unguarded `EXISTS` UUID cast;
- owner INSERT with original regex + unguarded `EXISTS` UUID cast;
- campaign SELECT with original owner/member OR and unguarded UUID casts.

Rollback is policy-only and requires no data restoration.

Because rollback also restores the confirmed malformed-topic `22P02` behavior, it should be used only if valid Realtime application behavior regresses and immediate restoration is required.

## Remaining gate

Before merge:

1. repository diff must remain scope-clean;
2. GitHub CI must pass on final branch SHA;
3. Vercel preview must succeed on final branch SHA;
4. user-authenticated two-session Realtime smoke test must pass;
5. merge requires explicit user authorization.
