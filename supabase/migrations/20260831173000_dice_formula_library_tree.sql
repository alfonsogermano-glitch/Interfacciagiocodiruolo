-- This file intentionally mirrors the production migration that introduced
-- the saved dice formula folder hierarchy. A follow-up migration hardens the
-- structural RPC execution context without changing their public signatures.

create table if not exists public.dice_formula_folders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  owner_profile_id uuid not null,
  name text not null,
  icon_name text null,
  parent_folder_id uuid null references public.dice_formula_folders(id) on delete cascade,
  sort_order integer not null default -1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dice_formula_folders_name_not_blank check (length(btrim(name)) > 0)
);

alter table public.dice_formulas add column if not exists folder_id uuid null references public.dice_formula_folders(id) on delete cascade;
alter table public.dice_formulas add column if not exists sort_order integer;

with ranked as (
  select id, row_number() over (partition by campaign_id, owner_profile_id order by updated_at desc, id) - 1 as position
  from public.dice_formulas where sort_order is null
)
update public.dice_formulas f set sort_order=ranked.position::integer from ranked where f.id=ranked.id;

alter table public.dice_formulas alter column sort_order set default -1;
alter table public.dice_formulas alter column sort_order set not null;
create index if not exists dice_formula_folders_library_order_idx on public.dice_formula_folders(campaign_id,owner_profile_id,parent_folder_id,sort_order);
create index if not exists dice_formulas_library_order_idx on public.dice_formulas(campaign_id,owner_profile_id,folder_id,sort_order);

alter table public.dice_formula_folders enable row level security;
drop policy if exists dice_formula_folders_select_own_campaign on public.dice_formula_folders;
create policy dice_formula_folders_select_own_campaign on public.dice_formula_folders for select using (
  owner_profile_id=(select auth.uid()) and (
    exists(select 1 from public.campaigns c where c.id=dice_formula_folders.campaign_id and c.deleted_at is null and c.owner_profile_id=((select auth.uid()))::text)
    or exists(select 1 from public.campaign_members cm where cm.campaign_id=dice_formula_folders.campaign_id and cm.profile_id=((select auth.uid()))::text)
  )
);
drop policy if exists dice_formula_folders_insert_own_campaign on public.dice_formula_folders;
create policy dice_formula_folders_insert_own_campaign on public.dice_formula_folders for insert with check (
  owner_profile_id=(select auth.uid()) and (
    exists(select 1 from public.campaigns c where c.id=dice_formula_folders.campaign_id and c.deleted_at is null and c.owner_profile_id=((select auth.uid()))::text)
    or exists(select 1 from public.campaign_members cm where cm.campaign_id=dice_formula_folders.campaign_id and cm.profile_id=((select auth.uid()))::text)
  )
);
drop policy if exists dice_formula_folders_update_own_campaign on public.dice_formula_folders;
create policy dice_formula_folders_update_own_campaign on public.dice_formula_folders for update using (owner_profile_id=(select auth.uid())) with check (
  owner_profile_id=(select auth.uid()) and (
    exists(select 1 from public.campaigns c where c.id=dice_formula_folders.campaign_id and c.deleted_at is null and c.owner_profile_id=((select auth.uid()))::text)
    or exists(select 1 from public.campaign_members cm where cm.campaign_id=dice_formula_folders.campaign_id and cm.profile_id=((select auth.uid()))::text)
  )
);
drop policy if exists dice_formula_folders_delete_own on public.dice_formula_folders;
create policy dice_formula_folders_delete_own on public.dice_formula_folders for delete using (owner_profile_id=(select auth.uid()));

