// Native campaign Notes transport. NEVER mix with entity/character tabs.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeId=(value,label)=>{if(typeof value!=='string'||!UUID.test(value))throw Error(label+' non valido');return value;};
const opts=(method,body)=>({method,credentials:'same-origin',cache:'no-store',redirect:'error',
 headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
 ...(body?{body:JSON.stringify(body)}:{})});
async function json(response){
 if(response.status===401)throw Error('Sessione scaduta');
 if(response.status===404)throw Error('Nota non disponibile o non autorizzata');
 if(!response.ok)throw Error('Operazione Note non riuscita');
 if(!(response.headers?.get?.('content-type')??'').toLowerCase().includes('application/json'))
  throw Error('Il server Note non ha restituito JSON');
 try{return await response.json();}catch{throw Error('Risposta Note non valida');}
}
const rich=x=>x===null||(x&&typeof x==='object'&&!Array.isArray(x));
function normalize(note,campaignId,parentId){
 if(!note||typeof note!=='object'||Array.isArray(note)||!UUID.test(note.id)||
  typeof note.title!=='string'||!note.title.trim()||note.title.length>120||
  !rich(note.contentRich)||!Number.isInteger(note.position)||note.position<0||
  note.position>10000||!['all','private'].includes(note.visibility)||
  (note.parentId!==null&&!UUID.test(note.parentId)))
  throw Error('Documento Note non valido');
 if(note.parentId!==parentId)throw Error('Sottoscheda di una nota differente');
 return Object.freeze({...note,campaignId});
}
export async function listArubaCampaignNotes(fetcher,campaignId,parentId=null){
 safeId(campaignId,'Campagna');if(parentId!==null)safeId(parentId,'Nota padre');
 const query=new URLSearchParams({campaignId,...(parentId?{parentId}:{})});
 const data=await json(await fetcher('/vtt/campaign-notes?'+query,opts('GET')));
 if(!Array.isArray(data.notes)||data.notes.length>100)throw Error('Elenco Note non valido');
 const notes=data.notes.map(note=>normalize(note,campaignId,parentId));
 if(new Set(notes.map(n=>n.id)).size!==notes.length)throw Error('Note duplicate');
 return notes;
}
export async function createArubaCampaignNote(fetcher,campaignId,title,parentId=null){
 safeId(campaignId,'Campagna');if(parentId!==null)safeId(parentId,'Nota padre');
 if(typeof title!=='string'||!title.trim()||title.trim().length>120)throw Error('Titolo Nota non valido');
 const data=await json(await fetcher('/vtt/campaign-notes',opts('POST',
  {campaignId,title:title.trim(),parentId})));
 return normalize(data.note,campaignId,parentId);
}
export async function saveArubaCampaignNote(fetcher,campaignId,note){
 safeId(campaignId,'Campagna');safeId(note?.id,'Nota');
 if(note.campaignId!==campaignId)throw Error('Nota di una campagna differente');
 if(typeof note.title!=='string'||!note.title.trim()||note.title.trim().length>120||
  !rich(note.contentRich)||!Number.isInteger(note.position)||note.position<0||
  note.position>10000||!['all','private'].includes(note.visibility)||
  (note.contentRich!==null&&new TextEncoder().encode(JSON.stringify(note.contentRich)).length>49152))
  throw Error('Dati Nota non validi');
 const data=await json(await fetcher('/vtt/campaign-notes/'+note.id,opts('PATCH',
  {campaignId,title:note.title.trim(),contentRich:note.contentRich,position:note.position,visibility:note.visibility})));
 if(data.savedId!==note.id)throw Error('Salvataggio Nota non confermato');
 return note.id;
}
export async function archiveArubaCampaignNote(fetcher,campaignId,noteId){
 safeId(campaignId,'Campagna');safeId(noteId,'Nota');
 const data=await json(await fetcher('/vtt/campaign-notes/'+noteId,opts('DELETE',{campaignId})));
 if(data.archivedId!==noteId)throw Error('Archiviazione Nota non confermata');
 return noteId;
}
