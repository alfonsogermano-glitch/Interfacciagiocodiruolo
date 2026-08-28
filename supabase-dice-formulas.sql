-- Hollowgate dice formulas: personal, campaign-scoped, persistent definitions only.
-- Roll results/history remain intentionally volatile and are never stored here.

create table if not exists public.dice_formulas (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  is_secret boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dice_formulas_campaign_owner_updated_idx
  on public.dice_formulas (campaign_id, owner_profile_id, updated_at desc);

alter table public.dice_formulas enable row level security;

grant select, insert, update, delete on public.dice_formulas to authenticated;

drop policy if exists "dice_formulas_select_own_campaign" on public.dice_formulas;
create policy "dice_formulas_select_own_campaign"
on public.dice_formulas
for select
to authenticated
using (
  owner_profile_id = (select auth.uid())
  and exists (
    select 1
    from public.campaigns c
    where c.id = dice_formulas.campaign_id
      and c.deleted_at is null
      and (
        c.owner_profile_id = (select auth.uid())::text
        or exists (
          select 1
          from public.campaign_members cm
          where cm.campaign_id = c.id
            and cm.profile_id = (select auth.uid())::text
        )
      )
  )
);

drop policy if exists "dice_formulas_insert_own_campaign" on public.dice_formulas;
create policy "dice_formulas_insert_own_campaign"
on public.dice_formulas
for insert
to authenticated
with check (
  owner_profile_id = (select auth.uid())
  and exists (
    select 1
    from public.campaigns c
    where c.id = dice_formulas.campaign_id
      and c.deleted_at is null
      and (
        c.owner_profile_id = (select auth.uid())::text
        or exists (
          select 1
          from public.campaign_members cm
          where cm.campaign_id = c.id
            and cm.profile_id = (select auth.uid())::text
        )
      )
  )
);

drop policy if exists "dice_formulas_update_own_campaign" on public.dice_formulas;
create policy "dice_formulas_update_own_campaign"
on public.dice_formulas
for update
to authenticated
using (
  owner_profile_id = (select auth.uid())
)
with check (
  owner_profile_id = (select auth.uid())
  and exists (
    select 1
    from public.campaigns c
    where c.id = dice_formulas.campaign_id
      and c.deleted_at is null
      and (
        c.owner_profile_id = (select auth.uid())::text
        or exists (
          select 1
          from public.campaign_members cm
          where cm.campaign_id = c.id
            and cm.profile_id = (select auth.uid())::text
        )
      )
  )
);

drop policy if exists "dice_formulas_delete_own" on public.dice_formulas;
create policy "dice_formulas_delete_own"
on public.dice_formulas
for delete
to authenticated
using (
  owner_profile_id = (select auth.uid())
);