create or replace function public.validate_dice_formula_folder_hierarchy() returns trigger language plpgsql security definer set search_path=public as $$
declare v_parent_campaign uuid; v_parent_owner uuid; v_parent_depth integer:=0; v_subtree_height integer:=1;
begin
  new.name:=btrim(new.name);
  if new.parent_folder_id is not null then
    if new.parent_folder_id=new.id then raise exception 'Una cartella non può contenere se stessa.'; end if;
    select campaign_id,owner_profile_id into v_parent_campaign,v_parent_owner from public.dice_formula_folders where id=new.parent_folder_id;
    if not found then raise exception 'Cartella superiore non trovata.'; end if;
    if v_parent_campaign<>new.campaign_id or v_parent_owner<>new.owner_profile_id then raise exception 'La cartella superiore deve appartenere alla stessa libreria.'; end if;
    if exists(
      with recursive descendants as (
        select id from public.dice_formula_folders where parent_folder_id=new.id
        union all select f.id from public.dice_formula_folders f join descendants d on f.parent_folder_id=d.id
      ) select 1 from descendants where id=new.parent_folder_id
    ) then raise exception 'Una cartella non può essere spostata dentro una propria sottocartella.'; end if;
    with recursive ancestors as (
      select id,parent_folder_id,1 depth from public.dice_formula_folders where id=new.parent_folder_id
      union all select f.id,f.parent_folder_id,a.depth+1 from public.dice_formula_folders f join ancestors a on f.id=a.parent_folder_id
    ) select coalesce(max(depth),0) into v_parent_depth from ancestors;
  end if;
  with recursive subtree as (
    select id,1 depth from public.dice_formula_folders where id=new.id
    union all select f.id,s.depth+1 from public.dice_formula_folders f join subtree s on f.parent_folder_id=s.id
  ) select coalesce(max(depth),1) into v_subtree_height from subtree;
  if v_parent_depth+v_subtree_height>5 then raise exception 'Le cartelle possono essere annidate fino a un massimo di 5 livelli.'; end if;
  return new;
end; $$;
drop trigger if exists validate_dice_formula_folder_hierarchy_trigger on public.dice_formula_folders;
create trigger validate_dice_formula_folder_hierarchy_trigger before insert or update of parent_folder_id,campaign_id,owner_profile_id,name on public.dice_formula_folders for each row execute function public.validate_dice_formula_folder_hierarchy();

create or replace function public.validate_dice_formula_folder_assignment() returns trigger language plpgsql security definer set search_path=public as $$
declare v_campaign uuid; v_owner uuid;
begin
  if new.folder_id is null then return new; end if;
  select campaign_id,owner_profile_id into v_campaign,v_owner from public.dice_formula_folders where id=new.folder_id;
  if not found or v_campaign<>new.campaign_id or v_owner<>new.owner_profile_id then raise exception 'La formula deve appartenere alla stessa libreria della cartella.'; end if;
  return new;
end; $$;
drop trigger if exists validate_dice_formula_folder_assignment_trigger on public.dice_formulas;
create trigger validate_dice_formula_folder_assignment_trigger before insert or update of folder_id,campaign_id,owner_profile_id on public.dice_formulas for each row execute function public.validate_dice_formula_folder_assignment();

create or replace function public.next_dice_library_sort_order(p_campaign uuid,p_owner uuid,p_parent uuid) returns integer language sql security definer set search_path=public as $$
  select coalesce(max(sort_order),-1)+1 from (
    select sort_order from public.dice_formulas where campaign_id=p_campaign and owner_profile_id=p_owner and folder_id is not distinct from p_parent
    union all
    select sort_order from public.dice_formula_folders where campaign_id=p_campaign and owner_profile_id=p_owner and parent_folder_id is not distinct from p_parent
  ) x;
