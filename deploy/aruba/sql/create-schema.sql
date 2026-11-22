-- Aruba PostgreSQL Schema
-- Generated from Supabase real data structure
-- Date: 2026-11-17

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- profiles (users)
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  drama INTEGER DEFAULT 1,
  owner_profile_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  ruleset TEXT,
  session_active BOOLEAN DEFAULT FALSE,
  session_activated_at TIMESTAMPTZ,
  invite_code TEXT,
  last_opened_at TIMESTAMPTZ,
  logo_url TEXT,
  cover_image_url TEXT,
  cover_crop JSONB,
  cover_rotation_degrees REAL DEFAULT 0,
  tab_order JSONB,
  tab_order_campaign_notes JSONB,
  tab_order_gm_notes JSONB,
  deleted_at TIMESTAMPTZ
);

-- campaign_members
CREATE TABLE IF NOT EXISTS campaign_members (
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  profile_id TEXT,
  role TEXT DEFAULT 'player',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (campaign_id, profile_id)
);

-- chapters
CREATE TABLE IF NOT EXISTS chapters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  synopsis TEXT,
  scenes JSONB,
  npcs JSONB,
  clues JSONB,
  status TEXT DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  kind TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  next_chapter_ids JSONB,
  map_url TEXT,
  map_metadata JSONB,
  location_metadata JSONB,
  source_environment UUID
);

-- environments (locations)
CREATE TABLE IF NOT EXISTS environments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT,
  description TEXT,
  atmosphere TEXT,
  image_url TEXT,
  map_url TEXT,
  features JSONB,
  hazards JSONB,
  tags JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  chapter_id UUID,
  parent_location_id UUID,
  map_location_id UUID,
  location_type TEXT,
  icon_id TEXT,
  exit_points JSONB,
  hidden_details TEXT,
  npcs_present JSONB,
  sort_order INTEGER DEFAULT 0
);

-- scenes
CREATE TABLE IF NOT EXISTS scenes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
  environment_id UUID,
  title TEXT,
  description TEXT,
  notes TEXT,
  status TEXT DEFAULT 'draft',
  image_url TEXT,
  sort_order INTEGER DEFAULT 0,
  next_scene_ids JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  map_regions JSONB,
  context_metadata JSONB,
  source_environment UUID
);

-- characters
CREATE TABLE IF NOT EXISTS characters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  owner_profile_id TEXT,
  name TEXT,
  style TEXT,
  viaggio TEXT,
  status TEXT DEFAULT 'active',
  portrait_url TEXT,
  background_url TEXT,
  sheet_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  description TEXT,
  tags JSONB,
  ruleset TEXT,
  token_color TEXT,
  token_background_color TEXT,
  token_border_style TEXT,
  portrait_image_url TEXT,
  portrait_cropped_image_url TEXT,
  portrait_crop JSONB,
  token_border_thickness REAL,
  token_border_label TEXT,
  token_border_visible BOOLEAN DEFAULT TRUE,
  portrait_source_image_url TEXT,
  portrait_crop_area JSONB,
  portrait_asset_id UUID,
  portrait_frame_asset_id UUID,
  portrait_frame_rotation_degrees REAL DEFAULT 0,
  portrait_frame_offset_x REAL DEFAULT 0,
  portrait_frame_offset_y REAL DEFAULT 0,
  portrait_frame_scale_x REAL DEFAULT 1,
  portrait_frame_scale_y REAL DEFAULT 1,
  cover_image_url TEXT,
  cover_image_scale REAL DEFAULT 1,
  cover_crop JSONB,
  cover_rotation_degrees REAL DEFAULT 0,
  frame_rotation REAL DEFAULT 0,
  frame_rotation_degrees REAL DEFAULT 0,
  cover_frame_offset_x REAL DEFAULT 0,
  cover_frame_offset_y REAL DEFAULT 0,
  cover_frame_scale_x REAL DEFAULT 1,
  cover_frame_scale_y REAL DEFAULT 1,
  cover_frame_asset_id UUID,
  available_for_players BOOLEAN DEFAULT FALSE,
  claimable_origin TEXT,
  original_owner_profile_id TEXT,
  folder_id UUID,
  chapter_id UUID
);

