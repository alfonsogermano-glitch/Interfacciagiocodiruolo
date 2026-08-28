import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const registry = read('src/services/realtime/campaignChannel.ts');
const session = read('src/app/components/session/dice/DiceSessionContext.tsx');
const helperPath = new URL('../src/services/realtime/diceRealtime.ts', import.meta.url);
const helper = fs.existsSync(helperPath) ? fs.readFileSync(helperPath, 'utf8') : '';

for (const event of ['INSERT', 'UPDATE', 'DELETE', 'session_change', 'members_change', 'notes_change', 'dice_roll']) {
  assert.ok(registry.includes(`'${event}'`), `campaignChannel missing event ${event}`);
}
assert.ok(registry.includes('const registry = new Map'), 'campaign channel registry/ref-count architecture must remain');
assert.ok(registry.includes('refCount'), 'campaign channel refCount must remain');
assert.ok(registry.includes('useCampaignChannel'), 'public rolls must reuse useCampaignChannel');

assert.ok(helper.includes('dice-gm:${campaignId}'), 'secret helper must target dice-gm:{campaignId}');
assert.ok(helper.includes('private: true'), 'secret helper channel must be private');
assert.ok(helper.includes("httpSend('dice_roll', result)"), 'secret helper must use httpSend');
assert.ok(helper.includes('removeChannel(channel)'), 'secret send-only channel must always be removed');
assert.ok(!/sendSecretRollToGm[\s\S]*?\.subscribe\(/.test(helper), 'secret send helper must never subscribe');
assert.ok(helper.includes('isRollResultPayload'), 'remote payloads must be validated');

assert.ok(session.includes('useCampaignChannel'), 'DiceSessionContext must receive/send public campaign rolls');
assert.ok(session.includes('useRealtimeChannel'), 'DiceSessionContext must subscribe to GM private topic');
assert.ok(session.includes("dice_roll"), 'DiceSessionContext must handle dice_roll');
assert.ok(session.includes('sendSecretRollToGm'), 'DiceSessionContext must route secret player rolls privately');
assert.ok(session.includes('activeCampaign?.ownerId === user?.id'), 'DiceSessionContext must derive GM role from campaign owner');
assert.ok(session.includes("visibility === 'public'"), 'public transport must enforce public visibility');
assert.ok(session.includes("visibility === 'secret'"), 'secret transport must enforce secret visibility');
assert.ok(session.includes('seenRollIds'), 'DiceSessionContext must deduplicate by result id');

const clearBody = session.match(/const clearLocalHistory[\s\S]*?\n  }, \[\]\);/)?.[0] ?? '';
assert.ok(clearBody, 'clearLocalHistory implementation not found');
assert.ok(!/(send|httpSend|supabase)/.test(clearBody), 'Clear must remain local-only');

console.log('Dice realtime verification passed.');