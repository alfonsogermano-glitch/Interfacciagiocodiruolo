-- Chat privata di campagna. Eseguire prima di usare la nuova interfaccia.
-- Il GM NON ha accesso speciale alle conversazioni degli altri partecipanti.
begin;

create or replace function public.private_chat_is_member(p_campaign text, p_profile text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.campaigns c
    where c.id::text = p_campaign and c.deleted_at is null
      and (c.owner_profile_id = p_profile or exists (
        select 1 from public.campaign_members cm
        where cm.campaign_id = c.id and cm.profile_id = p_profile
      ))
  );
$$;
revoke all on function public.private_chat_is_member(text, text) from public;
grant execute on function public.private_chat_is_member(text, text) to authenticated;

create or replace function public.private_chat_participants(p_campaign_id uuid)
returns table (profile_id text, display_name text, avatar_url text, is_gm boolean)
language sql stable security definer set search_path = public as $$
  select distinct p.id::text, coalesce(p.display_name, 'Partecipante'), p.avatar_url,
    p.id::text = c.owner_profile_id
  from public.campaigns c
  join public.profiles p on p.id::text = c.owner_profile_id or exists (
    select 1 from public.campaign_members cm where cm.campaign_id = c.id and cm.profile_id = p.id::text
  )
  where c.id = p_campaign_id and c.deleted_at is null
    and public.private_chat_is_member(c.id::text, (select auth.uid())::text);
$$;
revoke all on function public.private_chat_participants(uuid) from public;
grant execute on function public.private_chat_participants(uuid) to authenticated;

create table if not exists public.private_chat_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  sender_id text not null,
  recipient_id text not null,
  sender_name text not null default '',
  sender_avatar_url text,
  recipient_name text not null default '',
  recipient_avatar_url text,
  kind text not null check (kind in ('message', 'attachment')),
  content text not null default '' check (length(content) <= 20000),
  payload jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint private_chat_distinct_users check (sender_id <> recipient_id)
);
create index if not exists private_chat_sender_timeline on public.private_chat_messages(campaign_id, sender_id, created_at desc);
create index if not exists private_chat_recipient_timeline on public.private_chat_messages(campaign_id, recipient_id, created_at desc);
alter table public.private_chat_messages enable row level security;

drop policy if exists private_chat_read_pair on public.private_chat_messages;
create policy private_chat_read_pair on public.private_chat_messages for select to authenticated using (
  (sender_id = (select auth.uid())::text or recipient_id = (select auth.uid())::text)
  and public.private_chat_is_member(campaign_id::text, (select auth.uid())::text)
);
drop policy if exists private_chat_send_pair on public.private_chat_messages;
create policy private_chat_send_pair on public.private_chat_messages for insert to authenticated with check (
  sender_id = (select auth.uid())::text and deleted_at is null
  and public.private_chat_is_member(campaign_id::text, sender_id)
  and public.private_chat_is_member(campaign_id::text, recipient_id)
);
drop policy if exists private_chat_delete_own on public.private_chat_messages;
create policy private_chat_delete_own on public.private_chat_messages for update to authenticated
  using (sender_id = (select auth.uid())::text and deleted_at is null and public.private_chat_is_member(campaign_id::text, sender_id))
  with check (sender_id = (select auth.uid())::text and deleted_at is not null);
revoke all on public.private_chat_messages from anon, authenticated;
grant select, insert on public.private_chat_messages to authenticated;
grant update(deleted_at) on public.private_chat_messages to authenticated;

