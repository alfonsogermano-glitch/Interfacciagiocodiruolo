-- Hollowgate P1B.1
-- Optimize public-schema RLS auth.uid() evaluation and add five FK indexes.
-- Realtime, Storage, KV indexes, unused indexes, application code, and data are intentionally out of scope.

do $$
declare
  v_public_direct_uid_count integer;
begin
  select count(*)
    into v_public_direct_uid_count
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%auth.uid()%';

  if v_public_direct_uid_count <> 47 then
    raise exception 'P1B1_SCOPE_DRIFT: expected 47 public policies with direct auth.uid(), found %',
      v_public_direct_uid_count;
  end if;
end
$$;

alter policy adventures_delete_own on public.adventures
  using ((exists (select 1 from campaigns where ((campaigns.id = adventures.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))));

alter policy adventures_insert_own on public.adventures
  with check ((exists (select 1 from campaigns where ((campaigns.id = adventures.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))));

alter policy adventures_select_own_or_member on public.adventures
  using (((exists (select 1 from campaigns where ((campaigns.id = adventures.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))) or (exists (select 1 from campaign_members where ((campaign_members.campaign_id = adventures.campaign_id) and (campaign_members.profile_id = ((select auth.uid()))::text))))));

alter policy adventures_update_own on public.adventures
  using ((exists (select 1 from campaigns where ((campaigns.id = adventures.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))));

alter policy campaign_members_select_if_member_or_owner on public.campaign_members
  using (((profile_id = ((select auth.uid()))::text) or (exists (select 1 from campaigns where ((campaigns.id = campaign_members.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text))))));

alter policy campaigns_insert_own on public.campaigns
  with check ((owner_profile_id = ((select auth.uid()))::text));

alter policy campaigns_select_own on public.campaigns
  using ((owner_profile_id = ((select auth.uid()))::text));

alter policy campaigns_update_own on public.campaigns
  using ((owner_profile_id = ((select auth.uid()))::text));

alter policy character_equipment_all_own on public.character_equipment
  using ((exists (select 1 from (characters left join campaigns on ((campaigns.id = characters.campaign_id))) where ((characters.id = character_equipment.character_id) and ((characters.owner_profile_id = ((select auth.uid()))::text) or (campaigns.owner_profile_id = ((select auth.uid()))::text))))))
  with check ((exists (select 1 from (characters left join campaigns on ((campaigns.id = characters.campaign_id))) where ((characters.id = character_equipment.character_id) and ((characters.owner_profile_id = ((select auth.uid()))::text) or (campaigns.owner_profile_id = ((select auth.uid()))::text))))));

alter policy characters_delete_own on public.characters
  using ((owner_profile_id = ((select auth.uid()))::text));

alter policy characters_insert_own on public.characters
  with check ((owner_profile_id = ((select auth.uid()))::text));

alter policy characters_select_own_or_member on public.characters
  using (((owner_profile_id = ((select auth.uid()))::text) or (exists (select 1 from campaigns where ((campaigns.id = characters.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))) or (exists (select 1 from campaign_members where ((campaign_members.campaign_id = characters.campaign_id) and (campaign_members.profile_id = ((select auth.uid()))::text))))));

alter policy characters_update_own on public.characters
  using ((owner_profile_id = ((select auth.uid()))::text));

alter policy clues_all_own on public.clues
  using ((exists (select 1 from campaigns where ((campaigns.id = clues.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))))
  with check ((exists (select 1 from campaigns where ((campaigns.id = clues.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))));

alter policy dashboard_settings_delete_own on public.dashboard_settings
  using ((owner_profile_id = ((select auth.uid()))::text));

alter policy dashboard_settings_insert_own on public.dashboard_settings
  with check ((owner_profile_id = ((select auth.uid()))::text));

alter policy dashboard_settings_select_own on public.dashboard_settings
  using ((owner_profile_id = ((select auth.uid()))::text));

alter policy dashboard_settings_update_own on public.dashboard_settings
  using ((owner_profile_id = ((select auth.uid()))::text));

alter policy environments_delete_own on public.environments
  using ((exists (select 1 from campaigns where ((campaigns.id = environments.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))));

alter policy environments_insert_own on public.environments
  with check ((exists (select 1 from campaigns where ((campaigns.id = environments.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))));

alter policy environments_select_own_or_member on public.environments
  using (((exists (select 1 from campaigns where ((campaigns.id = environments.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))) or (exists (select 1 from campaign_members where ((campaign_members.campaign_id = environments.campaign_id) and (campaign_members.profile_id = ((select auth.uid()))::text))))));

alter policy environments_update_own on public.environments
  using ((exists (select 1 from campaigns where ((campaigns.id = environments.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))));

alter policy equipment_catalog_all_own on public.equipment_catalog
  using ((exists (select 1 from campaigns where ((campaigns.id = equipment_catalog.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))))
  with check ((exists (select 1 from campaigns where ((campaigns.id = equipment_catalog.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))));

alter policy folders_delete_own on public.folders
  using ((exists (select 1 from campaigns where ((campaigns.id = folders.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))));

alter policy folders_insert_own on public.folders
  with check ((exists (select 1 from campaigns where ((campaigns.id = folders.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))));

alter policy folders_select_own_or_member on public.folders
  using (((exists (select 1 from campaigns where ((campaigns.id = folders.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))) or (exists (select 1 from campaign_members where ((campaign_members.campaign_id = folders.campaign_id) and (campaign_members.profile_id = ((select auth.uid()))::text))))));

alter policy folders_update_own on public.folders
  using ((exists (select 1 from campaigns where ((campaigns.id = folders.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))));

alter policy image_assets_delete_own on public.image_assets
  using ((((select auth.uid()))::text = owner_profile_id));

alter policy image_assets_insert_own on public.image_assets
  with check ((((select auth.uid()))::text = owner_profile_id));

alter policy image_assets_select_own on public.image_assets
  using ((((select auth.uid()))::text = owner_profile_id));

alter policy image_assets_update_own on public.image_assets
  using ((((select auth.uid()))::text = owner_profile_id))
  with check ((((select auth.uid()))::text = owner_profile_id));

alter policy monsters_delete_owner on public.monsters
  using (((owner_profile_id = ((select auth.uid()))::text) or (exists (select 1 from campaigns where ((campaigns.id = monsters.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text))))));

alter policy monsters_insert_owner on public.monsters
  with check (((owner_profile_id = ((select auth.uid()))::text) or (exists (select 1 from campaigns where ((campaigns.id = monsters.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text))))));

alter policy monsters_select_owner_or_visible on public.monsters
  using (((owner_profile_id = ((select auth.uid()))::text) or (exists (select 1 from campaigns where ((campaigns.id = monsters.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))) or ((visible_to_players = true) and (exists (select 1 from campaign_members where ((campaign_members.campaign_id = monsters.campaign_id) and (campaign_members.profile_id = ((select auth.uid()))::text)))))));

alter policy monsters_update_owner on public.monsters
  using (((owner_profile_id = ((select auth.uid()))::text) or (exists (select 1 from campaigns where ((campaigns.id = monsters.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text))))));

alter policy news_delete_admin_only on public.news_posts
  using (((select auth.uid()) = '3c298159-e7d1-4507-ad06-b44765968162'::uuid));

alter policy news_insert_admin_only on public.news_posts
  with check (((select auth.uid()) = '3c298159-e7d1-4507-ad06-b44765968162'::uuid));

alter policy notifications_select_own on public.notifications
  using ((recipient_profile_id = ((select auth.uid()))::text));

alter policy npcs_delete_owner on public.npcs
  using (((owner_profile_id = ((select auth.uid()))::text) or (exists (select 1 from campaigns where ((campaigns.id = npcs.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text))))));

alter policy npcs_insert_owner on public.npcs
  with check (((owner_profile_id = ((select auth.uid()))::text) or (exists (select 1 from campaigns where ((campaigns.id = npcs.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text))))));

alter policy npcs_select_owner_or_visible on public.npcs
  using (((owner_profile_id = ((select auth.uid()))::text) or (exists (select 1 from campaigns where ((campaigns.id = npcs.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))) or ((visible_to_players = true) and (exists (select 1 from campaign_members where ((campaign_members.campaign_id = npcs.campaign_id) and (campaign_members.profile_id = ((select auth.uid()))::text)))))));

alter policy npcs_update_owner on public.npcs
  using (((owner_profile_id = ((select auth.uid()))::text) or (exists (select 1 from campaigns where ((campaigns.id = npcs.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text))))));

alter policy profiles_insert_own on public.profiles
  with check (((select auth.uid()) = id));

alter policy profiles_select_own on public.profiles
  using (((select auth.uid()) = id));

alter policy profiles_update_own on public.profiles
  using (((select auth.uid()) = id));

alter policy situations_all_own on public.situations
  using ((exists (select 1 from campaigns where ((campaigns.id = situations.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))))
  with check ((exists (select 1 from campaigns where ((campaigns.id = situations.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))));

alter policy visual_assets_all_own on public.visual_assets
  using ((exists (select 1 from campaigns where ((campaigns.id = visual_assets.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))))
  with check ((exists (select 1 from campaigns where ((campaigns.id = visual_assets.campaign_id) and (campaigns.owner_profile_id = ((select auth.uid()))::text)))));

create index idx_characters_portrait_asset
  on public.characters (portrait_asset_id);

create index idx_entity_notes_campaign
  on public.entity_notes (campaign_id);

create index idx_monsters_portrait_asset
  on public.monsters (portrait_asset_id);

create index idx_news_posts_author
  on public.news_posts (author_id);

create index idx_npcs_portrait_asset
  on public.npcs (portrait_asset_id);

do $$
declare
  v_public_direct_uid_count integer;
begin
  select count(*)
    into v_public_direct_uid_count
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%auth.uid()%';

  if v_public_direct_uid_count <> 0 then
    raise exception 'P1B1_POSTCONDITION_FAILED: % public policies still contain direct auth.uid()',
      v_public_direct_uid_count;
  end if;
end
$$;
