import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { build } from 'esbuild';

const db = new PGlite();
const campaign = '20000000-0000-0000-0000-000000000001';
const chapter = '20000000-0000-0000-0000-000000000002';
const linked = ['characters', 'npcs', 'monsters', 'environments', 'clues', 'situations'];

try {
  await db.exec(`
    create table campaigns(id uuid primary key);
    create table adventures(
      id uuid constraint adventures_pkey primary key,
      campaign_id uuid constraint adventures_campaign_id_fkey references campaigns(id) on delete cascade,
      title text not null, description text, notes text, created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create index idx_adventures_campaign on adventures(campaign_id);
    insert into campaigns values ('${campaign}');
    insert into adventures(id, campaign_id, title, description, notes) values ('${chapter}', '${campaign}', 'Prologo', 'Descrizione', 'Segreto');
  `);
  for (const table of linked) {
    await db.exec(`
      create table ${table}(
        id uuid primary key default gen_random_uuid(),
        adventure_id uuid constraint ${table}_adventure_id_fkey references adventures(id) on delete set null
      );
      create index idx_${table}_adventure on ${table}(adventure_id);
      insert into ${table}(adventure_id) values ('${chapter}');
    `);
  }

  const migration = await readFile(new URL('../supabase/migrations/20261010120000_chapters_domain_rename.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);

  assert.equal((await db.query("select to_regclass('public.adventures') as legacy")).rows[0].legacy, null);
  const row = (await db.query('select * from chapters where id=$1', [chapter])).rows[0];
  assert.equal(row.title, 'Prologo');
  assert.equal(row.kind, 'standard');
  assert.equal(row.is_active, false);
  assert.deepEqual(row.next_chapter_ids, []);

  for (const table of linked) {
    const columns = await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name=$1`, [table]);
    assert.ok(columns.rows.some((item) => item.column_name === 'chapter_id'), `${table}.chapter_id mancante`);
    assert.ok(!columns.rows.some((item) => item.column_name === 'adventure_id'), `${table}.adventure_id ancora presente`);
  }

  await db.query('delete from chapters where id=$1', [chapter]);
  for (const table of linked) {
    assert.equal((await db.query(`select chapter_id from ${table}`)).rows[0].chapter_id, null, `${table}: ON DELETE SET NULL perso`);
  }
  console.log('Chapters domain migration: PASS (rename, UUID/data preservation, links, defaults, idempotence).');
} finally {
  await db.close();
}

const unit = await build({
  entryPoints: ['scripts/verify-chapters-domain.mts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
await import(`data:text/javascript;base64,${Buffer.from(unit.outputFiles[0].text).toString('base64')}`);
