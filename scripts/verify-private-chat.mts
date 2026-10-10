import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onlineCampaignParticipants } from '../src/services/realtime/campaignPresence';
import { belongsToPrivateThread, mergePrivateMessages, privateChatRow, isPrivateChatUnread, markPrivateChatSeen, readPrivateChatLastSeen, sendPrivateChatMessage, type PrivateChatMessage } from '../src/services/supabase/privateChatService';
import { uploadPrivateChatAttachment } from '../src/app/components/session/chatAttachments';
import { setPersistenceIdentity } from '../src/services/storage/persistenceMode';

const preferences = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => preferences.get(key) ?? null,
  setItem: (key: string, value: string) => preferences.set(key, value),
}, configurable: true });
Object.defineProperty(globalThis, 'window', { value: { dispatchEvent: () => true }, configurable: true });
const people = [
  { id: 'gm', name: 'GM', isGm: true },
  { id: 'alice', name: 'Alice', isGm: false },
  { id: 'bob', name: 'Bob', isGm: false },
];
assert.deepEqual(onlineCampaignParticipants(people, {
  tab1: [{ profileId: 'alice' }, { profileId: 'gm' }], tab2: [{ profileId: 'alice' }], outsider: [{ profileId: 'non-member' }], invalid: {},
}).map((person) => person.id), ['gm', 'alice']);
assert.equal(onlineCampaignParticipants(people, {}).length, 0);

const message = privateChatRow({ id: 'one', campaign_id: 'campaign', sender_id: 'alice', recipient_id: 'bob', sender_name: 'Alice', recipient_name: 'Bob', kind: 'message', content: 'privato', created_at: '2026-10-10T10:00:00Z' });
assert.equal(belongsToPrivateThread(message, 'alice', 'bob'), true);
assert.equal(belongsToPrivateThread(message, 'bob', 'alice'), true);
assert.equal(belongsToPrivateThread(message, 'gm', 'alice'), false);
assert.equal(isPrivateChatUnread(message, 'alice'), false);
assert.equal(isPrivateChatUnread(message, 'bob'), true);
markPrivateChatSeen('campaign', 'bob', 'alice', message.createdAt);
assert.equal(isPrivateChatUnread(message, 'bob'), false);
assert.equal(readPrivateChatLastSeen('campaign', 'carol', 'alice'), null);
markPrivateChatSeen('campaign', 'bob', 'alice', '2026-10-09T10:00:00Z');
assert.equal(readPrivateChatLastSeen('campaign', 'bob', 'alice'), message.createdAt);
const deleted: PrivateChatMessage = { ...message, content: '', deletedAt: '2026-10-10T10:01:00Z' };
assert.equal(mergePrivateMessages([message], [message]).length, 1);
assert.equal(mergePrivateMessages([deleted], [message])[0].deletedAt, deleted.deletedAt, 'risposta stale non resuscita messaggi');

setPersistenceIdentity('alice');
preferences.set('hsc_dashboard_settings:alice', JSON.stringify({ saveMode: 'local' }));
await assert.rejects(sendPrivateChatMessage({ campaignId: 'campaign', senderId: 'alice', recipientId: '10000000-0000-0000-0000-000000000002', content: 'non inviare' }), /Cloud/);
await assert.rejects(uploadPrivateChatAttachment({ file: new File(['test'], 'test.txt'), campaignId: 'campaign', senderId: 'alice', recipientId: 'bob' }), /Cloud/);

const service = readFileSync('src/services/supabase/privateChatService.ts', 'utf8');
const attachments = readFileSync('src/app/components/session/chatAttachments.ts', 'utf8');
assert.ok(!service.includes(".from('chat_messages')"), 'messaggi privati non devono finire nella timeline pubblica');
assert.ok(!service.includes("type: 'broadcast'"), 'nessun contenuto privato in broadcast');
assert.match(service, /event: 'INSERT'.*private_chat_messages/);
assert.match(service, /event: 'UPDATE'.*private_chat_messages/);
assert.doesNotMatch(service, /event: 'DELETE'/);
const privateResolver = attachments.slice(attachments.indexOf('if (attachment.bucket === PRIVATE_CHAT_BUCKET)'), attachments.indexOf("if (attachment.storage === 'local')"));
assert.match(privateResolver, /\.download\(attachment\.assetPath\)/);
assert.doesNotMatch(privateResolver, /getPublicUrl|fetch\(/);
console.log('Private chat client: PASS (presence dedup/filter, thread isolation, unread identity, stale-load deletion, Local-mode denial, authenticated downloads, no public broadcast).');
