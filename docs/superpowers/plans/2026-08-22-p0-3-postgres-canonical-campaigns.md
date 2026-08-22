# Hollowgate P0.3 — PostgreSQL Canonical Campaigns & Memberships

Date: 2026-08-22
Branch: `stabilization/p0`
Spec: `docs/superpowers/specs/2026-08-22-p0-stabilization-design.md`

## Goal

Make PostgreSQL the canonical source of truth for campaign existence, campaign metadata, memberships and invite-code resolution while preserving all currently reachable data and keeping legacy KV rows as a temporary rollback snapshot rather than deleting them.

## Current audited state

Immediately before P0.3 implementation:

- KV campaign objects: 33
- SQL campaigns: 36
- campaigns only in KV: 8
- campaigns only in SQL: 11
- KV memberships: 13
- SQL memberships: 6
- memberships only in KV: 7
- memberships only in SQL: 0
- `campaignMembers:*` and `playerCampaigns:*` describe the same 13 membership pairs
- invite-code KV keys: 42
- 33 invite keys point at current KV campaigns
- 9 invite keys point at SQL-only campaigns that are no longer present in the current KV campaign lists
- no invite owner mismatch was found for campaigns still present in KV

SQL-only campaigns must not be deleted: the audited group still owns related entity data. They also must not suddenly reappear in the UI when SQL becomes canonical. P0.3 therefore introduces a reversible soft-delete/hidden state instead of destructive cleanup.

## Canonical SQL model

### `public.campaigns`

Keep existing core columns and add nullable metadata columns required to represent every campaign property currently found in KV:

- `invite_code text` — current/latest code shown by the UI
- `last_opened_at timestamptz`
- `logo_url text`
- `cover_image_url text`
- `cover_crop jsonb`
- `cover_rotation_degrees integer`
- `tab_order jsonb`
- `tab_order_campaign_notes jsonb`
- `tab_order_gm_notes jsonb`
- `deleted_at timestamptz`

`deleted_at` is a soft-delete marker. Normal campaign reads must filter `deleted_at IS NULL`.

### `public.campaign_invite_codes`

Create a dedicated table because current KV semantics allow historical generated codes to remain resolvable:

```sql
code text primary key,
campaign_id uuid not null references public.campaigns(id) on delete cascade,
created_at timestamptz not null default now()
```

Do not store an independent owner id in this table. Ownership is derived from the canonical campaign row. Before backfill, validate current KV invite owner ids against campaign owner ids; mismatches must stop the migration for manual classification.

`campaigns.invite_code` stores the current code displayed by the UI. `campaign_invite_codes` stores every code that remains valid for lookup, matching current KV behavior.

### `public.campaign_members`

Keep the existing composite primary key `(campaign_id, profile_id)` and current `joined_at` / `role` columns. This becomes the only canonical membership relation.

## Data migration choreography

1. Re-run all KV↔SQL counts immediately before changing data.
2. Add the new nullable campaign metadata columns, `deleted_at`, and `campaign_invite_codes` table/indexes/RLS posture.
3. Flatten current `campaigns:*` KV arrays and upsert them into SQL:
   - preserve campaign UUID;
   - use KV as the current product-state authority for the 33 currently visible campaign objects;
   - map camelCase KV properties to explicit SQL columns;
   - set `deleted_at = NULL` for those 33 rows;
   - preserve SQL-only fields such as `drama` when KV has no equivalent.
4. Insert the 8 KV-only campaigns.
5. Mark the 11 SQL-only campaigns with `deleted_at` instead of deleting them. Related entity rows stay untouched.
6. Backfill the 7 missing memberships from `campaignMembers:*`, preserving `joinedAt` where present.
7. Backfill all valid `inviteCode:*` records into `campaign_invite_codes`, including codes for soft-hidden SQL-only campaigns so rollback/recovery data is retained. Normal invite lookup must reject a campaign whose `deleted_at` is non-null.
8. Set each current KV campaign row's `campaigns.invite_code` from its current `inviteCode` property.
9. Verify counts and set equality after backfill. Do not delete or rewrite any KV key.

## Server architecture

Add small SQL helper functions to the Edge Function so routes stop duplicating ownership/membership logic:

- `mapCampaignRow(row)` — SQL snake_case → existing API `Campaign` camelCase
- `getOwnedCampaignsSql(admin, userId)`
- `getCampaignSql(admin, campaignId, includeDeleted = false)`
- `isCampaignOwnerSql(admin, campaignId, userId)`
- `isCampaignMemberSql(admin, campaignId, userId)`
- `canAccessCampaignSql(admin, campaignId, userId)`
- `getCampaignByInviteCodeSql(admin, code)`
- `generateUniqueInviteCodeSql(admin)`

All API response shapes remain backward-compatible with the current frontend.

## Route conversion order

### Phase A — canonical reads

Convert these reads to SQL first:

