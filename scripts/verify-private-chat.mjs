import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';

// Esegue davvero SQL, trigger, privilegi di colonna e RLS su PostgreSQL
// embedded. Non usa il database di produzione né credenziali privilegiate.
const db = new PGlite();
const ids = Object.fromEntries(['alice', 'bob', 'carol', 'gm', 'outsider', 'campaign', 'otherCampaign'].map((name, i) => [name, `10000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`]));
await db.exec(`
  create role authenticated; create role anon;
  create schema auth; create schema storage;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth, storage to authenticated, anon;
  create table public.campaigns(id uuid primary key, owner_profile_id text not null, deleted_at timestamptz);
  create table public.campaign_members(campaign_id uuid, profile_id text);
  create table public.profiles(id uuid primary key, display_name text, avatar_url text);
  create publication supabase_realtime;
  create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
  alter table storage.objects enable row level security;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant select on storage.objects to anon;
  -- Simula una policy preesistente troppo ampia: le guardie restrittive
  -- devono proteggere comunque il nuovo bucket privato.
  create policy unrelated_broad_read on storage.objects for select to public using (true);
  create policy unrelated_broad_insert on storage.objects for insert to authenticated with check (true);
  create policy unrelated_broad_update on storage.objects for update to authenticated using (true) with check (true);
  create policy unrelated_broad_delete on storage.objects for delete to authenticated using (true);
`);
for (const name of ['alice', 'bob', 'carol', 'gm', 'outsider']) {
  await db.query('insert into profiles values ($1,$2,$3)', [ids[name], name, `${name}.png`]);
}
await db.query('insert into campaigns values ($1,$2,null),($3,$4,null)', [ids.campaign, ids.gm, ids.otherCampaign, ids.outsider]);
for (const name of ['alice', 'bob', 'carol']) await db.query('insert into campaign_members values ($1,$2)', [ids.campaign, ids[name]]);
const migration = await readFile(new URL('../supabase/migrations/20261010100000_private_campaign_chat.sql', import.meta.url), 'utf8');
await db.exec(migration);
await db.exec(migration); // Idempotenza su tabelle/policy/trigger esistenti.
assert.equal((await db.query("select count(*)::int as count from pg_publication_tables where pubname='supabase_realtime' and tablename='private_chat_messages'")).rows[0].count, 1);
assert.equal((await db.query("select public from storage.buckets where id='private-chat-attachments'")).rows[0].public, false);
await db.exec("insert into storage.buckets(id,name,public) values('existing-public','existing-public',true); insert into storage.objects(bucket_id,name) values('existing-public','unchanged.png')");

async function asUser(name, operation, role = 'authenticated') {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [name ? ids[name] : '']);
    const result = await operation();
    await db.exec('commit');
    return result;
  } catch (error) { await db.exec('rollback'); throw error; }
}
const send = (sender, recipient, content = 'segreto', attachment) => db.query(`
  insert into private_chat_messages(campaign_id,sender_id,recipient_id,sender_name,kind,content,payload)
  values($1,$2,$3,'nome contraffatto',$4,$5,$6) returning *`,
  [ids.campaign, ids[sender], ids[recipient], attachment ? 'attachment' : 'message', content, attachment ? { attachment } : null]);
const countMessages = () => db.query('select * from private_chat_messages');
const path = `${ids.campaign}/${ids.alice}/${ids.bob}/test.png`;
const objectCount = () => db.query("select * from storage.objects where bucket_id='private-chat-attachments'");

