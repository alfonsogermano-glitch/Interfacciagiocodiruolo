create table if not exists public.dice_standard_styles (
  campaign_id uuid not null,
  owner_profile_id uuid not null,
  sides integer not null,
  body_color text not null default '#f5f5f5',
  symbol_color text not null default '#20242f',
  skin_id text not null default 'none',
  effects_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, owner_profile_id, sides),
  constraint dice_standard_styles_supported_sides check (sides in (4,6,8,10,12,20,100)),
  constraint dice_standard_styles_skin_id check (skin_id in ('none','fire','ice','lightning','poison','stone','metal','obsidian','arcane'))
);

create index if not exists dice_standard_styles_owner_campaign_idx
  on public.dice_standard_styles(owner_profile_id, campaign_id);

alter table public.dice_standard_styles enable row level security;

drop policy if exists dice_standard_styles_select_own_campaign on public.dice_standard_styles;
create policy dice_standard_styles_select_own_campaign on public.dice_standard_styles
for select to authenticated using (
  owner_profile_id = (select auth.uid()) and (
    exists (
      select 1 from public.campaigns c
      where c.id = dice_standard_styles.campaign_id
        and c.deleted_at is null
        and c.owner_profile_id = (select auth.uid())::text
    )
    or exists (
      select 1 from public.campaign_members cm
      where cm.campaign_id = dice_standard_styles.campaign_id
        and cm.profile_id = (select auth.uid())::text
    )
  )
);

drop policy if exists dice_standard_styles_insert_own_campaign on public.dice_standard_styles;
create policy dice_standard_styles_insert_own_campaign on public.dice_standard_styles
for insert to authenticated with check (
  owner_profile_id = (select auth.uid()) and (
    exists (
      select 1 from public.campaigns c
      where c.id = dice_standard_styles.campaign_id
        and c.deleted_at is null
        and c.owner_profile_id = (select auth.uid())::text
    )
    or exists (
      select 1 from public.campaign_members cm
      where cm.campaign_id = dice_standard_styles.campaign_id
        and cm.profile_id = (select auth.uid())::text
    )
  )
);

drop policy if exists dice_standard_styles_update_own_campaign on public.dice_standard_styles;
create policy dice_standard_styles_update_own_campaign on public.dice_standard_styles
for update to authenticated
using (owner_profile_id = (select auth.uid()))
with check (
  owner_profile_id = (select auth.uid()) and (
    exists (
      select 1 from public.campaigns c
      where c.id = dice_standard_styles.campaign_id
        and c.deleted_at is null
        and c.owner_profile_id = (select auth.uid())::text
    )
    or exists (
      select 1 from public.campaign_members cm
      where cm.campaign_id = dice_standard_styles.campaign_id
        and cm.profile_id = (select auth.uid())::text
    )
  )
);

drop policy if exists dice_standard_styles_delete_own on public.dice_standard_styles;
create policy dice_standard_styles_delete_own on public.dice_standard_styles
for delete to authenticated using (owner_profile_id = (select auth.uid()));

alter table public.dice_custom_dice
  add column if not exists skin_id text not null default 'none',
  add column if not exists effects_enabled boolean not null default false;

alter table public.dice_custom_dice
  drop constraint if exists dice_custom_dice_skin_id;
alter table public.dice_custom_dice
  add constraint dice_custom_dice_skin_id
  check (skin_id in ('none','fire','ice','lightning','poison','stone','metal','obsidian','arcane'));
