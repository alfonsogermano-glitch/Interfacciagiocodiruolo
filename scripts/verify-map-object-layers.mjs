import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/app/components/session/mapObjectLayers.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { doBoundsOverlap, getRotatedSquareBounds, polygonCoverage, rectangleCoverage, reorderMapObjects } = await import(moduleUrl);

const token = (id, x, y, size = 100, rotation = 0) => ({ id, x, y, size, rotation });
const overlaps = (first, second) => doBoundsOverlap(
  getRotatedSquareBounds(first, first.size, first.rotation),
  getRotatedSquareBounds(second, second.size, second.rotation),
);
const ids = objects => objects.map(object => object.id);

const pg = token('pg', 0, 0);
const remoteA = token('remote-a', 300, 0);
const remoteB = token('remote-b', 600, 0);
const npc = token('npc', 20, 20);

assert.deepEqual(ids(reorderMapObjects([pg, remoteA, remoteB, npc], 'pg', 'forward', overlaps)), ['remote-a', 'remote-b', 'npc', 'pg']);
assert.deepEqual(ids(reorderMapObjects([npc, remoteA, remoteB, pg], 'pg', 'backward', overlaps)), ['pg', 'npc', 'remote-a', 'remote-b']);
assert.deepEqual(ids(reorderMapObjects([pg, remoteA, remoteB], 'pg', 'forward', overlaps)), ['pg', 'remote-a', 'remote-b']);
assert.deepEqual(ids(reorderMapObjects([pg, remoteA, npc], 'pg', 'front', overlaps)), ['remote-a', 'npc', 'pg']);
assert.deepEqual(ids(reorderMapObjects([pg, remoteA, npc], 'npc', 'back', overlaps)), ['npc', 'pg', 'remote-a']);

const rotated = token('rotated', 105, 0, 100, 45);
assert.equal(overlaps(pg, rotated), true, 'la rotazione deve estendere i bounds usati per la sovrapposizione');
assert.equal(doBoundsOverlap({ x: 0, y: 0, width: 100, height: 100 }, { x: 100, y: 0, width: 100, height: 100 }), false, 'il solo contatto sul bordo non e una sovrapposizione');

const bounds = { x: 0, y: 0, width: 100, height: 100 };
assert.equal(rectangleCoverage(bounds, { x: 0, y: 0, width: 50, height: 100 }), 0.5, 'meta rettangolo deve restituire copertura 0.5');
assert.equal(rectangleCoverage(bounds, { x: 0, y: 0, width: 51, height: 100 }) > 0.5, true, 'oltre meta rettangolo deve superare la soglia');
assert.equal(polygonCoverage(bounds, [{ x: -1, y: -1 }, { x: 101, y: -1 }, { x: 101, y: 101 }, { x: -1, y: 101 }]), 1, 'un lazo completo deve coprire tutto il token');
assert.equal(polygonCoverage(bounds, [{ x: 200, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 300 }, { x: 200, y: 300 }]), 0, 'un lazo esterno non deve coprire il token');

console.log('Map object layers: PASS (livelli, bounds ruotati e copertura selezione).');
