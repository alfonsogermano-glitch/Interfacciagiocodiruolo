import type { Character } from '../src/types/character';
import { mapRowToCharacter } from '../src/services/supabase/charactersService';

// Compile-time regression contract for P0.2.
// This file intentionally contains no runtime side effects: `npm run typecheck`
// must fail if the Character domain type or the Supabase row mapper loses the
// PG -> chapter relation again, including rows persisted before the rename.
const characterChapterShape: Pick<Character, 'chapterId'> = {
  chapterId: null,
};

const mapped = mapRowToCharacter({
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Type contract',
  chapter_id: '00000000-0000-0000-0000-000000000002',
  sheet_data: {},
});

const mappedLegacy = mapRowToCharacter({
  id: '00000000-0000-0000-0000-000000000003',
  name: 'Legacy type contract',
  adventure_id: '00000000-0000-0000-0000-000000000004',
  sheet_data: {},
});

const mappedChapterId: string | null | undefined = mapped.chapterId;
const mappedLegacyChapterId: string | null | undefined = mappedLegacy.chapterId;

void characterChapterShape;
void mappedChapterId;
void mappedLegacyChapterId;
