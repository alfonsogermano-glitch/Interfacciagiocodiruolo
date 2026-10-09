import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { contentFetch } from '../src/services/storage/contentFetch.ts';
import { setPersistenceIdentity, persistenceKey } from '../src/services/storage/persistenceMode.ts';
import { withLocalContent } from '../src/services/storage/localContentStore.ts';
import { isRulesetCompatible, RULESETS, VISIBLE_RULESETS } from '../src/app/campaigns/campaignTypes.ts';

const preferences = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => preferences.get(key) ?? null,
  setItem: (key: string, value: string) => preferences.set(key, value),
}, configurable: true });
const calls: Request[] = [];
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init); calls.push(request);
  return Response.json({ remote: true });
};
const client = createClient('https://selected-storage.supabase.co', 'test-key', {
  global: { fetch: contentFetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const selectMode = (owner: string, mode: 'local' | 'cloud') => {
  setPersistenceIdentity(owner);
  localStorage.setItem(`hsc_dashboard_settings:${owner}`, JSON.stringify({ saveMode: mode }));
};
selectMode('alice', 'local');

async function api(path: string, method = 'GET', body?: unknown) {
  const response = await contentFetch(`https://selected-storage.supabase.co/functions/v1/make-server-771c5bfd/${path}`, {
    method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
  const result = await response.json();
  assert.equal(response.ok, true, JSON.stringify(result));
  return result;
}

// Campaign CRUD, rich note content, sub-tabs, folders and trash use the same
// persistent archive as direct Supabase queries, without a remote request.
const campaign = (await api('campaigns', 'POST', { name: 'Local campaign' })).campaign;
assert.equal((await api('campaigns')).campaigns[0].id, campaign.id);

// Campagna personalizzata: conserva l'identità custom e nasce senza entità,
// note o librerie dadi. Compatibilità indipendente dall'utente proprietario.
assert.ok(VISIBLE_RULESETS.some((ruleset) => ruleset.id === 'custom'));
const customCampaign = (await api('campaigns', 'POST', { name: '  Pagina bianca  ', description: 'Senza regole', ruleset: 'custom' })).campaign;
assert.equal(customCampaign.name, 'Pagina bianca');
assert.equal(customCampaign.description, 'Senza regole');
assert.equal(customCampaign.ruleset, 'custom');
await withLocalContent('alice', false, (tables) => {
  for (const table of ['characters', 'npcs', 'monsters', 'entity_notes', 'dice_formulas', 'dice_custom_dice', 'dice_formula_folders']) {
    assert.equal((tables[table] ?? []).filter((row) => row.campaign_id === customCampaign.id).length, 0, `${table} precompilato nella campagna custom`);
  }
});
for (const ruleset of Object.keys(RULESETS)) {
  assert.equal(isRulesetCompatible(ruleset as keyof typeof RULESETS, null, 'custom'), ruleset === 'custom');
  assert.equal(isRulesetCompatible('custom', null, ruleset as keyof typeof RULESETS), ruleset === 'custom');
}
await api(`campaigns/${customCampaign.id}`, 'DELETE');
const folder = (await api(`campaigns/${campaign.id}/folders`, 'POST', { entityType: 'campaignnotes', name: 'Folder' })).folder;
const note = (await api(`campaigns/${campaign.id}/notes`, 'POST', { entityType: 'campaign', entityId: campaign.id, tabName: 'Test', folderId: folder.id })).note;
const rich = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Persisted' }] }] };
await api(`notes/${note.id}`, 'PUT', { content: 'Persisted', contentRich: rich });
const loaded = (await api(`campaigns/${campaign.id}/notes?entityType=campaign&entityId=${campaign.id}`)).notes[0];
assert.deepEqual(loaded.content_rich, rich);
await api(`notes/${note.id}`, 'DELETE');
assert.equal((await api(`campaigns/${campaign.id}/trash`)).notes.length, 1);
await api(`notes/${note.id}/restore`, 'POST');
assert.equal((await api(`campaigns/${campaign.id}/trash`)).notes.length, 0);
await api(`notes/${note.id}/purge`, 'DELETE');
assert.equal((await api(`campaigns/${campaign.id}/notes?entityType=campaign&entityId=${campaign.id}`)).notes.length, 0);

for (const table of ['characters', 'npcs', 'monsters', 'environments', 'clues', 'situations', 'adventures', 'equipment_catalog', 'character_equipment', 'dice_formulas', 'dice_custom_dice', 'image_assets', 'campaign_documents']) {
  const id = crypto.randomUUID();
  const inserted = await client.from(table).insert({ id, campaign_id: campaign.id, name: table }).select('*').single();
  assert.equal(inserted.error, null, JSON.stringify(inserted.error)); assert.equal(inserted.data.id, id);
  const updated = await client.from(table).update({ name: 'Updated' }).eq('id', id).select('*').single();
  assert.equal(updated.error, null); assert.equal(updated.data.name, 'Updated');
  const queried = await client.from(table).select('*', { count: 'exact' }).or(`campaign_id.eq.${campaign.id},campaign_id.is.null`).order('created_at');
  assert.equal(queried.error, null); assert.equal(queried.count, 1);
  assert.equal((await client.from(table).delete().eq('id', id)).error, null);
  assert.equal((await client.from(table).select('*')).data?.length, 0);
}

// Documenti campagna (mappa/combat/incontro): upsert con onConflict e
// lettura mirata per coppia (campagna, chiave).
const docKey = 'combat';
const absent = await client.from('campaign_documents').select('payload').eq('campaign_id', campaign.id).eq('document_key', docKey).maybeSingle();
assert.equal(absent.error, null); assert.equal(absent.data, null);
await client.from('campaign_documents').upsert({ campaign_id: campaign.id, document_key: docKey, payload: { round: 1 } }, { onConflict: 'campaign_id,document_key' });
const firstDoc = await client.from('campaign_documents').select('payload').eq('campaign_id', campaign.id).eq('document_key', docKey).maybeSingle();
assert.deepEqual(firstDoc.data.payload, { round: 1 });
await client.from('campaign_documents').upsert({ campaign_id: campaign.id, document_key: docKey, payload: { round: 2 } }, { onConflict: 'campaign_id,document_key' });
const secondDoc = await client.from('campaign_documents').select('payload').eq('campaign_id', campaign.id).eq('document_key', docKey).maybeSingle();
assert.equal(secondDoc.data.payload.round, 2);
assert.equal((await client.from('campaign_documents').select('*')).data?.length, 1);
await client.from('campaign_documents').delete().eq('campaign_id', campaign.id).eq('document_key', docKey);
assert.equal((await client.from('campaign_documents').select('*')).data?.length, 0);

const rollId = crypto.randomUUID();
assert.equal((await client.from('chat_messages').upsert({ id: rollId, campaign_id: campaign.id, kind: 'roll', content: 'd6', payload: { total: 3 } }, { onConflict: 'id', ignoreDuplicates: true }).select('created_at').maybeSingle()).error, null);
await client.from('chat_messages').upsert({ id: rollId, kind: 'roll', content: 'must not overwrite' }, { onConflict: 'id', ignoreDuplicates: true });
const history = await client.from('chat_messages').select('*').eq('campaign_id', campaign.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
assert.equal(history.data.content, 'd6'); assert.equal(history.data.payload.total, 3);
assert.equal((await client.from('chat_messages').select('*').eq('id', 'missing').maybeSingle()).data, null);

const diceFolder = await client.rpc('create_dice_formula_folder', { p_campaign_id: campaign.id, p_owner_profile_id: 'alice', p_name: 'Dice', p_parent_folder_id: null });
assert.equal(diceFolder.error, null);
const formulaId = crypto.randomUUID();
await client.from('dice_formulas').insert({ id: formulaId, campaign_id: campaign.id, owner_profile_id: 'alice', folder_id: null, sort_order: 0 });
assert.equal((await client.rpc('move_dice_library_node', { p_node_type: 'formula', p_node_id: formulaId, p_destination_folder_id: diceFolder.data.id, p_destination_index: 0 })).error, null);
assert.equal((await client.from('dice_formulas').select('*').eq('id', formulaId).single()).data.folder_id, diceFolder.data.id);
await client.rpc('delete_dice_formula_folder', { p_folder_id: diceFolder.data.id, p_delete_contents: false });
assert.equal((await client.from('dice_formulas').select('*').eq('id', formulaId).single()).data.folder_id, null);

// Atomic transactions preserve concurrent writes and survive new clients.
await Promise.all(Array.from({ length: 25 }, (_, i) => client.from('chat_messages').insert({ id: crypto.randomUUID(), campaign_id: campaign.id, content: `message-${i}` })));
assert.equal((await client.from('chat_messages').select('*')).data?.length, 26);
const anotherClient = createClient('https://selected-storage.supabase.co', 'test-key', { global: { fetch: contentFetch }, auth: { persistSession: false, autoRefreshToken: false } });
assert.equal((await anotherClient.from('chat_messages').select('*')).data?.length, 26);

// Account isolation and no implicit cloud fallback.
const aliceKey = persistenceKey('cache');
selectMode('bob', 'local');
assert.notEqual(persistenceKey('cache'), aliceKey);
assert.equal((await api('campaigns')).campaigns.length, 0);
assert.equal((await client.from('chat_messages').select('*')).data?.length, 0);
assert.equal(calls.length, 0);
const unsupported = await contentFetch('https://selected-storage.supabase.co/functions/v1/make-server-771c5bfd/campaigns/join', { method: 'POST', body: JSON.stringify({ code: 'ABC' }) });
assert.equal(unsupported.ok, false); assert.equal(calls.length, 0);
await assert.rejects(withLocalContent('bob', true, (tables) => { tables.chat_messages = [{ id: 'should-abort' }]; throw new Error('failure'); }));
assert.equal((await client.from('chat_messages').select('*')).data?.length, 0);

// Cloud forwards the original method/body; administrative account data remains
// online even in Local mode (never forged in the local archive).
selectMode('alice', 'cloud');
await contentFetch('https://selected-storage.supabase.co/rest/v1/chat_messages', { method: 'POST', body: '{"content":"cloud"}' });
assert.equal(calls.length, 1); assert.equal(calls[0].method, 'POST'); assert.equal(await calls[0].text(), '{"content":"cloud"}');
selectMode('alice', 'local');
await contentFetch('https://selected-storage.supabase.co/rest/v1/rpc/admin_set_user_role', { method: 'POST', body: '{}' });
assert.equal(calls.length, 2);
assert.equal((await client.from('chat_messages').select('*')).data?.length, 26);
console.log('Selected storage: PASS (CRUD, rich notes/trash, dice RPC, idempotent rolls, concurrent transactions, reopen, account/mode isolation, no cloud fallback).');
