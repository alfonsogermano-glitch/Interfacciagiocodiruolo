import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const faceResult = read('src/app/components/session/dice/CustomDieFaceResult.tsx');
const historyCard = read('src/app/components/session/dice/DiceRollHistoryCard.tsx');

assert.ok(
  faceResult.includes("symbolColor?:string") && faceResult.includes("style={{color:symbolColor}}"),
  'Custom die icon results must use the saved symbol color instead of inheriting the chat palette',
);
assert.ok(
  historyCard.includes('symbolColor={group.customDieSnapshot?.symbolColor}'),
  'Dice history must pass the custom die symbol color to each custom face result',
);

console.log('Custom dice chat symbol color verification passed.');
