import test from 'node:test';
import assert from 'node:assert/strict';
import {signalingUrl,createSignalingClient} from '../src/signaling-client.mjs';
const campaignId='12345678-1234-4123-8123-123456789abc';
const peerId='22345678-1234-4123-8123-123456789abc';
class FakeSocket{
 static OPEN=1;
 constructor(url){this.url=url;this.readyState=1;this.handlers={};this.sent=[];FakeSocket.last=this;}
 addEventListener(type,fn){(this.handlers[type]??=[]).push(fn);}
 emit(type,data){for(const fn of this.handlers[type]??[])fn(data);}
 send(value){this.sent.push(JSON.parse(value));}
 close(){this.readyState=3;this.emit('close',{});}
}
test('signaling URL is same-origin WebSocket with no token or arbitrary endpoint',()=>{
 assert.equal(signalingUrl('https://staging.hollowgate.quest/',campaignId,'host'),
  'wss://staging.hollowgate.quest/vtt/signaling?campaignId='+campaignId+'&role=host');
 for(const origin of ['https://example.com/private','https://x.test/?token=secret','ftp://x.test/'])
  assert.throws(()=>signalingUrl(origin,campaignId,'host'));
 assert.throws(()=>signalingUrl('https://x.test/','bad','player'));
});
test('GM signaling cannot send before ready, cannot target an invalid peer, and closes cleanly',()=>{
 const events=[];let disconnects=0;
 const client=createSignalingClient({origin:'https://staging.hollowgate.quest/',campaignId,role:'host',WebSocketImpl:FakeSocket,onEvent:x=>events.push(x),onDisconnect:()=>disconnects++});
 assert.equal(client.send('offer',{sdp:'a'},peerId),false);
 FakeSocket.last.emit('message',{data:JSON.stringify({type:'ready',role:'host',peerId})});
 assert.equal(client.ready,true);
 assert.equal(client.send('offer',{sdp:'a'},'bad'),false);
 assert.equal(client.send('offer',{sdp:'a'},peerId),true);
 assert.deepEqual(FakeSocket.last.sent[0],{type:'signal',kind:'offer',payload:{sdp:'a'},targetPeerId:peerId});
 client.close();assert.equal(client.ready,false);assert.equal(disconnects,0);
});
test('player cannot forge GM target, and disconnect invalidates transport',()=>{
 let disconnected=0;
 const client=createSignalingClient({origin:'https://staging.hollowgate.quest/',campaignId,role:'player',WebSocketImpl:FakeSocket,onEvent:()=>{},onDisconnect:()=>disconnected++});
 FakeSocket.last.emit('message',{data:JSON.stringify({type:'ready',role:'player',peerId})});
 assert.equal(client.send('answer',{sdp:'a'},peerId),false);
 assert.equal(client.send('answer',{sdp:'a'}),true);
 FakeSocket.last.close();assert.equal(disconnected,1);assert.equal(client.send('ice',{candidate:{candidate:'x'}}),false);
});
