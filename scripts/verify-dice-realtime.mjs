import assert from 'node:assert/strict';import fs from 'node:fs';const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const session=read('src/app/components/session/dice/DiceSessionContext.tsx'),helper=read('src/services/realtime/diceRealtime.ts'),relay=read('supabase/functions/dice-secret-roll/index.ts'),card=read('src/app/components/session/dice/DiceRollHistoryCard.tsx');
assert.ok(helper.includes('dice-secret-roll'));assert.ok(helper.includes('Authorization'));assert.ok(helper.includes('isRollResultPayload'));assert.ok(!helper.includes("httpSend('dice_roll'"));
for(const token of ['keepMatched','groupItemId','scope','customFace','isNullableFinite']){assert.ok(helper.includes(token),`client missing ${token}`);assert.ok(relay.includes(token),`relay missing ${token}`)}
for(const token of [".from('campaigns')",".from('campaign_members')","result.visibility !== 'secret'",'result.rollerId !== user.id','ownerProfileId === user.id','profile:${ownerProfileId}',"httpSend('dice_roll', result)"]) assert.ok(relay.includes(token),`relay missing ${token}`);
for(const token of ['useCampaignChannel','useRealtimeChannel','profile:${user.id}',"dice_roll",'sendSecretRollToGm','activeCampaign?.ownerId===user?.id',"visibility==='public'","visibility==='secret'",'seenRollIds','previous.sourceItems.map']) assert.ok(session.includes(token),`session missing ${token}`);
assert.ok(session.includes('historyOpenRef'));assert.ok(session.includes('setHistoryUnread(true)'));assert.ok(!/const revealRoll[\s\S]{0,500}setHistoryOpen\(true\)/.test(session));
assert.ok(card.includes('EyeOff'));assert.ok(card.includes('Segreto'));
console.log('Dice realtime verification passed.');
