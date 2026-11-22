import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createRecoveryPreview} from '../qa/recovery-preview.mjs';

test('recovery preview has synthetic scenarios and refuses actual writes',async()=>{
 const server=createRecoveryPreview().listen(0,'127.0.0.1');
 await once(server,'listening');
 const origin='http://127.0.0.1:'+server.address().port;
 try{
  const request=(path,scenario)=>fetch(origin+path,{headers:{Referer:origin+'/vtt/?scenario='+scenario}});
  assert.equal((await request('/vtt/player-campaigns','player-route-404')).status,404);
  assert.equal((await request('/vtt/player-campaigns','session-expired')).status,401);
  assert.equal((await request('/vtt/campaigns','owned-route-503')).status,503);
  const data=await (await request('/vtt/campaigns','player-route-404')).json();
  assert.equal(data.campaigns[0].name,'Campagna QA conservata');
  const html=await request('/vtt/campaign-invites/preview','player-route-404');
  assert.equal(html.headers.get('content-type'),'text/html');
  const expired=await request('/vtt/campaign-invites/preview','expired-invite');
  assert.equal((await expired.json()).error,'Codice invito non valido o scaduto');
  const write=await fetch(origin+'/vtt/campaign-invites/join',{method:'POST',body:'{}'});
  assert.equal(write.status,405);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
