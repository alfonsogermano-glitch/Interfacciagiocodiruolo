export type SceneStatus = 'draft' | 'ready' | 'completed';

export interface Scene {
  id: string;
  campaignId: string;
  chapterId: string;
  title: string;
  description: string;
  notes: string;
  status: SceneStatus;
  environmentId: string | null;
  imageUrl: string | null;
  sortOrder: number;
  nextSceneIds: string[];
  createdAt: string;
  updatedAt: string;
}
