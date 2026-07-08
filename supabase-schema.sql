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
-- TABELLA: adventures (Avventure/Scenari)
-- =====================================================
CREATE TABLE IF NOT EXISTS adventures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,
  synopsis TEXT,

  -- Dati strutturati (JSONB)
  scenes JSONB DEFAULT '[]'::jsonb,
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
-- TABELLA: clues (Indizi)
-- =====================================================
CREATE TABLE IF NOT EXISTS clues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  adventure_id UUID REFERENCES adventures(id) ON DELETE SET NULL,

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
CREATE INDEX IF NOT EXISTS idx_monsters_campaign ON monsters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_adventures_campaign ON adventures(campaign_id);
CREATE INDEX IF NOT EXISTS idx_environments_campaign ON environments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_clues_campaign ON clues(campaign_id);
CREATE INDEX IF NOT EXISTS idx_clues_adventure ON clues(adventure_id);
CREATE INDEX IF NOT EXISTS idx_situations_campaign ON situations(campaign_id);
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
-- TRIGGER per bloccare Stile/Viaggio/Legame/Tutore/Tipo Speciale/Tratti
-- ("Origini") quando il personaggio e' gia' assegnato a una campagna.
-- Il client disabilita gia' la tab (fieldset disabled in
-- EntityDetailView.tsx quando campaign_id e' valorizzato); questo trigger
-- e' la garanzia lato DB, dato che saveCharacter() scrive via client
-- Supabase direttamente, senza un endpoint server intermedio da cui far
-- passare un controllo applicativo. Confronta OLD vs NEW campo per campo
-- (non l'intero sheet_data, che contiene anche campi sempre scrivibili in
-- sessione come condizioni/follia/freschezza/equipaggiamento).
-- =====================================================
CREATE OR REPLACE FUNCTION lock_characters_origins_in_campaign()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.campaign_id IS NOT NULL THEN
    IF NEW.style IS DISTINCT FROM OLD.style
       OR NEW.viaggio IS DISTINCT FROM OLD.viaggio
       OR NEW.sheet_data->'legame' IS DISTINCT FROM OLD.sheet_data->'legame'
       OR NEW.sheet_data->'linkedCharacterId' IS DISTINCT FROM OLD.sheet_data->'linkedCharacterId'
       OR NEW.sheet_data->'legameDescription' IS DISTINCT FROM OLD.sheet_data->'legameDescription'
       OR NEW.sheet_data->'tutore' IS DISTINCT FROM OLD.sheet_data->'tutore'
       OR NEW.sheet_data->'tipoSpeciale' IS DISTINCT FROM OLD.sheet_data->'tipoSpeciale'
       OR NEW.sheet_data->'tratti' IS DISTINCT FROM OLD.sheet_data->'tratti'
    THEN
      RAISE EXCEPTION 'ORIGINI_LOCKED: impossibile modificare Stile, Viaggio, Legame, Tutore, Tipo Speciale o Tratti: il personaggio è già assegnato a una campagna.';
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

CREATE TRIGGER update_adventures_updated_at BEFORE UPDATE ON adventures
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
