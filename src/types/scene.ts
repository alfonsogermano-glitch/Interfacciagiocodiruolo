import type { SceneContextMetadata, SceneMapRegion } from './mapGeometry';

export type SceneStatus = 'draft' | 'ready' | 'completed';

export interface Scene {
  id: string;
  campaignId: string;
  chapterId: string;
  title: string;
  description: string;
  notes: string;
  status: SceneStatus;
  /** Compatibility link for locations created before the spatial cutover. */
  environmentId?: string | null;
  imageUrl: string | null;
  sortOrder: number;
  nextSceneIds: string[];
  mapRegions: SceneMapRegion[];
  contextMetadata: SceneContextMetadata;
  sourceEnvironment?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}
