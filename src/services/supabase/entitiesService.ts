import { supabase } from '../../lib/supabaseClient';
import { readDashboardSettings } from '../settings/dashboardSettings';
import { isTauriRuntime } from '../runtime/runtimeEnvironment';
import {
  deleteTauriEntity,
  loadTauriEntities,
  saveTauriEntity
} from '../storage/tauriJsonEntityStorage';
import type { D20Stats } from '../../app/components/ruleset/D20StatBlock';
import { isRulesetCompatible, type RulesetId } from '../../app/campaigns/campaignTypes';
import type { TokenBorderStyle } from '../../types/tokenStyle';

/**
 * Servizio completo per gestire TUTTE le entità del gioco
 * con mapping bidirezionale tra formato frontend (camelCase) e database (snake_case)
 */

// ============= HELPER FUNCTIONS =============

// Campi che esistono solo nel frontend e NON devono essere salvati nel DB
const FRONTEND_ONLY_FIELDS = [
  'isDirty',          // Flag per tracciare modifiche locali
  'createdAt',        // Gestito da trigger DB
  'updatedAt',        // Gestito da trigger DB
  'isActive',         // Stato UI per avventura attiva, gestito da localStorage
  'kind',             // Tipo avventura (intro/standard/final), solo UI
  'nextAdventureIds'  // Collegamenti tra avventure, solo UI
];

type EntityCollection =
  | 'npcs'
  | 'monsters'
  | 'environments'
  | 'clues'
  | 'situations'
  | 'adventures';

function shouldUseLocalMode(): boolean {
  const settings = readDashboardSettings();
  return settings.saveMode === 'local' || !supabase;
}

function getLocalEntityKey(campaignId: string, collection: EntityCollection): string {
  return `hsc_local_entities:${campaignId}:${collection}`;
}

function loadLocalEntities<T>(campaignId: string, collection: EntityCollection): T[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(getLocalEntityKey(campaignId, collection));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function loadLocalModeEntities<T extends { id: string }>(
  campaignId: string,
  collection: EntityCollection
): Promise<T[]> {
  if (isTauriRuntime()) {
    return loadTauriEntities<T>(campaignId, collection);
  }

  return loadLocalEntities<T>(campaignId, collection);
}

async function saveLocalModeEntity<T extends { id: string }>(
  campaignId: string,
  collection: EntityCollection,
  entity: T
): Promise<void> {
  if (isTauriRuntime()) {
    await saveTauriEntity<T>(campaignId, collection, entity);
    return;
  }

  saveLocalEntity<T>(campaignId, collection, entity);
}

async function deleteLocalModeEntity(
  collection: EntityCollection,
  entityId: string
): Promise<void> {
  if (isTauriRuntime()) {
    await deleteTauriEntity(collection, entityId);
    return;
  }

  deleteLocalEntity(collection, entityId);
}

function saveLocalEntity<T extends { id: string }>(
  campaignId: string,
  collection: EntityCollection,
  entity: T
): void {
  if (typeof window === 'undefined') return;

  const entities = loadLocalEntities<T>(campaignId, collection);
  const index = entities.findIndex(item => item.id === entity.id);

  const nextEntities =
    index >= 0
      ? entities.map(item => item.id === entity.id ? entity : item)
      : [...entities, entity];

  window.localStorage.setItem(
    getLocalEntityKey(campaignId, collection),
    JSON.stringify(nextEntities)
  );
}

function deleteLocalEntity(collection: EntityCollection, entityId: string): void {
  if (typeof window === 'undefined') return;

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.includes(`:${collection}`)) continue;

    try {
      const raw = window.localStorage.getItem(key);
      const entities = raw ? JSON.parse(raw) : [];

      if (!Array.isArray(entities)) continue;

      const nextEntities = entities.filter((entity: { id?: string }) => entity.id !== entityId);

      window.localStorage.setItem(key, JSON.stringify(nextEntities));
    } catch {
      // Ignora chiavi locali non leggibili
    }
  }
}

