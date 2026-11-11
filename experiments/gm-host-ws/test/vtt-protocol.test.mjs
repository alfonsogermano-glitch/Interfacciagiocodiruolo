import test from 'node:test';
import assert from 'node:assert/strict';
import {createVttProtocol} from '../vtt-protocol.mjs';
const socket=()=>({readyState:1,frames:[],send(raw){this.frames.push(JSON.parse(raw))}});
const last=(ws,type)=>ws.frames.filter(m=>m.type===type).at(-1);
const cmd=(eventId,command,payload)=>({type:'vtt:command',version:1,campaignId:'demo',eventId,command,payload});
test('GM publishes scene, player receives filtered snapshot without private notes',()=>{
 const v=createVttProtocol();const gm=socket(),p=socket();
 v.join(gm,{role:'gm',actorId:'gm'});v.join(p,{role:'player',actorId:'p1'});
 assert.equal(v.handle(gm,cmd('scene-1','publishScene',{sceneId:'scene-a',title:'Torre',gmNotes:'Soluzione segreta'})),true);
 assert.equal(last(gm,'vtt:ack').status,'accepted');
 assert.equal(last(p,'vtt:patch').changes.scene.title,'Torre');
 assert.equal(JSON.stringify(p.frames).includes('Soluzione segreta'),false);
 assert.equal(last(gm,'vtt:patch').changes.scene.gmNotes,'Soluzione segreta');
});
test('outsider and players cannot publish scene, spoof GM or move another token',()=>{
 const v=createVttProtocol();const gm=socket(),p=socket(),other=socket();
 v.join(gm,{role:'gm',actorId:'gm'});v.join(p,{role:'player',actorId:'p1'});v.join(other,{role:'player',actorId:'p2'});
 assert.equal(v.handle(p,cmd('hack','publishScene',{sceneId:'hacked',title:'evil'})),true);
 assert.equal(last(p,'vtt:ack').status,'rejected');
 assert.equal(v.handle(gm,cmd('assign','assignToken',{tokenId:'hero',owner:'p1',x:10,y:20})),true);
 assert.equal(v.handle(other,cmd('spoof','moveToken',{tokenId:'hero',x:50,y:70})),true);
 assert.equal(last(other,'vtt:ack').status,'rejected');
 assert.equal(v.handle(p,cmd('legit','moveToken',{tokenId:'hero',x:40,y:45})),true);
 assert.equal(last(p,'vtt:ack').status,'accepted');
 assert.equal(v.handle(p,cmd('other','moveToken',{tokenId:'gm',x:1,y:1})),true);
 assert.equal(last(p,'vtt:ack').status,'rejected');
});
test('duplicate event ids do not apply twice, sequence gap requests full resync',()=>{
 const v=createVttProtocol();const gm=socket(),p=socket();
 v.join(gm,{role:'gm',actorId:'gm'});v.join(p,{role:'player',actorId:'p1'});
 const publish=cmd('scene-1','publishScene',{sceneId:'scene-a',title:'Ponte'});
 assert.equal(v.handle(gm,publish),true);const seq=last(p,'vtt:patch').sequence;
 assert.equal(v.handle(gm,publish),true);
 assert.equal(last(gm,'vtt:ack').status,'duplicate');
 assert.equal(last(p,'vtt:patch').sequence,seq);
 assert.equal(v.handle(p,{type:'vtt:resync',version:1,campaignId:'demo',lastSequence:0}),true);
 assert.equal(last(p,'vtt:snapshot').sequence,seq);
 assert.equal(v.handle(p,{type:'vtt:resync',version:1,campaignId:'wrong',lastSequence:0}),true);
 assert.equal(last(p,'vtt:error').code,'campaign_mismatch');
});
test('invalid payloads, wrong version, oversized titles rejected without mutation',()=>{
 const v=createVttProtocol();const gm=socket();v.join(gm,{role:'gm',actorId:'gm'});
 assert.equal(v.handle(gm,cmd('bad','publishScene',{sceneId:'x',title:'X'.repeat(400)})),true);
 assert.equal(last(gm,'vtt:ack').status,'rejected');
 assert.equal(v.handle(gm,{...cmd('bad2','publishScene',{sceneId:'x',title:'X'}),version:99}),true);
 assert.equal(last(gm,'vtt:error').code,'version_unsupported');
 assert.equal(last(gm,'vtt:snapshot').sequence,0);
});
