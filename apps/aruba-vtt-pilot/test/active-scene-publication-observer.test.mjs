import test from 'node:test';
import assert from 'node:assert/strict';
import {
 subscribeCommittedMapPublication,notifyCommittedMapPublication,
 subscribeFailedMapPublication,notifyFailedMapPublication,
} from '../../../src/app/components/session/activeScenePublicationObserver.ts';
const campaign='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const publication={campaignId:campaign,chapterId:'chapter',publishedAt:'2026-11-14T00:00:00.000Z',mapTokens:[{id:'token',x:1}]};
test('two identical settled callbacks can unsubscribe independently',()=>{
 let called=0;
 const listener=()=>called++;
 const stopA=subscribeCommittedMapPublication(campaign,listener);
 const stopB=subscribeCommittedMapPublication(campaign,listener);
 notifyCommittedMapPublication(publication);
 assert.equal(called,2);
 stopA();stopA();
 notifyCommittedMapPublication(publication);
 assert.equal(called,3);
 stopB();
 notifyCommittedMapPublication(publication);
 assert.equal(called,3);
});
test('duplicate failure callbacks unsubscribe independently and are campaign-scoped',()=>{
 let called=0;
 const listener=()=>called++;
 const stopA=subscribeFailedMapPublication(campaign,listener);
 const stopB=subscribeFailedMapPublication(campaign,listener);
 notifyFailedMapPublication(other);
 assert.equal(called,0);
 notifyFailedMapPublication(campaign);
 assert.equal(called,2);
 stopA();stopA();
 notifyFailedMapPublication(campaign);
 assert.equal(called,3);
 stopB();
 notifyFailedMapPublication(campaign);
 assert.equal(called,3);
});
test('settled publication observers receive separate cloned state and cannot mutate the source',()=>{
 let first,second;
 const stopA=subscribeCommittedMapPublication(campaign,value=>{
  first=value;
  value.state.mapTokens[0].x=999;
 });
 const stopB=subscribeCommittedMapPublication(campaign,value=>{second=value;});
 notifyCommittedMapPublication(publication);
 assert.equal(publication.mapTokens[0].x,1);
 assert.equal(second.state.mapTokens[0].x,1);
 assert.notStrictEqual(first.state,second.state);
 stopA();stopB();
});