// Campi che devono contenere UUID validi
const UUID_FIELDS = [
  'id',
  'campaignId',
  'adventureId',
  'environmentId',
  'parentLocationId',
  'characterId',
  'baseMonsterId'  // Può essere stringa catalogo, gestito separatamente
];

/**
 * Verifica se una stringa è un UUID valido
 */
function isValidUUID(str: string | null | undefined): boolean {
  if (!str || typeof str !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Sanitizza i campi UUID: se non sono UUID validi, li converte in null
 */
function sanitizeUUIDs(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeUUIDs);
  if (typeof obj !== 'object') return obj;

  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    // Se è un campo UUID e non è un UUID valido, converti in null
    if (UUID_FIELDS.includes(key) && key !== 'baseMonsterId') {
      if (typeof value === 'string' && !isValidUUID(value)) {
        // Log debug invece di warning (visibile solo se console debug abilitata)
        console.debug(`Campo ${key} contiene ID non-UUID: "${value}" → convertito in null`);
        sanitized[key] = null;
        continue;
      }
    }

    sanitized[key] = sanitizeUUIDs(value);
  }
  return sanitized;
}

function toSnakeCase(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (typeof obj !== 'object') return obj;

  const snakeCased: any = {};
  for (const [key, value] of Object.entries(obj)) {
    // Salta campi solo-frontend
    if (FRONTEND_ONLY_FIELDS.includes(key)) continue;

    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    snakeCased[snakeKey] = toSnakeCase(value);
  }
  return snakeCased;
}

function toCamelCase(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj !== 'object') return obj;

  const camelCased: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    camelCased[camelKey] = toCamelCase(value);
  }
  return camelCased;
}

export { toCamelCase };

// ============= NPC =============

export interface NPC {
  id: string;
  campaignId?: string | null;
  ruleset?: RulesetId | null;
  tokenColor?: string | null;
  tokenBackgroundColor?: string | null;
  tokenBorderStyle?: TokenBorderStyle | null;
  environmentId?: string | null;
  adventureId?: string | null;

  name: string;
  role: string;
  description: string;
  personality: string;
  secrets: string;
  location: string;

  portraitImageUrl?: string;
  portraitCroppedImageUrl?: string;
  portraitCrop?: {
    centerX: number;
    centerY: number;
    zoom: number;
  };

  mapLocationId?: string | null;
  customLocationName?: string;

  freschezza?: number | null;
  maxFreschezza?: number | null;
  caselleFrischezzaCruciali?: number[];

  attacco?: 'Base' | 'Critico' | 'Estremo' | 'Impossibile' | 'Non euclideo' | '';
  difesa?: 'Base' | 'Critico' | 'Estremo' | 'Impossibile' | 'Non euclideo' | '';

  tratti?: string[];
  trattiPersonalizzati?: string[];

  azioniSpeciali?: string[];
  azioniSpecialiPersonalizzate?: string[];

  puntoDebole?: string;
  d20Stats?: D20Stats;

  imageUrl?: string;
  tags?: string[];
  notes?: string;

  visibleToPlayers?: boolean;
  tabOrder?: string[];
  createdAt?: string;
  updatedAt?: string;
  ownerProfileId?: string;
}

export async function loadNPCs(campaignId: string): Promise<NPC[]> {
  if (shouldUseLocalMode()) {
  return loadLocalModeEntities<NPC>(campaignId, 'npcs');
  }

  if (!supabase) return [];

  const { data, error } = await supabase
    .from('npcs')
    .select('*')
    .eq('campaign_id', campaignId);

  if (error) {
    console.error('Errore caricamento NPC:', error);
    return loadLocalModeEntities<NPC>(campaignId, 'npcs');
  }

  return (data || []).map(toCamelCase);
}

