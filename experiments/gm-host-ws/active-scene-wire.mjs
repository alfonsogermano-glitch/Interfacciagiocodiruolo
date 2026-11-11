// Allowlisted ActiveScenePublication transport. Experimental: does not fetch assets.
// Always create a new object: never relay a caller-owned object verbatim.
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const txt=v=>typeof v==='string'&&v.length<=250;
const clone=v=>structuredClone(v);
const list=(v,max=1000)=>Array.isArray(v)&&v.length<=max;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const pick=(value,allowed)=>{const out={};for(const k of allowed)if(own(value,k))out[k]=clone(value[k]);return out};
const publicTokenFields=['id','entityKind','entityId','name','portraitImageUrl','portraitSourceImageUrl','portraitCropArea','tokenColor','tokenBackgroundColor','tokenBorderStyle','tokenBorderThickness','tokenBorderVisible','tokenBorderLabel','x','y','locked','pinned','visible','showLabel','labelColor','size','rotation','magnetEnabled','magnetGroupId','light','vision','conditions','createdAt','updatedAt'];
const publicPoiFields=['id','x','y','iconName','color','visibleToPlayers','locked','pinned','size','rotation','lightRadius','lightConfig','light','vision','noteVisibleToPlayers','label','labelVisible','createdAt','updatedAt'];
const publicDrawingFields=['id','kind','x','y','width','height','rotation','points','style','text','locked','pinned','visible','magnetEnabled','magnetGroupId','createdAt','updatedAt'];
const rootFields=['id','campaignId','sceneId','chapterId','title','description','chapterTitle','mapUrl','sceneImageUrl','mapMetadata','mapPlacement','gridSettings','mapTokens','mapDrawings','mapPois','mapFog','mapObjectOrder','mapRegions','contextMetadata','publishedAt'];
export function validateActiveScenePublication(input){
 if(!plain(input)||!['id','campaignId','sceneId','chapterId','title','description','chapterTitle','publishedAt'].every(k=>txt(input[k])))return false;
 if(!plain(input.mapMetadata)||!plain(input.contextMetadata)||!list(input.mapRegions,1000))return false;
 for(const k of ['mapUrl','sceneImageUrl'])if(input[k]!==null&&typeof input[k]!=='string')return false;
 for(const k of ['mapTokens','mapDrawings','mapPois','mapFog','mapObjectOrder'])if(input[k]!==undefined&&!list(input[k]))return false;
 if(input.mapTokens?.some(t=>!plain(t)||!txt(t.id)))return false;
 if(input.mapDrawings?.some(t=>!plain(t)||!txt(t.id)))return false;
 if(input.mapPois?.some(t=>!plain(t)||!txt(t.id)))return false;
 if(input.mapFog?.some(t=>!plain(t)||!txt(t.id)))return false;
 if(input.mapObjectOrder?.some(t=>!plain(t)||!txt(t.id)))return false;
 try{return Buffer.byteLength(JSON.stringify(input),'utf8')<=1024*1024}catch{return false}
}
export function projectActiveScene(input,role){
 if(!validateActiveScenePublication(input))throw Error('Invalid active scene');
 const safe={};
 for(const k of rootFields)if(own(input,k))safe[k]=clone(input[k]);
 if(role==='gm')return safe;
 if(role!=='player')throw Error('Invalid role');
 // Never expose hidden map entities or their IDs to a player's browser.
 const tokens=(safe.mapTokens??[]).filter(t=>t.hiddenFromPlayers!==true&&t.visible!==false);
 const pois=(safe.mapPois??[]).filter(p=>p.visibleToPlayers===true);
 const hiddenIds=new Set([
  ...(safe.mapTokens??[]).filter(t=>t.hiddenFromPlayers===true||t.visible===false).map(t=>t.id),
  ...(safe.mapPois??[]).filter(p=>p.visibleToPlayers!==true).map(p=>p.id)
 ]);
 safe.mapTokens=tokens.map(t=>pick(t,publicTokenFields));
 safe.mapPois=pois.map(p=>({...pick(p,publicPoiFields),noteId:p.noteVisibleToPlayers===true?p.noteId??null:null}));
 safe.mapDrawings=(safe.mapDrawings??[]).filter(d=>d.visible!==false).map(d=>pick(d,publicDrawingFields));
 const invisibleDrawings=(input.mapDrawings??[]).filter(d=>d.visible===false).map(d=>d.id);
 for(const id of invisibleDrawings)hiddenIds.add(id);
 if(safe.mapObjectOrder)safe.mapObjectOrder=safe.mapObjectOrder.filter(o=>!hiddenIds.has(o.id));
 // Restrict nested metadata to the fields used by the published React scene.
 safe.mapMetadata=pick(safe.mapMetadata,['imageUrl','previewUrl','displayUrl','source','fileName','gridVisible','gridColumns','gridRows']);
 safe.contextMetadata=pick(safe.contextMetadata,['timeOfDay','period','condition']);
 // Regions, fog and gridding are considered public scene data; secret elements must never be placed in them.
 return safe;
}