- `GET /campaigns`
- `GET /campaigns/joined`
- `GET /campaigns/invite-preview`
- campaign/member authorization helpers used by overview/member-names/folders/notes/character assignment

During this phase existing KV writes remain available only as compatibility data; read behavior is SQL canonical.

### Phase B — canonical writes

Convert:

- `POST /campaigns`
- `PUT /campaigns/:id`
- `DELETE /campaigns/:id` → set `deleted_at`, do not hard-delete
- `POST /campaigns/:id/open`
- `POST /campaigns/:id/session`
- `POST /campaigns/:id/invite-code`
- `POST /campaigns/join`
- membership add/remove/leave helpers
- invite-by-name acceptance flow

Write PostgreSQL first. KV mirroring may continue temporarily during rollout for rollback compatibility, but no route may treat a successful KV write as a substitute for a failed SQL write.

### Phase C — remove KV as an authorization/read dependency

Replace remaining `campaignsKey`, `campaignMembersKey`, `playerCampaignsKey`, and `inviteCodeKey` reads used for access control with SQL helpers. When this is complete, KV rows remain a passive snapshot only.

Do not delete KV rows in P0.3.

## Campaign update whitelist

The current server performs a generic merge of the request body. P0.3 replaces this with an explicit mapping of supported fields:

- `name`
- `description`
- `ruleset` (existing non-empty-campaign guard remains mandatory)
- `logoUrl`
- `coverImageUrl`
- `coverCrop`
- `coverRotationDegrees`
- `tabOrder`
- `tabOrderCampaignNotes`
- `tabOrderGmNotes`

Server-owned fields (`id`, `ownerId`, timestamps, session state, current invite code, deleted state) must not be arbitrarily overwritten by the generic request body.

## Frontend cleanup after server cutover

Once campaign creation is guaranteed to insert SQL atomically:

- remove `ensureCampaignExistsInDB` calls from `CampaignContext.tsx`;
- remove `src/services/supabase/campaignSyncService.ts` if no other imports remain;
- keep localStorage campaign cache as a UI/offline cache only, never a source of canonical existence.

The frontend API contract does not otherwise change.

## TDD / verification strategy

The repository now has TypeScript CI but does not type-check Deno Edge source. P0.3 therefore adds a lightweight source-contract verification script that runs in CI and checks invariant route/helper markers in `supabase/functions/server/index.tsx` plus a SQL migration verification section.

At minimum the regression guard must fail if:

- `GET /campaigns` reads `campaignsKey(userId)` as its source;
- invite preview resolves solely via `inviteCodeKey`;
- `POST /campaigns` omits a Postgres insert;
- campaign delete hard-deletes a campaign row rather than soft-hiding it;
- `campaignSyncService` remains imported by `CampaignContext` after cutover.

Prefer pure helper tests if helper extraction makes this natural; do not introduce a large testing framework solely for P0.3.

## Live rollout order

1. Commit migration source + server compatibility source on `stabilization/p0`.
2. CI green.
3. Apply additive schema migration.
4. Run pre-backfill anomaly queries.
5. Apply backfill transaction/migration.
6. Verify 33 current visible campaigns are active in SQL, 11 legacy SQL-only rows are soft-hidden, 13 membership pairs are represented, invite-code rows are preserved, and related entity counts are unchanged.
7. Deploy Edge Function from an immutable branch commit using the same verified Supabase bundle strategy as P0.2; keep `verify_jwt=true`.
8. Verify API routes and Edge logs/metadata.
9. Remove frontend `campaignSyncService` dependency and deploy/verify branch build.
10. Re-run SQL/KV comparison. Divergence in passive KV is acceptable; SQL API results must match the pre-cutover visible product state.
11. Run Supabase advisors and final CI.
12. Write P0.3 report and verify its commit.

## Rollback

- KV data is not deleted, so the previous Edge Function version can be redeployed during the transitional window.
- Backfilled SQL campaign/member/invite rows remain additive and harmless under the previous KV-driven server.
- Soft-hidden SQL-only campaigns retain all entity relations and can be restored by clearing `deleted_at` after explicit classification.
- New metadata columns are nullable and backward-compatible.
- Do not drop `campaign_invite_codes` or new columns during an incident response unless their data is first preserved.

## Definition of done

P0.3 is complete when:

- every campaign currently visible from KV exists as a non-deleted SQL campaign;
- SQL-only legacy campaigns remain preserved but hidden from normal lists;
- all 13 current KV membership pairs exist in `campaign_members`;
- invite preview/join resolves through SQL and preserves currently valid code semantics;
- campaign CRUD/session/open/invite/member operations write SQL canonically;
- authorization no longer depends on KV campaign/member lists;
- `CampaignContext` no longer needs the client-side SQL mirror service;
- no KV rows or user entities were deleted;
- Edge Function, Vercel branch build, CI and database verification are green.