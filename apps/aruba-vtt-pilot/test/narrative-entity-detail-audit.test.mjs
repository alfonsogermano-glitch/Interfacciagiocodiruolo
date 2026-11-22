import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const contract=JSON.parse(readFileSync(new URL('../../../deploy/aruba/qa/narrative-entity-detail-contract.json',import.meta.url),'utf8'));

test('original PNG and monster write is implemented with every exposed Aruba boundary verified',()=>{
 assert.equal(contract.status,'verified');
 assert.equal(contract.activationPolicy.allowWrite,true);
 assert.equal(contract.activationPolicy.requiresAllBlockedBoundariesResolved,true);
 assert.deepEqual(contract.blockedWriteBoundaries.map(item=>item.id),[
  'binary-images','referenced-visual-assets','custom-entity-notes','chapter-scene-placement','semantic-field-validation'
 ]);
 assert.ok(contract.blockedWriteBoundaries.every(item=>item.state==='browser-postgres-http-verified'));
 assert.deepEqual(contract.failClosedReferences.fields,['environmentId','mapLocationId','folderId']);
 assert.ok(contract.payloadRoundTrip.npcFields.includes('d20Stats'));
 assert.ok(contract.payloadRoundTrip.monsterFields.includes('customSpecialActions'));
});
