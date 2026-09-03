import assert from 'node:assert/strict';
import fs from 'node:fs';
function read(path){return fs.readFileSync(new URL(`../${path}`, import.meta.url),'utf8')}
const context=read('src/app/components/session/dice/DiceAppearanceContext.tsx');
const session=read('src/app/components/session/dice/DiceSessionContext.tsx');
assert.ok(context.includes('useAuth()') && context.includes('useCampaign()'));
assert.ok(context.includes('buildDefaultStandardDiceStyles') && context.includes('completeStandardDiceStyles'));
assert.ok(context.includes('loadStandardDiceStyles(campaignId, ownerProfileId)'));
assert.ok(context.includes('saveStandardDiceStyles(campaignId, ownerProfileId, completed)'));
assert.ok(session.includes('useDiceAppearance()'),'session must consume appearance context');
assert.ok(session.includes('<DiceAppearanceProvider>') && session.includes('<DiceSessionProviderBody>'),'appearance provider must wrap the dice session body');
console.log('verify-dice-appearance-context: PASS');
