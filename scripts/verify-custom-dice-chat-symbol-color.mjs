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
  faceResult.includes('symbolColor?: string;') && faceResult.includes("stroke={symbolColor || 'currentColor'}"),
  'Custom die icon results must use an explicit saved symbol stroke instead of inheriting the chat palette',
);
assert.ok(
  faceResult.includes('bodyColor?: string;') &&
  faceResult.includes('backgroundColor: bodyColor') &&
  faceResult.includes('data-custom-die-face-image'),
  'Custom die chat results must render both icons and transparent face images over the saved die body color',
);
assert.ok(
  historyCard.includes('symbolColor={die.customFace.symbolColor??group.customDieSnapshot?.symbolColor}') &&
  historyCard.includes('bodyColor={group.customDieSnapshot?.bodyColor}'),
  'Dice history must pass both the custom symbol color and the custom die body color to the face renderer',
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
