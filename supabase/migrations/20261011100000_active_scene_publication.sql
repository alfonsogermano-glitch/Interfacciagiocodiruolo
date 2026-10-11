begin;

-- Lo snapshot live e' l'unico campaign document leggibile dai membri. Le
-- Scene sorgente restano owner-only, quindi note GM e dati preparatori non
-- attraversano mai questa policy.
drop policy if exists campaign_documents_active_scene_member_read on public.campaign_documents;
create policy campaign_documents_active_scene_member_read
  on public.campaign_documents
  for select
  to authenticated
  using (
    document_key = 'active-scene'
    and exists (
      select 1
      from public.campaign_members member
      where member.campaign_id = campaign_documents.campaign_id
        and member.profile_id::text = (select auth.uid())::text
    )
  );

-- Difesa strutturale: impedisce che un futuro client pubblichi per errore le
-- note private dentro lo snapshot accessibile ai giocatori.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.campaign_documents'::regclass
      and conname = 'campaign_documents_active_scene_public_shape'
  ) then
    alter table public.campaign_documents
      add constraint campaign_documents_active_scene_public_shape check (
        document_key <> 'active-scene'
        or (
          jsonb_typeof(payload) = 'object'
          and payload ?& array[
            'id', 'campaignId', 'sceneId', 'chapterId', 'title',
            'description', 'chapterTitle', 'mapMetadata', 'mapRegions',
            'contextMetadata', 'publishedAt'
          ]
          and not payload ?| array['notes', 'gmNotes', 'sourceEnvironment']
        )
      );
  end if;
end $$;

comment on policy campaign_documents_active_scene_member_read on public.campaign_documents is
  'I membri leggono solo lo snapshot pubblico della Scena attiva; tutte le scritture restano owner-only.';

commit;
