create table if not exists public.dice_custom_dice (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  owner_profile_id uuid not null,
  name text not null,
  sides integer not null,
  faces jsonb not null,
  body_color text not null default '#20242f',
  symbol_color text not null default '#ffffff',
  icon_name text null,
  folder_id uuid null references public.dice_formula_folders(id) on delete cascade,
  sort_order integer not null default -1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dice_custom_dice_name_not_blank check (length(btrim(name)) > 0),
  constraint dice_custom_dice_supported_sides check (sides in (4,6,8,10,12,20,100))
);

create index if not exists dice_custom_dice_library_order_idx
  on public.dice_custom_dice(campaign_id, owner_profile_id, folder_id, sort_order);

alter table public.dice_custom_dice enable row level security;

drop policy if exists dice_custom_dice_select_own_campaign on public.dice_custom_dice;
create policy dice_custom_dice_select_own_campaign on public.dice_custom_dice for select to authenticated using (
  owner_profile_id=(select auth.uid()) and (
    exists(select 1 from public.campaigns c where c.id=dice_custom_dice.campaign_id and c.deleted_at is null and c.owner_profile_id=(select auth.uid())::text)
    or exists(select 1 from public.campaign_members cm where cm.campaign_id=dice_custom_dice.campaign_id and cm.profile_id=(select auth.uid())::text)
  )
);
drop policy if exists dice_custom_dice_insert_own_campaign on public.dice_custom_dice;
create policy dice_custom_dice_insert_own_campaign on public.dice_custom_dice for insert to authenticated with check (
  owner_profile_id=(select auth.uid()) and (
    exists(select 1 from public.campaigns c where c.id=dice_custom_dice.campaign_id and c.deleted_at is null and c.owner_profile_id=(select auth.uid())::text)
    or exists(select 1 from public.campaign_members cm where cm.campaign_id=dice_custom_dice.campaign_id and cm.profile_id=(select auth.uid())::text)
  )
);
drop policy if exists dice_custom_dice_update_own_campaign on public.dice_custom_dice;
create policy dice_custom_dice_update_own_campaign on public.dice_custom_dice for update to authenticated using (owner_profile_id=(select auth.uid())) with check (
  owner_profile_id=(select auth.uid()) and (
    exists(select 1 from public.campaigns c where c.id=dice_custom_dice.campaign_id and c.deleted_at is null and c.owner_profile_id=(select auth.uid())::text)
    or exists(select 1 from public.campaign_members cm where cm.campaign_id=dice_custom_dice.campaign_id and cm.profile_id=(select auth.uid())::text)
  )
);
drop policy if exists dice_custom_dice_delete_own on public.dice_custom_dice;
create policy dice_custom_dice_delete_own on public.dice_custom_dice for delete to authenticated using (owner_profile_id=(select auth.uid()));