-- Path file: <campagna>/<mittente>/<destinatario>/<uuid>-nome.
create or replace function public.private_chat_asset_access(p_name text, p_write boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select (select auth.uid()) is not null
    and array_length(string_to_array(p_name, '/'), 1) = 4
    and split_part(p_name, '/', 2) <> split_part(p_name, '/', 3)
    and (split_part(p_name, '/', 2) = (select auth.uid())::text
      or (not p_write and split_part(p_name, '/', 3) = (select auth.uid())::text))
    and public.private_chat_is_member(split_part(p_name, '/', 1), (select auth.uid())::text)
    and (not p_write or public.private_chat_is_member(split_part(p_name, '/', 1), split_part(p_name, '/', 3)));
$$;
revoke all on function public.private_chat_asset_access(text, boolean) from public;
-- Anche anon deve poter valutare la guardia restrittiva: con auth.uid NULL
-- la funzione restituisce false e non concede accesso ad alcun oggetto.
grant execute on function public.private_chat_asset_access(text, boolean) to authenticated, anon;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('private-chat-attachments', 'private-chat-attachments', false, 52428800, null)
on conflict(id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = null;

drop policy if exists private_chat_asset_read on storage.objects;
create policy private_chat_asset_read on storage.objects for select to authenticated
using (bucket_id = 'private-chat-attachments' and public.private_chat_asset_access(storage.objects.name, false));
drop policy if exists private_chat_asset_insert on storage.objects;
create policy private_chat_asset_insert on storage.objects for insert to authenticated
with check (bucket_id = 'private-chat-attachments' and public.private_chat_asset_access(storage.objects.name, true));
drop policy if exists private_chat_asset_delete on storage.objects;
create policy private_chat_asset_delete on storage.objects for delete to authenticated
using (bucket_id = 'private-chat-attachments' and split_part(storage.objects.name, '/', 2) = (select auth.uid())::text and public.private_chat_asset_access(storage.objects.name, false));

-- Le policy permissive di altri bucket NON devono concedere accesso al bucket
-- privato. Guardie restrittive aggiuntive, senza alterare gli altri bucket.
drop policy if exists private_chat_storage_read_guard on storage.objects;
create policy private_chat_storage_read_guard on storage.objects as restrictive for select to public
using (bucket_id <> 'private-chat-attachments' or case when (select auth.uid()) is not null then public.private_chat_asset_access(storage.objects.name, false) else false end);
drop policy if exists private_chat_storage_insert_guard on storage.objects;
create policy private_chat_storage_insert_guard on storage.objects as restrictive for insert to public
with check (bucket_id <> 'private-chat-attachments' or case when (select auth.uid()) is not null then public.private_chat_asset_access(storage.objects.name, true) else false end);
drop policy if exists private_chat_storage_update_guard on storage.objects;
create policy private_chat_storage_update_guard on storage.objects as restrictive for update to public
using (bucket_id <> 'private-chat-attachments') with check (bucket_id <> 'private-chat-attachments');
drop policy if exists private_chat_storage_delete_guard on storage.objects;
create policy private_chat_storage_delete_guard on storage.objects as restrictive for delete to public
using (bucket_id <> 'private-chat-attachments' or case when (select auth.uid()) is not null then split_part(storage.objects.name, '/', 2) = (select auth.uid())::text and public.private_chat_asset_access(storage.objects.name, false) else false end);

create or replace function public.private_chat_validate_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare a jsonb;
begin
  if tg_op = 'UPDATE' then
    if old.deleted_at is not null or new.deleted_at is null then
      raise exception 'I messaggi privati possono solo essere cancellati dal mittente';
    end if;
    -- Notifica UPDATE filtrata dalla RLS: nessun DELETE Realtime non filtrato.
    new.content := ''; new.payload := null;
    return new;
  end if;
  if new.sender_id <> auth.uid()::text or not public.private_chat_is_member(new.campaign_id::text, new.sender_id)
    or not public.private_chat_is_member(new.campaign_id::text, new.recipient_id) then
    raise exception 'Partecipanti non autorizzati';
  end if;
  select coalesce(p.display_name, 'Partecipante'), p.avatar_url into new.sender_name, new.sender_avatar_url
    from public.profiles p where p.id::text = new.sender_id;
  select coalesce(p.display_name, 'Partecipante'), p.avatar_url into new.recipient_name, new.recipient_avatar_url
    from public.profiles p where p.id::text = new.recipient_id;
  if new.kind = 'message' then
    if length(trim(new.content)) = 0 then raise exception 'Messaggio vuoto'; end if;
    new.payload := null;
  else
    a := new.payload -> 'attachment';
    if a is null or a->>'bucket' is distinct from 'private-chat-attachments' or a->>'storage' is distinct from 'cloud'
      or not public.private_chat_asset_access(a->>'assetPath', true)
      or split_part(a->>'assetPath', '/', 1) <> new.campaign_id::text
      or split_part(a->>'assetPath', '/', 3) <> new.recipient_id
      or not exists(select 1 from storage.objects o where o.bucket_id = 'private-chat-attachments' and o.name = a->>'assetPath') then
      raise exception 'Allegato privato non valido';
    end if;
    new.content := coalesce(a->>'fileName', 'File');
    new.payload := jsonb_build_object('attachment', a);
  end if;
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.private_chat_validate_message() from public;
drop trigger if exists private_chat_validate on public.private_chat_messages;
create trigger private_chat_validate before insert or update on public.private_chat_messages
for each row execute function public.private_chat_validate_message();

do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'private_chat_messages') then
    alter publication supabase_realtime add table public.private_chat_messages;
  end if;
end $$;

-- Pulizia definitiva della conversazione. Elimina i messaggi della coppia e i
-- riferimenti a entrambe le cartelle di file, senza soft-delete. Security
-- definer: la RLS normale non consente di cancellare i messaggi altrui. La
-- funzione riceve entrambi i partecipanti e verifica che il richiedente sia uno
-- dei due: il GM non puo' cancellare conversazioni tra altri utenti. La pulizia
-- e' inoltre riservata all'autore della conversazione, cioe' al mittente del
-- primo messaggio della coppia; una conversazione gia' vuota e' un no-op.
create or replace function public.clear_private_chat_conversation(p_campaign uuid, p_peer_a text, p_peer_b text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_user text := (select auth.uid())::text;
  v_peer text;
  v_author text;
begin
  if v_user is null
     or p_peer_a is null or p_peer_b is null
     or p_peer_a = p_peer_b
     or (v_user <> p_peer_a and v_user <> p_peer_b)
     or not public.private_chat_is_member(p_campaign::text, p_peer_a)
     or not public.private_chat_is_member(p_campaign::text, p_peer_b) then
    raise exception 'Partecipanti non autorizzati';
  end if;
  v_peer := case when v_user = p_peer_a then p_peer_b else p_peer_a end;

  select m.sender_id into v_author
  from public.private_chat_messages m
  where m.campaign_id = p_campaign
    and ((m.sender_id = v_user and m.recipient_id = v_peer)
      or (m.sender_id = v_peer and m.recipient_id = v_user))
  order by m.created_at, m.id
  limit 1;
  if v_author is not null and v_author <> v_user then
    raise exception 'Solo il primo mittente della conversazione puo'' pulirla';
  end if;

  delete from storage.objects
  where bucket_id = 'private-chat-attachments'
    and split_part(name, '/', 1) = p_campaign::text
    and (
      (split_part(name, '/', 2) = v_user and split_part(name, '/', 3) = v_peer)
      or (split_part(name, '/', 2) = v_peer and split_part(name, '/', 3) = v_user)
    );

  delete from private_chat_messages
  where campaign_id = p_campaign
    and ((sender_id = v_user and recipient_id = v_peer)
      or (sender_id = v_peer and recipient_id = v_user));
  return true;
end;
$$;
revoke all on function public.clear_private_chat_conversation(uuid, text, text) from public;
grant execute on function public.clear_private_chat_conversation(uuid, text, text) to authenticated;

commit;