-- npcs
CREATE TABLE IF NOT EXISTS npcs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT,
  role TEXT,
  description TEXT,
  notes TEXT,
  image_url TEXT,
  tags JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  environment_id UUID,
  chapter_id UUID,
  personality TEXT,
  secrets TEXT,
  location TEXT,
  portrait_image_url TEXT,
  portrait_cropped_image_url TEXT,
  portrait_crop JSONB,
  map_location_id UUID,
  custom_location_name TEXT,
  freschezza INTEGER,
  max_freschezza INTEGER,
  caselle_frischezza_cruciali JSONB,
  attacco INTEGER,
  difesa INTEGER,
  tratti JSONB,
  tratti_personalizzati JSONB,
  azioni_speciali JSONB,
  azioni_speciali_personalizzate JSONB,
  punto_debole TEXT,
  visible_to_players BOOLEAN DEFAULT FALSE,
  tab_order JSONB,
  owner_profile_id TEXT,
  d20_stats JSONB,
  ruleset TEXT,
  token_color TEXT,
  token_background_color TEXT,
  token_border_style TEXT,
  token_border_thickness REAL,
  token_border_label TEXT,
  token_border_visible BOOLEAN DEFAULT TRUE,
  portrait_rotation_degrees REAL DEFAULT 0,
  portrait_source_image_url TEXT,
  portrait_crop_area JSONB,
  portrait_asset_id UUID,
  portrait_frame_asset_id UUID,
  portrait_frame_rotation_degrees REAL DEFAULT 0,
  portrait_frame_offset_x REAL DEFAULT 0,
  portrait_frame_offset_y REAL DEFAULT 0,
  portrait_frame_scale_x REAL DEFAULT 1,
  portrait_frame_scale_y REAL DEFAULT 1,
  cover_image_url TEXT,
  cover_image_scale REAL DEFAULT 1,
  cover_crop JSONB,
  cover_rotation_degrees REAL DEFAULT 0,
  frame_rotation REAL DEFAULT 0,
  frame_rotation_degrees REAL DEFAULT 0,
  cover_frame_offset_x REAL DEFAULT 0,
  cover_frame_offset_y REAL DEFAULT 0,
  cover_frame_scale_x REAL DEFAULT 1,
  cover_frame_scale_y REAL DEFAULT 1,
  cover_frame_asset_id UUID,
  requestable BOOLEAN DEFAULT FALSE,
  folder_id UUID,
  scene_id UUID
);

-- monsters
CREATE TABLE IF NOT EXISTS monsters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT,
  base_type TEXT,
  size TEXT,
  threat_level TEXT,
  freschezza INTEGER,
  max_freschezza INTEGER,
  stress INTEGER,
  stress_threshold INTEGER,
  description TEXT,
  image_url TEXT,
  frame_url TEXT,
  traits JSONB,
  special_actions JSONB,
  tags JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  environment_id UUID,
  chapter_id UUID,
  base_monster_id UUID,
  map_location_id UUID,
  portrait_image_url TEXT,
  cover_image_url TEXT,
  portrait_crop JSONB,
  portrait_frame_asset_id UUID,
  portrait_frame_rotation_degrees REAL DEFAULT 0,
  portrait_rotation_degrees REAL DEFAULT 0,
  cover_image_scale REAL DEFAULT 1,
  cover_crop JSONB,
  cover_rotation_degrees REAL DEFAULT 0,
  frame_rotation REAL DEFAULT 0,
  frame_rotation_degrees REAL DEFAULT 0,
  cover_frame_asset_id UUID,
  caselle_frischezza_cruciali JSONB,
  attacco INTEGER,
  difesa INTEGER,
  trait_ids JSONB,
  custom_traits JSONB,
  special_action_ids JSONB,
  custom_special_actions JSONB,
  punto_debole TEXT,
  is_custom BOOLEAN DEFAULT FALSE,
  audacia INTEGER,
  caselle_freschezza_critiche JSONB,
  portrait_frame_offset_x REAL DEFAULT 0,
  portrait_frame_offset_y REAL DEFAULT 0,
  portrait_frame_scale_x REAL DEFAULT 1,
  portrait_frame_scale_y REAL DEFAULT 1,
  cover_frame_offset_x REAL DEFAULT 0,
  cover_frame_offset_y REAL DEFAULT 0,
  cover_frame_scale_x REAL DEFAULT 1,
  cover_frame_scale_y REAL DEFAULT 1,
  tiro_follia TEXT,
  visible_to_players BOOLEAN DEFAULT FALSE,
  tab_order JSONB,
  owner_profile_id TEXT,
  ruleset TEXT,
  token_color TEXT,
  token_background_color TEXT,
  token_border_style TEXT,
  token_border_thickness REAL,
  token_border_label TEXT,
  token_border_visible BOOLEAN DEFAULT TRUE,
  portrait_source_image_url TEXT,
  portrait_crop_area JSONB,
  portrait_asset_id UUID,
  folder_id UUID,
  scene_id UUID
);

