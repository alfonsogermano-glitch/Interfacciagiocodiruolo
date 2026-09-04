import assert from 'node:assert/strict';
import { attachDiceAppearanceSnapshots, buildDefaultStandardDiceStyles, completeStandardDiceStyles } from '../src/app/components/session/dice/diceAppearance.ts';
import { DICE_SKINS, isDiceSkinId } from '../src/app/components/session/dice/diceSkins.ts';
import { DEFAULT_DICE_TEXTURE_SCALE, normalizeDiceTextureScale } from '../src/app/components/session/dice/diceTextureScale.ts';
import type { RollResult, StandardDieAppearance } from '../src/app/components/session/dice/diceTypes.ts';

const defaults = buildDefaultStandardDiceStyles();
assert.deepEqual(defaults.map((style) => style.sides), [4,6,8,10,12,20,100]);
assert.equal(defaults.length, 7);
assert.ok(defaults.every((style) => style.textureScale === DEFAULT_DICE_TEXTURE_SCALE));
assert.equal(normalizeDiceTextureScale(80), 100);
assert.equal(normalizeDiceTextureScale(165), 165);
assert.equal(normalizeDiceTextureScale(240), 200);
assert.equal(normalizeDiceTextureScale(undefined), DEFAULT_DICE_TEXTURE_SCALE);
assert.deepEqual(DICE_SKINS.map((skin) => skin.id), ['none','fire','ice','lightning','poison','stone','metal','obsidian','arcane']);
for (const skin of DICE_SKINS) assert.equal(isDiceSkinId(skin.id), true);
assert.equal(isDiceSkinId('rainbow'), false);

const completed = completeStandardDiceStyles([{ ...defaults[0], sides: 4, skinId: 'fire', effectsEnabled: true, textureScale: 165 }]);
assert.equal(completed.length, 7);
assert.equal(completed.find((style) => style.sides === 4)?.skinId, 'fire');
assert.equal(completed.find((style) => style.sides === 4)?.textureScale, 165);
assert.equal(completed.find((style) => style.sides === 6)?.skinId, 'none');
assert.equal(completed.find((style) => style.sides === 6)?.textureScale, DEFAULT_DICE_TEXTURE_SCALE);

const result: RollResult = {
  id: 'r', campaignId: 'c', rollerId: 'u', rollerName: 'Tester', formulaName: 'test', formulaText: '1d6+1d20', visibility: 'public',
  sourceItems: [], arithmeticSteps: [], comparisons: [], total: 8, createdAt: 1,
  diceGroups: [
    { itemId:'a', sides:6, requestedQuantity:1, rolls:[], activeRollIds:[], contribution:3 },
    { itemId:'b', sides:20, requestedQuantity:1, rolls:[], activeRollIds:[], contribution:5 },
    { itemId:'c', sides:6, requestedQuantity:1, rolls:[], activeRollIds:[], contribution:null, customDieId:'custom', customDieName:'C', customDieSnapshot:{ id:'custom',name:'C',sides:6,faces:[],bodyColor:'#111111',symbolColor:'#ffffff',skinId:'ice',effectsEnabled:true } },
  ],
};
const styles: StandardDieAppearance[] = defaults.map((style) => style.sides === 6 ? {...style, bodyColor:'#123456', symbolColor:'#abcdef', skinId:'arcane', effectsEnabled:true, textureScale:174} : style);
const snap = attachDiceAppearanceSnapshots(result, styles);
assert.notEqual(snap, result);
assert.equal(result.diceGroups[0].appearance, undefined, 'source result must stay immutable');
assert.deepEqual(snap.diceGroups[0].appearance, {bodyColor:'#123456',symbolColor:'#abcdef',skinId:'arcane',effectsEnabled:true,textureScale:174});
assert.equal(snap.diceGroups[2].appearance, undefined, 'custom groups must keep appearance in custom snapshot');
assert.equal(snap.diceGroups[2].customDieSnapshot?.skinId, 'ice');
console.log('verify-dice-appearance: PASS');
