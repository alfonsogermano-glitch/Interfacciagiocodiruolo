// Server-side validation boundary for the original Chapter model.
// No Supabase calls, browser storage, or database writes occur here.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS=new Set(['intro','standard','final']);
export class ChapterRejected extends Error{
 constructor(message,status=400){super(message);this.status=status;}
}
export function validateChapterDraft(campaignId,draft){
 if(!UUID.test(campaignId??''))throw new ChapterRejected('Campagna non valida');
 if(!draft||typeof draft!=='object'||Array.isArray(draft))throw new ChapterRejected('Capitolo non valido');
 const allowed=new Set(['id','title','description','notes','kind','isActive','nextChapterIds','mapUrl','mapMetadata','locationMetadata','sourceEnvironment','createdAt','updatedAt']);
 if(Object.keys(draft).some(k=>!allowed.has(k)))throw new ChapterRejected('Campi capitolo non autorizzati');
 if(typeof draft.id!=='string'||!UUID.test(draft.id)||
 typeof draft.title!=='string'||!draft.title.trim()||draft.title.trim().length>200||
 typeof draft.description!=='string'||draft.description.length>10000||
 typeof draft.notes!=='string'||draft.notes.length>50000||
 !KINDS.has(draft.kind)||typeof draft.isActive!=='boolean'||
 !Array.isArray(draft.nextChapterIds)||draft.nextChapterIds.length>100||
 draft.nextChapterIds.some(id=>typeof id!=='string'||!UUID.test(id)||id===draft.id)||
 new Set(draft.nextChapterIds).size!==draft.nextChapterIds.length||
 !(draft.mapUrl===null||(typeof draft.mapUrl==='string'&&draft.mapUrl.length<=2048&&
  !/supabase(?:\\.co|\\.in)/i.test(draft.mapUrl)))||
 !draft.mapMetadata||typeof draft.mapMetadata!=='object'||Array.isArray(draft.mapMetadata)||
 !draft.locationMetadata||typeof draft.locationMetadata!=='object'||Array.isArray(draft.locationMetadata)||
 !(draft.sourceEnvironment===undefined||draft.sourceEnvironment===null||
 (typeof draft.sourceEnvironment==='object'&&!Array.isArray(draft.sourceEnvironment)))||
 !['createdAt','updatedAt'].every(key=>draft[key]===undefined||
  (typeof draft[key]==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(draft[key])&&
   !Number.isNaN(Date.parse(draft[key]))&&new Date(draft[key]).toISOString()===draft[key])))
 throw new ChapterRejected('Dati capitolo non validi');
 return Object.freeze({...draft,title:draft.title.trim(),campaignId,nextChapterIds:Object.freeze([...draft.nextChapterIds])});
}
