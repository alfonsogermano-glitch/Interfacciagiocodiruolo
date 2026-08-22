# Hollowgate — P0.4 Closure Report

Date: 2026-08-22
Branch: `stabilization/p0`
Production branch: `main` (not modified by this P0 work)

## Result

P0.4 technical verification is complete on the stabilization branch. The campaign consistency/security issue discovered during closure was fixed before declaring the phase complete.

The branch is suitable for an authenticated manual smoke test before any merge to `main`. No merge is performed automatically.

## Final Edge Function deployment

Edge Function `make-server-771c5bfd`:

- version: 78
- status: ACTIVE
- `verify_jwt`: true
- deployed entrypoint is pinned to immutable GitHub commit `17e15e22501454ca2520952e36033fac83537437`
- that commit contains the P0.4 atomic campaign-delete route and no temporary write-enabled workflow

The direct working container cannot resolve the Supabase public hostname, so it cannot originate an authenticated HTTP smoke request itself. This limitation was not bypassed by creating production test accounts. Runtime evidence is instead based on real authenticated traffic already observed on the SQL-canonical v76 plus compilation/deployment, database transaction tests and final invariants. v77/v78 only add rollback-mirror and atomic-delete safeguards on top of that canonical read path.

## P0.4 bug found and fixed: deleted campaign membership access

During final RLS review, campaign entity policies were found to grant member access through `campaign_members` without also checking `campaigns.deleted_at`.

Before the fix, deleting a campaign soft-deleted the campaign row but did not atomically revoke its memberships. A future deleted campaign could therefore disappear from the UI while a player membership continued to authorize direct RLS reads of some campaign entities.

Current legacy impact before the fix was zero: all 11 existing soft-hidden legacy campaigns had zero memberships.

### Fix

Migration file:

`supabase-p0-4-campaign-delete-membership.sql`

It installs:

`public.soft_delete_campaign_and_revoke_members(uuid, text)`

Properties:

- `SECURITY DEFINER`
- `SET search_path = public`
- verifies campaign ownership and active state
- soft-deletes the campaign
- deletes all campaign membership rows
- returns revoked player profile IDs
- campaign update and membership delete happen in one PostgreSQL transaction
- EXECUTE revoked from PUBLIC, `anon` and `authenticated`
- EXECUTE granted only to `service_role`

The Edge DELETE route calls this RPC first, then updates only legacy KV rollback snapshots.

### Transactional verification

A synthetic campaign and membership were inserted inside a transaction, the RPC was executed and assertions confirmed:

- campaign became soft-deleted;
- membership disappeared;
- revoked profile ID was returned.

The transaction was then rolled back.

Production counts after rollback remained exactly:

- active campaigns: 33
- memberships: 13

Privilege verification:

- anon EXECUTE: false
- authenticated EXECUTE: false
- service_role EXECUTE: true

## Final campaign/membership invariants

After Edge v78 deployment:

- SQL campaign rows total: 44
- active campaigns: 33
- soft-hidden legacy campaigns: 11
- SQL memberships: 13
- SQL invite codes: 42
- memberships on soft-hidden campaigns: 0
- active KV campaign IDs missing from SQL: 0
- active SQL campaign IDs missing from KV rollback snapshot: 0
- KV membership pairs missing from SQL: 0
- SQL membership pairs missing from KV rollback snapshot: 0

The historical 11 SQL-only campaigns remain soft-hidden rather than deleted so their entity data is preserved.

## Historical anomalies classified, not deleted

P0.4 found:

- 4 active campaign rows whose owner profile no longer exists;
- 1 membership whose profile no longer exists;
- 6 KV-vs-SQL `joined_at` differences.

Further checks showed:

- the four missing owners were already missing in the old KV data;
- those user IDs are also absent from `auth.users`;
- the membership profile is also absent from `auth.users`;
- membership roles have zero mismatches;
- all six `joined_at` differences are less than one second and are consistent with historical dual-write timing.

These rows were deliberately preserved. They are historical cleanup debt, not evidence of P0 data loss.

## Entity/reference invariants

Final production counts observed during closure:

- characters: 12
- NPCs: 10
- monsters: 10
- adventures: 4
- environments: 5
- clues: 1
- situations: 1
- entity notes: 78
- folders: 0
- visual assets: 9
- notifications: 9

Orphan checks:

- character -> campaign: 0
- NPC -> campaign: 0
- monster -> campaign: 0
- adventure -> campaign: 0
- character -> adventure: 0

## Storage verification

Final Storage object counts:

- avatars: 2
- campaign-logos: 20
- character-portraits: 46
- monster-images: 20
- news-images: 1
- note-images: 3
- npc-images: 6
- visual-assets: 8

P0.2 Storage hardening did not delete or move objects.

Owner-folder upload/update/delete policies remain in place. Public-read policies are retained where the product currently expects public asset URLs.

## Realtime verification and cleanup

