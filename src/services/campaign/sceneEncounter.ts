import { generateUUID } from '../../lib/uuid';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import type { Scene } from '../../types/scene';
import { CAMPAIGN_STORAGE_KEYS } from './campaignStorageKeys';
import { persistenceKey, selectedContentMode } from '../storage/persistenceMode';

export type ActiveEncounter = {
  id: string;
  campaignId: string;
  environmentId: string;
  environmentName: string;
  sceneId: string;
  npcIds: string[];
  monsterIds: string[];
  clueIds: string[];
  situationIds: string[];
  startedAt: string;
  status: 'running' | 'paused';
  pausedAt?: string;
};

type LinkedEntity = {
  id: string;
  chapterId?: string | null;
  environmentId?: string | null;
  sceneId?: string | null;
};

function readLocalEntities(key: string): LinkedEntity[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(persistenceKey(key)) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function belongsToScene(entity: LinkedEntity, scene: Scene) {
  return entity.sceneId === scene.id
    || (!entity.sceneId && entity.chapterId === scene.chapterId)
    || (!entity.sceneId && !!scene.environmentId && entity.environmentId === scene.environmentId);
}

export async function buildSceneEncounter(campaignId: string, scene: Scene): Promise<ActiveEncounter> {
  const keys = ['npcs', 'monsters', 'clues', 'situations'] as const;
  let entities: LinkedEntity[][];

  if (selectedContentMode() === 'local' || !isSupabaseConfigured || !supabase) {
    const storageKeys = [CAMPAIGN_STORAGE_KEYS.npcs, CAMPAIGN_STORAGE_KEYS.monsters, CAMPAIGN_STORAGE_KEYS.clues, CAMPAIGN_STORAGE_KEYS.situations];
    entities = storageKeys.map(readLocalEntities);
  } else {
    const results = await Promise.all(keys.map(key => supabase.from(key).select('id, chapter_id, environment_id, scene_id').eq('campaign_id', campaignId)));
    const failed = results.find(result => result.error);
    if (failed?.error) throw failed.error;
    entities = results.map(result => (result.data ?? []).map(item => ({
      id: item.id,
      chapterId: item.chapter_id,
      environmentId: item.environment_id,
      sceneId: item.scene_id,
    })));
  }

  const ids = (items: LinkedEntity[]) => items.filter(item => belongsToScene(item, scene)).map(item => item.id);
  return {
    id: generateUUID(),
    campaignId,
    environmentId: scene.environmentId ?? scene.id,
    environmentName: scene.title,
    sceneId: scene.id,
    npcIds: ids(entities[0]),
    monsterIds: ids(entities[1]),
    clueIds: ids(entities[2]),
    situationIds: ids(entities[3]),
    startedAt: new Date().toISOString(),
    status: 'running',
  };
}
