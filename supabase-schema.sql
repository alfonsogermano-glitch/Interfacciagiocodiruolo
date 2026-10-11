-- =====================================================
-- HIGH SCHOOL CTHULHU - Schema Database Supabase
-- =====================================================

-- Abilita l'estensione UUID se non già abilitata
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABELLA: campaigns
-- =====================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  drama INTEGER DEFAULT 1 CHECK (drama >= 1 AND drama <= 12),
  owner_profile_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TABELLA: characters (Personaggi Giocanti)
-- =====================================================
CREATE TABLE IF NOT EXISTS characters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  owner_profile_id TEXT NOT NULL,

  name TEXT NOT NULL,
  style TEXT,
  viaggio TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),

  portrait_url TEXT,
  background_url TEXT,

  -- Tutti i dati della scheda personaggio in formato JSONB
  sheet_data JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TABELLA: equipment_catalog (Catalogo Equipaggiamento)
-- =====================================================
CREATE TABLE IF NOT EXISTS equipment_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('tascabile', 'trasportabile', 'risorsa', 'arma')),
  description TEXT DEFAULT '',
  is_vehicle BOOLEAN DEFAULT false,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(campaign_id, name)
);

-- =====================================================
-- TABELLA: character_equipment (Equipaggiamento Personaggi)
-- =====================================================
CREATE TABLE IF NOT EXISTS character_equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
  catalog_item_id UUID REFERENCES equipment_catalog(id) ON DELETE SET NULL,

  source TEXT DEFAULT 'catalog' CHECK (source IN ('catalog', 'custom')),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT DEFAULT '',
  location TEXT NOT NULL CHECK (location IN ('in_tasca', 'nel_zaino', 'a_casa')),
  inseparabile BOOLEAN DEFAULT false,
  is_vehicle BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TABELLA: npcs (Personaggi Non Giocanti)
-- =====================================================
CREATE TABLE IF NOT EXISTS npcs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  role TEXT,
  description TEXT,
  notes TEXT,
  image_url TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TABELLA: monsters (Mostri/Creature)
-- =====================================================
CREATE TABLE IF NOT EXISTS monsters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  base_type TEXT,
  size TEXT,
  threat_level INTEGER,

  -- Stats
  freschezza INTEGER,
  max_freschezza INTEGER,
  stress INTEGER DEFAULT 0,
  stress_threshold INTEGER DEFAULT 3,

  -- Descrizione e immagini
  description TEXT,
  image_url TEXT,
  frame_url TEXT,

  -- Tratti e abilità speciali (JSONB)
  traits JSONB DEFAULT '[]'::jsonb,
  special_actions JSONB DEFAULT '[]'::jsonb,

  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TABELLA: chapters (Capitoli/Scenari)
-- =====================================================
CREATE TABLE IF NOT EXISTS chapters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,
  synopsis TEXT,
  kind TEXT NOT NULL DEFAULT 'standard' CHECK (kind IN ('intro', 'standard', 'final')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  next_chapter_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  map_url TEXT,
  map_metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(map_metadata) = 'object'),
  location_metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(location_metadata) = 'object'),
  source_environment JSONB CHECK (source_environment IS NULL OR jsonb_typeof(source_environment) = 'object'),

  -- Dati strutturati (JSONB)
  npcs JSONB DEFAULT '[]'::jsonb,
  clues JSONB DEFAULT '[]'::jsonb,

  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TABELLA: environments (Ambienti/Location)
-- =====================================================
CREATE TABLE IF NOT EXISTS environments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  atmosphere TEXT,
  image_url TEXT,
  map_url TEXT,

  -- Dettagli ambientali (JSONB)
  features JSONB DEFAULT '[]'::jsonb,
  hazards JSONB DEFAULT '[]'::jsonb,

  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TABELLA: scenes (Scene narrative private del GM)
-- =====================================================
CREATE UNIQUE INDEX IF NOT EXISTS chapters_campaign_id_id_uidx ON chapters(campaign_id, id);

CREATE TABLE IF NOT EXISTS scenes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL,
  environment_id UUID REFERENCES environments(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'completed')),
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  next_scene_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  map_regions JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (
    jsonb_typeof(map_regions) = 'array'
    AND NOT jsonb_path_exists(map_regions, '$[*] ? (@.type() != "object")')
  ),
  context_metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(context_metadata) = 'object'),
  source_environment JSONB CHECK (source_environment IS NULL OR jsonb_typeof(source_environment) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT scenes_chapter_campaign_fkey FOREIGN KEY (campaign_id, chapter_id)
    REFERENCES chapters(campaign_id, id) ON DELETE CASCADE,
  CONSTRAINT scenes_no_self_next CHECK (NOT (id = ANY(next_scene_ids)))
);

CREATE TABLE IF NOT EXISTS environment_narrative_mapping (
  environment_id UUID PRIMARY KEY,
  root_environment_id UUID NOT NULL,
  chapter_id UUID NOT NULL,
  scene_id UUID,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('chapter', 'scene')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (target_kind = 'chapter' AND scene_id IS NULL AND environment_id = root_environment_id)
    OR (target_kind = 'scene' AND scene_id IS NOT NULL AND environment_id <> root_environment_id)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS environment_narrative_mapping_scene_uidx
  ON environment_narrative_mapping(scene_id) WHERE scene_id IS NOT NULL;
ALTER TABLE environment_narrative_mapping ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- TABELLA: clues (Indizi)
-- =====================================================
CREATE TABLE IF NOT EXISTS clues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  description TEXT,
  revelation TEXT,

  discovered BOOLEAN DEFAULT false,
  discovery_date TIMESTAMPTZ,
  discovered_by TEXT,

  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TABELLA: situations (Situazioni/Eventi)
-- =====================================================
CREATE TABLE IF NOT EXISTS situations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,
  trigger_condition TEXT,
  consequences TEXT,

  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'resolved', 'failed')),

  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE npcs ADD COLUMN IF NOT EXISTS scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL;
