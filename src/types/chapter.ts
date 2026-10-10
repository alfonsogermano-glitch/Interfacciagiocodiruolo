import type { ChapterMapMetadata } from './mapGeometry';

export type ChapterKind = 'intro' | 'standard' | 'final';

export interface Chapter {
  id: string;
  campaignId: string;
  title: string;
  description: string;
  notes: string;

  kind: ChapterKind;
  isActive: boolean;

  nextChapterIds: string[];
  mapUrl: string | null;
  mapMetadata: ChapterMapMetadata;
  locationMetadata: Record<string, unknown>;
  sourceEnvironment?: Record<string, unknown> | null;

  createdAt: string;
  updatedAt: string;
}