export async function saveNPC(campaignId: string | null, npc: NPC): Promise<void> {
  if (shouldUseLocalMode()) {
  await saveLocalModeEntity<NPC>(campaignId ?? 'unassigned', 'npcs', { ...npc, campaignId });
    return;
  }

  if (!supabase) {
    saveLocalEntity<NPC>(campaignId ?? 'unassigned', 'npcs', { ...npc, campaignId });
    return;
  }

  const dbData = toSnakeCase(sanitizeUUIDs({
    ...npc,
    campaignId
  }));

  const { error } = await supabase
    .from('npcs')
    .upsert(dbData);

  if (error) {
    // Se fallisce per foreign key constraint (environment_id non esiste)
    // Ritenta salvando senza environment_id
    if (error.code === '23503' && error.message.includes('environment_id')) {
      console.warn('Environment non trovato nel DB, salvo NPC senza collegamento:', dbData.environment_id);

      const dataWithoutEnv = { ...dbData, environment_id: null, adventure_id: null };
      const { error: retryError } = await supabase
        .from('npcs')
        .upsert(dataWithoutEnv);

      if (retryError) {
        console.error('Errore salvataggio NPC (retry):', retryError, dataWithoutEnv);
        throw retryError;
      }

      console.info('NPC salvato senza collegamento a environment. Ricrea il luogo e riassegna il NPC.');
      return;
    }

    console.error('Errore salvataggio NPC:', error, dbData);
    throw error;
  }
}

export async function deleteNPC(npcId: string): Promise<void> {
  if (shouldUseLocalMode()) {
  await deleteLocalModeEntity('npcs', npcId);
    return;
  }

  if (!supabase) {
    deleteLocalEntity('npcs', npcId);
    return;
  }

  const { error } = await supabase
    .from('npcs')
    .delete()
    .eq('id', npcId);

  if (error) throw error;
}

export async function unassignNPCFromCampaign(npcId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase non configurato');

  const { error } = await supabase
    .from('npcs')
    .update({ campaign_id: null })
    .eq('id', npcId);

  if (error) throw error;
}

export async function assignNPCToCampaign(
  npcId: string,
  entityRuleset: RulesetId | null | undefined,
  targetCampaign: { id: string; ruleset: RulesetId }
): Promise<void> {
  if (!supabase) throw new Error('Supabase non configurato');
  if (!isRulesetCompatible(entityRuleset, null, targetCampaign.ruleset)) {
    throw new Error('Ruleset incompatibile con questa campagna');
  }

  // Se il PNG non aveva ancora un ruleset (dato storico), lo eredita ora
  // dalla campagna a cui viene assegnato invece di restare NULL.
  const { error } = await supabase
    .from('npcs')
    .update({ campaign_id: targetCampaign.id, ruleset: entityRuleset ?? targetCampaign.ruleset })
    .eq('id', npcId);

  if (error) throw error;
}

export async function loadNPCsByOwner(ownerProfileId: string): Promise<NPC[]> {
  if (shouldUseLocalMode()) return [];
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('npcs')
    .select('*')
    .eq('owner_profile_id', ownerProfileId);

  if (error) {
    console.error('Errore caricamento PNG per proprietario:', error);
    return [];
  }

  return (data || []).map(toCamelCase);
}

export async function copyNPCToCampaign(npcId: string, targetCampaignId: string, ownerProfileId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase non configurato');

  const { data: original, error: fetchError } = await supabase
    .from('npcs')
    .select('*')
    .eq('id', npcId)
    .single();

  if (fetchError || !original) throw fetchError ?? new Error('PNG non trovato');

  const { id, created_at, updated_at, owner_profile_id, ...rest } = original as any;
  const { error } = await supabase
    .from('npcs')
    .insert({ ...rest, campaign_id: targetCampaignId, owner_profile_id: ownerProfileId });

  if (error) throw error;
}

// ============= MOSTRI =============

