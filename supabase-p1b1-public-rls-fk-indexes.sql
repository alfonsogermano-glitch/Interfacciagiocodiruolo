-- Hollowgate P1B.1
-- Optimize exactly 47 approved public-schema RLS policies and add five FK indexes.
-- Realtime, Storage, KV indexes, unused indexes, application code, and data are out of scope.

do $$
declare
  v_targets text[] := array[
    'adventures.adventures_delete_own',
    'adventures.adventures_insert_own',
    'adventures.adventures_select_own_or_member',
    'adventures.adventures_update_own',
    'campaign_members.campaign_members_select_if_member_or_owner',
    'campaigns.campaigns_insert_own',
    'campaigns.campaigns_select_own',
    'campaigns.campaigns_update_own',
    'character_equipment.character_equipment_all_own',
    'characters.characters_delete_own',
    'characters.characters_insert_own',
    'characters.characters_select_own_or_member',
    'characters.characters_update_own',
    'clues.clues_all_own',
    'dashboard_settings.dashboard_settings_delete_own',
    'dashboard_settings.dashboard_settings_insert_own',
    'dashboard_settings.dashboard_settings_select_own',
    'dashboard_settings.dashboard_settings_update_own',
    'environments.environments_delete_own',
    'environments.environments_insert_own',
    'environments.environments_select_own_or_member',
    'environments.environments_update_own',
    'equipment_catalog.equipment_catalog_all_own',
    'folders.folders_delete_own',
    'folders.folders_insert_own',
    'folders.folders_select_own_or_member',
    'folders.folders_update_own',
    'image_assets.image_assets_delete_own',
    'image_assets.image_assets_insert_own',
    'image_assets.image_assets_select_own',
    'image_assets.image_assets_update_own',
    'monsters.monsters_delete_owner',
    'monsters.monsters_insert_owner',
    'monsters.monsters_select_owner_or_visible',
    'monsters.monsters_update_owner',
    'news_posts.news_delete_admin_only',
    'news_posts.news_insert_admin_only',
    'notifications.notifications_select_own',
    'npcs.npcs_delete_owner',
    'npcs.npcs_insert_owner',
    'npcs.npcs_select_owner_or_visible',
    'npcs.npcs_update_owner',
    'profiles.profiles_insert_own',
    'profiles.profiles_select_own',
    'profiles.profiles_update_own',
    'situations.situations_all_own',
    'visual_assets.visual_assets_all_own'
  ];
  v_direct_total integer;
  v_target_direct integer;
  r record;
  v_sql text;
begin
  select count(*) into v_direct_total
  from pg_policies
  where schemaname = 'public'
    and replace(
      coalesce(qual, '') || ' ' || coalesce(with_check, ''),
      '( SELECT auth.uid() AS uid)',
      ''
    ) like '%auth.uid()%';

  select count(*) into v_target_direct
  from pg_policies
  where schemaname = 'public'
    and (tablename || '.' || policyname) = any(v_targets)
    and replace(
      coalesce(qual, '') || ' ' || coalesce(with_check, ''),
      '( SELECT auth.uid() AS uid)',
      ''
    ) like '%auth.uid()%';

  if cardinality(v_targets) <> 47 then
    raise exception 'P1B1_TARGET_LIST_INVALID: expected 47 target names, found %', cardinality(v_targets);
  end if;

  if v_direct_total <> 47 or v_target_direct <> 47 then
    raise exception 'P1B1_SCOPE_DRIFT: direct public policies %, matching approved targets %',
      v_direct_total, v_target_direct;
  end if;

  for r in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (tablename || '.' || policyname) = any(v_targets)
    order by tablename, policyname
  loop
    v_sql := 'alter policy ' || quote_ident(r.policyname)
      || ' on public.' || quote_ident(r.tablename)
      || case when r.qual is not null
           then ' using (' || replace(r.qual, 'auth.uid()', '(select auth.uid())') || ')'
           else ''
         end
      || case when r.with_check is not null
           then ' with check (' || replace(r.with_check, 'auth.uid()', '(select auth.uid())') || ')'
           else ''
         end;
    execute v_sql;
  end loop;

  select count(*) into v_direct_total
  from pg_policies
  where schemaname = 'public'
    and replace(
      coalesce(qual, '') || ' ' || coalesce(with_check, ''),
      '( SELECT auth.uid() AS uid)',
      ''
    ) like '%auth.uid()%';

  if v_direct_total <> 0 then
    raise exception 'P1B1_POSTCONDITION_FAILED: % public policies still contain direct auth.uid()',
      v_direct_total;
  end if;
end
$$;

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
  v_index_count integer;
begin
  select count(*) into v_index_count
  from pg_indexes
  where schemaname = 'public'
    and indexname in (
      'idx_characters_portrait_asset',
      'idx_entity_notes_campaign',
      'idx_monsters_portrait_asset',
      'idx_news_posts_author',
      'idx_npcs_portrait_asset'
    );

  if v_index_count <> 5 then
    raise exception 'P1B1_INDEX_POSTCONDITION_FAILED: expected 5 target indexes, found %',
      v_index_count;
  end if;
end
$$;