$$;
create or replace function public.assign_dice_formula_sort_order() returns trigger language plpgsql security definer set search_path=public as $$ begin if new.sort_order<0 then new.sort_order:=public.next_dice_library_sort_order(new.campaign_id,new.owner_profile_id,new.folder_id); end if; return new; end; $$;
drop trigger if exists assign_dice_formula_sort_order_trigger on public.dice_formulas;
create trigger assign_dice_formula_sort_order_trigger before insert on public.dice_formulas for each row execute function public.assign_dice_formula_sort_order();
create or replace function public.assign_dice_formula_folder_sort_order() returns trigger language plpgsql security definer set search_path=public as $$ begin if new.sort_order<0 then new.sort_order:=public.next_dice_library_sort_order(new.campaign_id,new.owner_profile_id,new.parent_folder_id); end if; return new; end; $$;
drop trigger if exists assign_dice_formula_folder_sort_order_trigger on public.dice_formula_folders;
create trigger assign_dice_formula_folder_sort_order_trigger before insert on public.dice_formula_folders for each row execute function public.assign_dice_formula_folder_sort_order();

create or replace function public.normalize_dice_library_level(p_campaign_id uuid,p_owner_profile_id uuid,p_parent_folder_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare r record; v_position integer:=0;
begin
  for r in select kind,id from (
    select 'formula'::text kind,id,sort_order,created_at from public.dice_formulas where campaign_id=p_campaign_id and owner_profile_id=p_owner_profile_id and folder_id is not distinct from p_parent_folder_id
    union all
    select 'folder'::text kind,id,sort_order,created_at from public.dice_formula_folders where campaign_id=p_campaign_id and owner_profile_id=p_owner_profile_id and parent_folder_id is not distinct from p_parent_folder_id
  ) nodes order by sort_order,created_at,kind,id loop
    if r.kind='formula' then update public.dice_formulas set sort_order=v_position where id=r.id; else update public.dice_formula_folders set sort_order=v_position where id=r.id; end if;
    v_position:=v_position+1;
  end loop;
end; $$;

create or replace function public.create_dice_formula_folder(p_campaign_id uuid,p_owner_profile_id uuid,p_parent_folder_id uuid,p_name text,p_icon_name text default null) returns public.dice_formula_folders language plpgsql security invoker set search_path=public as $$
declare v_folder public.dice_formula_folders;
begin
  if p_owner_profile_id<>auth.uid() then raise exception 'Operazione non autorizzata.'; end if;
  insert into public.dice_formula_folders(campaign_id,owner_profile_id,parent_folder_id,name,icon_name,sort_order) values(p_campaign_id,p_owner_profile_id,p_parent_folder_id,btrim(p_name),p_icon_name,-1) returning * into v_folder;
  return v_folder;
end; $$;

create or replace function public.move_dice_library_node(p_node_type text,p_node_id uuid,p_destination_folder_id uuid,p_destination_index integer) returns void language plpgsql security invoker set search_path=public as $$
declare v_campaign uuid; v_owner uuid; v_source_parent uuid; v_dc uuid; v_do uuid; v_index integer:=greatest(coalesce(p_destination_index,0),0);
begin
  if p_node_type='formula' then select campaign_id,owner_profile_id,folder_id into v_campaign,v_owner,v_source_parent from public.dice_formulas where id=p_node_id for update;
  elsif p_node_type='folder' then select campaign_id,owner_profile_id,parent_folder_id into v_campaign,v_owner,v_source_parent from public.dice_formula_folders where id=p_node_id for update;
  else raise exception 'Tipo di nodo non valido.'; end if;
  if not found or v_owner<>auth.uid() then raise exception 'Nodo non trovato o non autorizzato.'; end if;
  if p_destination_folder_id is not null then
    select campaign_id,owner_profile_id into v_dc,v_do from public.dice_formula_folders where id=p_destination_folder_id for update;
    if not found or v_dc<>v_campaign or v_do<>v_owner then raise exception 'Destinazione non valida.'; end if;
  end if;
  if p_node_type='formula' then update public.dice_formulas set folder_id=p_destination_folder_id,sort_order=2147483647,updated_at=now() where id=p_node_id;
  else update public.dice_formula_folders set parent_folder_id=p_destination_folder_id,sort_order=2147483647,updated_at=now() where id=p_node_id; end if;
  if v_source_parent is distinct from p_destination_folder_id then perform public.normalize_dice_library_level(v_campaign,v_owner,v_source_parent); end if;
  perform public.normalize_dice_library_level(v_campaign,v_owner,p_destination_folder_id);
  if p_node_type='formula' then update public.dice_formulas set sort_order=2147483647 where id=p_node_id; else update public.dice_formula_folders set sort_order=2147483647 where id=p_node_id; end if;
  update public.dice_formulas set sort_order=sort_order+1 where campaign_id=v_campaign and owner_profile_id=v_owner and folder_id is not distinct from p_destination_folder_id and sort_order>=v_index and not (p_node_type='formula' and id=p_node_id);
  update public.dice_formula_folders set sort_order=sort_order+1 where campaign_id=v_campaign and owner_profile_id=v_owner and parent_folder_id is not distinct from p_destination_folder_id and sort_order>=v_index and not (p_node_type='folder' and id=p_node_id);
  if p_node_type='formula' then update public.dice_formulas set sort_order=v_index where id=p_node_id; else update public.dice_formula_folders set sort_order=v_index where id=p_node_id; end if;
  perform public.normalize_dice_library_level(v_campaign,v_owner,p_destination_folder_id);
end; $$;

create or replace function public.delete_dice_formula_folder(p_folder_id uuid,p_delete_contents boolean) returns void language plpgsql security invoker set search_path=public as $$
declare v_campaign uuid; v_owner uuid; v_parent uuid; v_folder_order integer; v_child_count integer:=0; v_delta integer:=0; v_position integer:=0; r record;
begin
  select campaign_id,owner_profile_id,parent_folder_id,sort_order into v_campaign,v_owner,v_parent,v_folder_order from public.dice_formula_folders where id=p_folder_id for update;
  if not found or v_owner<>auth.uid() then raise exception 'Cartella non trovata o non autorizzata.'; end if;
  if p_delete_contents then delete from public.dice_formula_folders where id=p_folder_id; perform public.normalize_dice_library_level(v_campaign,v_owner,v_parent); return; end if;
  select count(*) into v_child_count from (select id from public.dice_formulas where folder_id=p_folder_id union all select id from public.dice_formula_folders where parent_folder_id=p_folder_id) children;
  v_delta:=v_child_count-1;
  update public.dice_formulas set sort_order=sort_order+v_delta where campaign_id=v_campaign and owner_profile_id=v_owner and folder_id is not distinct from v_parent and sort_order>v_folder_order;
  update public.dice_formula_folders set sort_order=sort_order+v_delta where campaign_id=v_campaign and owner_profile_id=v_owner and parent_folder_id is not distinct from v_parent and id<>p_folder_id and sort_order>v_folder_order;
  v_position:=v_folder_order;
  for r in select kind,id from (
    select 'formula'::text kind,id,sort_order,created_at from public.dice_formulas where folder_id=p_folder_id
    union all
    select 'folder'::text kind,id,sort_order,created_at from public.dice_formula_folders where parent_folder_id=p_folder_id
  ) children order by sort_order,created_at,kind,id loop
    if r.kind='formula' then update public.dice_formulas set folder_id=v_parent,sort_order=v_position,updated_at=now() where id=r.id; else update public.dice_formula_folders set parent_folder_id=v_parent,sort_order=v_position,updated_at=now() where id=r.id; end if;
    v_position:=v_position+1;
  end loop;
  delete from public.dice_formula_folders where id=p_folder_id;
  perform public.normalize_dice_library_level(v_campaign,v_owner,v_parent);
end; $$;

revoke all on function public.normalize_dice_library_level(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.next_dice_library_sort_order(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_dice_formula_folder(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.move_dice_library_node(text,uuid,uuid,integer) to authenticated;
grant execute on function public.delete_dice_formula_folder(uuid,boolean) to authenticated;
