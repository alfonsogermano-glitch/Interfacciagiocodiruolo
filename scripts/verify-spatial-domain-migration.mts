import assert from 'node:assert/strict';
import {
  buildEnvironmentChapterMapping,
  migrateBackupToSpatialDomain,
  migrateEnvironmentDomainTables,
  normalizeChapterSpatialValue,
  normalizeSceneSpatialValue,
  resolveChapterIdForEnvironment,
  resolveChapterNavigation,
} from '../src/services/campaign/spatialDomainMigration.ts';
import type { Chapter } from '../src/types/chapter.ts';
import type { Scene } from '../src/types/scene.ts';

const id = (n: number) => `50000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const campaign = id(1);
const root = id(10);
const child = id(11);
const grandchild = id(12);
const forest = id(13);
const clearing = id(14);
const authoredChapter = id(20);
const authoredScene = id(21);
const monster = id(40);

const environmentRow = (overrides: Record<string, unknown>) => ({
  id: '',
  campaignId: campaign,
  name: 'Environment',
  description: '',
  notes: '',
  parentLocationId: null,
  mapUrl: null,
  imageUrl: null,
  atmosphere: '',
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

const environments = [
  environmentRow({ id: root, name: 'Citadel', description: 'Root description', notes: 'root notes', mapUrl: 'root-map.jpg', atmosphere: 'fog' }),
  environmentRow({ id: child, name: 'Hall', description: 'Child description', parentLocationId: root, sortOrder: 4 }),
  environmentRow({ id: grandchild, name: 'Alcove', description: 'Grandchild description', parentLocationId: child, sortOrder: 5 }),
  environmentRow({ id: forest, name: 'Forest' }),
  environmentRow({ id: clearing, name: 'Clearing', parentLocationId: forest }),
];

// --- 1. Conversione locale camelCase: gerarchia, preservazione, riferimenti ---
{
  const tables = migrateEnvironmentDomainTables({
    environments: structuredClone(environments),
    chapters: [{ id: authoredChapter, campaignId: campaign, title: 'Authored chapter', description: 'narrative', notes: 'secret', kind: 'intro', isActive: true, nextChapterIds: [], mapUrl: null, mapMetadata: { imageUrl: null, gridVisible: true, gridColumns: 12, gridRows: 8 }, locationMetadata: {}, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    scenes: [{ id: authoredScene, campaignId: campaign, chapterId: authoredChapter, title: 'Authored scene', description: 'must remain', notes: '', status: 'ready', imageUrl: null, sortOrder: 0, nextSceneIds: [], mapRegions: [], contextMetadata: { timeOfDay: '', period: '', condition: '' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    monsters: [{ id: monster, campaignId: campaign, name: 'Cultist', environmentId: grandchild, chapterId: null }],
  });

  assert.equal(tables.environments?.length, 5, 'le Environment restano immutate come storage di compatibilità');
  assert.deepEqual(tables.environments?.[0], environments[0], 'riga ambiente non modificata');

  const chapters = tables.chapters ?? [];
  const scenes = tables.scenes ?? [];
  assert.equal(chapters.length, 3, 'capitolo autore + 2 radici migrate');
  assert.equal(scenes.length, 4, 'scena autore + 3 discendenti migrati');

  const authored = chapters.find(chapter => chapter.id === authoredChapter);
  assert.equal(authored?.title, 'Authored chapter', 'capitolo esistente preservato');
  assert.equal(authored?.isActive, true, 'stato capitolo autore intatto');

  const migratedRoot = chapters.find(chapter => chapter.id === root);
  assert.ok(migratedRoot, 'la radice diventa capitolo con lo stesso UUID');
  assert.equal(migratedRoot?.title, 'Citadel');
  assert.equal(migratedRoot?.mapUrl, 'root-map.jpg');
  assert.equal(migratedRoot?.kind, 'standard', 'default kind');
  assert.equal(migratedRoot?.isActive, false, 'default isActive');
  assert.deepEqual(migratedRoot?.nextChapterIds, [], 'default nextChapterIds');
  assert.equal(migratedRoot?.mapMetadata.gridColumns, 20, 'default mapMetadata');
  assert.equal((migratedRoot?.sourceEnvironment as { id?: string })?.id, root, 'marker sourceEnvironment persistito');
  assert.equal((migratedRoot?.locationMetadata as { atmosphere?: string })?.atmosphere, 'fog', 'locationMetadata conserva il dettaglio');

  const hallScene = scenes.find(scene => scene.id === child);
  assert.equal(hallScene?.chapterId, root, 'figlio -> scena del capitolo radice');
  assert.equal((hallScene as { environmentId?: string })?.environmentId, child, 'compatibilità environment_id conservata');
  assert.equal(hallScene?.sortOrder, 4);
  assert.deepEqual(hallScene?.mapRegions, []);
  assert.deepEqual(hallScene?.contextMetadata, { timeOfDay: '', period: '', condition: '' }, 'default contextMetadata');
  assert.equal(hallScene?.status, 'draft', 'default status');

  const alcoveScene = scenes.find(scene => scene.id === grandchild);
  assert.equal(alcoveScene?.chapterId, root, 'nipote risale alla stessa radice');

  const forestChapter = chapters.find(chapter => chapter.id === forest);
  assert.ok(forestChapter, 'seconda radice indipendente');
  assert.equal(scenes.find(scene => scene.id === clearing)?.chapterId, forest);

  const migratedMonster = tables.monsters?.[0];
  assert.equal(migratedMonster?.chapterId, root, 'entità riassegnata al capitolo');
  assert.equal(migratedMonster?.sceneId, grandchild, 'entità collegata alla scena');
  assert.equal(migratedMonster?.environmentId, grandchild, 'riferimento ambiente di compatibilità non rimosso');
}

// --- 2. Collisioni UUID + idempotence del run ripetuto ---
{
  const tables = migrateEnvironmentDomainTables({
    environments: structuredClone(environments),
    chapters: [{ id: root, campaignId: campaign, title: 'Collision chapter' }],
    scenes: [{ id: child, campaignId: campaign, chapterId: root, title: 'Collision scene' }],
  });

  const collisionChapter = (tables.chapters ?? []).find(chapter => (chapter.sourceEnvironment as { id?: string })?.id === root);
  assert.ok(collisionChapter, 'capitolo migrato creato nonostante la collisione');
  assert.notEqual(collisionChapter?.id, root, 'collisione UUID: usa un UUID di sostituzione persistente');
  assert.equal((tables.chapters ?? []).find(chapter => chapter.id === root)?.title, 'Collision chapter', 'capitolo autore non sovrascritto');
  const collisionScene = (tables.scenes ?? []).find(scene => (scene as { environmentId?: string }).environmentId === child);
  assert.notEqual(collisionScene?.id, child, 'collisione UUID scena risolta');

  const chapterCount = tables.chapters?.length ?? 0;
  const sceneCount = tables.scenes?.length ?? 0;
  const rerun = migrateEnvironmentDomainTables(tables);
  assert.equal(rerun.chapters?.length, chapterCount, 'rerun senza capitoli duplicati');
  assert.equal(rerun.scenes?.length, sceneCount, 'rerun senza scene duplicate');
  const rerunRoot = (rerun.chapters ?? []).find(chapter => (chapter.sourceEnvironment as { id?: string })?.id === root);
  assert.equal(rerunRoot?.id, collisionChapter?.id, 'mapping stabile tra i run');
}

// --- 3. Conversione righe snake_case (persistenza SQL/locale mista) ---
{
  const tables = migrateEnvironmentDomainTables({
    environments: [
      { id: root, campaign_id: campaign, parent_location_id: null, name: 'Citadel', description: null, notes: null, map_url: 'root-map.jpg', image_url: 'root.jpg', sort_order: 3, created_at: '2026-01-01T00:00:00.000Z' },
      { id: child, campaign_id: campaign, parent_location_id: root, name: 'Hall', description: null, notes: null, map_url: null, image_url: null, sort_order: 4 },
    ],
    monsters: [{ id: monster, campaign_id: campaign, environment_id: child, chapter_id: null }],
  });

  const chapter = (tables.chapters ?? [])[0];
  assert.equal(chapter?.campaign_id, campaign, 'chiave snake campaign_id');
  assert.equal(chapter?.map_url, 'root-map.jpg');
  assert.equal(chapter?.is_active, false);
  assert.deepEqual(chapter?.next_chapter_ids, []);
  assert.equal(chapter?.map_metadata.gridColumns, 20);
  assert.equal((chapter?.source_environment as { id?: string })?.id, root);
  const scene = (tables.scenes ?? [])[0];
  assert.equal(scene?.chapter_id, root, 'scene snake legate al capitolo');
  assert.equal(scene?.environment_id, child);
  assert.equal(tables.monsters?.[0]?.chapter_id, root);
  assert.equal(tables.monsters?.[0]?.scene_id, child);
  assert.ok(tables.monsters?.[0]?.environment_id, 'compatibilità environment_id conservata in snake_case');
}

// --- 4. Default spaziali dei Capitoli ---
{
  const chapter = normalizeChapterSpatialValue({
    id: id(50),
    campaignId: campaign,
    title: 'Senza mappa',
    mapMetadata: { imageUrl: 'fallback.jpg', gridVisible: true, gridColumns: 0, gridRows: 999 },
  } as unknown as Chapter);
  assert.equal(chapter.mapUrl, 'fallback.jpg', 'mapUrl eredita mapMetadata.imageUrl');
  assert.equal(chapter.mapMetadata.imageUrl, 'fallback.jpg');
  assert.equal(chapter.mapMetadata.gridColumns, 20, 'colonne non valide -> default 20');
  assert.equal(chapter.mapMetadata.gridRows, 999);
  assert.equal(chapter.description, '');
  assert.equal(chapter.notes, '');
  assert.equal(chapter.kind, 'standard');
  assert.equal(chapter.isActive, false);
  assert.deepEqual(chapter.locationMetadata, {});
  assert.deepEqual(chapter.nextChapterIds, []);
  assert.ok(chapter.createdAt && chapter.updatedAt, 'timestamp di default generati');

  const withMap = normalizeChapterSpatialValue({ id: id(51), campaignId: campaign, title: 'T', mapUrl: 'direct.jpg' } as unknown as Chapter);
  assert.equal(withMap.mapMetadata.imageUrl, 'direct.jpg', 'mapMetadata.imageUrl eredita mapUrl');
}

// --- 5. Normalizzazione scene e filtro regioni non valide ---
{
  const scene = normalizeSceneSpatialValue({
    id: id(60),
    campaignId: campaign,
    chapterId: authoredChapter,
    title: '  Con regioni  ',
    mapRegions: [
      { id: 'ok', label: 'OK', color: '#fff', geometry: { kind: 'rect', rect: { x: 0, y: 0, width: 10, height: 10 } } },
      { id: 'zero', label: 'Zero', color: '#fff', geometry: { kind: 'rect', rect: { x: 0, y: 0, width: 0, height: 10 } } },
      { id: 'poly-short', label: 'Short', color: '#fff', geometry: { kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } },
      { id: 'poly-ok', label: 'Poly', color: '#fff', geometry: { kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }] } },
      { id: 'broken', label: 'Broken', color: '#fff', geometry: null },
    ],
  } as unknown as Scene);
  assert.deepEqual(scene.mapRegions.map(region => region.id), ['ok', 'poly-ok'], 'regioni non valide scartate');
  assert.equal(scene.status, 'draft');
  assert.equal(scene.sortOrder, 0);
  assert.equal(scene.imageUrl, null);
  assert.deepEqual(scene.nextSceneIds, []);
  assert.deepEqual(scene.contextMetadata, { timeOfDay: '', period: '', condition: '' });
}

// --- 6. Normalizzazione backup (v1/v2 legacy -> v3 spaziale) ---
{
  const converted = migrateBackupToSpatialDomain({
    chapters: [{ id: authoredChapter, campaignId: campaign, title: 'Authored chapter' }],
    scenes: [],
    environments: structuredClone(environments),
  });
  assert.equal(converted.chapters.length, 3, 'backup: radici convertite senza duplicare il capitolo autore');
  assert.equal(converted.scenes.length, 3, 'backup: discendenti convertiti in scene');
  assert.equal(converted.environments.length, 5, 'backup: Environment conservate come input di compatibilità');

  const again = migrateBackupToSpatialDomain(converted);
  assert.equal(again.chapters.length, converted.chapters.length, 'import ripetuto senza capitoli duplicati');
  assert.equal(again.scenes.length, converted.scenes.length, 'import ripetuto senza scene duplicate');
  assert.equal(again.environments.length, converted.environments.length);

  const empty = migrateBackupToSpatialDomain({ chapters: null, scenes: 'nope', environments: undefined });
  assert.deepEqual(empty, { chapters: [], scenes: [], environments: [] }, 'input non validi -> tabelle vuote');

  const onlyLegacy = migrateBackupToSpatialDomain({ environments: structuredClone(environments) });
  assert.equal(onlyLegacy.chapters.length, 2);
  assert.equal(onlyLegacy.scenes.length, 3);
}

// --- 7. Risoluzione navigazione environment -> chapter ---
{
  const tables = migrateBackupToSpatialDomain({ environments: structuredClone(environments) });
  const chapters = (tables.chapters ?? []) as unknown as Chapter[];
  const scenes = (tables.scenes ?? []) as unknown as Scene[];

  const mapping = buildEnvironmentChapterMapping(chapters, scenes);
  assert.equal(mapping.get(root), root, 'radice mappata su se stessa');
  assert.equal(mapping.get(child), root, 'figlio mappato sul capitolo radice');
  assert.equal(mapping.get(grandchild), root, 'nipote mappato sul capitolo radice');
  assert.equal(mapping.get(forest), forest);

  assert.equal(resolveChapterIdForEnvironment(root, chapters, scenes), root);
  assert.equal(resolveChapterIdForEnvironment(child, chapters, scenes), root);
  assert.equal(resolveChapterIdForEnvironment(id(99), chapters, scenes), null);
  assert.equal(resolveChapterIdForEnvironment(null, chapters, scenes), null);

  assert.equal(resolveChapterNavigation(root, chapters, scenes)?.id, root);
  assert.equal(resolveChapterNavigation(child, chapters, scenes)?.id, root, 'target legacy environment risolto sul capitolo');
  assert.equal(resolveChapterNavigation(authoredChapter, chapters, scenes) ?? null, null, 'capitolo autore non raggiungibile via mapping');
}

console.log('Spatial domain migration: PASS (conversione locale, collisioni, snake_case, default spaziali, backup, navigazione).');
