import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const verifier=readFileSync(new URL('../../../deploy/aruba/qa/verify-session-navigation-contract.mjs',import.meta.url),'utf8');
const navigation=JSON.parse(readFileSync(new URL('../../../deploy/aruba/qa/session-navigation-contract.json',import.meta.url),'utf8'));
const claims=JSON.parse(readFileSync(new URL('../../../deploy/aruba/qa/character-claim-contract.json',import.meta.url),'utf8'));
const narrative=JSON.parse(readFileSync(new URL('../../../deploy/aruba/qa/narrative-entity-detail-contract.json',import.meta.url),'utf8'));

test('navigation release cannot outpace the atomic character-claim contract',()=>{
 const gap=navigation.confirmedPilotDivergences.find(item=>item.id==='owner-only-campaign-list');
 const claimsFullyVerified=claims.status==='verified'&&
  claims.requiredBoundaries.every(item=>item.state==='verified');
 assert.equal(gap.state,claimsFullyVerified?'resolved':'open');
 assert.equal(claims.status,'verified');
 assert.ok(claims.requiredBoundaries.every(item=>item.state==='verified'));
 assert.equal(claims.activationPolicy.requiresRealPostgres,true);
 assert.equal(claims.activationPolicy.requiresTwoBrowserAccounts,true);
 assert.match(verifier,/campaignListGap\.state!=='resolved'\|\|claimsFullyVerified/);
 assert.match(verifier,/requiredBoundaries\.every\(boundary=>boundary\.state==='verified'\)/);
 assert.match(verifier,/requiresRealPostgres===true/);
 assert.match(verifier,/requiresTwoBrowserAccounts===true/);
});

test('contextual narrative route resolves only with every exposed write boundary verified',()=>{
 const gap=navigation.confirmedPilotDivergences.find(item=>item.id==='contextual-character-open');
 assert.equal(gap.state,'resolved');
 assert.equal(narrative.status,'verified');
 assert.equal(narrative.activationPolicy.allowWrite,true);
 assert.ok(narrative.blockedWriteBoundaries.length>0);
 assert.ok(narrative.blockedWriteBoundaries.every(item=>item.state==='browser-postgres-http-verified'));
 assert.deepEqual(narrative.failClosedReferences.fields,['environmentId','mapLocationId','folderId']);
 assert.match(verifier,/narrativeGap\.state!=='resolved'\|\|narrativeWriteReady/);
 assert.match(verifier,/requiresBrowserRoundTrip===true/);
});
