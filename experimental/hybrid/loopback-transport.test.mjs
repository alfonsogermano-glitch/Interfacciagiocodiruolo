import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { HybridHost } from './host-core.mjs';
import { createLoopbackTransport } from './loopback-transport.mjs';

async function setup(t) {
  const dir = mkdtempSync(join(tmpdir(),'hybrid-network-'));
  const host = new HybridHost(dir);
  const a = host.create({ ownerId:'account-a',title:'Test campaign' });
  const b = host.join({ campaignId:a.campaignId,userId:'account-b',inviteCode:a.inviteCode });
  const c = host.join({ campaignId:a.campaignId,userId:'account-c',inviteCode:a.inviteCode });
  const transport=createLoopbackTransport(host);
  const base=await transport.start();
  t.after(async()=>{await transport.close();rmSync(dir,{recursive:true,force:true});});
  const endpoint=(name)=>base+'/v1/'+name+'?campaignId='+a.campaignId;
  const req=(name,token,opts={})=>fetch(endpoint(name),{...opts,headers:{authorization:'Bearer '+token,...opts.headers}});
  return {host,a,b,c,req,endpoint,base};
}

test('two player clients communicate with the GM Host and permissions hold over HTTP',async t=>{
  const {a,b,c,req,endpoint}=await setup(t);
  const first=await req('snapshot',b.token);
  assert.equal(first.status,200);
  assert.equal((await first.json()).role,'player');
  assert.equal((await req('snapshot','no-such-token')).status,401);
  const gm=await req('command',a.token,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'assign_token',id:'hero',ownerId:'account-b'})});
  assert.equal(gm.status,200);
  const move=await req('command',b.token,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'move_token',id:'hero',x:23,y:45})});
  assert.equal(move.status,200);
  const denied=await req('command',c.token,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'move_token',id:'hero',x:0,y:0})});
  assert.equal(denied.status,400);
  const other=await req('snapshot',c.token);
  assert.equal((await other.json()).tokens.hero.x,23);
  // fetch() normalizes the Host header; use raw node:http to assert this guard.
  const unsafeStatus = await new Promise((resolve,reject) => {
    const call=httpRequest(endpoint('snapshot'), { headers: {
      authorization: 'Bearer '+b.token, host:'evil.test',
    } }, response => { response.resume(); resolve(response.statusCode); });
    call.on('error',reject);
    call.end();
  });
  assert.equal(unsafeStatus,403);
});

test('SSE streams only authorized events and replay never leaks GM notes',async t=>{
  const {a,b,c,req}=await setup(t);
  const feed=await req('events',b.token);
  assert.equal(feed.status,200);
  const reader=feed.body.getReader();
  // First chunk is a readiness comment; subscriptions are installed thereafter.
  await reader.read();
  const note=await req('command',a.token,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'note',text:'hidden temple',visibility:'gm'})});
  assert.equal(note.status,200);
  const published=await req('command',c.token,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'roll',sides:20})});
  assert.equal(published.status,200);
  const chunk=await reader.read();
  assert.equal(chunk.done,false);
  const message=new TextDecoder().decode(chunk.value);
  assert.match(message,/"type":"roll"/);
  assert.doesNotMatch(message,/hidden temple/);
  const replay=await req('replay',b.token,{headers:{'x-after-sequence':'0'}});
  assert.equal(replay.status,200);
  const entries=(await replay.json()).events;
  assert.equal(entries.length,1);
  assert.equal(entries[0].type,'roll');
  const gmReplay=await req('replay',a.token,{headers:{'x-after-sequence':'0'}});
  assert.equal((await gmReplay.json()).events.length,2);
  await reader.cancel();
});

test('network inputs reject missing credentials, huge payload, and replay errors',async t=>{
  const {a,b,req}=await setup(t);
  assert.equal((await req('snapshot','wrong')).status,401);
  assert.equal((await req('replay',b.token,{headers:{'x-after-sequence':'-1'}})).status,400);
  assert.equal((await req('command',b.token,{method:'POST',headers:{'content-type':'text/plain'},body:'{}'})).status,415);
  const tooLarge=await req('command',b.token,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'note',text:'x'.repeat(9000)})});
  assert.equal(tooLarge.status,413);
  const valid=await req('snapshot',a.token);
  assert.equal(valid.status,200);
});