export interface Monster {
  id: string;
  campaignId: string;
  ruleset?: RulesetId | null;
  tokenColor?: string | null;
  tokenBackgroundColor?: string | null;
  tokenBorderStyle?: TokenBorderStyle | null;
  baseMonsterId?: string | null;
  adventureId?: string | null;
  environmentId?: string | null;
  mapLocationId?: string | null;
  isDirty?: boolean;

  name: string;
  description: string;

  portraitImageUrl?: string;
  coverImageUrl?: string;

  portraitCrop?: {
    x: number;
    y: number;
    scale: number;
  };
  portraitFrameAssetId?: string | null;
  portraitFrameRotationDegrees?: number;
  portraitFrameOffsetX?: number;
  portraitFrameOffsetY?: number;
  portraitFrameScaleX?: number;
  portraitFrameScaleY?: number;
  portraitBorderColor?: string;
  portraitBorderVisible?: boolean;
  portraitBorderLabel?: string;
  portraitRotationDegrees?: number;

  coverImageScale?: number;
  coverCrop?: {
    x: number;
    y: number;
    scale: number;
  };
  coverRotationDegrees?: number;
  frameRotation?: 0 | 90;
  frameRotationDegrees?: number;
  coverFrameOffsetX?: number;
  coverFrameOffsetY?: number;
  coverFrameScaleX?: number;
  coverFrameScaleY?: number;
  coverFrameAssetId?: string | null;

  freschezza: number | null;
  maxFreschezza: number | null;
  audacia?: number;
  caselleFreschezzaCritiche?: number[];
  caselleFrischezzaCruciali: number[];

  attacco: 'Base' | 'Critico' | 'Estremo' | 'Impossibile' | 'Non euclideo' | '';
  difesa: 'Base' | 'Critico' | 'Estremo' | 'Impossibile' | 'Non euclideo' | '';
  tiroFollia?: 'Base' | 'Critico' | 'Estremo' | 'Impossibile' | 'Non euclideo' | '' | null;

  traitIds: string[];
  customTraits: Array<{
    id: string;
    name: string;
    description: string;
  }>;

  specialActionIds: string[];
  customSpecialActions: Array<{
    id: string;
    name: string;
    description: string;
  }>;

  puntoDebole: string;
  notes: string;
  isCustom: boolean;

  createdAt: string;
  updatedAt: string;

  visibleToPlayers?: boolean;
  tabOrder?: string[];
  ownerProfileId?: string;

  // Legacy fields from DB
  baseType?: string;
  size?: string;
  threatLevel?: number;
  stress?: number;
  stressThreshold?: number;
  imageUrl?: string;
  frameUrl?: string;
  traits?: any[];
  specialActions?: any[];
  tags?: string[];
}

export async function loadMonsters(campaignId: string): Promise<Monster[]> {
  if (shouldUseLocalMode()) {
  return loadLocalModeEntities<Monster>(campaignId, 'monsters');
}
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('monsters')
    .select('*')
    .eq('campaign_id', campaignId);

  if (error) {
    console.error('Errore caricamento mostri:', error);
    return [];
  }

  return (data || []).map(toCamelCase);
}

function normalizeMonsterForSave(monster: Monster): Monster {
  const criticalBoxes =
    monster.caselleFreschezzaCritiche ??
    monster.caselleFrischezzaCruciali ??
    [];

  return {
    ...monster,
    audacia: Math.max(0, monster.audacia ?? 0),
    caselleFreschezzaCritiche: criticalBoxes,
    caselleFrischezzaCruciali: criticalBoxes
  };
}

function stripMonsterRemovedColumns(dbData: any): any {
  const {
    custom_location_name,
    ...rest
  } = dbData;

  return rest;
}

function stripMonsterNewColumns(dbData: any): any {
  const {
    audacia,
    caselle_freschezza_critiche,
    custom_location_name,
    tiro_follia,
    portrait_frame_offset_x,
    portrait_frame_offset_y,
    portrait_frame_scale_x,
    portrait_frame_scale_y,
    portrait_border_color,
    portrait_border_visible,
    portrait_border_label,
    cover_frame_offset_x,
    cover_frame_offset_y,
    cover_frame_scale_x,
    cover_frame_scale_y,
    ...rest
  } = dbData;

  return rest;
}

