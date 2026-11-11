import test from 'node:test';
import assert from 'node:assert/strict';
import { createVttProtocol } from '../vtt-protocol.mjs';
const socket=()=>({readyState:1,messages:[],send(raw){this.messages.push(JSON.parse(raw))}});
const last=(ws,t)=>ws.messages.filter(m=>m.type===t).at(-1);
const command=(eventId,command,payload)=>({type:'vtt:command',version:1,campaignId:'demo',eventId,command,payload});
test('one GM and three browser peers receive identical public scene updates irrespective of client device/network',()=>{
 const host=createVttProtocol(),gm=socket();
 const players=[socket(),socket(),socket()];
 assert.equal(host.join(gm,{role:'gm',actorId:'gm'}),true);
 for(let i=0;i<players.length;i++)assert.equal(host.join(players[i],{role:'player',actorId:'player'+i}),true);
 const scene={id:'scene:1',campaignId:'demo',sceneId:'1',chapterId:'c1',title:'Porto',description:'',
 chapterTitle:'Atto I',mapUrl:'https://example.org/map.png',sceneImageUrl:null,
 mapMetadata:{imageUrl:null,gridVisible:true,gridRows:10,gridColumns:10},mapRegions:[],
 contextMetadata:{timeOfDay:'day',period:'',condition:''},publishedAt:'2026-11-11T12:00:00Z'};
 host.handle(gm,command('one','publishActiveScene',{activeScene:scene}));
 for(const p of players)assert.equal(last(p,'vtt:patch').changes.activeScene.title,'Porto');
 host.leave(players[1]);
 const reconnected=socket();
 assert.equal(host.join(reconnected,{role:'player',actorId:'player1'}),true);
 assert.equal(last(reconnected,'vtt:snapshot').state.activeScene.title,'Porto');
 const otherPlayers=[players[0],players[2],reconnected];
 host.handle(gm,command('two','publishActiveScene',{activeScene:{...scene,title:'Porto di notte'}}));
 assert.deepEqual(otherPlayers.map(p=>last(p,'vtt:patch').changes.activeScene.title),['Porto di notte','Porto di notte','Porto di notte']);
 for(const p of otherPlayers)assert.equal(last(p,'vtt:patch').sequence,2);
});
