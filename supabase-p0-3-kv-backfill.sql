-- P0.3 one-time conservative backfill from the legacy Figma KV model.
-- KV remains untouched and serves as a rollback snapshot.
-- Current KV campaign objects define what is visible today; SQL-only rows are
-- soft-hidden instead of deleted so all related entities remain recoverable.

-- 1) Upsert all currently visible KV campaigns into the canonical SQL row.
with kv_campaigns as (
  select c as obj
  from public.kv_store_771c5bfd k
  cross join lateral jsonb_array_elements(k.value) c
  where k.key like 'campaigns:%'
    and jsonb_typeof(k.value) = 'array'
    and c ? 'id'
)
insert into public.campaigns (
  id,
  name,
  description,
  owner_profile_id,
  created_at,
  updated_at,
  ruleset,
  session_active,
  session_activated_at,
  invite_code,
  last_opened_at,
  logo_url,
  cover_image_url,
  cover_crop,
  cover_rotation_degrees,
  tab_order,
  tab_order_campaign_notes,
  tab_order_gm_notes,
  deleted_at
)
select
  (obj->>'id')::uuid,
  obj->>'name',
  nullif(obj->>'description', ''),
  obj->>'ownerId',
  coalesce(nullif(obj->>'createdAt', '')::timestamptz, now()),
  coalesce(nullif(obj->>'updatedAt', '')::timestamptz, now()),
  nullif(obj->>'ruleset', ''),
  coalesce(nullif(obj->>'sessionActive', '')::boolean, false),
  nullif(obj->>'sessionActivatedAt', '')::timestamptz,
  nullif(obj->>'inviteCode', ''),
  nullif(obj->>'lastOpenedAt', '')::timestamptz,
  nullif(obj->>'logoUrl', ''),
  nullif(obj->>'coverImageUrl', ''),
  case when obj ? 'coverCrop' then obj->'coverCrop' else null end,
  nullif(obj->>'coverRotationDegrees', '')::integer,
  case when obj ? 'tabOrder' then obj->'tabOrder' else null end,
  case when obj ? 'tabOrderCampaignNotes' then obj->'tabOrderCampaignNotes' else null end,
  case when obj ? 'tabOrderGmNotes' then obj->'tabOrderGmNotes' else null end,
  null
from kv_campaigns
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  owner_profile_id = excluded.owner_profile_id,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  ruleset = excluded.ruleset,
  session_active = excluded.session_active,
  session_activated_at = excluded.session_activated_at,
  invite_code = excluded.invite_code,
  last_opened_at = excluded.last_opened_at,
  logo_url = excluded.logo_url,
  cover_image_url = excluded.cover_image_url,
  cover_crop = excluded.cover_crop,
  cover_rotation_degrees = excluded.cover_rotation_degrees,
  tab_order = excluded.tab_order,
  tab_order_campaign_notes = excluded.tab_order_campaign_notes,
  tab_order_gm_notes = excluded.tab_order_gm_notes,
  deleted_at = null;

-- 2) Preserve but hide rows that exist only in SQL. They are not visible in
-- the current KV-driven product today, so switching to SQL must not resurrect
-- them. This is reversible and does not touch related entities.
with current_kv_ids as (
  select distinct (c->>'id')::uuid as id
  from public.kv_store_771c5bfd k
  cross join lateral jsonb_array_elements(k.value) c
  where k.key like 'campaigns:%'
    and jsonb_typeof(k.value) = 'array'
    and c ? 'id'
)
update public.campaigns c
set deleted_at = coalesce(c.deleted_at, now())
where not exists (select 1 from current_kv_ids k where k.id = c.id);

-- 3) Backfill canonical memberships from campaignMembers:*.
with kv_members as (
  select
    split_part(k.key, ':', 2)::uuid as campaign_id,
    m->>'profileId' as profile_id,
    coalesce(nullif(m->>'role', ''), 'player') as role,
    nullif(m->>'joinedAt', '')::timestamptz as joined_at
  from public.kv_store_771c5bfd k
  cross join lateral jsonb_array_elements(k.value) m
  where k.key like 'campaignMembers:%'
    and jsonb_typeof(k.value) = 'array'
    and m ? 'profileId'
)
insert into public.campaign_members (campaign_id, profile_id, role, joined_at)
select campaign_id, profile_id, role, coalesce(joined_at, now())
from kv_members
on conflict (campaign_id, profile_id) do update set
  role = excluded.role,
  joined_at = coalesce(public.campaign_members.joined_at, excluded.joined_at);

-- 4) Preserve every legacy invite code. Normal server lookup will also require
-- the referenced campaign to have deleted_at IS NULL, so stale codes belonging
-- to soft-hidden campaigns remain recoverable data but are not valid joins.
insert into public.campaign_invite_codes (code, campaign_id)
select
  upper(split_part(k.key, ':', 2)) as code,
  (k.value->>'campaignId')::uuid as campaign_id
from public.kv_store_771c5bfd k
where k.key like 'inviteCode:%'
  and jsonb_typeof(k.value) = 'object'
  and k.value ? 'campaignId'
on conflict (code) do update set campaign_id = excluded.campaign_id;
