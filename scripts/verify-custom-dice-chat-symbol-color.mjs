import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const faceResult = read('src/app/components/session/dice/CustomDieFaceResult.tsx');
const historyCard = read('src/app/components/session/dice/DiceRollHistoryCard.tsx');
const engine = read('src/app/components/session/dice/diceEngine.ts');
const types = read('src/app/components/session/dice/diceTypes.ts');

assert.ok(
  faceResult.includes("symbolColor?:string") && faceResult.includes("style={{color:symbolColor}}"),
  'Custom die icon results must use the saved symbol color instead of inheriting the chat palette',
);
assert.ok(
  historyCard.includes('symbolColor={die.customFace.symbolColor??group.customDieSnapshot?.symbolColor}'),
  'Dice history must prefer the color carried by the rolled face and only fall back to the group snapshot',
);
assert.ok(
  types.includes('export interface RollCustomDieFace extends CustomDieFace') && types.includes('symbolColor?: string;'),
  'Rolled custom faces must be able to persist their icon color through realtime serialization',
);
assert.ok(
  engine.includes("face.visual.kind === 'icon' ? { symbolColor } : {}") &&
  engine.includes('snapshotRolledCustomFace(tensFace, die.symbolColor)') &&
  engine.includes('snapshotRolledCustomFace(unitsFace, die.symbolColor)') &&
  engine.includes('snapshotRolledCustomFace(customFace, die.symbolColor)') &&
  engine.includes('snapshotRolledCustomFace(customFace, customItem.customDie.symbolColor)'),
  'Every rolled custom icon face, including d100 and explosions, must carry its symbol color while images remain untinted',
);

console.log('Custom dice chat symbol color verification passed.');
