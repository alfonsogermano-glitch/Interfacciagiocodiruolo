import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadCampaignCollections} from '../src/campaign-collections.mjs';
import {CampaignSessionExpiredError} from '../src/client.mjs';
const owner='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const owned={id:'33333333-3333-4333-8333-333333333333',ownerId:owner,name:'Campagna conservata',description:'',ruleset:'hsc'};
const joined={...owned,id:'44444444-4444-4444-8444-444444444444',ownerId:other};
const user={id:owner,campaignsEnabled:true,playerCharactersEnabled:true};
const json=(campaigns)=>new Response(JSON.stringify({campaigns}),{headers:{'Content-Type':'application/json'}});

test('failed player route never erases successfully read owned campaigns',async()=>{
 const result=await loadCampaignCollections(async path=>path==='/vtt/campaigns'?json([owned]):new Response('Not Found',{status:404}),user);
 assert.equal(result.owned[0].id,owned.id);assert.deepEqual(result.joined,[]);
 assert.deepEqual(result.errors,['Impossibile caricare le campagne a cui partecipi.']);
});
test('failed owned read does not erase valid joined campaigns',async()=>{
 const result=await loadCampaignCollections(async path=>path==='/vtt/player-campaigns'?json([joined]):new Response('',{status:503}),user);
 assert.deepEqual(result.owned,[]);assert.equal(result.joined[0].id,joined.id);
 assert.equal(result.errors.length,1);
});
test('both failures remain explicit, never silently reported as an empty account',async()=>{
 const result=await loadCampaignCollections(async()=>{throw Error('private network diagnostic');},user);
 assert.deepEqual(result.owned,[]);assert.deepEqual(result.joined,[]);
 assert.equal(result.errors.length,2);assert.ok(!JSON.stringify(result).includes('private network'));
});
test('one invalid session revokes both lists even when the other request succeeded',async()=>{
 for(const failingPath of ['/vtt/campaigns','/vtt/player-campaigns'])
  await assert.rejects(()=>loadCampaignCollections(async path=>path===failingPath?new Response('',{status:401}):json(path==='/vtt/campaigns'?[owned]:[joined]),user),CampaignSessionExpiredError);
});
test('disabled capability never calls its API and is not treated as a failure',async()=>{
 const paths=[];
 const result=await loadCampaignCollections(async path=>{paths.push(path);return json([owned]);},{...user,playerCharactersEnabled:false});
 assert.deepEqual(paths,['/vtt/campaigns']);assert.deepEqual(result.joined,[]);assert.deepEqual(result.errors,[]);
});
test('HTML success fallback is not accepted as campaign data',async()=>{
 const result=await loadCampaignCollections(async path=>path==='/vtt/campaigns'?new Response('<html>SPA</html>',{headers:{'Content-Type':'text/html'}}):json([joined]),user);
 assert.deepEqual(result.owned,[]);assert.equal(result.joined[0].id,joined.id);assert.equal(result.errors.length,1);
});
test('a subsequent refresh uses only current server data, without a stale cache',async()=>{
 const fetch1=async path=>json(path==='/vtt/campaigns'?[owned]:[joined]);
 assert.equal((await loadCampaignCollections(fetch1,user)).owned.length,1);
 const next=await loadCampaignCollections(async()=>json([]),user);
 assert.deepEqual(next,{owned:[],joined:[],errors:[]});
});
test('shipping entry clears identity-scoped data and uses independent collection loader',()=>{
 const source=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
 assert.match(source,/loadCampaignCollections\(fetcher,user\)/);
 assert.match(source,/setCampaigns\(\[\]\);setJoinedCampaigns\(\[\]\);setCampaignError\(null\)/);
 assert.match(source,/setCampaignError\(errors.length\?errors.join/);
});
