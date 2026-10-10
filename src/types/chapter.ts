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

  createdAt: string;
  updatedAt: string;
}
