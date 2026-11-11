import test from 'node:test';
import assert from 'node:assert/strict';
import {createVttProtocol} from '../vtt-protocol.mjs';
import {projectActiveScene} from '../active-scene-wire.mjs';

const ws=()=>({readyState:1,frames:[],send(raw){this.frames.push(JSON.parse(raw))}});
const last=(peer,type)=>peer.frames.filter(f=>f.type===type).at(-1);
const command=(id,command,payload)=>({type:'vtt:command',version:1,campaignId:'demo',eventId:id,command,payload});
const publication=()=>({
 id:'scene:a',campaignId:'demo',sceneId:'a',chapterId:'chapter',
 title:'Torre',description:'Descrizione pubblica',chapterTitle:'Capitolo',
 mapUrl:'https://maps.example/tower.png',sceneImageUrl:null,
 mapMetadata:{imageUrl:null,gridVisible:true,gridColumns:20,gridRows:20},
 mapRegions:[],contextMetadata:{timeOfDay:'night',period:'',condition:''},
 publishedAt:'2026-11-11T12:00:00.000Z',
 mapTokens:[
  {id:'hero',name:'Eroe',x:10,y:20,createdAt:'today',updatedAt:'today'},
  {id:'secret',name:'Mostro segreto',x:50,y:50,hiddenFromPlayers:true,createdAt:'today',updatedAt:'today'},
  {id:'invisible',name:'Invisibile',x:70,y:70,visible:false,createdAt:'today',updatedAt:'today'}
 ],
 mapPois:[
  {id:'poi-public',label:'Visibile',visibleToPlayers:true,noteId:'private-note-id',noteVisibleToPlayers:false},
  {id:'poi-secret',label:'Trappola segreta',visibleToPlayers:false,noteId:'secret-note',noteVisibleToPlayers:false}
 ],
 mapDrawings:[{id:'draw-public',visible:true},{id:'draw-secret',visible:false}],
 mapFog:[{id:'fog1',kind:'rectangle',operation:'cover',x:0,y:0,width:10,height:10}],
 mapObjectOrder:[{id:'hero',family:'token'},{id:'secret',family:'token'},{id:'poi-secret',family:'poi'},{id:'draw-secret',family:'drawing'}],
});
test('full published scene preserves public map data but removes all hidden map objects on player transport',()=>{
 const v=createVttProtocol(),gm=ws(),player=ws();
 v.join(gm,{role:'gm',actorId:'gm'});v.join(player,{role:'player',actorId:'p1'});
 const input=publication();input.extraPrivateValue='MUST NEVER LEAK';
 v.handle(gm,command('full-1','publishActiveScene',{activeScene:input}));
 assert.equal(last(gm,'vtt:ack').status,'accepted');
 const playerScene=last(player,'vtt:patch').changes.activeScene;
 assert.equal(playerScene.mapUrl,'https://maps.example/tower.png');
 assert.equal(playerScene.mapFog[0].id,'fog1');
 assert.deepEqual(playerScene.mapTokens.map(x=>x.id),['hero']);
 assert.deepEqual(playerScene.mapPois.map(x=>x.id),['poi-public']);
 assert.equal(playerScene.mapPois[0].noteId,null);
 assert.deepEqual(playerScene.mapDrawings.map(x=>x.id),['draw-public']);
 assert.deepEqual(playerScene.mapObjectOrder.map(x=>x.id),['hero']);
 assert.equal(JSON.stringify(player.frames).includes('MUST NEVER LEAK'),false);
 assert.equal(JSON.stringify(player.frames).includes('Mostro segreto'),false);
 assert.equal(JSON.stringify(player.frames).includes('Trappola segreta'),false);
 const g=last(gm,'vtt:patch').changes.activeScene;
 assert.equal(g.mapTokens.length,3);
 assert.equal(g.mapPois.length,2);
 const newcomer=ws();v.join(newcomer,{role:'player',actorId:'p2'});
 assert.deepEqual(last(newcomer,'vtt:snapshot').state.activeScene,playerScene);
});
test('players cannot publish ActiveScenePublication and invalid/oversized structures are rejected',()=>{
 const v=createVttProtocol(),gm=ws(),player=ws();v.join(gm,{role:'gm',actorId:'gm'});v.join(player,{role:'player',actorId:'p1'});
 v.handle(player,command('bad-player','publishActiveScene',{activeScene:publication()}));
 assert.equal(last(player,'vtt:ack').code,'gm_only');
 const bad=publication();bad.campaignId='another';
 v.handle(gm,command('bad-campaign','publishActiveScene',{activeScene:bad}));
 assert.equal(last(gm,'vtt:ack').status,'rejected');
 bad.campaignId='demo';bad.title='x'.repeat(300);
 assert.equal(projectActiveScene(publication(),'player').mapTokens.length,1);
 v.handle(gm,command('bad-title','publishActiveScene',{activeScene:bad}));
 assert.equal(last(gm,'vtt:ack').status,'rejected');
 assert.equal(last(gm,'vtt:snapshot').state.activeScene,null);
});
