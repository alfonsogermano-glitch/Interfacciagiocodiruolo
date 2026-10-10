import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = (n) => `30000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const owner = id(1), member = id(2), campaign = id(3), otherCampaign = id(4), chapter = id(5), otherChapter = id(6), environment = id(7), otherEnvironment = id(8), sceneA = id(9), sceneB = id(10);

async function asUser(userId, operation) {
  await db.exec('begin');
  try {
    await db.exec('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const result = await operation();
    await db.exec('commit');
    return result;
  } catch (error) { await db.exec('rollback'); throw error; }
}

try {
  await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to authenticated;
    create table campaigns(id uuid primary key, owner_profile_id text not null);
    create table chapters(id uuid primary key, campaign_id uuid not null references campaigns(id) on delete cascade);
    create table environments(id uuid primary key, campaign_id uuid not null references campaigns(id) on delete cascade);
    grant select on campaigns, chapters, environments to authenticated;
    insert into campaigns values ('${campaign}', '${owner}'), ('${otherCampaign}', '${member}');
    insert into chapters values ('${chapter}', '${campaign}'), ('${otherChapter}', '${otherCampaign}');
    insert into environments values ('${environment}', '${campaign}'), ('${otherEnvironment}', '${otherCampaign}');
  `);
  const migration = await readFile(new URL('../supabase/migrations/20261010130000_campaign_scenes.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);

  await asUser(owner, () => db.query(`insert into scenes(id,campaign_id,chapter_id,environment_id,title,sort_order) values($1,$2,$3,$4,'  Apertura  ',0)`, [sceneA, campaign, chapter, environment]));
  await asUser(owner, () => db.query(`insert into scenes(id,campaign_id,chapter_id,title,sort_order,status) values($1,$2,$3,'Confronto',1,'ready')`, [sceneB, campaign, chapter]));
  assert.equal((await asUser(owner, () => db.query('select title from scenes where id=$1', [sceneA]))).rows[0].title, 'Apertura');
  assert.equal((await asUser(member, () => db.query('select * from scenes'))).rows.length, 0, 'preparazione invisibile ai membri');
  await assert.rejects(asUser(member, () => db.query(`insert into scenes(campaign_id,chapter_id,title) values($1,$2,'Intrusione')`, [campaign, chapter])));
  await assert.rejects(asUser(owner, () => db.query(`insert into scenes(campaign_id,chapter_id,title) values($1,$2,'Campagna errata')`, [campaign, otherChapter])));
  await assert.rejects(asUser(owner, () => db.query(`insert into scenes(campaign_id,chapter_id,environment_id,title) values($1,$2,$3,'Luogo errato')`, [campaign, chapter, otherEnvironment])));
  await assert.rejects(asUser(owner, () => db.query('update scenes set next_scene_ids=$1 where id=$2', [[sceneB, sceneB], sceneA])));
  await assert.rejects(asUser(owner, () => db.query('update scenes set next_scene_ids=$1 where id=$2', [[sceneA], sceneA])));
  await asUser(owner, () => db.query('update scenes set next_scene_ids=$1 where id=$2', [[sceneB], sceneA]));
  await asUser(owner, () => db.query('delete from scenes where id=$1', [sceneB]));
  assert.deepEqual((await asUser(owner, () => db.query('select next_scene_ids from scenes where id=$1', [sceneA]))).rows[0].next_scene_ids, []);
  await db.query('delete from environments where id=$1', [environment]);
  assert.equal((await asUser(owner, () => db.query('select environment_id from scenes where id=$1', [sceneA]))).rows[0].environment_id, null);
  await db.query('delete from chapters where id=$1', [chapter]);
  assert.equal((await db.query('select count(*)::int count from scenes')).rows[0].count, 0);
  console.log('Scenes domain: PASS (RLS owner-only, campaign integrity, links, cleanup, ordering schema, idempotence).');
} finally { await db.close(); }