ALTER TABLE monsters ADD COLUMN IF NOT EXISTS scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL;
ALTER TABLE clues ADD COLUMN IF NOT EXISTS scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL;
ALTER TABLE situations ADD COLUMN IF NOT EXISTS scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL;

-- =====================================================
-- TABELLA: visual_assets (Asset Visuali)
-- =====================================================
CREATE TABLE IF NOT EXISTS visual_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('handout', 'map', 'portrait', 'scene', 'other')),
  url TEXT NOT NULL,
  thumbnail_url TEXT,

  description TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDICI per Performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_characters_campaign ON characters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_characters_status ON characters(status);
CREATE INDEX IF NOT EXISTS idx_equipment_catalog_campaign ON equipment_catalog(campaign_id);
CREATE INDEX IF NOT EXISTS idx_character_equipment_character ON character_equipment(character_id);
CREATE INDEX IF NOT EXISTS idx_character_equipment_catalog ON character_equipment(catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_npcs_campaign ON npcs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_npcs_scene ON npcs(scene_id);
CREATE INDEX IF NOT EXISTS idx_monsters_campaign ON monsters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_monsters_scene ON monsters(scene_id);
CREATE INDEX IF NOT EXISTS idx_chapters_campaign ON chapters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_environments_campaign ON environments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_clues_campaign ON clues(campaign_id);
CREATE INDEX IF NOT EXISTS idx_clues_chapter ON clues(chapter_id);
CREATE INDEX IF NOT EXISTS idx_clues_scene ON clues(scene_id);
CREATE INDEX IF NOT EXISTS idx_situations_campaign ON situations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_situations_scene ON situations(scene_id);
CREATE INDEX IF NOT EXISTS idx_visual_assets_campaign ON visual_assets(campaign_id);

-- =====================================================
-- TRIGGER per aggiornare updated_at automaticamente
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Applica il trigger a tutte le tabelle
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_characters_updated_at BEFORE UPDATE ON characters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_equipment_catalog_updated_at BEFORE UPDATE ON equipment_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_character_equipment_updated_at BEFORE UPDATE ON character_equipment
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TRIGGER per bloccare Stile/Viaggio/Tratti ("Origini") quando il
-- personaggio e' gia' assegnato a una campagna. Legame/Tutore/Tipo
-- Speciale vivono ora nella tab "Storia" (sempre editabile, non toccata
-- da questo trigger) - vedi EntityDetailView.tsx. Il client disabilita
-- gia' la tab Origini (fieldset disabled quando campaign_id e'
-- valorizzato); questo trigger e' la garanzia lato DB, dato che
-- saveCharacter() scrive via client Supabase direttamente, senza un
-- endpoint server intermedio da cui far passare un controllo applicativo.
-- Confronta OLD vs NEW campo per campo (non l'intero sheet_data, che
-- contiene anche campi sempre scrivibili in sessione come
-- condizioni/follia/freschezza/equipaggiamento/legame/tutore/tipoSpeciale/notes).
-- =====================================================
CREATE OR REPLACE FUNCTION lock_characters_origins_in_campaign()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.campaign_id IS NOT NULL THEN
    IF NEW.style IS DISTINCT FROM OLD.style
       OR NEW.viaggio IS DISTINCT FROM OLD.viaggio
       OR NEW.sheet_data->'tratti' IS DISTINCT FROM OLD.sheet_data->'tratti'
    THEN
      RAISE EXCEPTION 'ORIGINI_LOCKED: impossibile modificare Stile, Viaggio o Tratti: il personaggio è già assegnato a una campagna.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER characters_lock_origins_in_campaign
  BEFORE UPDATE ON characters
  FOR EACH ROW EXECUTE FUNCTION lock_characters_origins_in_campaign();

CREATE TRIGGER update_npcs_updated_at BEFORE UPDATE ON npcs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_monsters_updated_at BEFORE UPDATE ON monsters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chapters_updated_at BEFORE UPDATE ON chapters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_environments_updated_at BEFORE UPDATE ON environments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clues_updated_at BEFORE UPDATE ON clues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_situations_updated_at BEFORE UPDATE ON situations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_visual_assets_updated_at BEFORE UPDATE ON visual_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- RLS (Row Level Security) - Da configurare tramite Supabase UI
-- =====================================================
-- NOTA: Le policy RLS vanno configurate tramite l'interfaccia Supabase
-- per gestire i permessi di accesso ai dati per campagna
-- Active Scene publication: campaign_documents remains owner-writable, while
-- campaign members may read only the sanitized live snapshot.
drop policy if exists campaign_documents_active_scene_member_read on public.campaign_documents;
create policy campaign_documents_active_scene_member_read on public.campaign_documents
  for select to authenticated using (
    document_key = 'active-scene'
    and exists (
      select 1 from public.campaign_members member
      where member.campaign_id = campaign_documents.campaign_id
        and member.profile_id::text = (select auth.uid())::text
    )
  );