export async function saveMonster(campaignId: string, monster: Monster): Promise<void> {
  const normalizedMonster = normalizeMonsterForSave({
    ...monster,
    campaignId
  });

  if (shouldUseLocalMode()) {
    await saveLocalModeEntity<Monster>(campaignId, 'monsters', normalizedMonster);
    return;
  }

  if (!supabase) {
    saveLocalEntity<Monster>(campaignId, 'monsters', normalizedMonster);
    return;
  }

  const dbData = stripMonsterRemovedColumns(toSnakeCase(sanitizeUUIDs(normalizedMonster)));

  const { error } = await supabase
    .from('monsters')
    .upsert(dbData);

  if (error) {
    // Se le colonne nuove non sono ancora state create in Supabase,
    // salva comunque il mostro senza bloccare tutta la dashboard.
    // Attenzione: Audacia/Caselle Critiche saranno persistenti solo dopo la SQL.
    if (
      error.code === 'PGRST204' &&
      (error.message.includes("'audacia'") ||
        error.message.includes("'caselle_freschezza_critiche'") ||
        error.message.includes("'tiro_follia'") ||
        error.message.includes("'portrait_frame_offset_x'") ||
        error.message.includes("'portrait_frame_offset_y'") ||
        error.message.includes("'portrait_frame_scale_x'") ||
        error.message.includes("'portrait_frame_scale_y'") ||
        error.message.includes("'portrait_border_color'") ||
        error.message.includes("'portrait_border_visible'") ||
        error.message.includes("'portrait_border_label'") ||
        error.message.includes("'cover_frame_offset_x'") ||
        error.message.includes("'cover_frame_offset_y'") ||
        error.message.includes("'cover_frame_scale_x'") ||
        error.message.includes("'cover_frame_scale_y'"))
    ) {
      console.warn(
        'Colonne nuove mostro non trovate in Supabase. Salvo temporaneamente il mostro senza i nuovi campi. Esegui la migrazione SQL per rendere persistenti Audacia/Caselle Critiche/Tiro Follia/trasformazioni cornici.',
        error
      );

      const fallbackData = stripMonsterNewColumns(dbData);
      const { error: retryError } = await supabase
        .from('monsters')
        .upsert(fallbackData);

      if (retryError) {
        console.error('Errore salvataggio mostro senza campi nuovi:', retryError, fallbackData);
        throw retryError;
      }

      return;
    }

    // Se fallisce per foreign key constraint (environment_id non esiste)
    // Ritenta salvando senza environment_id
    if (error.code === '23503' && error.message.includes('environment_id')) {
      console.warn('Environment non trovato nel DB, salvo mostro senza collegamento:', dbData.environment_id);

      const dataWithoutEnv = { ...dbData, environment_id: null, adventure_id: null };
      const { error: retryError } = await supabase
        .from('monsters')
        .upsert(dataWithoutEnv);

      if (retryError) {
        console.error('Errore salvataggio mostro (retry):', retryError, dataWithoutEnv);
        throw retryError;
      }

      console.info('Mostro salvato senza collegamento a environment. Ricrea il luogo e riassegna il mostro.');
      return;
    }

    console.error('Errore salvataggio mostro:', error, dbData);
    throw error;
  }
}

export async function deleteMonster(monsterId: string): Promise<void> {
  if (shouldUseLocalMode()) {
  await deleteLocalModeEntity('monsters', monsterId);
  return;
}

  const { error } = await supabase
    .from('monsters')
    .delete()
    .eq('id', monsterId);

  if (error) throw error;
}

export async function unassignMonsterFromCampaign(monsterId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase non configurato');

  const { error } = await supabase
    .from('monsters')
    .update({ campaign_id: null })
    .eq('id', monsterId);

  if (error) throw error;
}

