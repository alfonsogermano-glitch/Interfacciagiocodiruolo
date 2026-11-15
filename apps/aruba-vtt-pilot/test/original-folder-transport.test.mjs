import test from 'node:test';
import assert from 'node:assert/strict';
import {createArubaOriginalFolderTransport} from '../src/ArubaOriginalFolderTransport.mjs';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const folder='aa2f1a87-b8ee-4b34-9da0-07efda11379a';
const newFolder='bb2f1a87-b8ee-4b34-9da0-07efda11379a';
const row=(id=folder)=>({id,name:'Segreti',scope:'gm',parentId:null,icon:null,position:1});
const json=data=>({status:200,ok:true,headers:{get:()=> 'application/json'},json:async()=>data});
test('original useFolderSection signatures transport only Aruba cookie, no Supabase',async()=>{
 const calls=[];
 let folders=[row()];
 const api=createArubaOriginalFolderTransport(async(path,opts)=>{
  calls.push({path,opts});
  const body=opts.body?JSON.parse(opts.body):{};
  if(opts.method==='GET')return json({folders});
  if(opts.method==='POST'){folders=[...folders,row(newFolder)];return json({folderId:newFolder});}
  if(path.includes('/presentation/'))
   return json({folderId:folder,icon:body.icon,position:body.position});
  if(opts.method==='PATCH')return json({folderId:folder});
  return json({archivedId:folder,cascade:body.cascade});
 });
 const loaded=await api.loadFolders(campaign,'gmnotes','https://old.invalid','legacy-placeholder');
 assert.equal(loaded[0].entityType,'gmnotes');
 const created=await api.createFolder(campaign,'gmnotes','Segreti','unused','not-a-token',null);
 assert.equal(created.id,newFolder);
 await api.renameFolder(folder,'Nuovo','unused','unused');
 await api.reorderFolder(folder,4,'unused','unused');
 await api.setFolderParent(folder,null,'unused','unused');
 await api.setFolderIcon(folder,'book-open','unused','unused');
 await api.deleteFolder(folder,'unused','unused');
 assert.equal(calls.some(x=>x.path.includes('old.invalid')),false);
 assert.equal(calls.every(x=>x.opts.credentials==='same-origin'),true);
 assert.equal(calls.every(x=>!x.opts.headers.Authorization),true);
 assert.deepEqual(calls.filter(x=>x.opts.method==='DELETE').map(x=>JSON.parse(x.opts.body).cascade),[false]);
 await assert.rejects(()=>api.renameFolder('cc2f1a87-b8ee-4b34-9da0-07efda11379a',
  'Forged','',''),/non disponibile/);
 api.clear();
 await assert.rejects(()=>api.setFolderIcon(newFolder,null,'',''),/non disponibile/);
});
test('original folder cascade never deletes content physically and is explicitly selected',async()=>{
 const requests=[];
 const api=createArubaOriginalFolderTransport(async(path,opts)=>{
  requests.push({path,opts});
  if(opts.method==='GET')return json({folders:[row()]});
  return json({archivedId:folder,cascade:true});
 });
 await api.loadFolders(campaign,'gmnotes','','');
 await api.deleteFolderCascade(folder,'','');
 assert.equal(JSON.parse(requests[1].opts.body).cascade,true);
 assert.equal(requests[1].opts.method,'DELETE');
 assert.match(requests[1].path,/campaign-note-folders/);
});
