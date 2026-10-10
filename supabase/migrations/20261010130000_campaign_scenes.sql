-- Scene narrative persistenti. La preparazione e' privata del GM; la futura
-- scena pubblicata in sessione avra' uno stato runtime separato.
begin;

create unique index if not exists chapters_campaign_id_id_uidx
  on public.chapters(campaign_id, id);

create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  chapter_id uuid not null,
  environment_id uuid references public.environments(id) on delete set null,
  title text not null,
  description text not null default '',
  notes text not null default '',
  status text not null default 'draft' check (status in ('draft', 'ready', 'completed')),
  image_url text,
  sort_order integer not null default 0 check (sort_order >= 0),
  next_scene_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scenes_chapter_campaign_fkey foreign key (campaign_id, chapter_id)
    references public.chapters(campaign_id, id) on delete cascade,
  constraint scenes_title_not_blank check (length(btrim(title)) > 0),
  constraint scenes_no_self_next check (not (id = any(next_scene_ids)))
);

create index if not exists scenes_campaign_idx on public.scenes(campaign_id);
create index if not exists scenes_chapter_order_idx on public.scenes(chapter_id, sort_order, created_at, id);
create index if not exists scenes_environment_idx on public.scenes(environment_id);

create or replace function public.validate_campaign_scene()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_distinct integer;
begin
  new.title := btrim(new.title);
  new.next_scene_ids := coalesce(new.next_scene_ids, '{}'::uuid[]);
  select count(distinct value)::integer into v_distinct from unnest(new.next_scene_ids) value;
  if v_distinct <> cardinality(new.next_scene_ids) then
    raise exception 'Le scene successive non possono contenere duplicati';
  end if;
  if new.environment_id is not null and not exists (
    select 1 from public.environments e where e.id = new.environment_id and e.campaign_id = new.campaign_id
  ) then
    raise exception 'Il luogo della scena appartiene a un altra campagna';
  end if;
  if exists (
    select 1 from unnest(new.next_scene_ids) target
    left join public.scenes s on s.id = target
    where s.id is null or s.campaign_id <> new.campaign_id or s.chapter_id <> new.chapter_id
  ) then
    raise exception 'Le scene successive devono appartenere allo stesso capitolo';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.validate_campaign_scene() from public;

drop trigger if exists validate_campaign_scene on public.scenes;
create trigger validate_campaign_scene before insert or update on public.scenes
for each row execute function public.validate_campaign_scene();

create or replace function public.cleanup_deleted_scene_links()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.scenes
  set next_scene_ids = array_remove(next_scene_ids, old.id)
  where campaign_id = old.campaign_id and old.id = any(next_scene_ids);
  return old;
end;
$$;
revoke all on function public.cleanup_deleted_scene_links() from public;

drop trigger if exists cleanup_deleted_scene_links on public.scenes;
create trigger cleanup_deleted_scene_links after delete on public.scenes
for each row execute function public.cleanup_deleted_scene_links();

alter table public.scenes enable row level security;
revoke all on public.scenes from anon, authenticated;
grant select, insert, update, delete on public.scenes to authenticated;

drop policy if exists scenes_select_owner on public.scenes;
create policy scenes_select_owner on public.scenes for select to authenticated using (
  exists (select 1 from public.campaigns c where c.id = scenes.campaign_id and c.owner_profile_id = (select auth.uid())::text)
);
drop policy if exists scenes_insert_owner on public.scenes;
create policy scenes_insert_owner on public.scenes for insert to authenticated with check (
  exists (select 1 from public.campaigns c where c.id = scenes.campaign_id and c.owner_profile_id = (select auth.uid())::text)
);
drop policy if exists scenes_update_owner on public.scenes;
create policy scenes_update_owner on public.scenes for update to authenticated using (
  exists (select 1 from public.campaigns c where c.id = scenes.campaign_id and c.owner_profile_id = (select auth.uid())::text)
) with check (
  exists (select 1 from public.campaigns c where c.id = scenes.campaign_id and c.owner_profile_id = (select auth.uid())::text)
);
drop policy if exists scenes_delete_owner on public.scenes;
create policy scenes_delete_owner on public.scenes for delete to authenticated using (
  exists (select 1 from public.campaigns c where c.id = scenes.campaign_id and c.owner_profile_id = (select auth.uid())::text)
);

comment on table public.scenes is 'Scene narrative preparate dal GM e ordinate dentro un capitolo.';
commit;
