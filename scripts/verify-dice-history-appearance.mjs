import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) { return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'); }
const card = read('src/app/components/session/dice/DiceRollHistoryCard.tsx');
const session = read('src/app/components/session/dice/DiceSessionContext.tsx');

// La cronologia deve preferire lo snapshot salvato nel gruppo; il contesto serve
// solo come fallback per i payload legacy senza appearance.
assert.ok(card.includes('historyStandardAppearance'), 'history must resolve appearance through a snapshot-first variable');
assert.ok(card.includes('group.appearance'), 'history must read the appearance snapshot stored on the roll group');
assert.ok(!card.includes('result.rollerId === user?.id'), 'history must not switch past rolls to the current saved appearance');
assert.ok(card.includes('appearance={historyStandardAppearance}'), 'standard history icons must render the resolved snapshot appearance');

// Anche i tiri da modificatore devono fissare lo snapshot al momento del lancio.
assert.ok(session.includes('attachDiceAppearanceSnapshots({'), 'modifier roll results must also receive appearance snapshots');
assert.ok(session.includes('}, standardStyles)'), 'modifier snapshots must use the current campaign styles');

console.log('verify-dice-history-appearance: PASS');