create or replace function public.validate_dice_custom_die() returns trigger language plpgsql security definer set search_path=public as $$
declare v_expected integer; v_role text; v_role_expected integer; v_count integer; v_distinct_indices integer; v_min_index integer; v_max_index integer; v_face jsonb; v_visual jsonb; v_campaign uuid; v_owner uuid;
begin
  new.name:=btrim(new.name);
  v_expected:=case when new.sides=100 then 20 else new.sides end;
  if jsonb_typeof(new.faces)<>'array' or jsonb_array_length(new.faces)<>v_expected then raise exception 'Numero di facce non valido per il dado custom.'; end if;
  if new.folder_id is not null then
    select campaign_id,owner_profile_id into v_campaign,v_owner from public.dice_formula_folders where id=new.folder_id;
    if not found or v_campaign<>new.campaign_id or v_owner<>new.owner_profile_id then raise exception 'Il dado custom deve appartenere alla stessa libreria della cartella.'; end if;
  end if;
  if new.sides=100 then
    for v_role in select unnest(array['tens','units']::text[]) loop
      v_role_expected:=10;
      select count(*),count(distinct (f->>'index')::integer),min((f->>'index')::integer),max((f->>'index')::integer)
      into v_count,v_distinct_indices,v_min_index,v_max_index from jsonb_array_elements(new.faces) f where f->>'role'=v_role and jsonb_typeof(f->'index')='number';
      if v_count<>v_role_expected or v_distinct_indices<>v_role_expected or v_min_index<>1 or v_max_index<>v_role_expected then raise exception 'Indici o ruoli delle facce non validi per il dado custom.'; end if;
    end loop;
  else
    v_role_expected:=new.sides;
    select count(*),count(distinct (f->>'index')::integer),min((f->>'index')::integer),max((f->>'index')::integer)
    into v_count,v_distinct_indices,v_min_index,v_max_index from jsonb_array_elements(new.faces) f where f->>'role'='single' and jsonb_typeof(f->'index')='number';
    if v_count<>v_role_expected or v_distinct_indices<>v_role_expected or v_min_index<>1 or v_max_index<>v_role_expected then raise exception 'Indici o ruoli delle facce non validi per il dado custom.'; end if;
  end if;
  for v_face in select value from jsonb_array_elements(new.faces) loop
    if jsonb_typeof(v_face)<>'object' then raise exception 'Definizione faccia non valida.'; end if;
    if new.sides=100 and coalesce(v_face->>'role','') not in ('tens','units') then raise exception 'Ruolo faccia d100 non valido.'; end if;
    if new.sides<>100 and coalesce(v_face->>'role','')<>'single' then raise exception 'Ruolo faccia non valido.'; end if;
    v_visual:=v_face->'visual';
    if jsonb_typeof(v_visual)<>'object' then raise exception 'Visuale faccia non valida.'; end if;
    if v_visual->>'kind'='icon' then
      if length(btrim(coalesce(v_visual->>'iconName','')))=0 then raise exception 'Icona faccia mancante.'; end if;
    elsif v_visual->>'kind'='image' then
      if length(btrim(coalesce(v_visual->>'assetPath','')))=0 or length(btrim(coalesce(v_visual->>'publicUrl','')))=0 then raise exception 'Asset faccia mancante.'; end if;
    else raise exception 'Tipo visuale faccia non valido.'; end if;
    if v_face ? 'numericValue' and v_face->'numericValue'<>'null'::jsonb and jsonb_typeof(v_face->'numericValue')<>'number' then raise exception 'Valore numerico faccia non valido.'; end if;
  end loop;
  return new;
end; $$;
drop trigger if exists validate_dice_custom_die_trigger on public.dice_custom_dice;
create trigger validate_dice_custom_die_trigger before insert or update on public.dice_custom_dice for each row execute function public.validate_dice_custom_die();

create or replace function public.next_dice_library_sort_order(p_campaign uuid,p_owner uuid,p_parent uuid) returns integer language sql security definer set search_path=public as $$
  select coalesce(max(sort_order),-1)+1 from (
    select sort_order from public.dice_formulas where campaign_id=p_campaign and owner_profile_id=p_owner and folder_id is not distinct from p_parent
    union all select sort_order from public.dice_custom_dice where campaign_id=p_campaign and owner_profile_id=p_owner and folder_id is not distinct from p_parent
    union all select sort_order from public.dice_formula_folders where campaign_id=p_campaign and owner_profile_id=p_owner and parent_folder_id is not distinct from p_parent
  ) x;
$$;
create or replace function public.assign_dice_custom_die_sort_order() returns trigger language plpgsql security definer set search_path=public as $$
begin if new.sort_order<0 then new.sort_order:=public.next_dice_library_sort_order(new.campaign_id,new.owner_profile_id,new.folder_id); end if; return new; end; $$;
drop trigger if exists assign_dice_custom_die_sort_order_trigger on public.dice_custom_dice;
create trigger assign_dice_custom_die_sort_order_trigger before insert on public.dice_custom_dice for each row execute function public.assign_dice_custom_die_sort_order();

