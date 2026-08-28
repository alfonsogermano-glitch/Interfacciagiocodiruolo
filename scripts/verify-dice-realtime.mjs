import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const registry = read('src/services/realtime/campaignChannel.ts');
const session = read('src/app/components/session/dice/DiceSessionContext.tsx');
const historyCard = read('src/app/components/session/dice/DiceRollHistoryCard.tsx');
const helperPath = new URL('../src/services/realtime/diceRealtime.ts', import.meta.url);
const helper = fs.existsSync(helperPath) ? fs.readFileSync(helperPath, 'utf8') : '';
const relayPath = new URL('../supabase/functions/dice-secret-roll/index.ts', import.meta.url);
const relay = fs.existsSync(relayPath) ? fs.readFileSync(relayPath, 'utf8') : '';

for (const event of ['INSERT', 'UPDATE', 'DELETE', 'session_change', 'members_change', 'notes_change', 'dice_roll']) {
  assert.ok(registry.includes(`'${event}'`), `campaignChannel missing event ${event}`);
}
assert.ok(registry.includes('const registry = new Map'), 'campaign channel registry/ref-count architecture must remain');
assert.ok(registry.includes('refCount'), 'campaign channel refCount must remain');
assert.ok(registry.includes('useCampaignChannel'), 'public rolls must reuse useCampaignChannel');

assert.ok(helper.includes('dice-secret-roll'), 'secret helper must call the authenticated relay Edge Function');
assert.ok(helper.includes('Authorization'), 'secret helper must authenticate the relay request');
assert.ok(helper.includes('isRollResultPayload'), 'remote payloads must be validated');
assert.ok(!helper.includes('dice-gm:'), 'player clients must not open a secret GM realtime topic');
assert.ok(!helper.includes("httpSend('dice_roll'"), 'player clients must not broadcast secret payloads directly');

assert.ok(relay.includes(".from('campaigns')"), 'relay must resolve the campaign owner');
assert.ok(relay.includes(".from('campaign_members')"), 'relay must verify player membership');
assert.ok(relay.includes("result.visibility !== 'secret'"), 'relay must reject non-secret payloads');
assert.ok(relay.includes('result.rollerId !== user.id'), 'relay must bind roller identity to JWT user');
assert.ok(relay.includes('ownerProfileId === user.id'), 'relay must reject GM secret network sends');
assert.ok(relay.includes('profile:${ownerProfileId}'), 'relay must target only the GM personal realtime topic');
assert.ok(relay.includes("httpSend('dice_roll', result)"), 'relay must broadcast the canonical result to the GM');
assert.ok(!/\.from\(['\"]dice_(roll|history|results)/.test(relay), 'relay must not persist roll results');

assert.ok(session.includes('useCampaignChannel'), 'DiceSessionContext must receive/send public campaign rolls');
assert.ok(session.includes('useRealtimeChannel'), 'DiceSessionContext must subscribe to the GM personal topic');
assert.ok(session.includes('profile:${user.id}'), 'GM secret reception must use the current GM personal topic');
assert.ok(session.includes("dice_roll"), 'DiceSessionContext must handle dice_roll');
assert.ok(session.includes('sendSecretRollToGm'), 'DiceSessionContext must route secret player rolls privately');
assert.ok(session.includes('activeCampaign?.ownerId === user?.id'), 'DiceSessionContext must derive GM role from campaign owner');
assert.ok(session.includes("visibility === 'public'"), 'public transport must enforce public visibility');
assert.ok(session.includes("visibility === 'secret'"), 'secret transport must enforce secret visibility');
assert.ok(session.includes('seenRollIds'), 'DiceSessionContext must deduplicate by result id');

const clearStart = session.indexOf('const clearLocalHistory = useCallback(() => {');
const clearEnd = clearStart >= 0 ? session.indexOf('\n  }, [', clearStart) : -1;
const clearBody = clearStart >= 0 && clearEnd > clearStart ? session.slice(clearStart, clearEnd) : '';
assert.ok(clearBody, 'clearLocalHistory implementation not found');
assert.ok(clearBody.includes('setEntries([])'), 'Clear must erase only this client session ledger');
assert.ok(!/(sendSecretRollToGm|publicChannel\.send|httpSend|supabase)/.test(clearBody), 'Clear must remain local-only');

assert.ok(historyCard.includes('EyeOff'), 'secret history cards must use the EyeOff icon');
assert.ok(historyCard.includes("result.visibility === 'secret'"), 'secret indicator must be visibility-driven');
assert.ok(historyCard.includes('Segreto'), 'secret history cards must be labeled Segreto');

console.log('Dice realtime verification passed.');
