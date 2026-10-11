import { generateUUID } from '../../lib/uuid';
import type { ActiveScenePublication } from '../../types/activeScene';
import type { Chapter } from '../../types/chapter';
import type { Scene } from '../../types/scene';
import {
  deleteCampaignDocument,
  loadCampaignDocumentOrNull,
  saveCampaignDocument,
} from '../storage/campaignDocuments';

export const ACTIVE_SCENE_DOCUMENT_KEY = 'active-scene';

export function buildActiveScenePublication(
  campaignId: string,
  scene: Scene,
  chapter: Chapter,
): ActiveScenePublication {
  if (scene.campaignId !== campaignId || chapter.campaignId !== campaignId || scene.chapterId !== chapter.id) {
    throw new Error('La scena e il capitolo devono appartenere alla campagna attiva.');
  }

  return {
    id: generateUUID(),
    campaignId,
    sceneId: scene.id,
    chapterId: chapter.id,
    title: scene.title,
    description: scene.description,
    chapterTitle: chapter.title,
    mapUrl: chapter.mapUrl,
    sceneImageUrl: scene.imageUrl,
    mapMetadata: { ...chapter.mapMetadata },
    mapRegions: scene.mapRegions.map(region => ({
      ...region,
      geometry: region.geometry.kind === 'rect'
        ? { kind: 'rect', rect: { ...region.geometry.rect } }
        : { kind: 'polygon', points: region.geometry.points.map(point => ({ ...point })) },
    })),
    contextMetadata: { ...scene.contextMetadata },
    publishedAt: new Date().toISOString(),
  };
}

export function loadActiveScene(campaignId: string): Promise<ActiveScenePublication | null> {
  return loadCampaignDocumentOrNull<ActiveScenePublication>(campaignId, ACTIVE_SCENE_DOCUMENT_KEY);
}

export function saveActiveScene(campaignId: string, value: ActiveScenePublication): Promise<void> {
  return saveCampaignDocument(campaignId, ACTIVE_SCENE_DOCUMENT_KEY, value);
}

export function clearActiveScene(campaignId: string): Promise<void> {
  return deleteCampaignDocument(campaignId, ACTIVE_SCENE_DOCUMENT_KEY);
}