The application uses a shared private `campaign:{campaignId}` channel registry with reference counting and retry, plus private `profile:{profileId}` notification channels.

During P0.4, two explicitly temporary diagnostic policies were still present:

- `diag temp - listen diag:test1`
- `diag temp - track diag:test1`

No repository code references `diag:test1`. They were removed by:

`supabase-p0-4-remove-realtime-diagnostics.sql`

Post-migration verification:

- diagnostic policies remaining: 0
- checked core profile/campaign Realtime policies still present: 4

Global `online:all` Presence is intentionally disabled in the frontend and was not changed in P0; its policies are left as historical/non-blocking cleanup rather than mixed into stabilization.

## Core flow verification

### Auth/session bootstrap

`AuthContext`:

- reuses one Supabase client singleton;
- restores session through `auth.getSession()`;
- subscribes to `onAuthStateChange`;
- has an 8-second safety timeout so startup cannot remain permanently stuck;
- removes Realtime channels on sign-out.

### Campaign create/select/reload

- create writes through SQL-canonical `campaignStore`;
- active campaign list reads PostgreSQL only;
- `deleted_at` campaigns are excluded;
- client-side `ensureCampaignExistsInDB` mirror was removed in P0.3;
- Vercel build for the verified stabilization commit succeeded.

### Invite preview/join

- invite code validity comes from `campaign_invite_codes` through the SQL-canonical adapter;
- preview has no join side effect;
- join creates/updates canonical membership through `addPlayerToCampaign`;
- rollback `playerCampaigns:*` is regenerated from SQL, never used as authority.

### Player removal / campaign deletion

- individual player removal revokes SQL membership and rollback snapshots and broadcasts `members_change`;
- deleting the entire campaign now revokes all memberships atomically with the soft-delete before KV mirrors are touched.

### Session activation/deactivation

- endpoint authenticates user and verifies campaign ownership;
- canonical campaign row stores session state;
- CampaignHome refreshes state and uses campaign Realtime events.

### Character/NPC/monster/folders/notes

- campaign entity relationships have zero orphans;
- PG -> adventure has zero orphans and an indexed FK added in P0.2;
- folder and trash routes authenticate and perform explicit campaign access checks;
- note/trash requests have been observed returning HTTP 200 on real authenticated traffic after the SQL-canonical cutover;
- shared campaign Realtime avoids duplicate channel ownership between CampaignHome, notes, entity tabs and session panels.

## CI / build evidence

Clean P0.4 application commit before final documentation/realtime-cleanup-only commits:

`17e15e22501454ca2520952e36033fac83537437`

GitHub Actions:

- run: `32593141451`
- job: `97079955993`
- `npm ci`: success
- `npm run check`: success
- type-check: success
- P0 canonical campaign regression contract: success
- Vite production build: success

Vercel status for the same commit: success.

The final branch HEAD after this report must receive one additional CI pass before the branch is declared merge-ready.

## Supabase advisor review

### Security — intentionally not mass-fixed in P0

No new P0.4 atomic-delete function warning is present: its search path and privileges are restricted correctly.

The advisor still reports historical items:

- `campaign_invite_codes`, `entity_notes` and the legacy KV table: RLS enabled with no policies. These are intentionally server/service-role-only today; no client policy was added merely to silence the linter.
- mutable search paths on several older trigger/check functions;
- `characters_broadcast_changes()` and `handle_new_user()` are older SECURITY DEFINER functions executable by client roles;
- leaked-password protection is disabled in Supabase Auth.

Reference documentation:

- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

These items should be handled in separate, testable security work rather than mixed with the P0 source-of-truth migration.

### Performance — non-blocking debt

The advisor still reports:

- unindexed historical FKs for portrait assets, `entity_notes.campaign_id` and `news_posts.author_id`;
- many RLS policies using per-row `auth.uid()` instead of `(select auth.uid())`;
- duplicate legacy KV indexes;
- several currently-unused indexes.

Reference documentation:

- https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
- https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index

Unused indexes were not dropped merely because the advisor reports them.

## Runtime evidence limitation

The working container cannot resolve the external Supabase hostname, so a fresh authenticated E2E request cannot be originated from that container. No user credentials were read or reused and no synthetic production account was created.

Real authenticated Edge logs from the SQL-canonical v76 show HTTP 200 for campaign list, joined campaigns, notes, trash and notifications. Versions 77 and 78 preserve those canonical read paths; their changes are respectively rollback KV synchronization and atomic delete/membership revocation.

## P0 closure status

Technical stabilization P0.1-P0.4 is complete on `stabilization/p0`, subject to the final CI run on the documentation-complete HEAD.

Recommended integration sequence:

1. keep PR #1 unmerged until the final CI is green;
2. perform one authenticated live smoke test from the real Hollowgate UI (login, open a campaign, start/stop session, open notes, and—using a disposable campaign if desired—invite/join/delete);
3. merge only after that explicit human approval;
4. preserve the legacy KV snapshot during an initial post-merge observation window before considering later cleanup.
