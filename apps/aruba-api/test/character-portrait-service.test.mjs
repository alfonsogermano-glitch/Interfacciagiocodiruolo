import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacterPortraitService} from '../src/character-portrait-service.mjs';
const owner='971e26ae-eecb-4f37-ad03-56b0c3000789';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const pg='ee2f1a87-b8ee-4b34-9da0-07efda11379a';
const bytes=Buffer.from('89504e470d0a1a0a0000000d49484452','hex');
test('portrait service persists only owner-scoped binary through a SQL function',async()=>{
 const calls=[];
 const svc=createCharacterPortraitService({pool:{query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('save_owned'))return {rows:[{saved:true}]};
  return {rows:[{mime_type:'image/png',bytes}]};
 }}});
 assert.deepEqual(await svc.save(owner,campaign,pg,{campaignId:campaign,mimeType:'image/png',dataBase64:bytes.toString('base64')}),{characterId:pg,stored:true});
 assert.deepEqual(calls[0].args.slice(0,4),[owner,campaign,pg,'image/png']);
 assert.equal(calls[0].args[4].equals(bytes),true);
 assert.match(calls[0].sql,/save_owned_character_portrait/);
 assert.equal((await svc.read(owner,campaign,pg)).dataBase64,bytes.toString('base64'));
 assert.match(calls[1].sql,/read_authorized_character_portrait/);
});
test('malformed, forged or oversized inputs reject before any database writes',async()=>{
 let calls=0;
 const svc=createCharacterPortraitService({pool:{query:async()=>{calls++;return {rows:[]};}}});
 const good={campaignId:campaign,mimeType:'image/png',dataBase64:bytes.toString('base64')};
 for(const body of [{...good,ownerId:owner},{...good,mimeType:'image/svg+xml'},
   {...good,dataBase64:Buffer.alloc(524289).toString('base64')},
   {...good,dataBase64:'A'.repeat(16)},
   {...good,dataBase64:Buffer.from('not an image string').toString('base64')}])
  await assert.rejects(()=>svc.save(owner,campaign,pg,body));
 await assert.rejects(()=>svc.save('forged',campaign,pg,good));
 assert.equal(calls,0);
});
test('unassigned and foreign IDs do not reveal portrait data',async()=>{
 const svc=createCharacterPortraitService({pool:{query:async()=>({rows:[]})}});
 await assert.rejects(()=>svc.read(owner,campaign,pg),e=>e.status===404);
 await assert.rejects(()=>svc.read(owner,'forged',pg),e=>e.status===400);
});
