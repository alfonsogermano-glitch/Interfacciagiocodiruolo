drop policy if exists dice_face_assets_insert_own on storage.objects;
create policy dice_face_assets_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'dice-face-assets'
  and (storage.foldername(storage.objects.name))[2] = (select auth.uid())::text
  and (
    exists (
      select 1 from public.campaigns c
      where c.id::text = (storage.foldername(storage.objects.name))[1]
        and c.deleted_at is null
        and c.owner_profile_id = (select auth.uid())::text
    )
    or exists (
      select 1 from public.campaign_members cm
      where cm.campaign_id::text = (storage.foldername(storage.objects.name))[1]
        and cm.profile_id = (select auth.uid())::text
    )
  )
);
