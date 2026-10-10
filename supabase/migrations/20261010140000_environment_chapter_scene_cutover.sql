-- Conservative location-domain cutover: environments remain the compatibility
-- source while effective top-level locations become chapters and descendants
-- become scenes. Resolution is deterministic and rerun-stable:
--   * a parent is followed only when the row exists and shares the campaign;
--   * environments without a usable parent (top level, missing parent, parent in
--     another campaign) become chapter roots of their own campaign;
--   * cyclic chains (including self-parent rows) resolve to the smallest uuid of
--     the cycle as root, so no environment is left without a narrative target;
--   * rows without campaign_id are left untouched;
--   * chapter/scene metadata use the canonical client object shapes while the
--     legacy array columns stay nested inside those objects.
-- The whole migration is a single DO statement: SQL editors may run each
-- statement in a separate transaction/session, so no object created by an
-- earlier statement (temp or plain helper tables) can be relied on (42P01).
do $mig$
declare
  v_table text;
begin
  execute 'alter table public.chapters add column if not exists map_url text';
  execute $q$alter table public.chapters add column if not exists map_metadata jsonb not null default '{}'::jsonb$q$;
  execute $q$alter table public.chapters add column if not exists location_metadata jsonb not null default '{}'::jsonb$q$;
  execute 'alter table public.chapters add column if not exists source_environment jsonb';

  execute $q$alter table public.scenes add column if not exists map_regions jsonb not null default '[]'::jsonb$q$;
  execute $q$alter table public.scenes add column if not exists context_metadata jsonb not null default '{}'::jsonb$q$;
  execute 'alter table public.scenes add column if not exists source_environment jsonb';

  if not exists (select 1 from pg_constraint where conname = 'chapters_map_metadata_object' and conrelid = 'public.chapters'::regclass) then
    execute $q$alter table public.chapters add constraint chapters_map_metadata_object check (jsonb_typeof(map_metadata) = 'object')$q$;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chapters_location_metadata_object' and conrelid = 'public.chapters'::regclass) then
    execute $q$alter table public.chapters add constraint chapters_location_metadata_object check (jsonb_typeof(location_metadata) = 'object')$q$;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chapters_source_environment_object' and conrelid = 'public.chapters'::regclass) then
    execute $q$alter table public.chapters add constraint chapters_source_environment_object check (source_environment is null or jsonb_typeof(source_environment) = 'object')$q$;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'scenes_map_regions_array' and conrelid = 'public.scenes'::regclass) then
    execute $q$alter table public.scenes add constraint scenes_map_regions_array check (jsonb_typeof(map_regions) = 'array')$q$;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'scenes_map_regions_objects' and conrelid = 'public.scenes'::regclass) then
    execute $q$alter table public.scenes add constraint scenes_map_regions_objects check (not jsonb_path_exists(map_regions, '$[*] ? (@.type() != "object")'))$q$;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'scenes_context_metadata_object' and conrelid = 'public.scenes'::regclass) then
    execute $q$alter table public.scenes add constraint scenes_context_metadata_object check (jsonb_typeof(context_metadata) = 'object')$q$;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'scenes_source_environment_object' and conrelid = 'public.scenes'::regclass) then
    execute $q$alter table public.scenes add constraint scenes_source_environment_object check (source_environment is null or jsonb_typeof(source_environment) = 'object')$q$;
  end if;

  execute $q$create table if not exists public.environment_narrative_mapping (
    environment_id uuid primary key,
    root_environment_id uuid not null,
    chapter_id uuid not null,
    scene_id uuid,
    target_kind text not null check (target_kind in ('chapter', 'scene')),
    created_at timestamptz not null default now(),
    constraint environment_narrative_mapping_shape check (
      (target_kind = 'chapter' and scene_id is null and environment_id = root_environment_id)
      or (target_kind = 'scene' and scene_id is not null and environment_id <> root_environment_id)
    )
  )$q$;

  -- Self-heal the named shape constraint when the table was bootstrapped without
  -- it (schema dumps create it unnamed); existing rows are revalidated.
  execute 'alter table public.environment_narrative_mapping drop constraint if exists environment_narrative_mapping_shape';
  execute $q$alter table public.environment_narrative_mapping add constraint environment_narrative_mapping_shape check (
    (target_kind = 'chapter' and scene_id is null and environment_id = root_environment_id)
    or (target_kind = 'scene' and scene_id is not null and environment_id <> root_environment_id)
  )$q$;

  execute 'create unique index if not exists environment_narrative_mapping_scene_uidx on public.environment_narrative_mapping(scene_id) where scene_id is not null';
  execute 'alter table public.environment_narrative_mapping enable row level security';
  execute 'revoke all on public.environment_narrative_mapping from anon, authenticated';

  -- Reserve stable destination UUIDs before inserting. A generated UUID is kept
  -- permanently whenever an independently authored chapter/scene already owns it.
  execute $q$
    with recursive walk as (
      select e.id as start_id, e.id as node_id, e.campaign_id as campaign_id,
             e.parent_location_id as parent_id, array[e.id] as path
      from public.environments e
      where e.campaign_id is not null
      union all
      select w.start_id, p.id, w.campaign_id, p.parent_location_id, w.path || p.id
      from walk w
      join public.environments p
        on p.id = w.parent_id
       and p.campaign_id is not null
       and p.campaign_id = w.campaign_id
      where not p.id = any(w.path)
    ), terminal as (
      select distinct on (w.start_id) w.start_id, w.campaign_id, w.node_id, w.parent_id, w.path
      from walk w
      order by w.start_id, cardinality(w.path) desc
    ), resolution as (
      select t.start_id, t.campaign_id,
        case
          when t.parent_id is null then t.node_id
          when not exists (
            select 1 from public.environments p
            where p.id = t.parent_id and p.campaign_id = t.campaign_id
          ) then t.node_id
          else (
            select min(pel.el::text)::uuid
            from unnest(t.path) with ordinality as pel(el, idx)
            where pel.idx >= coalesce(array_position(t.path, t.parent_id), 1)
          )
        end as root_id
      from terminal t
    )
    insert into public.environment_narrative_mapping(environment_id, root_environment_id, chapter_id, target_kind)
    select r.start_id, r.root_id,
      case when c.id is null then r.start_id else gen_random_uuid() end,
      'chapter'
    from resolution r
    left join public.chapters c on c.id = r.start_id
    where r.start_id = r.root_id
    on conflict (environment_id) do nothing
  $q$;

  execute $q$
    with recursive walk as (
      select e.id as start_id, e.id as node_id, e.campaign_id as campaign_id,
             e.parent_location_id as parent_id, array[e.id] as path
      from public.environments e
      where e.campaign_id is not null
      union all
      select w.start_id, p.id, w.campaign_id, p.parent_location_id, w.path || p.id
      from walk w
      join public.environments p
        on p.id = w.parent_id
       and p.campaign_id is not null
       and p.campaign_id = w.campaign_id
      where not p.id = any(w.path)
    ), terminal as (
      select distinct on (w.start_id) w.start_id, w.campaign_id, w.node_id, w.parent_id, w.path
      from walk w
      order by w.start_id, cardinality(w.path) desc
    ), resolution as (
      select t.start_id, t.campaign_id,
        case
          when t.parent_id is null then t.node_id
          when not exists (
            select 1 from public.environments p
            where p.id = t.parent_id and p.campaign_id = t.campaign_id
          ) then t.node_id
          else (
            select min(pel.el::text)::uuid
            from unnest(t.path) with ordinality as pel(el, idx)
            where pel.idx >= coalesce(array_position(t.path, t.parent_id), 1)
          )
        end as root_id
      from terminal t
    )
    insert into public.environment_narrative_mapping(environment_id, root_environment_id, chapter_id, scene_id, target_kind)
    select r.start_id, r.root_id, root_map.chapter_id,
      case when s.id is null then r.start_id else gen_random_uuid() end,
      'scene'
    from resolution r
    join public.environment_narrative_mapping root_map
      on root_map.environment_id = r.root_id and root_map.target_kind = 'chapter'
    left join public.scenes s on s.id = r.start_id
    where r.start_id <> r.root_id
    on conflict (environment_id) do nothing
  $q$;

  execute $q$
    insert into public.chapters(id, campaign_id, title, description, notes, map_url, map_metadata, location_metadata, source_environment)
    select m.chapter_id, e.campaign_id,
      case when btrim(coalesce(e.name, '')) = '' then 'Luogo ' || left(e.id::text, 8) else btrim(e.name) end,
      coalesce(e.description, ''), coalesce(e.notes, ''), e.map_url,
      jsonb_build_object('imageUrl', e.map_url, 'gridVisible', true, 'gridColumns', 20, 'gridRows', 20),
      to_jsonb(e) - array['id','campaign_id','name','description','notes','map_url','image_url','created_at','updated_at'],
      to_jsonb(e)
    from public.environment_narrative_mapping m
    join public.environments e on e.id = m.environment_id
    where m.target_kind = 'chapter'
    on conflict (id) do nothing
  $q$;

  execute $q$
    insert into public.scenes(id, campaign_id, chapter_id, environment_id, title, description, notes, image_url, sort_order, map_regions, context_metadata, source_environment)
    select m.scene_id, e.campaign_id, m.chapter_id, e.id,
      case when btrim(coalesce(e.name, '')) = '' then 'Luogo ' || left(e.id::text, 8) else btrim(e.name) end,
      coalesce(e.description, ''), coalesce(e.notes, ''), e.image_url,
      greatest(coalesce(e.sort_order, 0), 0),
      '[]'::jsonb,
      jsonb_build_object('timeOfDay', '', 'period', '', 'condition', ''),
      to_jsonb(e)
    from public.environment_narrative_mapping m
    join public.environments e on e.id = m.environment_id
    where m.target_kind = 'scene'
    on conflict (id) do nothing
  $q$;

  foreach v_table in array array['npcs', 'monsters', 'clues', 'situations'] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('alter table public.%I add column if not exists scene_id uuid references public.scenes(id) on delete set null', v_table);
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name=v_table and column_name='environment_id')
         and exists (select 1 from information_schema.columns where table_schema='public' and table_name=v_table and column_name='chapter_id')
         and exists (select 1 from information_schema.columns where table_schema='public' and table_name=v_table and column_name='campaign_id') then
        execute format(
          'update public.%1$I entity
             set chapter_id = m.chapter_id, scene_id = m.scene_id
           from public.environment_narrative_mapping m
           join public.environments e on e.id = m.environment_id
           where entity.environment_id = m.environment_id
             and entity.campaign_id = e.campaign_id
             and (entity.chapter_id is distinct from m.chapter_id or entity.scene_id is distinct from m.scene_id)',
          v_table
        );
      end if;
      execute format('create index if not exists %I on public.%I(scene_id)', 'idx_' || v_table || '_scene', v_table);
    end if;
  end loop;

  execute $q$comment on column public.scenes.map_regions is 'Possibly overlapping regions on the chapter macro-map; overlap is intentionally unrestricted.'$q$;
  execute $q$comment on column public.chapters.map_metadata is 'Canonical client map object (imageUrl, gridVisible, gridColumns, gridRows).'$q$;
  execute $q$comment on column public.scenes.context_metadata is 'Canonical client context object (timeOfDay, period, condition).'$q$;
  execute $q$comment on table public.environment_narrative_mapping is 'Persistent, idempotent mapping from legacy environments to chapters/scenes.'$q$;
end $mig$;
