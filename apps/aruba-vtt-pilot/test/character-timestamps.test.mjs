import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCharacterDraft,listCharacterDrafts,listClaimableCharacters,listAssignedPlayerCharacters} from '../src/client.mjs';

const owner='00000000-0000-4000-8000-000000000001';
const campaign='00000000-0000-4000-8000-000000000002';
const character={id:'00000000-0000-4000-8000-000000000003',campaignId:campaign,ownerId:owner,
 name:'Personaggio',status:'active',sheetData:{},createdAt:'2026-01-02T03:04:05.000Z',updatedAt:'2026-11-22T10:20:30.000Z'};
const response=characters=>async()=>({ok:true,json:async()=>({characters})});

test('character validator keeps server timestamps used by original catalog sorting',()=>{
 const parsed=validateCharacterDraft({...character,ownerProfileId:'ignored',arbitrary:'ignored'});
 assert.equal(parsed.createdAt,character.createdAt);
 assert.equal(parsed.updatedAt,character.updatedAt);
 assert.equal(parsed.ownerProfileId,undefined);
 assert.equal(parsed.arbitrary,undefined);
 assert.equal(Object.isFrozen(parsed),true);
});

test('older character responses without timestamps remain compatible without invented dates',()=>{
 const {createdAt,updatedAt,...older}=character;
 assert.deepEqual(validateCharacterDraft(older),older);
 assert.equal(Object.hasOwn(validateCharacterDraft(older),'createdAt'),false);
});

test('character timestamps reject malformed values rather than replacing them with current time',()=>{
 for(const field of ['createdAt','updatedAt'])for(const value of [null,0,{},[],true,'','invalid','x'.repeat(65)]){
  assert.throws(()=>validateCharacterDraft({...character,[field]:value}),/Data personaggio non valida/);
 }
});

test('owner, claimable and assigned list transports all retain authoritative timestamps',async()=>{
 const lists=await Promise.all([
  listCharacterDrafts(response([character]),campaign,owner),
  listClaimableCharacters(response([character]),campaign),
  listAssignedPlayerCharacters(response([character]),campaign),
 ]);
 for(const [row] of lists){
  assert.equal(row.createdAt,character.createdAt);
  assert.equal(row.updatedAt,character.updatedAt);
 }
});

test('creation-date ordering is possible after transport validation and differs from update-date ordering',async()=>{
 const newer={...character,id:'00000000-0000-4000-8000-000000000004',
  createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'};
 const rows=await listCharacterDrafts(response([character,newer]),campaign,owner);
 assert.deepEqual([...rows].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).map(c=>c.id),[newer.id,character.id]);
 assert.deepEqual([...rows].sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)).map(c=>c.id),[character.id,newer.id]);
});
