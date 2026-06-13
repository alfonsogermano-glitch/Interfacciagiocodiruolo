-- =====================================================
-- MIGRAZIONE COMPLETA SCHEMA SUPABASE
-- Aggiunge tutti i campi mancanti alle tabelle esistenti
-- =====================================================

-- =====================================================
-- ENVIRONMENTS: Aggiunta campi gerarchici e strutturali
-- =====================================================
ALTER TABLE environments
  ADD COLUMN IF NOT EXISTS adventure_id UUID REFERENCES adventures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_location_id UUID REFERENCES environments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS map_location_id TEXT,
  ADD COLUMN IF NOT EXISTS location_type TEXT CHECK (location_type IN ('area', 'building', 'room', 'poi', 'other')),
  ADD COLUMN IF NOT EXISTS icon_id TEXT,
  ADD COLUMN IF NOT EXISTS exit_points TEXT,
  ADD COLUMN IF NOT EXISTS hidden_details TEXT,
  ADD COLUMN IF NOT EXISTS npcs_present JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- =====================================================
-- NPCS: Aggiunta campi completi per personaggi
-- =====================================================
ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS environment_id UUID REFERENCES environments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS adventure_id UUID REFERENCES adventures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS personality TEXT,
  ADD COLUMN IF NOT EXISTS secrets TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS portrait_image_url TEXT,
  ADD COLUMN IF NOT EXISTS portrait_cropped_image_url TEXT,
  ADD COLUMN IF NOT EXISTS portrait_crop JSONB,
  ADD COLUMN IF NOT EXISTS map_location_id TEXT,
  ADD COLUMN IF NOT EXISTS custom_location_name TEXT,
  ADD COLUMN IF NOT EXISTS freschezza INTEGER,
  ADD COLUMN IF NOT EXISTS max_freschezza INTEGER,
  ADD COLUMN IF NOT EXISTS caselle_frischezza_cruciali JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attacco TEXT,
  ADD COLUMN IF NOT EXISTS difesa TEXT,
  ADD COLUMN IF NOT EXISTS tratti JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tratti_personalizzati JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS azioni_speciali JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS azioni_speciali_personalizzate JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS punto_debole TEXT;

-- =====================================================
-- MONSTERS: Aggiunta campi completi per mostri
-- =====================================================
ALTER TABLE monsters
  ADD COLUMN IF NOT EXISTS environment_id UUID REFERENCES environments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS adventure_id UUID REFERENCES adventures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS base_monster_id TEXT,
  ADD COLUMN IF NOT EXISTS map_location_id TEXT,
  ADD COLUMN IF NOT EXISTS custom_location_name TEXT,
  ADD COLUMN IF NOT EXISTS portrait_image_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS portrait_crop JSONB,
  ADD COLUMN IF NOT EXISTS portrait_frame_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS portrait_frame_rotation_degrees INTEGER,
  ADD COLUMN IF NOT EXISTS portrait_rotation_degrees INTEGER,
  ADD COLUMN IF NOT EXISTS cover_image_scale REAL,
  ADD COLUMN IF NOT EXISTS cover_crop JSONB,
  ADD COLUMN IF NOT EXISTS cover_rotation_degrees INTEGER,
  ADD COLUMN IF NOT EXISTS frame_rotation INTEGER CHECK (frame_rotation IN (0, 90)),
  ADD COLUMN IF NOT EXISTS frame_rotation_degrees INTEGER,
  ADD COLUMN IF NOT EXISTS cover_frame_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS caselle_frischezza_cruciali JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attacco TEXT,
  ADD COLUMN IF NOT EXISTS difesa TEXT,
  ADD COLUMN IF NOT EXISTS trait_ids JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_traits JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS special_action_ids JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_special_actions JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS punto_debole TEXT,
  ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT false;

-- =====================================================
-- CLUES: Aggiunta campi location e connessioni
-- =====================================================
ALTER TABLE clues
  ADD COLUMN IF NOT EXISTS environment_id UUID REFERENCES environments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS connected_to JSONB DEFAULT '[]'::jsonb;

-- =====================================================
-- SITUATIONS: Aggiunta campi e conversione consequences
-- =====================================================
ALTER TABLE situations
  ADD COLUMN IF NOT EXISTS adventure_id UUID REFERENCES adventures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS environment_id UUID REFERENCES environments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trigger TEXT,
  ADD COLUMN IF NOT EXISTS consequences_array JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS choices JSONB DEFAULT '[]'::jsonb;

-- Migra consequences da TEXT a JSONB se necessario
-- (Questo comando tenta di convertire, ma potrebbe richiedere una migrazione manuale dei dati esistenti)
UPDATE situations
SET consequences_array = CASE
  WHEN consequences IS NOT NULL AND consequences != ''
  THEN jsonb_build_array(consequences)
  ELSE '[]'::jsonb
END
WHERE consequences_array = '[]'::jsonb;

-- =====================================================
-- INDICI per performance
-- =====================================================

-- Environments
CREATE INDEX IF NOT EXISTS idx_environments_campaign ON environments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_environments_adventure ON environments(adventure_id);
CREATE INDEX IF NOT EXISTS idx_environments_parent ON environments(parent_location_id);

-- NPCs
CREATE INDEX IF NOT EXISTS idx_npcs_campaign ON npcs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_npcs_environment ON npcs(environment_id);
CREATE INDEX IF NOT EXISTS idx_npcs_adventure ON npcs(adventure_id);

-- Monsters
CREATE INDEX IF NOT EXISTS idx_monsters_campaign ON monsters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_monsters_environment ON monsters(environment_id);
CREATE INDEX IF NOT EXISTS idx_monsters_adventure ON monsters(adventure_id);

-- Clues
CREATE INDEX IF NOT EXISTS idx_clues_campaign ON clues(campaign_id);
CREATE INDEX IF NOT EXISTS idx_clues_environment ON clues(environment_id);
CREATE INDEX IF NOT EXISTS idx_clues_adventure ON clues(adventure_id);

-- Situations
CREATE INDEX IF NOT EXISTS idx_situations_campaign ON situations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_situations_environment ON situations(environment_id);
CREATE INDEX IF NOT EXISTS idx_situations_adventure ON situations(adventure_id);

-- =====================================================
-- COMMENTI
-- =====================================================
COMMENT ON COLUMN environments.parent_location_id IS 'Parent location per strutture gerarchiche (es. Bagno dentro Biblioteca)';
COMMENT ON COLUMN environments.location_type IS 'Tipo di location: area, building, room, poi, other';
COMMENT ON COLUMN npcs.portrait_crop IS 'JSON: {centerX, centerY, zoom}';
COMMENT ON COLUMN npcs.caselle_frischezza_cruciali IS 'Array di numeri rappresentanti le caselle critiche di freschezza';
COMMENT ON COLUMN monsters.portrait_crop IS 'JSON: {x, y, scale}';
COMMENT ON COLUMN monsters.custom_traits IS 'Array di {id, name, description}';
COMMENT ON COLUMN monsters.custom_special_actions IS 'Array di {id, name, description}';
COMMENT ON COLUMN clues.connected_to IS 'Array di ID di altri indizi collegati';
COMMENT ON COLUMN situations.choices IS 'Array di {text, outcome}';