try {
  const members = await asUser('alice', () => db.query('select * from private_chat_participants($1)', [ids.campaign]));
  assert.equal(members.rows.length, 4);
  assert.equal(members.rows.find((row) => row.profile_id === ids.gm).is_gm, true);
  assert.equal((await asUser('outsider', () => db.query('select * from private_chat_participants($1)', [ids.campaign]))).rows.length, 0);
  await assert.rejects(asUser(null, () => db.query('select * from private_chat_participants($1)', [ids.campaign]), 'anon'));

  const message = (await asUser('alice', () => send('alice', 'bob'))).rows[0];
  assert.equal(message.sender_name, 'alice', 'nome ricavato dal profilo, non dal client');
  assert.equal((await asUser('bob', countMessages)).rows.length, 1);
  assert.equal((await asUser('alice', countMessages)).rows.length, 1);
  assert.equal((await asUser('carol', countMessages)).rows.length, 0);
  assert.equal((await asUser('gm', countMessages)).rows.length, 0, 'il GM non legge i privati degli altri');
  assert.equal((await asUser('outsider', countMessages)).rows.length, 0);
  await assert.rejects(asUser(null, countMessages, 'anon'));
  await assert.rejects(asUser('carol', () => send('alice', 'bob')), 'mittente impersonato');
  await assert.rejects(asUser('alice', () => send('alice', 'outsider')), 'destinatario non membro');
  await assert.rejects(asUser('outsider', () => send('outsider', 'alice')), 'mittente non membro');
  await assert.rejects(asUser('alice', () => send('alice', 'alice')), 'messaggio a sé stessi');
  await assert.rejects(asUser('alice', () => db.query('update private_chat_messages set recipient_id=$1 where id=$2', [ids.carol, message.id])), 'destinatario immutabile');

  await asUser('alice', () => db.query("insert into storage.objects(bucket_id,name) values('private-chat-attachments',$1)", [path]));
  assert.equal((await asUser('bob', objectCount)).rows.length, 1);
  assert.equal((await asUser('alice', objectCount)).rows.length, 1);
  for (const name of ['carol', 'gm', 'outsider']) assert.equal((await asUser(name, objectCount)).rows.length, 0);
  assert.equal((await asUser(null, objectCount, 'anon')).rows.length, 0, 'policy broad non rende pubblico il file');
  assert.equal((await asUser(null, () => db.query("select * from storage.objects where bucket_id='existing-public'"), 'anon')).rows.length, 1, 'gli altri bucket mantengono le proprie policy');
  await assert.rejects(asUser('bob', () => db.query("insert into storage.objects(bucket_id,name) values('private-chat-attachments',$1)", [path.replace('test.png', 'forged.png')])), 'upload nello spazio del mittente altrui');
  assert.equal((await asUser('alice', () => db.query('update storage.objects set name=$1 where name=$2 returning id', [path.replace('test.png', 'overwrite.png'), path]))).rows.length, 0, 'file non sovrascrivibile');
  assert.equal((await asUser('bob', () => db.query('delete from storage.objects where name=$1 returning id', [path]))).rows.length, 0, 'destinatario non cancella i file del mittente');

  const attachment = { bucket: 'private-chat-attachments', assetPath: path, storage: 'cloud', fileName: 'test.png', display: 'image', size: 10, contentType: 'image/png' };
  const fileMessage = (await asUser('alice', () => send('alice', 'bob', '', attachment))).rows[0];
  assert.equal(fileMessage.payload.attachment.assetPath, path);
  await assert.rejects(asUser('alice', () => send('alice', 'bob', '', { ...attachment, bucket: 'chat-attachments' })), 'allegato pubblico vietato');
  await assert.rejects(asUser('alice', () => send('alice', 'carol', '', attachment)), 'file di una conversazione diversa');
  await assert.rejects(asUser('alice', () => send('alice', 'bob', '', { ...attachment, assetPath: path.replace('test.png', 'missing.png') })), 'asset inesistente');

  assert.equal((await asUser('bob', () => db.query('update private_chat_messages set deleted_at=now() where id=$1 returning id', [message.id]))).rows.length, 0);
  assert.equal((await asUser('gm', () => db.query('update private_chat_messages set deleted_at=now() where id=$1 returning id', [message.id]))).rows.length, 0);
  await asUser('alice', () => db.query('update private_chat_messages set deleted_at=now() where id=$1', [message.id]));
  const deleted = (await asUser('bob', () => db.query('select * from private_chat_messages where id=$1', [message.id]))).rows[0];
  assert.ok(deleted.deleted_at); assert.equal(deleted.content, ''); assert.equal(deleted.payload, null);
  assert.equal((await asUser('alice', () => db.query('update private_chat_messages set deleted_at=null where id=$1 returning id', [message.id]))).rows.length, 0);
  const gmMessage = (await asUser('gm', () => send('gm', 'bob', 'messaggio dal GM'))).rows[0];
  assert.equal((await asUser('gm', countMessages)).rows[0].id, gmMessage.id, 'GM vede soltanto la propria conversazione');

  await db.query('delete from campaign_members where campaign_id=$1 and profile_id=$2', [ids.campaign, ids.bob]);
  assert.equal((await asUser('bob', countMessages)).rows.length, 0, 'membro rimosso perde accesso');
  assert.equal((await asUser('bob', objectCount)).rows.length, 0);
  await assert.rejects(asUser('alice', () => send('alice', 'bob')), 'nessun nuovo messaggio a membro rimosso');
  assert.equal((await asUser('alice', () => db.query('delete from storage.objects where name=$1 returning id', [path]))).rows.length, 1, 'mittente può pulire il file anche dopo rimozione destinatario');
  await db.query('update campaigns set deleted_at=now() where id=$1', [ids.campaign]);
  assert.equal((await asUser('alice', countMessages)).rows.length, 0, 'campagna cancellata revoca accesso');
  console.log('Private chat PostgreSQL RLS: PASS (pair-only, GM isolation, private storage guards, forged sender/asset denial, deletion, membership revocation, idempotence).');
} finally { await db.close(); }

const unit = await build({
  entryPoints: ['scripts/verify-private-chat.mts'], bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'isolated-client', setup(builder) {
    builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'test-client', namespace: 'private-chat-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'private-chat-test' }, () => ({ contents: 'export const supabase = null;', loader: 'js' }));
  } }],
});
await import(`data:text/javascript;base64,${Buffer.from(unit.outputFiles[0].text).toString('base64')}`);
