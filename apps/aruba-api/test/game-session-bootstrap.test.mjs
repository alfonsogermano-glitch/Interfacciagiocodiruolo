import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameSessionBootstrap} from '../src/game-session-bootstrap.mjs';
const userId='00000000-0000-4000-8000-000000000002';
const ownerId='00000000-0000-4000-8000-000000000003';
const ownedId='00000000-0000-4000-8000-000000000011';
const joinedId='00000000-0000-4000-8000-000000000012';

test('live bootstrap publishes freshly verified GM and player memberships',async()=>{
 const queries=[];
 const bootstrap=createGameSessionBootstrap({
  campaigns:{list:async()=>({campaigns:[{id:ownedId,ownerId:userId}]})},
  playerCharacters:{listCampaigns:async()=>({campaigns:[{id:joinedId,ownerId},{id:ownedId,ownerId:userId}]})},
  pool:{query:async(sql,args)=>{queries.push({sql,args});return {rows:[{member_role:args[1]===ownedId?'gm':'player'}]};}},
 });
 assert.deepEqual(await bootstrap({id:userId}),[
  {userId,campaignId:ownedId,role:'gm'},
  {userId,campaignId:joinedId,role:'player'},
 ]);
 assert.deepEqual(queries.map(query=>query.args),[[userId,ownedId],[userId,joinedId]]);
});

test('live bootstrap fails closed on stale role, forged ownership and malformed lists',async()=>{
 const pool={query:async()=>({rows:[{member_role:'gm'}]})};
 await assert.rejects(()=>createGameSessionBootstrap({campaigns:{list:async()=>({campaigns:[]})},playerCharacters:{listCampaigns:async()=>({campaigns:[{id:joinedId,ownerId}]})},pool})({id:userId}),/changed/);
 await assert.rejects(()=>createGameSessionBootstrap({campaigns:{list:async()=>({campaigns:[]})},playerCharacters:{listCampaigns:async()=>({campaigns:[{id:joinedId,ownerId:userId}]})},pool})({id:userId}),/ownership/);
 await assert.rejects(()=>createGameSessionBootstrap({campaigns:{list:async()=>({campaigns:{}})},pool})({id:userId}),/owned campaign list/);
});
