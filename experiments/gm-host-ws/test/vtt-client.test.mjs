import test from 'node:test';
import assert from 'node:assert/strict';
import {createVttClient} from '../vtt-client.mjs';
const env=()=>{const sent=[],seen=[],client=createVttClient({send:m=>sent.push(m),onState:(s,n)=>seen.push({s,n})});return {client,sent,seen}};
const frame=(type,sequence,more={})=>({type,version:1,campaignId:'demo',sequence,...more});
test('ordered patches update local scene and token without duplicate application',()=>{
 const {client,seen}=env();
 client.accept(frame('vtt:snapshot',1,{state:{scene:null,tokens:[]}}));
 client.accept(frame('vtt:patch',2,{changes:{scene:{sceneId:'scene',title:'Mappa'}}}));
 client.accept(frame('vtt:patch',3,{changes:{token:{tokenId:'g',owner:'gm',x:12,y:14}}}));
 client.accept(frame('vtt:patch',3,{changes:{token:{tokenId:'g',owner:'gm',x:99,y:99}}}));
 assert.equal(client.getState().scene.title,'Mappa');
 assert.equal(client.getState().tokens[0].x,12);
 assert.deepEqual(seen.map(s=>s.n),[1,2,3]);
});
test('gap requests one resync and applies authoritative replacement snapshot',()=>{
 const {client,sent}=env();
 client.accept(frame('vtt:snapshot',5,{state:{scene:null,tokens:[]}}));
 client.accept(frame('vtt:patch',8,{changes:{scene:{title:'skipped'}}}));
 client.accept(frame('vtt:patch',9,{changes:{scene:{title:'second skipped'}}}));
 assert.equal(sent.length,1);
 assert.deepEqual(sent[0],{type:'vtt:resync',lastSequence:5,version:1,campaignId:'demo'});
 assert.equal(client.getState().scene,null);
 client.accept(frame('vtt:snapshot',9,{state:{scene:{sceneId:'a',title:'Recovered'},tokens:[]}}));
 assert.equal(client.getState().scene.title,'Recovered');
 client.accept(frame('vtt:patch',10,{changes:{token:{tokenId:'g',owner:'gm',x:2,y:3}}}));
 assert.equal(client.getState().tokens[0].x,2);
});
test('invalid versions and stale snapshots cannot downgrade state',()=>{
 const {client}=env();
 assert.equal(client.accept({type:'vtt:snapshot',version:2,campaignId:'demo'}),false);
 client.accept(frame('vtt:snapshot',3,{state:{scene:{title:'new'},tokens:[]}}));
 client.accept(frame('vtt:snapshot',2,{state:{scene:{title:'old'},tokens:[]}}));
 assert.equal(client.getState().scene.title,'new');
 assert.equal(client.getSequence(),3);
});
test('commands include schema version and campaign without allowing arbitrary send',()=>{
 const {client,sent}=env();
 assert.equal(client.command('moveToken',{tokenId:'g',x:9,y:2},'ev1'),true);
 assert.deepEqual(sent[0],{type:'vtt:command',eventId:'ev1',command:'moveToken',payload:{tokenId:'g',x:9,y:2},version:1,campaignId:'demo'});
 assert.equal(client.command('publishScene',{},''),false);
});