export async function assignMonsterToCampaign(
  monsterId: string,
  entityRuleset: RulesetId | null | undefined,
  targetCampaign: { id: string; ruleset: RulesetId }
): Promise<void> {
  if (!supabase) throw new Error('Supabase non configurato');
  if (!isRulesetCompatible(entityRuleset, null, targetCampaign.ruleset)) {
    throw new Error('Ruleset incompatibile con questa campagna');
  }

  // Se il mostro non aveva ancora un ruleset (dato storico), lo eredita ora
  // dalla campagna a cui viene assegnato invece di restare NULL.
  const { error } = await supabase
    .from('monsters')
    .update({ campaign_id: targetCampaign.id, ruleset: entityRuleset ?? targetCampaign.ruleset })
    .eq('id', monsterId);

  if (error) throw error;
}

export async function loadMonstersByOwner(ownerProfileId: string): Promise<Monster[]> {
  if (shouldUseLocalMode()) return [];
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('monsters')
    .select('*')
    .eq('owner_profile_id', ownerProfileId);

  if (error) {
    console.error('Errore caricamento mostri per proprietario:', error);
    return [];
  }

  return (data || []).map(toCamelCase);
}

export async function copyMonsterToCampaign(monsterId: string, targetCampaignId: string, ownerProfileId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase non configurato');

  const { data: original, error: fetchError } = await supabase
    .from('monsters')
    .select('*')
    .eq('id', monsterId)
    .single();

  if (fetchError || !original) throw fetchError ?? new Error('Mostro non trovato');

  const { id, created_at, updated_at, owner_profile_id, ...rest } = original as any;
  const { error } = await supabase
    .from('monsters')
    .insert({ ...rest, campaign_id: targetCampaignId, owner_profile_id: ownerProfileId });

  if (error) throw error;
}

// ============= AMBIENTI =============

export interface Environment {
  id: string;
  campaignId: string;
  adventureId?: string | null;
  parentLocationId?: string | null;
  mapLocationId?: string | null;
  locationType?: 'area' | 'building' | 'room' | 'poi' | 'other';
  name: string;
  description: string;
  iconId?: string | null;
  atmosphere: string;
  exitPoints: string;
  hiddenDetails: string;
  npcsPresent: string[];
  sortOrder?: number;

  // Legacy fields from DB
  imageUrl?: string;
  mapUrl?: string;
  features?: any[];
  hazards?: any[];
  tags?: string[];
  notes?: string;
}

export async function loadEnvironments(campaignId: string): Promise<Environment[]> {
  if (shouldUseLocalMode()) {
  return loadLocalModeEntities<Environment>(campaignId, 'environments');
}
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('environments')
    .select('*')
    .eq('campaign_id', campaignId);

  if (error) {
    console.error('Errore caricamento ambienti:', error);
    return [];
  }

  return (data || []).map(toCamelCase);
}

export async function saveEnvironment(campaignId: string, environment: Environment): Promise<void> {
  if (shouldUseLocalMode()) {
  await saveLocalModeEntity<Environment>(campaignId, 'environments', { ...environment, campaignId });
  return;
}

  const dbData = toSnakeCase(sanitizeUUIDs({
    ...environment,
    campaignId
  }));

  const { error } = await supabase
    .from('environments')
    .upsert(dbData);

  if (error) {
    // Se fallisce per foreign key constraint
    if (error.code === '23503') {
      // Controlla quale foreign key sta fallendo
      if (error.message.includes('adventure_id')) {
        console.warn('Adventure non trovata nel DB, salvo environment senza adventure:', dbData.adventure_id);

        const dataWithoutAdventure = { ...dbData, adventure_id: null };
        const { error: retryError } = await supabase
          .from('environments')
          .upsert(dataWithoutAdventure);

        if (retryError) {
          console.error('Errore salvataggio ambiente (retry):', retryError, dataWithoutAdventure);
          throw retryError;
        }

        console.info('Environment salvato senza adventure. Crea prima l\'avventura e poi riassegna l\'ambiente.');
        return;
      }

      if (error.message.includes('parent_location_id')) {
        console.warn('Parent location non trovato nel DB, salvo environment senza parent:', dbData.parent_location_id);

        const dataWithoutParent = { ...dbData, parent_location_id: null };
        const { error: retryError } = await supabase
          .from('environments')
          .upsert(dataWithoutParent);

        if (retryError) {
          console.error('Errore salvataggio ambiente (retry):', retryError, dataWithoutParent);
          throw retryError;
        }

        console.info('Environment salvato senza parent location. Ricrea prima il luogo padre e poi riassegna.');
        return;
      }
    }

    console.error('Errore salvataggio ambiente:', error, dbData);
    throw error;
  }
}

