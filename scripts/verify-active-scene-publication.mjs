import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = n => `41000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const owner = id(1), member = id(2), outsider = id(3), campaign = id(4);

async function asUser(userId, operation) {
  await db.exec('begin');
  try {
    await db.exec('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const result = await operation();
    await db.exec('commit');
    return result;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}

const publication = {
  id: id(5), campaignId: campaign, sceneId: id(6), chapterId: id(7),
  title: 'Deposito notturno', description: 'La luce filtra dalle assi.',
  chapterTitle: 'Manicomio di Arkham', mapUrl: 'https://maps.example/arkham.png',
  sceneImageUrl: null,
  mapMetadata: { imageUrl: 'https://maps.example/arkham.png', gridVisible: true, gridColumns: 20, gridRows: 20 },
  mapRegions: [{ id: id(8), label: 'Deposito', color: '#f59e0b', geometry: { kind: 'rect', rect: { x: 10, y: 10, width: 20, height: 20 } } }],
  contextMetadata: { timeOfDay: 'Notte', period: '', condition: '' },
  publishedAt: new Date().toISOString(),
};

try {
  await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table campaigns(id uuid primary key, owner_profile_id text not null);
    create table campaign_members(campaign_id uuid not null references campaigns(id), profile_id text not null);
    create table campaign_documents(campaign_id uuid not null references campaigns(id), document_key text not null, payload jsonb not null, updated_at timestamptz not null default now(), primary key(campaign_id, document_key));
    alter table campaign_documents enable row level security;
    grant usage on schema public, auth to authenticated;
    grant select on campaigns, campaign_members to authenticated;
    grant select, insert, update, delete on campaign_documents to authenticated;
    create policy campaign_documents_owner on campaign_documents for all to authenticated
      using (exists(select 1 from campaigns c where c.id=campaign_id and c.owner_profile_id=auth.uid()::text))
      with check (exists(select 1 from campaigns c where c.id=campaign_id and c.owner_profile_id=auth.uid()::text));
    insert into campaigns values ('${campaign}', '${owner}');
    insert into campaign_members values ('${campaign}', '${member}');
  `);

  const migration = await readFile(new URL('../supabase/migrations/20261011100000_active_scene_publication.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);

  await asUser(owner, () => db.query('insert into campaign_documents(campaign_id,document_key,payload) values($1,$2,$3)', [campaign, 'active-scene', publication]));
  await asUser(owner, () => db.query('insert into campaign_documents(campaign_id,document_key,payload) values($1,$2,$3)', [campaign, 'combat', { secret: true }]));

  const memberRows = await asUser(member, () => db.query('select document_key,payload from campaign_documents order by document_key'));
  assert.deepEqual(memberRows.rows.map(row => row.document_key), ['active-scene'], 'il membro legge solo active-scene');
  assert.equal(memberRows.rows[0].payload.title, publication.title);
  assert.equal('notes' in memberRows.rows[0].payload, false, 'nessuna nota GM nello snapshot');
  assert.equal((await asUser(outsider, () => db.query('select * from campaign_documents'))).rows.length, 0, 'estraneo isolato');
  assert.equal((await asUser(owner, () => db.query('select * from campaign_documents'))).rows.length, 2, 'owner legge tutti i documenti');

  await asUser(member, () => db.query('update campaign_documents set payload=$1 where campaign_id=$2 and document_key=$3', [{ ...publication, title: 'Contraffatta' }, campaign, 'active-scene']));
  assert.equal((await asUser(owner, () => db.query("select payload->>'title' title from campaign_documents where campaign_id=$1 and document_key='active-scene'", [campaign]))).rows[0].title, publication.title, 'il membro non aggiorna lo snapshot');
  await asUser(member, () => db.query('delete from campaign_documents where campaign_id=$1 and document_key=$2', [campaign, 'active-scene']));
  assert.equal((await asUser(owner, () => db.query("select count(*)::int count from campaign_documents where campaign_id=$1 and document_key='active-scene'", [campaign]))).rows[0].count, 1, 'il membro non elimina lo snapshot');
  await assert.rejects(asUser(owner, () => db.query('update campaign_documents set payload=$1 where campaign_id=$2 and document_key=$3', [{ ...publication, notes: 'Segreto GM' }, campaign, 'active-scene'])));
  await assert.rejects(asUser(owner, () => db.query('update campaign_documents set payload=$1 where campaign_id=$2 and document_key=$3', [{ title: 'Incompleta' }, campaign, 'active-scene'])));

  await asUser(owner, () => db.query('delete from campaign_documents where campaign_id=$1 and document_key=$2', [campaign, 'active-scene']));
  assert.equal((await asUser(member, () => db.query('select * from campaign_documents'))).rows.length, 0, 'rimozione pubblicazione visibile');
  console.log('Active scene publication: PASS (snapshot pubblico sanitizzato, member read-only, documenti privati isolati, idempotenza).');
} finally {
  await db.close();
}
