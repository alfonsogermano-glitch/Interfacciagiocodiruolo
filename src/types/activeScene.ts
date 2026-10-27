import type { ChapterMapMetadata, SceneContextMetadata, SceneMapRegion, SessionGridSettings } from './mapGeometry';
import type { SessionMapToken } from './sessionMapToken';
import type { SessionMapDrawing } from './sessionMapDrawing';
import type { SessionMapPoi } from './sessionMapPoi';
import type { SessionMapFog } from './sessionMapFog';
import type { MapObjectRef } from '../app/components/session/mapObjectLayers';

/** Snapshot pubblico e immutabile della Scena pubblicata in sessione. */
export interface ActiveScenePublication {
  id: string;
  campaignId: string;
  sceneId: string;
  chapterId: string;
  title: string;
  description: string;
  chapterTitle: string;
  mapUrl: string | null;
  sceneImageUrl: string | null;
  mapMetadata: ChapterMapMetadata;
  mapPlacement?: { x: number; y: number; locked: boolean; width?: number; height?: number };
  gridSettings?: SessionGridSettings;
  mapTokens?: SessionMapToken[];
  mapDrawings?: SessionMapDrawing[];
  mapPois?: SessionMapPoi[];
  mapFog?: SessionMapFog[];
  mapObjectOrder?: MapObjectRef[];
  mapRegions: SceneMapRegion[];
  contextMetadata: SceneContextMetadata;
  publishedAt: string;
}

export function isActiveScenePublication(value: unknown): value is ActiveScenePublication {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.campaignId === 'string' && typeof item.sceneId === 'string' && typeof item.chapterId === 'string' && typeof item.title === 'string' && typeof item.description === 'string' && typeof item.chapterTitle === 'string' && (item.mapUrl === null || typeof item.mapUrl === 'string') && (item.sceneImageUrl === null || typeof item.sceneImageUrl === 'string') && !!item.mapMetadata && typeof item.mapMetadata === 'object' && Array.isArray(item.mapRegions) && !!item.contextMetadata && typeof item.contextMetadata === 'object' && typeof item.publishedAt === 'string';
}
