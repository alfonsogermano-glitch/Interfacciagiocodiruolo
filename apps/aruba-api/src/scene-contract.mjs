// Server boundary for the original Hollowgate Scene model; no persistence side effects.
import {ChapterRejected} from './chapter-contract.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS=new Set(['draft','ready','completed']);
const fields=new Set(['id','campaignId','chapterId','title','description','notes','status','environmentId','imageUrl','sortOrder','nextSceneIds','mapRegions','contextMetadata','sourceEnvironment','createdAt','updatedAt']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const iso=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString()===value;
export function validateSceneDraft(campaignId,draft){
 if(!ID.test(campaignId??''))throw new ChapterRejected('Campagna non valida');
 if(!object(draft)||Object.keys(draft).some(key=>!fields.has(key)))throw new ChapterRejected('Scena non valida');
 if(!ID.test(draft.id??'')||!ID.test(draft.chapterId??'')||
  (draft.campaignId!==undefined&&draft.campaignId!==campaignId)||
  typeof draft.title!=='string'||!draft.title.trim()||draft.title.trim().length>200||
  typeof draft.description!=='string'||draft.description.length>10000||
  typeof draft.notes!=='string'||draft.notes.length>50000||
  !STATUS.has(draft.status)||
  !(draft.environmentId===undefined||draft.environmentId===null||ID.test(draft.environmentId))||
  !(draft.imageUrl===null||(typeof draft.imageUrl==='string'&&draft.imageUrl.length<=2048&&!/supabase(?:\.co|\.in)/i.test(draft.imageUrl)))||
  !Number.isSafeInteger(draft.sortOrder)||draft.sortOrder<0||
  !Array.isArray(draft.nextSceneIds)||draft.nextSceneIds.length>100||
  draft.nextSceneIds.some(id=>typeof id!=='string'||!ID.test(id)||id===draft.id)||
  new Set(draft.nextSceneIds).size!==draft.nextSceneIds.length||
  !Array.isArray(draft.mapRegions)||draft.mapRegions.length>1000||
  !object(draft.contextMetadata)||
  !(draft.sourceEnvironment===undefined||draft.sourceEnvironment===null||object(draft.sourceEnvironment))||
  !['createdAt','updatedAt'].every(key=>draft[key]===undefined||iso(draft[key])))
  throw new ChapterRejected('Dati scena non validi');
 const timestamp=new Date().toISOString();
 return Object.freeze({...draft,campaignId,title:draft.title.trim(),
  createdAt:draft.createdAt??timestamp,updatedAt:draft.updatedAt??draft.createdAt??timestamp,
  nextSceneIds:Object.freeze([...draft.nextSceneIds])});
}
