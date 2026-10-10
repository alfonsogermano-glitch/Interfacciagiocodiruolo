-- Rinomina definitiva del dominio narrativo: Campagna -> Capitolo -> Scena.
-- Conserva UUID, righe, relazioni, privilegi e dati esistenti.
begin;

do $$
begin
  if to_regclass('public.chapters') is null and to_regclass('public.adventures') is not null then
    alter table public.adventures rename to chapters;
  elsif to_regclass('public.chapters') is not null and to_regclass('public.adventures') is not null then
    raise exception 'Esistono sia public.chapters sia public.adventures: unificare i dati prima del cutover';
  end if;
  if to_regclass('public.chapters') is null then
    raise exception 'Tabella narrativa non trovata';
  end if;
end $$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['characters', 'npcs', 'monsters', 'environments', 'clues', 'situations'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_table and column_name = 'adventure_id'
    ) and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_table and column_name = 'chapter_id'
    ) then
      execute format('alter table public.%I rename column adventure_id to chapter_id', v_table);
    end if;
  end loop;
end $$;

alter table public.chapters add column if not exists kind text;
alter table public.chapters add column if not exists is_active boolean;
alter table public.chapters add column if not exists next_chapter_ids uuid[];
update public.chapters set kind = coalesce(kind, 'standard'), is_active = coalesce(is_active, false), next_chapter_ids = coalesce(next_chapter_ids, '{}'::uuid[]);
alter table public.chapters alter column kind set default 'standard';
alter table public.chapters alter column kind set not null;
alter table public.chapters alter column is_active set default false;
alter table public.chapters alter column is_active set not null;
alter table public.chapters alter column next_chapter_ids set default '{}'::uuid[];
alter table public.chapters alter column next_chapter_ids set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chapters_kind_check' and conrelid = 'public.chapters'::regclass) then
    alter table public.chapters add constraint chapters_kind_check check (kind in ('intro', 'standard', 'final'));
  end if;
end $$;

do $$
declare
  item record;
begin
  for item in select * from (values
    ('chapters', 'adventures_pkey', 'chapters_pkey'),
    ('chapters', 'adventures_campaign_id_fkey', 'chapters_campaign_id_fkey'),
    ('characters', 'characters_adventure_id_fkey', 'characters_chapter_id_fkey'),
    ('npcs', 'npcs_adventure_id_fkey', 'npcs_chapter_id_fkey'),
    ('monsters', 'monsters_adventure_id_fkey', 'monsters_chapter_id_fkey'),
    ('environments', 'environments_adventure_id_fkey', 'environments_chapter_id_fkey'),
    ('clues', 'clues_adventure_id_fkey', 'clues_chapter_id_fkey'),
    ('situations', 'situations_adventure_id_fkey', 'situations_chapter_id_fkey')
  ) as names(table_name, old_name, new_name) loop
    if exists (select 1 from pg_constraint where conname = item.old_name and conrelid = format('public.%I', item.table_name)::regclass)
       and not exists (select 1 from pg_constraint where conname = item.new_name and conrelid = format('public.%I', item.table_name)::regclass) then
      execute format('alter table public.%I rename constraint %I to %I', item.table_name, item.old_name, item.new_name);
    end if;
  end loop;
end $$;

do $$
declare
  item record;
begin
  for item in select * from (values
    ('idx_adventures_campaign', 'idx_chapters_campaign'),
    ('idx_characters_adventure', 'idx_characters_chapter'),
    ('idx_npcs_adventure', 'idx_npcs_chapter'),
    ('idx_monsters_adventure', 'idx_monsters_chapter'),
    ('idx_environments_adventure', 'idx_environments_chapter'),
    ('idx_clues_adventure', 'idx_clues_chapter'),
    ('idx_situations_adventure', 'idx_situations_chapter')
  ) as names(old_name, new_name) loop
    if to_regclass('public.' || item.old_name) is not null and to_regclass('public.' || item.new_name) is null then
      execute format('alter index public.%I rename to %I', item.old_name, item.new_name);
    end if;
  end loop;
end $$;

do $$
declare
  item record;
begin
  for item in select * from (values
    ('adventures_select_own_or_member', 'chapters_select_own_or_member'),
    ('adventures_insert_own', 'chapters_insert_own'),
    ('adventures_update_own', 'chapters_update_own'),
    ('adventures_delete_own', 'chapters_delete_own')
  ) as names(old_name, new_name) loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chapters' and policyname = item.old_name)
       and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chapters' and policyname = item.new_name) then
      execute format('alter policy %I on public.chapters rename to %I', item.old_name, item.new_name);
    end if;
  end loop;
end $$;

do $$ begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.chapters'::regclass and tgname = 'update_adventures_updated_at')
     and not exists (select 1 from pg_trigger where tgrelid = 'public.chapters'::regclass and tgname = 'update_chapters_updated_at') then
    alter trigger update_adventures_updated_at on public.chapters rename to update_chapters_updated_at;
  end if;
end $$;

comment on table public.chapters is 'Capitoli narrativi della campagna; ogni capitolo contiene scene.';
comment on column public.chapters.next_chapter_ids is 'Diramazioni narrative verso i capitoli successivi.';

commit;