export async function deleteEnvironment(environmentId: string): Promise<void> {
  if (shouldUseLocalMode()) {
  await deleteLocalModeEntity('environments', environmentId);
  return;
}

  const { error } = await supabase
    .from('environments')
    .delete()
    .eq('id', environmentId);

  if (error) throw error;
}

// ============= INDIZI =============

export interface Clue {
  id: string;
  campaignId: string;
  adventureId?: string | null;
  environmentId?: string | null;
  title: string;
  description: string;
  location: string;
  discovered: boolean;
  connectedTo: string[];

  // Legacy fields from DB
  revelation?: string;
  discoveryDate?: string;
  discoveredBy?: string;
  tags?: string[];
}

export async function loadClues(campaignId: string): Promise<Clue[]> {
  if (shouldUseLocalMode()) {
  return loadLocalModeEntities<Clue>(campaignId, 'clues');
}
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('clues')
    .select('*')
    .eq('campaign_id', campaignId);

  if (error) {
    console.error('Errore caricamento indizi:', error);
    return [];
  }

  return (data || []).map(toCamelCase);
}

export async function saveClue(campaignId: string, clue: Clue): Promise<void> {
  if (shouldUseLocalMode()) {
  await saveLocalModeEntity<Clue>(campaignId, 'clues', { ...clue, campaignId });
  return;
}

  const dbData = toSnakeCase(sanitizeUUIDs({
    ...clue,
    campaignId
  }));

  const { error } = await supabase
    .from('clues')
    .upsert(dbData);

  if (error) {
    // Se fallisce per foreign key constraint (environment_id non esiste)
    // Ritenta salvando senza environment_id
    if (error.code === '23503' && error.message.includes('environment_id')) {
      console.warn('Environment non trovato nel DB, salvo indizio senza collegamento:', dbData.environment_id);

      const dataWithoutEnv = { ...dbData, environment_id: null, adventure_id: null };
      const { error: retryError } = await supabase
        .from('clues')
        .upsert(dataWithoutEnv);

      if (retryError) {
        console.error('Errore salvataggio indizio (retry):', retryError, dataWithoutEnv);
        throw retryError;
      }

      console.info('Indizio salvato senza collegamento a environment. Ricrea il luogo e riassegna l\'indizio.');
      return;
    }

    console.error('Errore salvataggio indizio:', error, dbData);
    throw error;
  }
}

export async function deleteClue(clueId: string): Promise<void> {
  if (shouldUseLocalMode()) {
  await deleteLocalModeEntity('clues', clueId);
    return;
  }

  const { error } = await supabase
    .from('clues')
    .delete()
    .eq('id', clueId);

  if (error) throw error;
}

// ============= SITUAZIONI =============

export interface Situation {
  id: string;
  campaignId: string;
  adventureId?: string | null;
  environmentId?: string | null;
  title: string;
  trigger: string;
  description: string;
  consequences: string[];
  choices: Array<{ text: string; outcome: string }>;

  // Legacy fields from DB
  triggerCondition?: string;
  status?: 'pending' | 'active' | 'resolved' | 'failed';
  tags?: string[];
  notes?: string;
}

