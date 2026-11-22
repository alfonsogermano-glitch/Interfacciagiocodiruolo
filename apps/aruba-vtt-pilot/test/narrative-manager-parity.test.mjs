import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const manager=read('../src/ArubaNarrativeManager.tsx');
const pilot=read('../src/main.tsx');
const campaignHome=read('../src/ArubaCampaignHome.tsx');
const client=read('../src/client.mjs');
test('PNG, Monsters and Clues mount real Aruba CRUD only after server capability',()=>{
 assert.match(pilot,/section as 'npcs'\|'monsters'\|'clues'/);
 assert.match(pilot,/enabled=\{user\.narrativeContentEnabled\}/);
 assert.match(manager,/listArubaNarrativeContent/);
 assert.match(manager,/saveArubaNarrativeContent/);
 assert.match(manager,/deleteArubaNarrativeContent/);
 assert.doesNotMatch(manager,/localStorage|supabase/i);
});
test('CampaignHome opens real Aruba PNG and Monster details with repeatable contextual selection',()=>{
 assert.match(campaignHome,/onOpenNarrative:\(kind:'npcs'\|'monsters',id:string\)=>void/);
 assert.match(campaignHome,/onClick=\{\(\)=>onOpenNarrative\(kind==='npc'\?'npcs':'monsters',item\.id\)\}/);
 assert.match(pilot,/setNarrativeOpenRequest\(\{kind,id,requestId:\+\+requestSequence\.current\}\)/);
 assert.doesNotMatch(pilot,/setNarrativeOpenRequest[\s\S]{0,160}setSection\(kind\)/);
 assert.match(pilot,/ArubaNarrativeDetailPanel[\s\S]*narrativeOpenRequest\.requestId/);
 assert.match(manager,/initialSelection\?\.requestId/);
 assert.match(manager,/result\.some\(item=>item\.id===initialSelection\.id\)/);
});
test('narrative archive preserves type-specific labels and fail-closed deletion',()=>{
 assert.match(manager,/npcs:\{singular:'PNG'/);
 assert.match(manager,/monsters:\{singular:'Mostro'/);
 assert.match(manager,/clues:\{singular:'Indizio'/);
 assert.match(manager,/events:\{singular:'Evento'/);
 assert.match(manager,/kind==='events'/);
 assert.match(client,/method:'DELETE',credentials:'same-origin'/);
 assert.match(client,/data\?\.deleted!==true/);
});
