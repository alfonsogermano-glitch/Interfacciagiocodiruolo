import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {composeOwnedCampaignPlayerRows} from '../src/campaign-player-rows.mjs';
const owner='4a3465ec-47d7-4021-9f0d-e70da8cbd001';
const player='4a3465ec-47d7-4021-9f0d-e70da8cbd002';
const members=[{userId:owner,displayName:'GM',role:'gm'},
 {userId:player,displayName:'Giocatore',role:'player'}];
const active={id:'c1',ownerId:owner,name:'Mara',status:'active',sheetData:{style:'Jock'}};
test('GM-owned character is grouped under GM, player with no PG stays visible',()=>{
 const rows=composeOwnedCampaignPlayerRows(members,[active],owner);
 assert.equal(rows.length,2);
 assert.equal(rows[0].characters[0].id,'c1');
 assert.deepEqual(rows[1].characters,[]);
});
test('only active characters appear, and no phantom player ownership is inferred',()=>{
 const rows=composeOwnedCampaignPlayerRows(members,[{...active,status:'draft'}],owner);
 assert.deepEqual(rows.map(r=>r.characters.length),[0,0]);
});
test('rejected identity mismatch, invalid status, duplicate roster or missing GM fail closed',()=>{
 for(const [m,c,o] of [
  [members,[{...active,ownerId:player}],owner],
  [members,[{...active,status:'mystery'}],owner],
  [[members[0],members[0]],[active],owner],
  [[members[1]],[active],owner],
  [members,[{...active,sheetData:null}],owner],
 ])assert.throws(()=>composeOwnedCampaignPlayerRows(m,c,o));
});

// Keep the character opener and the GM availability button as siblings:
// nested interactive controls intercept keyboard and screen-reader navigation.
test('campaign character opener does not wrap the availability button',()=>{
 const source=readFileSync(new URL('../src/ArubaCampaignPlayerRows.tsx',import.meta.url),'utf8');
 assert.match(source,/<div role="button" tabIndex=\{0\} className="aruba-campaign-character-open"/);
 assert.match(source,/onClick=\{\(\)=>onOpenCharacter\(c\.id\)\}\/>\s*<\/div>\s*\{availabilityEnabled&&\s*<button/);
});

test('confirmed server assignment groups a GM-owned card beneath its player exactly once',()=>{
 const links=new Map([[active.id,player]]);
 const rows=composeOwnedCampaignPlayerRows(members,[active],owner,links);
 assert.deepEqual(rows.map(r=>r.characters.map(c=>c.id)),[[],[active.id]]);
 assert.equal(rows[1].characters[0].ownerId,owner,'assignment never transfers ownership');
 const reset=composeOwnedCampaignPlayerRows(members,[active],owner,new Map());
 assert.deepEqual(reset.map(r=>r.characters.length),[1,0]);
});
test('forged, unverified or stale player assignments fail closed',()=>{
 for(const links of [
  new Map([[active.id,owner]]),
  new Map([[active.id,'other']]),
  new Map([['unknown',player]]),
  new Map([[active.id,player],['unknown',player]]),
 ])
  assert.throws(()=>composeOwnedCampaignPlayerRows(members,[active],owner,links));
 assert.throws(()=>composeOwnedCampaignPlayerRows(members,[{...active,status:'draft'}],owner,
  new Map([[active.id,player]])));
});