-- clues
CREATE TABLE IF NOT EXISTS clues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  chapter_id UUID,
  title TEXT,
  description TEXT,
  revelation TEXT,
  discovered BOOLEAN DEFAULT FALSE,
  discovery_date TIMESTAMPTZ,
  discovered_by TEXT,
  tags JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  environment_id UUID,
  location TEXT,
  connected_to JSONB,
  scene_id UUID
);

-- situations
CREATE TABLE IF NOT EXISTS situations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  trigger_condition TEXT,
  consequences TEXT,
  status TEXT DEFAULT 'pending',
  tags JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  chapter_id UUID,
  environment_id UUID,
  trigger TEXT,
  consequences_array JSONB,
  choices JSONB,
  scene_id UUID
);

-- chat_messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  sender_id TEXT,
  sender_name TEXT,
  sender_avatar_url TEXT,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  kind TEXT DEFAULT 'message',
  payload JSONB,
  reactions JSONB
);

-- equipment_catalog
CREATE TABLE IF NOT EXISTS equipment_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT,
  type TEXT,
  description TEXT,
  is_vehicle BOOLEAN DEFAULT FALSE,
  tags JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  source TEXT,
  rarity TEXT,
  is_clue BOOLEAN DEFAULT FALSE,
  is_story_item BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  is_public BOOLEAN DEFAULT FALSE,
  image_asset_id UUID,
  icon_id TEXT,
  icon_color TEXT,
  linked_environment_ids JSONB,
  linked_npc_ids JSONB,
  linked_monster_ids JSONB,
  container_item_id UUID
);

-- visual_assets
CREATE TABLE IF NOT EXISTS visual_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT,
  type TEXT,
  url TEXT,
  thumbnail_url TEXT,
  description TEXT,
  tags JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  image_data_url TEXT
);

-- folders
CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  entity_type TEXT,
  name TEXT,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  parent_folder_id UUID,
  icon TEXT,
  deleted_at TIMESTAMPTZ
);

-- entity_notes
CREATE TABLE IF NOT EXISTS entity_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  entity_type TEXT,
  entity_id UUID,
  tab_name TEXT,
  content TEXT,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  hidden BOOLEAN DEFAULT FALSE,
  folder_id UUID,
  tab_order JSONB,
  deleted_at TIMESTAMPTZ,
  owner_profile_id TEXT,
  visibility TEXT DEFAULT 'private',
  content_rich JSONB,
  title_icon TEXT
);

-- dice_formulas
CREATE TABLE IF NOT EXISTS dice_formulas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID,
  name TEXT,
  formula TEXT,
  description TEXT,
  folder_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaigns_owner ON campaigns(owner_profile_id);
CREATE INDEX IF NOT EXISTS idx_characters_campaign ON characters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_npcs_campaign ON npcs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_monsters_campaign ON monsters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_chapters_campaign ON chapters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_scenes_chapter ON scenes(chapter_id);
CREATE INDEX IF NOT EXISTS idx_clues_campaign ON clues(campaign_id);
CREATE INDEX IF NOT EXISTS idx_situations_campaign ON situations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_campaign ON chat_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_entity_notes_entity ON entity_notes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_environments_campaign ON environments(campaign_id);

-- Done
SELECT 'Schema created successfully' AS status;
