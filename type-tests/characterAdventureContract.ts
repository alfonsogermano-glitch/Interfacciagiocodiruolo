import type { Character } from '../src/types/character';
import { mapRowToCharacter } from '../src/services/supabase/charactersService';

// Compile-time regression contract for P0.2.
// This file intentionally contains no runtime side effects: `npm run typecheck`
// must fail if the Character domain type or the Supabase row mapper loses the
// PG -> adventure relation again.
const characterAdventureShape: Pick<Character, 'adventureId'> = {
  adventureId: null,
};

const mapped = mapRowToCharacter({
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Type contract',
  adventure_id: '00000000-0000-0000-0000-000000000002',
  sheet_data: {},
});

const mappedAdventureId: string | null | undefined = mapped.adventureId;

void characterAdventureShape;
void mappedAdventureId;
