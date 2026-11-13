import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createTurnCredentialService,parseTurnSharedSecret} from '../src/turn-credential-service.mjs';

const campaign='00000000-0000-4000-8000-000000000001';
const owner='00000000-0000-4000-8000-000000000002';
const player='00000000-0000-4000-8000-000000000003';
const secret=Buffer.alloc(32,47);
function make({revoked=false,role='player'}={}){
 const verifyCalls=[];
 const identity={async verify(value){
  verifyCalls.push(value);
  if(revoked)throw Error('Expired session');
  return {userId:role==='gm'?owner:player,campaignId:campaign,role};
 }};
 const service=createTurnCredentialService({identity,sharedSecret:secret,
  urls:['turn:relay.example.org:3478?transport=udp',
   'turns:relay.example.org:5349?transport=tcp'],
  ttlSeconds:300,clock:()=>1000000});
 return {service,verifyCalls};
}
test('short-lived coturn credentials derive from current authenticated campaign role',async()=>{
 const {service,verifyCalls}=make();
 const result=await service.issue({sessionToken:'cookie',campaignId:campaign,connectionRole:'player'});
 assert.equal(result.expiresAt,1300);
 assert.equal(result.iceServers.length,1);
 const entry=result.iceServers[0];
 assert.equal(entry.username,'1300:'+player);
 assert.equal(entry.credential,createHmac('sha1',secret).update(entry.username).digest('base64'));
 assert.deepEqual(verifyCalls,[{sessionToken:'cookie',campaignId:campaign,connectionRole:'player'}]);
 assert.ok(!JSON.stringify(result).includes(secret.toString()));
});
test('revoked session, wrong campaign and role fail closed',async()=>{
 const {service}=make({revoked:true});
 await assert.rejects(service.issue({sessionToken:'cookie',campaignId:campaign,
  connectionRole:'player'}));
 const wrong=make({role:'player'});
 await assert.rejects(wrong.service.issue({sessionToken:'cookie',campaignId:campaign,
  connectionRole:'host'}),{status:403});
 await assert.rejects(wrong.service.issue({sessionToken:'cookie',campaignId:'bad',
  connectionRole:'player'}),{status:401});
 assert.equal(wrong.verifyCalls.length,1);
});
test('TURN settings reject permanent credentials in URL and weak secrets',()=>{
 const identity={verify:async()=>({userId:player,campaignId:campaign,role:'player'})};
 for(const urls of [
  ['turn:alice:password@relay.example.org'],
  ['https://relay.example.org'],
  ['turn:relay.example.org/path'],
  [],
 ]){
  assert.throws(()=>createTurnCredentialService({identity,sharedSecret:secret,urls}));
 }
 assert.throws(()=>createTurnCredentialService({identity,sharedSecret:Buffer.from('short'),
  urls:['turn:relay.example.org']}));
 assert.throws(()=>createTurnCredentialService({identity,sharedSecret:secret,
  urls:['turn:relay.example.org'],ttlSeconds:3600}));
});

test('TURN secret file allows exactly one terminal newline and matches coturn HMAC',()=>{
 const hex='a'.repeat(64);
 const identity={verify:async()=>({userId:player,campaignId:campaign,role:'player'})};
 for(const suffix of ['', '\n','\r\n']){
  const bytes=parseTurnSharedSecret(Buffer.from(hex+suffix));
  assert.equal(bytes.toString('utf8'),hex);
  assert.deepEqual(createHmac('sha1',bytes).update('1300:'+player).digest(),
   createHmac('sha1',Buffer.from(hex)).update('1300:'+player).digest());
 }
 for(const invalid of [hex+'\n\n',hex+' ',hex.toUpperCase(),hex.slice(0,63),' '+hex]){
  assert.throws(()=>parseTurnSharedSecret(Buffer.from(invalid)));
 }
 assert.throws(()=>parseTurnSharedSecret('not-a-buffer'));
 const secretFile=parseTurnSharedSecret(Buffer.from(hex+'\n'));
 const turn=createTurnCredentialService({identity,sharedSecret:secretFile,
  urls:['turn:relay.example.org'],clock:()=>1000000,ttlSeconds:300});
 assert.ok(turn);
});
