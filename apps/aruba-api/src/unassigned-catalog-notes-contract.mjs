import {CatalogRejected,catalogId,catalogRevision} from './unassigned-catalog-contract.mjs';
const plain=value=>value!==null&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype;
const fail=()=>{throw new CatalogRejected('Dati nota catalogo non validi');};
function exact(body,keys){if(!plain(body)||Object.keys(body).sort().join(',')!==keys)fail();}
function title(value){if(typeof value!=='string'||!value.trim()||value.trim().length>120)fail();return value.trim();}
function rich(value){
 if(value===null)return null;
 let nodes=0;
 function safe(tree,depth=0){
  if(++nodes>20000||depth>64)return false;
  if(tree===null||typeof tree==='boolean')return true;
  if(typeof tree==='string')return tree.length<=1048576;
  if(typeof tree==='number')return Number.isFinite(tree);
  if(Array.isArray(tree))return tree.length<=10000&&tree.every(item=>safe(item,depth+1));
  return plain(tree)&&Object.keys(tree).length<=250&&Object.entries(tree).every(([key,item])=>
   key.length<=100&&!['__proto__','constructor','prototype'].includes(key)&&safe(item,depth+1));
 }
 if(!plain(value)||!safe(value))fail();
 const encoded=JSON.stringify(value);
 // Leave headroom for PostgreSQL jsonb's canonical whitespace.
 if(Buffer.byteLength(encoded)>950000||/supabase\.(?:co|in)|data:image\//i.test(encoded))fail();
 return structuredClone(value);
}
export function catalogNoteCreate(body){
 if(!plain(body)||!['revision,tabName','parentId,revision,tabName'].includes(Object.keys(body).sort().join(',')))fail();
 return {revision:catalogRevision(body.revision),tabName:title(body.tabName),parentId:body.parentId==null?null:catalogId(body.parentId)};
}
export function catalogNoteSave(body){
 exact(body,'content,contentRich,hidden,position,revision,tabName,visibility');
 if(typeof body.content!=='string'||Buffer.byteLength(body.content)>32768||/supabase\.(?:co|in)|data:image\//i.test(body.content)||
  !Number.isInteger(body.position)||body.position<0||body.position>10000||typeof body.hidden!=='boolean'||
  !['all','private'].includes(body.visibility))fail();
 return {...body,revision:catalogRevision(body.revision),tabName:title(body.tabName),contentRich:rich(body.contentRich)};
}
export function catalogNoteOrder(body){
 exact(body,'revision,tabOrder');
 if(!Array.isArray(body.tabOrder)||body.tabOrder.length>100)fail();
 const tabOrder=body.tabOrder.map(catalogId);
 if(new Set(tabOrder).size!==tabOrder.length)fail();
 return {revision:catalogRevision(body.revision),tabOrder};
}
export function catalogRevisionBody(body){exact(body,'revision');return catalogRevision(body.revision);}
export function catalogDuplicateBody(body){
 exact(body,'requestId,revision');
 return {revision:catalogRevision(body.revision),requestId:catalogId(body.requestId)};
}
export function catalogCopyToCampaignBody(body){
 exact(body,'revision,targetCampaignId');
 return {revision:catalogRevision(body.revision),targetCampaignId:catalogId(body.targetCampaignId)};
}
