import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNarrativeContentDraft,NarrativeContentRejected} from '../src/narrative-content-contract.mjs';
const campaign='f24f6bdd-a5f7-4521-aa16-bc0854dc5841',id='c2244c0b-4b67-45c2-901a-2b4d3f7c8c42',chapter='4b2c4c0b-4b67-45c2-901a-2b4d3f7c8c42';

test('preserves bounded original models and normalizes their labels',()=>{
 const cases=[['npcs',{id,name:'  Mara  ',role:'Custode'}],['monsters',{id,name:'  Ombra  ',traitIds:[],customTraits:[]}],
  ['clues',{id,title:'  Sigillo  ',description:'',connectedTo:[]}],['events',{id,title:'  Eclissi  ',consequences:[],choices:[]}]];
 for(const [kind,draft] of cases){
  const value=validateNarrativeContentDraft(campaign,kind,{...draft,chapterId:chapter,sceneId:null});
  assert.equal(value.campaignId,campaign);assert.equal(value[kind==='clues'||kind==='events'?'title':'name'],draft[kind==='clues'||kind==='events'?'title':'name'].trim());
 }
});

test('rejects forged placement, legacy assets and unsafe or unbounded JSON',()=>{
 const invalid=[
  ['npcs',{id,name:'Mara',sceneId:id,chapterId:null}],
  ['npcs',{id,name:'Mara',environmentId:chapter}],
  ['clues',{id,title:'Sigillo',imageUrl:'https://legacy.supabase.co/a.png'}],
  ['events',{id,title:'Evento',deep:{a:{b:{c:{d:{e:{f:{g:{h:{i:{j:{k:{l:{m:true}}}}}}}}}}}}}}],
 ];
 for(const [kind,draft] of invalid)assert.throws(()=>validateNarrativeContentDraft(campaign,kind,draft),NarrativeContentRejected);
 assert.throws(()=>validateNarrativeContentDraft(campaign,'other',{id,name:'No'}),NarrativeContentRejected);
});

test('round-trips semantically valid original PNG and monster fields',()=>{
 const asset='8d2f4c0b-4b67-45c2-901a-2b4d3f7c8c42';
 const npc=validateNarrativeContentDraft(campaign,'npcs',{id,name:'Mara',ruleset:'hsc',visibleToPlayers:true,
  freschezza:3,maxFreschezza:5,caselleFrischezzaCruciali:[2,5],attacco:'Critico',difesa:'Base',
  portraitImageUrl:`/vtt/campaigns/${campaign}/visual-assets/${asset}/content`,
  d20Stats:{hp:8,maxHp:10,ac:12,speed:30,str:10,dex:12,con:11,int:14,wis:9,cha:13},tags:['custode']});
 assert.deepEqual(npc.caselleFrischezzaCruciali,[2,5]);
 const monster=validateNarrativeContentDraft(campaign,'monsters',{id,name:'Ombra',ruleset:'hsc',audacia:2,
  portraitCrop:{x:0,y:0,scale:1},coverCrop:{x:2,y:-1,scale:1.2},traitIds:['terrificante'],
  customTraits:[{id:'trait-1',name:'Gelido',description:'Descrizione'}],specialActionIds:['assalto'],
  customSpecialActions:[{id:'action-1',name:'Urlo',description:'Tiro Follia'}],tiroFollia:'Estremo'});
 assert.equal(monster.customSpecialActions[0].name,'Urlo');
});

test('rejects malformed original entity semantics before persistence',()=>{
 const invalid=[
  ['npcs',{id,name:'Mara',visibleToPlayers:'yes'}],
  ['npcs',{id,name:'Mara',attacco:'Facile'}],
  ['npcs',{id,name:'Mara',d20Stats:{hp:Infinity}}],
  ['monsters',{id,name:'Ombra',traitIds:[42]}],
  ['monsters',{id,name:'Ombra',portraitCrop:{x:0,y:0,scale:0}}],
  ['monsters',{id,name:'Ombra',customTraits:[{id:'x',name:'X'}]}],
  ['monsters',{id,name:'Ombra',portraitFrameAssetId:'not-a-uuid'}]
  ,['monsters',{id,name:'Ombra',coverImageUrl:'data:image/png;base64,AAAA'}]
  ,['npcs',{id,name:'Mara',portraitImageUrl:`/vtt/campaigns/${id}/visual-assets/${chapter}/content`}]
 ];
 for(const [kind,draft] of invalid)assert.throws(()=>validateNarrativeContentDraft(campaign,kind,draft),NarrativeContentRejected);
});
