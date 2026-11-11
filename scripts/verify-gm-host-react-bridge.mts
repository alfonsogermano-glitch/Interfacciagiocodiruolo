import test from 'node:test';
import assert from 'node:assert/strict';
import { createGmHostReactBridge } from '../src/services/realtime/gmHostReactBridge.ts';
class MockSocket {
 readyState=0;
 handlers=new Map();
 sent=[];
 addEventListener(key,fn){const a=this.handlers.get(key)||[];a.push(fn);this.handlers.set(key,a)}
 removeEventListener(key,fn){this.handlers.set(key,(this.handlers.get(key)||[]).filter(v=>v!==fn))}
 emit(key,value){for(const h of this.handlers.get(key)||[])h(value)}
 send(raw){this.sent.push(JSON.parse(raw))}
 close(){this.readyState=3;this.emit('close',{})}
 open(){this.readyState=1;this.emit('open',{})}
 frame(value){this.emit('message',{data:JSON.stringify(value)})}
}
const frame=(type,sequence,changes)=>({type,version:1,campaignId:'demo',sequence,...(type==='vtt:snapshot'?{state:changes}:{changes})});
function setup(){
 const sockets=[];
 const bridge=createGmHostReactBridge({role:'player',token:'private',origin:'https://demo.trycloudflare.com',createSocket:()=>{const s=new MockSocket();sockets.push(s);return s}});
 bridge.connect();const ws=sockets[0];ws.open();ws.frame({type:'joined'});
 return {bridge,ws};
}
test('React adapter authenticates and applies sequential GM scene/token updates',()=>{
 const {bridge,ws}=setup();
 assert.equal(ws.sent[0].type,'hello');assert.equal(ws.sent[0].token,'private');
 ws.frame(frame('vtt:snapshot',0,{scene:null,tokens:[]}));
 ws.frame(frame('vtt:patch',1,{scene:{sceneId:'chapter1',title:'Torre'}}));
 ws.frame(frame('vtt:patch',2,{token:{tokenId:'hero',owner:'player',x:21,y:17}}));
 assert.equal(bridge.getSnapshot().scene.title,'Torre');
 assert.equal(bridge.getSnapshot().tokens[0].x,21);
 assert.equal(bridge.getSnapshot().sequence,2);
 bridge.dispose();
});
test('Gap requests resync and stale frames are never applied',()=>{
 const {bridge,ws}=setup();
 ws.frame(frame('vtt:snapshot',4,{scene:{sceneId:'a',title:'Before'},tokens:[]}));
 ws.frame(frame('vtt:patch',6,{scene:{sceneId:'b',title:'Missed'}}));
 assert.equal(ws.sent.at(-1).type,'vtt:resync');
 assert.equal(bridge.getSnapshot().scene.title,'Before');
 ws.frame(frame('vtt:snapshot',6,{scene:{sceneId:'b',title:'Recovered'},tokens:[]}));
 ws.frame(frame('vtt:snapshot',2,{scene:{sceneId:'c',title:'Stale'},tokens:[]}));
 assert.equal(bridge.getSnapshot().scene.title,'Recovered');
 bridge.dispose();
});
test('Unsigned or unauthenticated mutations rejected locally',()=>{
 const sockets=[];const bridge=createGmHostReactBridge({role:'player',token:'private',origin:'https://demo.trycloudflare.com',createSocket:()=>{const ws=new MockSocket();sockets.push(ws);return ws}});
 assert.equal(bridge.command('moveToken',{tokenId:'hero',x:1,y:1},'evt'),false);
 bridge.connect();sockets[0].open();
 assert.equal(bridge.command('moveToken',{tokenId:'hero',x:1,y:1},'evt'),false);
 sockets[0].frame({type:'joined'});
 assert.equal(bridge.command('moveToken',{tokenId:'hero',x:1,y:1},'evt'),true);
 assert.equal(sockets[0].sent.at(-1).type,'vtt:command');
 bridge.dispose();
});
