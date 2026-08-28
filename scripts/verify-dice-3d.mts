import assert from 'node:assert/strict';
import fs from 'node:fs';
import { projectRollTo3D } from '../src/app/components/session/dice/dice3dProjection.ts';
import type { RollDiceGroup, RollResult } from '../src/app/components/session/dice/diceTypes.ts';

function read(path: string): string {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function group(itemId: string, sides: number, faces: Array<{ face: number; contribution?: number; active?: boolean; source?: 'base' | 'explosion' }>): RollDiceGroup {
  const rolls = faces.map((entry, index) => ({
    id: `${itemId}-${index}`,
    groupItemId: itemId,
    sides,
    face: entry.face,
    contribution: entry.contribution ?? entry.face,
    active: entry.active ?? true,
    source: entry.source ?? 'base',
    explosionDepth: entry.source === 'explosion' ? 1 : 0,
    chainId: `${itemId}-chain-${index}`,
  }));
  return {
    itemId,
    sides,
    requestedQuantity: rolls.filter((die) => die.source === 'base').length,
    rolls,
    activeRollIds: rolls.filter((die) => die.active).map((die) => die.id),
    contribution: rolls.filter((die) => die.active).reduce((sum, die) => sum + die.contribution, 0),
  };
}

function result(diceGroups: RollDiceGroup[]): RollResult {
  return {
    id: 'roll-3d-test',
    campaignId: '10000000-0000-0000-0000-000000000001',
    rollerId: '20000000-0000-0000-0000-000000000001',
    rollerName: 'Tester',
    formulaName: '3D test',
    formulaText: 'test',
    visibility: 'public',
    sourceItems: [],
    diceGroups,
    arithmeticSteps: [],
    comparisons: [],
    total: 0,
    createdAt: 1,
  };
}

assert.deepEqual(
  projectRollTo3D(result([group('d20', 20, [{ face: 17 }, { face: 4 }])])),
  [{ sides: 20, values: [17, 4], notation: '2d20@17,4' }],
);

const standard = projectRollTo3D(result([
  group('d4', 4, [{ face: 3 }]),
  group('d6', 6, [{ face: 6 }]),
  group('d8', 8, [{ face: 7 }]),
  group('d10', 10, [{ face: 9 }]),
  group('d12', 12, [{ face: 11 }]),
  group('d20', 20, [{ face: 19 }]),
  group('d100', 100, [{ face: 73 }]),
]));
assert.deepEqual(standard.map((chunk) => chunk.sides), [4, 6, 8, 10, 12, 20, 100]);
assert.deepEqual(standard.map((chunk) => chunk.notation), [
  '1d4@3', '1d6@6', '1d8@7', '1d10@9', '1d12@11', '1d20@19', '1d100@73',
]);

assert.deepEqual(
  projectRollTo3D(result([
    group('unsupported-d3', 3, [{ face: 2 }]),
    group('supported-d6', 6, [{ face: 5 }]),
    group('unsupported-d30', 30, [{ face: 21 }]),
  ])),
  [{ sides: 6, values: [5], notation: '1d6@5' }],
);

const processed = projectRollTo3D(result([
  group('processed-d6', 6, [
    { face: 1, active: false },
    { face: 6, active: true },
    { face: 6, contribution: 5, source: 'explosion' },
    { face: 3, contribution: 2, source: 'explosion' },
  ]),
]));
assert.deepEqual(processed, [{ sides: 6, values: [1, 6, 6, 3], notation: '4d6@1,6,6,3' }]);

const mixed = projectRollTo3D(result([
  group('first', 20, [{ face: 12 }]),
  group('second', 12, [{ face: 7 }, { face: 2 }]),
  group('third', 6, [{ face: 4 }]),
]));
assert.deepEqual(mixed.map((chunk) => chunk.notation), ['1d20@12', '2d12@7,2', '1d6@4']);

const renderer = read('src/app/components/session/dice/dice3dRenderer.ts');
const overlay = read('src/app/components/session/dice/Dice3DOverlay.tsx');
const session = read('src/app/components/session/dice/DiceSessionContext.tsx');
const drawer = read('src/app/components/session/dice/DiceRollHistoryDrawer.tsx');

assert.ok(renderer.includes("await import('@3d-dice/dice-box-threejs')"), '3D package must be lazy-loaded');
assert.ok(!/^import\s+.*['\"]@3d-dice\/dice-box-threejs['\"]/m.test(renderer), '3D package must not be eagerly imported');
assert.ok(renderer.includes('projectRollTo3D(result)'), 'renderer must use canonical roll projection');
assert.ok(renderer.includes('chunk.notation'), 'renderer must roll predetermined notation');

assert.ok(overlay.includes('data-dice-3d-overlay'), '3D overlay host marker missing');
assert.ok(overlay.includes('pointer-events-none'), '3D overlay must not intercept pointer input');
assert.ok(overlay.includes('fixed inset-0'), '3D overlay must cover the session viewport');

for (const revealState of ['pending', 'animating', 'revealed']) {
  assert.ok(session.includes(`'${revealState}'`), `missing reveal state ${revealState}`);
}
assert.ok(session.includes('stopActiveAnimation(true)'), 'new rolls must interrupt/reveal the previous animation');
assert.ok(session.includes('DICE_SETTLED_HOLD_MS = 1000'), 'settled dice should remain visible before reveal');
assert.ok(session.includes("hollowgate.dice.3d-enabled"), '3D preference key missing');
assert.ok(session.includes("entry.revealState === 'revealed'"), 'history must expose only revealed roll results');
assert.ok(session.includes('renderer.dispose();'), 'aborted renderer must be disposed');
assert.ok(drawer.includes('data-dice-3d-toggle'), '3D on/off control missing');
assert.ok(drawer.includes('<Dice3DOverlay />'), '3D overlay must remain mounted with the session roll UI');

console.log('Dice 3D verification passed.');