create or replace function public.normalize_dice_library_level(p_campaign_id uuid,p_owner_profile_id uuid,p_parent_folder_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare r record; v_position integer:=0;
begin
  for r in select kind,id from (
    select 'formula'::text kind,id,sort_order,created_at from public.dice_formulas where campaign_id=p_campaign_id and owner_profile_id=p_owner_profile_id and folder_id is not distinct from p_parent_folder_id
    union all select 'custom-die'::text kind,id,sort_order,created_at from public.dice_custom_dice where campaign_id=p_campaign_id and owner_profile_id=p_owner_profile_id and folder_id is not distinct from p_parent_folder_id
    union all select 'folder'::text kind,id,sort_order,created_at from public.dice_formula_folders where campaign_id=p_campaign_id and owner_profile_id=p_owner_profile_id and parent_folder_id is not distinct from p_parent_folder_id
  ) nodes order by sort_order,created_at,kind,id loop
    if r.kind='formula' then update public.dice_formulas set sort_order=v_position where id=r.id;
    elsif r.kind='custom-die' then update public.dice_custom_dice set sort_order=v_position where id=r.id;
    else update public.dice_formula_folders set sort_order=v_position where id=r.id; end if;
    v_position:=v_position+1;
  end loop;
end; $$;

create or replace function public.move_dice_library_node(p_node_type text,p_node_id uuid,p_destination_folder_id uuid,p_destination_index integer) returns void language plpgsql security definer set search_path=public as $$
declare v_campaign uuid; v_owner uuid; v_source_parent uuid; v_dc uuid; v_do uuid; v_index integer:=greatest(coalesce(p_destination_index,0),0);
begin
  if p_node_type='formula' then select campaign_id,owner_profile_id,folder_id into v_campaign,v_owner,v_source_parent from public.dice_formulas where id=p_node_id for update;
  elsif p_node_type='custom-die' then select campaign_id,owner_profile_id,folder_id into v_campaign,v_owner,v_source_parent from public.dice_custom_dice where id=p_node_id for update;
  elsif p_node_type='folder' then select campaign_id,owner_profile_id,parent_folder_id into v_campaign,v_owner,v_source_parent from public.dice_formula_folders where id=p_node_id for update;
  else raise exception 'Tipo di nodo non valido.'; end if;
  if not found or v_owner<>auth.uid() then raise exception 'Nodo non trovato o non autorizzato.'; end if;
  if p_destination_folder_id is not null then select campaign_id,owner_profile_id into v_dc,v_do from public.dice_formula_folders where id=p_destination_folder_id for update; if not found or v_dc<>v_campaign or v_do<>v_owner then raise exception 'Destinazione non valida.'; end if; end if;
  if p_node_type='formula' then update public.dice_formulas set folder_id=p_destination_folder_id,sort_order=2147483647,updated_at=now() where id=p_node_id;
  elsif p_node_type='custom-die' then update public.dice_custom_dice set folder_id=p_destination_folder_id,sort_order=2147483647,updated_at=now() where id=p_node_id;
  else update public.dice_formula_folders set parent_folder_id=p_destination_folder_id,sort_order=2147483647,updated_at=now() where id=p_node_id; end if;
  if v_source_parent is distinct from p_destination_folder_id then perform public.normalize_dice_library_level(v_campaign,v_owner,v_source_parent); end if;
  perform public.normalize_dice_library_level(v_campaign,v_owner,p_destination_folder_id);
  if p_node_type='formula' then update public.dice_formulas set sort_order=2147483647 where id=p_node_id;
  elsif p_node_type='custom-die' then update public.dice_custom_dice set sort_order=2147483647 where id=p_node_id;
  else update public.dice_formula_folders set sort_order=2147483647 where id=p_node_id; end if;
  update public.dice_formulas set sort_order=sort_order+1 where campaign_id=v_campaign and owner_profile_id=v_owner and folder_id is not distinct from p_destination_folder_id and sort_order>=v_index and not (p_node_type='formula' and id=p_node_id);
  update public.dice_custom_dice set sort_order=sort_order+1 where campaign_id=v_campaign and owner_profile_id=v_owner and folder_id is not distinct from p_destination_folder_id and sort_order>=v_index and not (p_node_type='custom-die' and id=p_node_id);
  update public.dice_formula_folders set sort_order=sort_order+1 where campaign_id=v_campaign and owner_profile_id=v_owner and parent_folder_id is not distinct from p_destination_folder_id and sort_order>=v_index and not (p_node_type='folder' and id=p_node_id);
  if p_node_type='formula' then update public.dice_formulas set sort_order=v_index where id=p_node_id;
  elsif p_node_type='custom-die' then update public.dice_custom_dice set sort_order=v_index where id=p_node_id;
  else update public.dice_formula_folders set sort_order=v_index where id=p_node_id; end if;
  perform public.normalize_dice_library_level(v_campaign,v_owner,p_destination_folder_id);
end; $$;

create or replace function public.delete_dice_formula_folder(p_folder_id uuid,p_delete_contents boolean) returns void language plpgsql security definer set search_path=public as $$
declare v_campaign uuid; v_owner uuid; v_parent uuid; v_folder_order integer; v_child_count integer:=0; v_delta integer:=0; v_position integer:=0; r record;
begin
  select campaign_id,owner_profile_id,parent_folder_id,sort_order into v_campaign,v_owner,v_parent,v_folder_order from public.dice_formula_folders where id=p_folder_id for update;
  if not found or v_owner<>auth.uid() then raise exception 'Cartella non trovata o non autorizzata.'; end if;
  if p_delete_contents then delete from public.dice_formula_folders where id=p_folder_id; perform public.normalize_dice_library_level(v_campaign,v_owner,v_parent); return; end if;
  select count(*) into v_child_count from (select id from public.dice_formulas where folder_id=p_folder_id union all select id from public.dice_custom_dice where folder_id=p_folder_id union all select id from public.dice_formula_folders where parent_folder_id=p_folder_id) children;
  v_delta:=v_child_count-1;
  update public.dice_formulas set sort_order=sort_order+v_delta where campaign_id=v_campaign and owner_profile_id=v_owner and folder_id is not distinct from v_parent and sort_order>v_folder_order;
  update public.dice_custom_dice set sort_order=sort_order+v_delta where campaign_id=v_campaign and owner_profile_id=v_owner and folder_id is not distinct from v_parent and sort_order>v_folder_order;
  update public.dice_formula_folders set sort_order=sort_order+v_delta where campaign_id=v_campaign and owner_profile_id=v_owner and parent_folder_id is not distinct from v_parent and id<>p_folder_id and sort_order>v_folder_order;
  v_position:=v_folder_order;
  for r in select kind,id from (select 'formula'::text kind,id,sort_order,created_at from public.dice_formulas where folder_id=p_folder_id union all select 'custom-die'::text kind,id,sort_order,created_at from public.dice_custom_dice where folder_id=p_folder_id union all select 'folder'::text kind,id,sort_order,created_at from public.dice_formula_folders where parent_folder_id=p_folder_id) children order by sort_order,created_at,kind,id loop
    if r.kind='formula' then update public.dice_formulas set folder_id=v_parent,sort_order=v_position,updated_at=now() where id=r.id;
    elsif r.kind='custom-die' then update public.dice_custom_dice set folder_id=v_parent,sort_order=v_position,updated_at=now() where id=r.id;
    else update public.dice_formula_folders set parent_folder_id=v_parent,sort_order=v_position,updated_at=now() where id=r.id; end if;
    v_position:=v_position+1;
  end loop;
  delete from public.dice_formula_folders where id=p_folder_id;
  perform public.normalize_dice_library_level(v_campaign,v_owner,v_parent);
end; $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('dice-face-assets','dice-face-assets',true,1048576,array['image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists dice_face_assets_insert_own on storage.objects;
create policy dice_face_assets_insert_own on storage.objects for insert to authenticated with check (
  bucket_id='dice-face-assets' and (storage.foldername(name))[2]=(select auth.uid())::text and (
    exists(select 1 from public.campaigns c where c.id::text=(storage.foldername(name))[1] and c.deleted_at is null and c.owner_profile_id=(select auth.uid())::text)
    or exists(select 1 from public.campaign_members cm where cm.campaign_id::text=(storage.foldername(storage.objects.name))[1] and cm.profile_id=(select auth.uid())::text)
  )
);
drop policy if exists dice_face_assets_update_own on storage.objects;
create policy dice_face_assets_update_own on storage.objects for update to authenticated using (bucket_id='dice-face-assets' and (storage.foldername(name))[2]=(select auth.uid())::text) with check (bucket_id='dice-face-assets' and (storage.foldername(name))[2]=(select auth.uid())::text);
drop policy if exists dice_face_assets_delete_own on storage.objects;
create policy dice_face_assets_delete_own on storage.objects for delete to authenticated using (bucket_id='dice-face-assets' and (storage.foldername(name))[2]=(select auth.uid())::text);
