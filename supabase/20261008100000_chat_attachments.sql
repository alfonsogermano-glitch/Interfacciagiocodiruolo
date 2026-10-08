-- =====================================================
-- ALLEGATI CHAT: bucket dedicato per i file condivisi
-- Il pulsante "+" della chat accetta qualsiasi tipo di
-- file fino a 50 MB. In Cloud i bytes finiscono qui
-- (in Locale restano in IndexedDB via contentAssets),
-- mentre chat_messages.payload tiene solo i metadati.
-- Path: <campaignId>/<userId>/<uuid>-<nome> (come
-- dice-face-assets: cartella campagna + cartella utente
-- per le policy di storage.objects).
-- =====================================================

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('chat-attachments','chat-attachments',true,52428800,null)
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=null;

drop policy if exists chat_attachments_insert_own on storage.objects;
create policy chat_attachments_insert_own on storage.objects for insert to authenticated with check (
  bucket_id='chat-attachments' and (storage.foldername(storage.objects.name))[2]=(select auth.uid())::text and (
    exists(select 1 from public.campaigns c where c.id::text=(storage.foldername(storage.objects.name))[1] and c.deleted_at is null and c.owner_profile_id=(select auth.uid())::text)
    or exists(select 1 from public.campaign_members cm where cm.campaign_id::text=(storage.foldername(storage.objects.name))[1] and cm.profile_id=(select auth.uid())::text)
  )
);

drop policy if exists chat_attachments_update_own on storage.objects;
create policy chat_attachments_update_own on storage.objects for update to authenticated using (bucket_id='chat-attachments' and (storage.foldername(name))[2]=(select auth.uid())::text) with check (bucket_id='chat-attachments' and (storage.foldername(name))[2]=(select auth.uid())::text);

drop policy if exists chat_attachments_delete_own on storage.objects;
create policy chat_attachments_delete_own on storage.objects for delete to authenticated using (bucket_id='chat-attachments' and (storage.foldername(name))[2]=(select auth.uid())::text);
