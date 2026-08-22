-- Hollowgate P1A — harden PostgreSQL trigger functions without changing behavior.
-- Scope: fixed search_path and direct-RPC privilege reduction only.

create or replace function public.characters_broadcast_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'campaign:' || coalesce(new.campaign_id, old.campaign_id)::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

revoke all on function public.characters_broadcast_changes() from public;
revoke all on function public.characters_broadcast_changes() from anon;
revoke all on function public.characters_broadcast_changes() from authenticated;
grant execute on function public.characters_broadcast_changes() to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
  v_avatar_url text;
  v_meta jsonb := new.raw_user_meta_data;
begin
  v_display_name := coalesce(
    v_meta->'custom_claims'->>'global_name',
    v_meta->>'full_name',
    v_meta->>'name',
    v_meta->>'nickname',
    v_meta->>'display_name',
    split_part(new.email, '@', 1),
    'Utente'
  );
  v_avatar_url := coalesce(v_meta->>'avatar_url', v_meta->>'picture');

  insert into public.profiles (id, display_name, avatar_url, email)
  values (new.id, v_display_name, v_avatar_url, new.email)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;
grant execute on function public.handle_new_user() to service_role;

create or replace function public.check_character_folder_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.folder_id is not null then
    if not exists (
      select 1 from public.folders
      where id = new.folder_id
        and campaign_id = new.campaign_id
        and entity_type = case when new.available_for_players then 'premade' else 'character' end
    ) then
      raise exception 'folder_id non valido per questo personaggio (tipo o campagna non corrispondenti)';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.check_npc_folder_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.folder_id is not null then
    if not exists (
      select 1 from public.folders
      where id = new.folder_id
        and campaign_id = new.campaign_id
        and entity_type = 'npc'
    ) then
      raise exception 'folder_id non valido per questo PNG (tipo o campagna non corrispondenti)';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.check_monster_folder_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.folder_id is not null then
    if not exists (
      select 1 from public.folders
      where id = new.folder_id
        and campaign_id = new.campaign_id
        and entity_type = 'monster'
    ) then
      raise exception 'folder_id non valido per questo mostro (tipo o campagna non corrispondenti)';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.check_folder_hierarchy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_id uuid;
  depth integer := 1;
  parent_entity_type text;
  parent_campaign_id uuid;
begin
  if new.parent_folder_id is null then
    return new;
  end if;

  if new.parent_folder_id = new.id then
    raise exception 'una cartella non puo essere genitore di se stessa';
  end if;

  select entity_type, campaign_id into parent_entity_type, parent_campaign_id
  from public.folders where id = new.parent_folder_id;

  if parent_entity_type is null then
    raise exception 'cartella genitore non trovata';
  end if;
  if parent_entity_type <> new.entity_type or parent_campaign_id <> new.campaign_id then
    raise exception 'la sotto-cartella deve avere lo stesso tipo e la stessa campagna della cartella genitore';
  end if;

  current_id := new.parent_folder_id;
  while current_id is not null loop
    depth := depth + 1;
    if current_id = new.id then
      raise exception 'riferimento circolare tra cartelle';
    end if;
    if depth > 5 then
      raise exception 'profondita massima di annidamento (5 livelli) superata';
    end if;
    select parent_folder_id into current_id from public.folders where id = current_id;
  end loop;

  return new;
end;
$$;

create or replace function public.check_entity_notes_folder_type()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expected_entity_type text;
begin
  if new.folder_id is null then
    return new;
  end if;

  if new.entity_type <> 'campaign' then
    raise exception 'folder_id ammesso solo per note di campagna (Note del GM/Note della Campagna)';
  end if;

  expected_entity_type := case when new.hidden then 'gmnotes' else 'campaignnotes' end;

  if not exists (
    select 1 from public.folders
    where id = new.folder_id
      and campaign_id = new.campaign_id
      and entity_type = expected_entity_type
  ) then
    raise exception 'folder_id non valido per questa nota (sezione o campagna non corrispondenti)';
  end if;

  return new;
end;
$$;

create or replace function public.lock_characters_origins_in_campaign()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.campaign_id is not null then
    if new.style is distinct from old.style
       or new.viaggio is distinct from old.viaggio
       or new.sheet_data->'tratti' is distinct from old.sheet_data->'tratti'
    then
      raise exception 'ORIGINI_LOCKED: impossibile modificare Stile, Viaggio o Tratti: il personaggio è già assegnato a una campagna.';
    end if;
  end if;
  return new;
end;
$$;