export async function loadSituations(campaignId: string): Promise<Situation[]> {
  if (shouldUseLocalMode()) {
  return loadLocalModeEntities<Situation>(campaignId, 'situations');
}
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('situations')
    .select('*')
    .eq('campaign_id', campaignId);

  if (error) {
    console.error('Errore caricamento situazioni:', error);
    return [];
  }

  return (data || []).map(row => {
    const camel = toCamelCase(row);
    // Handle consequences_array -> consequences conversion
    if (camel.consequencesArray && !camel.consequences) {
      camel.consequences = camel.consequencesArray;
    }
    return camel;
  });
}

export async function saveSituation(campaignId: string, situation: Situation): Promise<void> {
  if (shouldUseLocalMode()) {
  await saveLocalModeEntity<Situation>(campaignId, 'situations', { ...situation, campaignId });
  return;
}

  const dbData = toSnakeCase(sanitizeUUIDs({
    ...situation,
    campaignId,
    // Map consequences to consequences_array for DB
    consequencesArray: situation.consequences
  }));

  const { error } = await supabase
    .from('situations')
    .upsert(dbData);

  if (error) {
    // Se fallisce per foreign key constraint (environment_id non esiste)
    // Ritenta salvando senza environment_id
    if (error.code === '23503' && error.message.includes('environment_id')) {
      console.warn('Environment non trovato nel DB, salvo situazione senza collegamento:', dbData.environment_id);

      const dataWithoutEnv = { ...dbData, environment_id: null, adventure_id: null };
      const { error: retryError } = await supabase
        .from('situations')
        .upsert(dataWithoutEnv);

      if (retryError) {
        console.error('Errore salvataggio situazione (retry):', retryError, dataWithoutEnv);
        throw retryError;
      }

      console.info('Situazione salvata senza collegamento a environment. Ricrea il luogo e riassegna la situazione.');
      return;
    }

    console.error('Errore salvataggio situazione:', error, dbData);
    throw error;
  }
}

export async function deleteSituation(situationId: string): Promise<void> {
  if (shouldUseLocalMode()) {
  await deleteLocalModeEntity('situations', situationId);
  return;
}

  const { error } = await supabase
    .from('situations')
    .delete()
    .eq('id', situationId);

  if (error) throw error;
}

// ============= ADVENTURE =============

export interface Adventure {
  id: string;
  campaignId: string;
  title: string;
  description: string;
  notes: string;
  kind: 'intro' | 'standard' | 'final';
  isActive: boolean;
  nextAdventureIds: string[];
  createdAt?: string;
  updatedAt?: string;
}

export async function loadAdventures(campaignId: string): Promise<Adventure[]> {
  if (shouldUseLocalMode()) {
  return loadLocalModeEntities<Adventure>(campaignId, 'adventures');
}

  const { data, error } = await supabase
    .from('adventures')
    .select('*')
    .eq('campaign_id', campaignId);

  if (error) {
    console.error('Errore caricamento avventure da Supabase:', error);
    throw error;
  }

  return (data || []).map(toCamelCase);
}

export async function saveAdventure(campaignId: string, adventure: Adventure): Promise<void> {
  if (shouldUseLocalMode()) {
  await saveLocalModeEntity<Adventure>(campaignId, 'adventures', { ...adventure, campaignId });
  return;
}

  const dbData = toSnakeCase(sanitizeUUIDs({
    ...adventure,
    campaignId
  }));

  const { error } = await supabase
    .from('adventures')
    .upsert(dbData);

  if (error) {
    console.error('Errore salvataggio avventura:', error, dbData);
    throw error;
  }
}

export async function deleteAdventure(adventureId: string): Promise<void> {
  if (shouldUseLocalMode()) {
  await deleteLocalModeEntity('adventures', adventureId);
  return;
}

  const { error } = await supabase
    .from('adventures')
    .delete()
    .eq('id', adventureId);

  if (error) throw error;
}





