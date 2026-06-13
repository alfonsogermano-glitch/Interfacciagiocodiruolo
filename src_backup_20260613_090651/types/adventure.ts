export type AdventureKind = 'intro' | 'standard' | 'final';

export interface Adventure {
  id: string;
  campaignId: string;
  title: string;
  description: string;
  notes: string;

  kind: AdventureKind;
  isActive: boolean;

  nextAdventureIds: string[];

  createdAt: string;
  updatedAt: string;
}