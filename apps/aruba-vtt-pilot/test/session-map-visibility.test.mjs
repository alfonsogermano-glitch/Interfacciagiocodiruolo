import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publicMapTokens, publicMapDrawings, publicMapPois } from '../../../src/app/components/session/sessionMapVisibility.ts';
import { filterMapObjectOrder } from '../../../src/app/components/session/mapObjectLayers.ts';

test('original map player projection preserves source-sheet independence for placed tokens',()=>{
 const tokens=[
  {id:'shown',visible:true,hiddenFromPlayers:true,name:'Placed token'},
  {id:'hidden',visible:false,hiddenFromPlayers:false,name:'GM-only token'},
  {id:'legacy',name:'Legacy token'},
 ];
 const projected=publicMapTokens(tokens);
 assert.deepEqual(projected.map(x=>x.id),['shown','legacy']);
 assert.strictEqual(projected[0],tokens[0],'No silent rewriting of token visual properties');
 assert.equal(tokens[1].visible,false);
});
test('original map player projection drops GM-hidden drawings while keeping legacy visibility',()=>{
 const drawings=[{id:'visible',visible:true},{id:'hidden',visible:false},{id:'legacy'}];
 assert.deepEqual(publicMapDrawings(drawings).map(x=>x.id),['visible','legacy']);
});
test('original map player projection hides private POIs and private linked note IDs',()=>{
 const pois=[
  {id:'private',visibleToPlayers:false,noteId:'private-note',noteVisibleToPlayers:true},
  {id:'public-with-private-note',visibleToPlayers:true,noteId:'private-note',noteVisibleToPlayers:false},
  {id:'public-with-public-note',visibleToPlayers:true,noteId:'public-note',noteVisibleToPlayers:true},
 ];
 const projected=publicMapPois(pois);
 assert.deepEqual(projected.map(x=>({id:x.id,noteId:x.noteId})),[
  {id:'public-with-private-note',noteId:null},
  {id:'public-with-public-note',noteId:'public-note'},
 ]);
 assert.equal(pois[1].noteId,'private-note','GM source must not be modified');
 assert.notStrictEqual(projected[0],pois[1]);
});
test('layer order is projected against only the objects actually visible to a player',()=>{
 const original=[
  {family:'poi',id:'private'},
  {family:'token',id:'shown'},
  {family:'drawing',id:'hidden'},
  {family:'poi',id:'public-with-private-note'},
  {family:'token',id:'hidden'},
 ];
 const visible=[
  ...publicMapTokens([{id:'shown',visible:true},{id:'hidden',visible:false}]).map(({id})=>({family:'token',id})),
  ...publicMapDrawings([{id:'hidden',visible:false}]).map(({id})=>({family:'drawing',id})),
  ...publicMapPois([{id:'private',visibleToPlayers:false,noteVisibleToPlayers:false,noteId:'secret'},
   {id:'public-with-private-note',visibleToPlayers:true,noteVisibleToPlayers:false,noteId:'secret'}])
    .map(({id})=>({family:'poi',id})),
 ];
 assert.deepEqual(filterMapObjectOrder(original,visible),[
  {family:'token',id:'shown'},
  {family:'poi',id:'public-with-private-note'},
 ]);
});
test('the original SessionWorkspace uses the shared filters for all outbound map paths',()=>{
 const source=readFileSync(new URL('../../../src/app/components/session/SessionWorkspace.tsx',import.meta.url),'utf8');
 assert.match(source,/import \{ publicMapTokens, publicMapDrawings, publicMapPois \} from '\.\/sessionMapVisibility';/);
 assert.doesNotMatch(source,/function publicMapTokens\(/);
 for(const marker of ['mapTokens: publicMapTokens(', 'mapDrawings: publicMapDrawings(', 'mapPois: publicMapPois(', 'mapObjectOrder: publicMapObjectOrder('])
  assert.ok(source.includes(marker),'Original map publish path no longer filters '+marker);
});
