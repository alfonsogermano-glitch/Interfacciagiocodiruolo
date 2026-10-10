import assert from 'node:assert/strict';
import { migrateLegacyChapterTables, normalizeLegacyChapterValue } from '../src/services/campaign/chapterMigration';

const normalized = normalizeLegacyChapterValue({
  id: 'chapter-one',
  adventureId: 'legacy-parent',
  nested: { adventure_id: 'legacy-snake' },
  nextAdventureIds: ['chapter-two'],
});
assert.deepEqual(normalized, {
  id: 'chapter-one',
  chapterId: 'legacy-parent',
  nested: { chapter_id: 'legacy-snake' },
  nextChapterIds: ['chapter-two'],
});

const tables = migrateLegacyChapterTables({
  adventures: [{ id: 'one', title: 'Legacy', nextAdventureIds: ['two'] }],
  chapters: [{ id: 'one', title: 'Canonical', nextChapterIds: [] }, { id: 'two', title: 'Secondo' }],
  npcs: [{ id: 'npc', adventure_id: 'one' }],
});
assert.equal('adventures' in tables, false);
assert.deepEqual(tables.chapters, [
  { id: 'one', title: 'Canonical', nextChapterIds: [] },
  { id: 'two', title: 'Secondo' },
]);
assert.equal(tables.npcs[0].chapter_id, 'one');

console.log('Chapters local migration: PASS (legacy fields, merge precedence, idempotent cleanup).');
