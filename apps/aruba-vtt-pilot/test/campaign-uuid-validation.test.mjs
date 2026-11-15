import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCampaign} from '../src/client.mjs';
const id='12345678-1234-4123-8123-123456789abc';
const campaign={id,ownerId:id,name:'Campaign',description:'',ruleset:'hsc',createdAt:'2026-11-14'};
test('Aruba campaign validation requires correctly grouped UUIDs for campaign and owner',()=>{
 assert.equal(validateCampaign(campaign).id,id);
 for(const bad of ['------------------------------------','12345678123441238123123456789abc----','xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx','12345678-1234-4123-8123-123456789abz']){
  assert.throws(()=>validateCampaign({...campaign,id:bad}),/Campagna non valida/);
  assert.throws(()=>validateCampaign({...campaign,ownerId:bad}),/Campagna non valida/);
 }
});
