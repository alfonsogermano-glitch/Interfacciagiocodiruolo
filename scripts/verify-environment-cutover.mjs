import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = (n) => `40000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

const campaign = id(1), campaignB = id(2), owner = id(3);
const existingChapter = id(4), existingScene = id(5);
const root = id(10), child = id(11), grandchild = id(12);
const freeRoot = id(13), freeChild = id(14);
const assignedRoot = id(15), assignedChild = id(16);
const orphan = id(17), orphanChild = id(18);
const cycleA = id(19), cycleBEnv = id(20), cycleChild = id(21);
const selfParent = id(22);
const crossRoot = id(23), crossChild = id(24);
const blankName = id(25), negativeSort = id(26);
const emptyMetaRoot = id(27), objectMetaRoot = id(28);
const nullCampaign = id(29);
const missingParent = id(90);
const entityBase = 40;
const envCount = 19;

const orderColumns = {
  environment_narrative_mapping: 'environment_id',
  chapters: 'id',
  scenes: 'id',
  npcs: 'id',
  monsters: 'id',
  clues: 'id',
  situations: 'id',
};

const snapshot = async () => {
  const state = {};
  for (const [table, column] of Object.entries(orderColumns)) {
    state[table] = (await db.query(`select * from ${table} order by ${column}::text`)).rows;
  }
  return state;
};

const count = async (table, where = 'true', params = []) =>
  (await db.query(`select count(*)::int count from ${table} where ${where}`, params)).rows[0].count;

const row = async (sql, params = []) => (await db.query(sql, params)).rows[0];

try {
  await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table campaigns(id uuid primary key, owner_profile_id text not null);
    create table chapters(
      id uuid primary key default gen_random_uuid(), campaign_id uuid not null references campaigns(id) on delete cascade,
      title text not null, description text, notes text, kind text not null default 'standard', is_active boolean not null default false,
      next_chapter_ids uuid[] not null default '{}', created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table environments(
      id uuid primary key, campaign_id uuid references campaigns(id) on delete cascade,
      chapter_id uuid references chapters(id), parent_location_id uuid references environments(id), name text not null,
      description text, atmosphere text, image_url text, map_url text, features jsonb default '[]', hazards jsonb default '[]',
      tags text[] default '{}', notes text, map_location_id text, location_type text, icon_id text, exit_points text,
      hidden_details text, npcs_present jsonb default '[]', sort_order integer, created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table npcs(id uuid primary key, campaign_id uuid, chapter_id uuid references chapters(id) on delete set null, environment_id uuid references environments(id) on delete set null);
    create table monsters(id uuid primary key, campaign_id uuid, chapter_id uuid references chapters(id) on delete set null, environment_id uuid references environments(id) on delete set null);
    create table clues(id uuid primary key, campaign_id uuid, chapter_id uuid references chapters(id) on delete set null, environment_id uuid references environments(id) on delete set null);
    create table situations(id uuid primary key, campaign_id uuid, chapter_id uuid references chapters(id) on delete set null, environment_id uuid references environments(id) on delete set null);
    grant usage on schema public, auth to authenticated;
    grant select on campaigns, chapters, environments to authenticated;
    insert into campaigns values ('${campaign}', '${owner}'), ('${campaignB}', '${owner}');
    insert into chapters(id,campaign_id,title) values
      ('${existingChapter}','${campaign}','Authored chapter'), ('${root}','${campaign}','Collision chapter');
  `);

  const scenesMigration = await readFile(new URL('../supabase/migrations/20261010130000_campaign_scenes.sql', import.meta.url), 'utf8');
  const cutoverMigration = await readFile(new URL('../supabase/migrations/20261010140000_environment_chapter_scene_cutover.sql', import.meta.url), 'utf8');
  await db.exec(scenesMigration);
  await db.query(`insert into scenes(id,campaign_id,chapter_id,title,description,notes) values
    ($1,$2,$3,'Authored scene','must remain narrative','original'),
    ($4,$2,$3,'Collision scene','must not be replaced','original')`, [existingScene, campaign, existingChapter, child]);

  const envColumns = `id,campaign_id,chapter_id,parent_location_id,name,description,atmosphere,image_url,map_url,features,hazards,tags,notes,map_location_id,location_type,icon_id,exit_points,hidden_details,npcs_present,sort_order`;
  await db.exec(`insert into environments(${envColumns}) values
    ('${root}','${campaign}',null,null,'Citadel','Root description','fog','root.jpg','root-map.jpg','[{"door":1}]','[{"fire":true}]','{ancient}','root notes','map-root','building','castle','north','vault','[{"id":"npc"}]',3),
    ('${child}','${campaign}',null,'${root}','Hall','Child description','echoes','hall.jpg',null,'[{"statue":true}]','[]','{inside}','child notes','map-child','room','door','east','rune','[]',4),
    ('${grandchild}','${campaign}',null,'${child}','Alcove','Grandchild description','cold','alcove.jpg',null,'[]','[]','{secret}','grandchild notes','map-grand','poi','eye','none','cache','[]',5),
    ('${freeRoot}','${campaign}',null,null,'Forest','Free root','rain','forest.jpg','forest-map.jpg','[]','[]','{wild}','forest notes',null,'area',null,null,null,'[]',0),
    ('${freeChild}','${campaign}',null,'${freeRoot}','Clearing','Free child','wind','clearing.jpg',null,'[]','[]','{open}','clearing notes',null,'poi',null,null,null,'[]',0),
    ('${assignedRoot}','${campaign}','${existingChapter}',null,'Assigned keep','Root already assigned to an authored chapter',null,null,null,'[]','[]','{}','assigned notes',null,'area',null,null,null,'[]',1),
    ('${assignedChild}','${campaign}',null,'${assignedRoot}','Assigned child',null,null,null,null,'[]','[]','{}',null,null,'room',null,null,null,'[]',2),
    ('${orphan}','${campaign}',null,null,'Orphan bay','Parent row is missing',null,null,null,'[]','[]','{}',null,null,'room',null,null,null,'[]',0),
    ('${orphanChild}','${campaign}',null,'${orphan}','Orphan child',null,null,null,null,'[]','[]','{}',null,null,'poi',null,null,null,'[]',1),
    ('${cycleA}','${campaign}',null,'${cycleBEnv}','Cycle A',null,null,null,null,'[]','[]','{}',null,null,'area',null,null,null,'[]',0),
    ('${cycleBEnv}','${campaign}',null,'${cycleA}','Cycle B',null,null,null,null,'[]','[]','{}',null,null,'area',null,null,null,'[]',1),
    ('${cycleChild}','${campaign}',null,'${cycleA}','Cycle child',null,null,null,null,'[]','[]','{}',null,null,'poi',null,null,null,'[]',2),
    ('${selfParent}','${campaign}',null,'${selfParent}','Self parent',null,null,null,null,'[]','[]','{}',null,null,'poi',null,null,null,'[]',0),
    ('${crossRoot}','${campaign}',null,null,'Border root',null,null,null,null,'[]','[]','{}',null,null,'area',null,null,null,'[]',0),
    ('${crossChild}','${campaignB}',null,'${crossRoot}','Border child in other campaign',null,null,null,null,'[]','[]','{}',null,null,'room',null,null,null,'[]',1),
    ('${blankName}','${campaign}',null,'${freeRoot}','   ',null,null,null,null,'[]','[]','{}',null,null,'poi',null,null,null,'[]',0),
    ('${negativeSort}','${campaign}',null,'${freeRoot}','Negative sort',null,null,null,null,'[]','[]','{}',null,null,'poi',null,null,null,'[]',-7),
    ('${emptyMetaRoot}','${campaign}',null,null,'Empty meta','No optional data at all',null,null,null,'[]','[]','{}',null,null,'area',null,null,null,'[]',0),
    ('${objectMetaRoot}','${campaign}',null,null,'Object meta','Legacy object payloads',null,null,null,'{}','{}','{}',null,null,'area',null,null,null,'{}',0),
    ('${nullCampaign}',null,null,null,'No campaign','Legacy row without campaign',null,null,null,'[]','[]','{}',null,null,'area',null,null,null,'[]',0)`);

  // Production keeps this foreign key (deleting a parent nulls the child), but
  // historical rows loaded before the constraint existed can still dangle; the
  // cutover must not drop them and must not loop on them.
  await db.exec(`alter table environments drop constraint environments_parent_location_id_fkey`);
  await db.query(`update environments set parent_location_id=$1 where id=$2`, [missingParent, orphan]);

  const entityRows = [
    ['npcs', root, existingChapter, campaign],
    ['monsters', child, existingChapter, campaign],
    ['clues', grandchild, existingChapter, campaign],
    ['situations', freeChild, existingChapter, campaign],
    ['monsters', null, existingChapter, campaign],
    ['clues', assignedRoot, existingChapter, campaign],
    ['situations', crossChild, null, campaignB],
    ['npcs', nullCampaign, null, campaign],
  ];
  for (const [index, [table, environmentId, chapterId, entityCampaign]] of entityRows.entries()) {
    await db.query(`insert into ${table}(id,campaign_id,chapter_id,environment_id) values($1,$2,$3,$4)`,
      [id(entityBase + index), entityCampaign, chapterId, environmentId]);
  }

  await db.exec(cutoverMigration);
  const firstState = await snapshot();
  const firstMappings = firstState.environment_narrative_mapping;

  assert.equal(firstMappings.length, envCount, 'every campaign-linked environment must be mapped exactly once');
  assert.equal(await count('environments'), envCount + 1);
  assert.equal(await count('chapters'), 12, 'authored + collision chapters plus one per effective root');
  assert.equal(await count('scenes'), 11, 'authored + collision scenes plus one per descendant');

  const mapOf = (environmentId) => {
    const mapping = firstMappings.find((entry) => entry.environment_id === environmentId);
    assert.ok(mapping, `missing mapping for ${environmentId}`);
    return mapping;
  };
  const rootMap = mapOf(root), childMap = mapOf(child), grandchildMap = mapOf(grandchild);
  const freeRootMap = mapOf(freeRoot), freeChildMap = mapOf(freeChild);
  const assignedRootMap = mapOf(assignedRoot), assignedChildMap = mapOf(assignedChild);
  const orphanMap = mapOf(orphan), orphanChildMap = mapOf(orphanChild);
  const cycleAMap = mapOf(cycleA), cycleBMap = mapOf(cycleBEnv), cycleChildMap = mapOf(cycleChild);
  const selfParentMap = mapOf(selfParent);
  const crossRootMap = mapOf(crossRoot), crossChildMap = mapOf(crossChild);
  const blankNameMap = mapOf(blankName), negativeSortMap = mapOf(negativeSort);

  assert.equal(rootMap.target_kind, 'chapter');
  assert.notEqual(rootMap.chapter_id, root, 'chapter UUID collision must use a persistent replacement');
  assert.equal(rootMap.scene_id, null);
  assert.equal(childMap.target_kind, 'scene');
  assert.notEqual(childMap.scene_id, child, 'scene UUID collision must use a persistent replacement');
  assert.equal(childMap.chapter_id, rootMap.chapter_id);
  assert.equal(childMap.root_environment_id, root);
  assert.equal(freeRootMap.chapter_id, freeRoot, 'non-colliding chapter UUID must be preserved');
  assert.equal(freeChildMap.chapter_id, freeRoot, 'descendants of a second root use their own root chapter');
  assert.notEqual(freeChildMap.chapter_id, rootMap.chapter_id, 'multiple roots must not share a chapter');
  assert.equal(grandchildMap.root_environment_id, root, 'deep descendants must resolve to their top-level root');
  assert.equal(grandchildMap.chapter_id, rootMap.chapter_id);

  assert.equal(assignedRootMap.target_kind, 'chapter', 'a root assigned to an authored chapter still becomes its own macro-place');
  assert.equal(assignedRootMap.chapter_id, assignedRoot);
  assert.notEqual(assignedRootMap.chapter_id, existingChapter, 'authored chapters are never reused or overwritten');
  assert.equal(assignedChildMap.chapter_id, assignedRoot);
  assert.equal(assignedChildMap.target_kind, 'scene');

  assert.equal(orphanMap.target_kind, 'chapter', 'an environment whose parent row is missing becomes its own root');
  assert.equal(orphanMap.chapter_id, orphan);
  assert.equal(orphanChildMap.chapter_id, orphan);
  assert.equal(orphanChildMap.target_kind, 'scene');

  assert.equal(cycleAMap.target_kind, 'chapter', 'cycles resolve to the smallest uuid of the cycle');
  assert.equal(cycleAMap.chapter_id, cycleA);
  assert.equal(cycleBMap.root_environment_id, cycleA);
  assert.equal(cycleBMap.target_kind, 'scene');
  assert.equal(cycleBMap.chapter_id, cycleAMap.chapter_id);
  assert.equal(cycleChildMap.chapter_id, cycleAMap.chapter_id);
  assert.equal(cycleChildMap.root_environment_id, cycleA);

  assert.equal(selfParentMap.target_kind, 'chapter', 'a self-parent environment becomes its own root');
  assert.equal(selfParentMap.chapter_id, selfParent);

  assert.equal(crossRootMap.target_kind, 'chapter');
  assert.equal(crossChildMap.target_kind, 'chapter', 'a parent in another campaign is not a usable parent');
  assert.equal((await row('select campaign_id from chapters where id=$1', [crossChildMap.chapter_id])).campaign_id, campaignB);
  assert.equal((await row('select campaign_id from chapters where id=$1', [crossRootMap.chapter_id])).campaign_id, campaign);

  assert.equal(firstMappings.find((entry) => entry.environment_id === nullCampaign), undefined, 'environments without campaign must stay untouched');
  assert.equal(await count('chapters', `source_environment->>'id' = $1`, [nullCampaign]), 0);

  assert.equal(blankNameMap.target_kind, 'scene');
  const blankScene = await row('select * from scenes where id=$1', [blankNameMap.scene_id]);
  assert.match(blankScene.title, /^Luogo [0-9a-f]{8}$/, 'blank environment names get a deterministic fallback title');
  assert.equal(blankScene.chapter_id, freeRoot);
  assert.equal((await row('select sort_order from scenes where id=$1', [negativeSortMap.scene_id])).sort_order, 0, 'negative sort_order is clamped');

  const migratedChapter = await row('select * from chapters where id=$1', [rootMap.chapter_id]);
  assert.equal(migratedChapter.title, 'Citadel');
  assert.equal(migratedChapter.map_url, 'root-map.jpg');
  assert.equal(migratedChapter.source_environment.atmosphere, 'fog');
  assert.deepEqual(migratedChapter.source_environment.features, [{ door: 1 }]);
  assert.deepEqual(migratedChapter.map_metadata, { imageUrl: 'root-map.jpg', gridVisible: true, gridColumns: 20, gridRows: 20 });
  assert.equal(migratedChapter.location_metadata.map_location_id, 'map-root');
  assert.equal(migratedChapter.location_metadata.chapter_id, null);
  assert.equal(migratedChapter.location_metadata.name, undefined, 'duplicated columns stay out of location_metadata');
  assert.equal(jsonType(await row('select location_metadata from chapters where id=$1', [rootMap.chapter_id])), 'object');

  const migratedScene = await row('select * from scenes where id=$1', [grandchildMap.scene_id]);
  assert.equal(migratedScene.title, 'Alcove');
  assert.equal(migratedScene.environment_id, grandchild);
  assert.equal(migratedScene.chapter_id, rootMap.chapter_id);
  assert.deepEqual(migratedScene.map_regions, []);
  assert.deepEqual(migratedScene.context_metadata, { timeOfDay: '', period: '', condition: '' });
  assert.equal(migratedScene.source_environment.hidden_details, 'cache');

  const emptyMetaChapter = await row('select * from chapters where id=$1', [mapOf(emptyMetaRoot).chapter_id]);
  assert.deepEqual(emptyMetaChapter.map_metadata, { imageUrl: null, gridVisible: true, gridColumns: 20, gridRows: 20 });
  assert.deepEqual(emptyMetaChapter.location_metadata.features, [], 'empty arrays survive nested inside object metadata');
  assert.equal(jsonType(await row('select map_metadata from chapters where id=$1', [mapOf(emptyMetaRoot).chapter_id])), 'object');
  const objectMetaChapter = await row('select * from chapters where id=$1', [mapOf(objectMetaRoot).chapter_id]);
  assert.deepEqual(objectMetaChapter.location_metadata.features, {}, 'legacy object payloads are preserved as objects');

  const assignedChapter = await row('select * from chapters where id=$1', [assignedRootMap.chapter_id]);
  assert.equal(assignedChapter.location_metadata.chapter_id, existingChapter, 'legacy chapter assignment is preserved in metadata');
  assert.equal(assignedChapter.source_environment.chapter_id, existingChapter);
  const authoredChapter = await row('select * from chapters where id=$1', [existingChapter]);
  assert.equal(authoredChapter.title, 'Authored chapter');
  assert.equal(authoredChapter.source_environment, null);

  const entityExpectations = [
    ['npcs', root, rootMap.chapter_id, null],
    ['monsters', child, rootMap.chapter_id, childMap.scene_id],
    ['clues', grandchild, rootMap.chapter_id, grandchildMap.scene_id],
    ['situations', freeChild, freeRootMap.chapter_id, freeChildMap.scene_id],
    ['clues', assignedRoot, assignedRootMap.chapter_id, null],
    ['situations', crossChild, crossChildMap.chapter_id, null],
  ];
  for (const [table, environmentId, chapterId, sceneId] of entityExpectations) {
    const entity = await row(`select chapter_id, scene_id, environment_id from ${table} where environment_id=$1`, [environmentId]);
    assert.equal(entity.chapter_id, chapterId, `${table} chapter reference for ${environmentId}`);
    assert.equal(entity.scene_id, sceneId, `${table} scene reference for ${environmentId}`);
    assert.ok(entity.environment_id, `${table} keeps environment compatibility`);
  }
  const noEnvironment = await row(`select chapter_id, scene_id from monsters where environment_id is null`);
  assert.deepEqual(noEnvironment, { chapter_id: existingChapter, scene_id: null }, 'entities without environment keep their chapter');
  const noCampaignEntity = await row(`select chapter_id, scene_id from npcs where environment_id=$1`, [nullCampaign]);
  assert.deepEqual(noCampaignEntity, { chapter_id: null, scene_id: null }, 'entities of an unmapped environment stay untouched');

  await db.exec(cutoverMigration);
  const secondState = await snapshot();
  assert.deepEqual(secondState, firstState, 'reruns must not change mappings, chapters, scenes or entity references');
  assert.equal(await count('chapters'), 12, 'rerun must not duplicate chapters');
  assert.equal(await count('scenes'), 11, 'rerun must not duplicate scenes');
  assert.equal(await count('environment_narrative_mapping'), envCount, 'rerun must not duplicate mappings');

  await db.query(`update scenes set map_regions=$1 where id=$2`, [[{ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }], grandchildMap.scene_id]);
  assert.deepEqual((await row('select map_regions from scenes where id=$1', [grandchildMap.scene_id])).map_regions,
    [{ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }], 'overlapping regions stay unrestricted');
  for (const invalid of [
    `update scenes set map_regions='{}'::jsonb where id=$1`,
    `update scenes set map_regions='[1]'::jsonb where id=$1`,
    `update scenes set context_metadata='[]'::jsonb where id=$1`,
    `update scenes set source_environment='[]'::jsonb where id=$1`,
  ]) await assert.rejects(db.query(invalid, [grandchildMap.scene_id]), invalid);
  for (const invalid of [
    `update chapters set map_metadata='[]'::jsonb where id=$1`,
    `update chapters set location_metadata='[]'::jsonb where id=$1`,
    `update chapters set source_environment='[]'::jsonb where id=$1`,
  ]) await assert.rejects(db.query(invalid, [rootMap.chapter_id]), invalid);

  const freeSceneIds = [freeChildMap.scene_id, blankNameMap.scene_id, negativeSortMap.scene_id];
  await db.query('delete from chapters where id=$1', [freeRootMap.chapter_id]);
  assert.equal(await count('scenes', 'chapter_id=$1', [freeRootMap.chapter_id]), 0, 'chapter deletion cascades its scenes');
  await db.exec(cutoverMigration);
  assert.equal(await count('chapters', 'id=$1', [freeRootMap.chapter_id]), 1, 'the mapping restores a deleted chapter under the same id');
  for (const sceneId of freeSceneIds) {
    assert.equal(await count('scenes', 'id=$1', [sceneId]), 1, `the mapping restores scene ${sceneId}`);
  }
  assert.equal((await row('select environment_id, chapter_id from scenes where id=$1', [freeChildMap.scene_id])).environment_id, freeChild);
  assert.deepEqual(await row('select chapter_id, scene_id from situations where environment_id=$1', [freeChild]),
    { chapter_id: freeRootMap.chapter_id, scene_id: freeChildMap.scene_id }, 'entity chapter and scene links are restored');
  assert.deepEqual((await db.query('select * from environment_narrative_mapping order by environment_id::text')).rows, firstMappings, 'self-healing keeps the mapping stable');
  assert.equal(await count('chapters'), 12);
  assert.equal(await count('scenes'), 11);
  assert.equal(await count('environment_narrative_mapping'), envCount);

  assert.equal((await row(`select relrowsecurity from pg_class where oid='public.environment_narrative_mapping'::regclass`)).relrowsecurity, true);
  assert.equal(await count('information_schema.role_table_grants', `table_name='environment_narrative_mapping' and grantee in ('anon','authenticated')`), 0);

  console.log('Environment cutover: PASS (roots, orphans, cycles, self-parent, cross-campaign, assignments, multiple roots, JSON shapes, self-healing, RLS, idempotence).');
} finally {
  await db.close();
}

function jsonType(result) {
  const [value] = Object.values(result);
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false, 'metadata columns must hold objects, never arrays');
  return Array.isArray(value) ? 'array' : 'object';
}
