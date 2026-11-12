import test from 'node:test';
import assert from 'node:assert/strict';
import {
 listArubaCampaignFolders,createArubaCampaignFolder,changeArubaCampaignFolder,
 renameOrNestArubaCampaignFolder,setArubaCampaignFolderPresentation,
 archiveArubaCampaignFolder,
} from '../src/campaign-folders-client.mjs';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const folder='aa2f1a87-b8ee-4b34-9da0-07efda11379a';
const child='bb2f1a87-b8ee-4b34-9da0-07efda11379a';
const reply=data=>({status:200,ok:true,headers:{get:()=> 'application/json'},json:async()=>data});
const root={id:folder,scope:'shared',name:'Cartella',parentId:null,icon:'book',position:2};
const sub={id:child,scope:'shared',name:'Figlia',parentId:folder,icon:null,position:0};
test('original folder fields are mapped from cookie-only Aruba response, no Supabase',async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{calls.push({url,options});return reply({folders:[root,sub]});};
 const list=await listArubaCampaignFolders(fetcher,campaign,'campaignnotes');
 assert.deepEqual(list[0],{id:folder,campaignId:campaign,entityType:'campaignnotes',
  name:'Cartella',parentFolderId:null,icon:'book',position:2});
 assert.equal(list[1].parentFolderId,folder);
 assert.equal(new URL('https://example.invalid'+calls[0].url).searchParams.get('scope'),'shared');
 assert.equal(calls[0].options.credentials,'same-origin');
 assert.equal(calls[0].options.redirect,'error');
 assert.equal(calls[0].options.headers.Authorization,undefined);
 await assert.rejects(()=>listArubaCampaignFolders(fetcher,campaign,'character'),/non disponibile/);
 await assert.rejects(()=>listArubaCampaignFolders(async()=>reply({folders:[root,root]}),
  campaign,'campaignnotes'),/duplicate/);
 await assert.rejects(()=>listArubaCampaignFolders(async()=>reply({folders:[sub]}),
  campaign,'campaignnotes'),/incompleta/);
 await assert.rejects(()=>listArubaCampaignFolders(async()=>reply({folders:[
  {...root,parentId:child},sub]}),campaign,'campaignnotes'),/non valida/);
 await assert.rejects(()=>listArubaCampaignFolders(async()=>reply({folders:[root]}),
  campaign,'gmnotes'),/non valida/);
});
test('folder create, rename, icon/order, and archive use exact API contracts',async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  const body=JSON.parse(options.body??'{}');
  if(options.method==='POST')return reply({folderId:folder});
  if(url.includes('/presentation/'))return reply({folderId:folder,icon:body.icon,position:body.position});
  if(options.method==='PATCH')return reply({folderId:folder});
  return reply({archivedId:folder,cascade:body.cascade});
 };
 await createArubaCampaignFolder(fetcher,campaign,'gmnotes',' Segreti ',null);
 await renameOrNestArubaCampaignFolder(fetcher,campaign,folder,'Nuovo nome',null);
 await setArubaCampaignFolderPresentation(fetcher,campaign,folder,'notebook',4);
 await archiveArubaCampaignFolder(fetcher,campaign,folder,false);
 await archiveArubaCampaignFolder(fetcher,campaign,folder,true);
 assert.deepEqual(JSON.parse(calls[0].options.body),
  {campaignId:campaign,scope:'gm',name:'Segreti',parentId:null});
 assert.deepEqual(JSON.parse(calls[1].options.body),
  {campaignId:campaign,name:'Nuovo nome',parentId:null});
 assert.deepEqual(JSON.parse(calls[2].options.body),
  {campaignId:campaign,icon:'notebook',position:4});
 assert.deepEqual(JSON.parse(calls[3].options.body),{campaignId:campaign,cascade:false});
 assert.deepEqual(JSON.parse(calls[4].options.body),{campaignId:campaign,cascade:true});
 for(const call of calls){
  assert.equal(call.options.credentials,'same-origin');
  assert.doesNotMatch(call.url+(call.options.body??''),/ownerId|role|accessToken|supabase/);
 }
});
test('partial folder edits fetch current authorized sibling fields, never invent them',async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  if(options.method==='GET')return reply({folders:[root]});
  if(url.includes('/presentation/')){
   const body=JSON.parse(options.body);return reply({folderId:folder,icon:body.icon,position:body.position});
  }
  return reply({folderId:folder});
 };
 await changeArubaCampaignFolder(fetcher,campaign,'campaignnotes',folder,{name:'Nuova'});
 await changeArubaCampaignFolder(fetcher,campaign,'campaignnotes',folder,{position:9});
 await changeArubaCampaignFolder(fetcher,campaign,'campaignnotes',folder,{parentFolderId:null});
 await changeArubaCampaignFolder(fetcher,campaign,'campaignnotes',folder,{icon:null});
 assert.deepEqual(JSON.parse(calls[1].options.body),
  {campaignId:campaign,name:'Nuova',parentId:null});
 assert.deepEqual(JSON.parse(calls[3].options.body),
  {campaignId:campaign,icon:'book',position:9});
 assert.deepEqual(JSON.parse(calls[5].options.body),
  {campaignId:campaign,name:'Cartella',parentId:null});
 assert.deepEqual(JSON.parse(calls[7].options.body),
  {campaignId:campaign,icon:null,position:2});
 const n=calls.length;
 await assert.rejects(()=>changeArubaCampaignFolder(fetcher,campaign,'campaignnotes',folder,
  {icon:null,position:1}),/non valida/);
 assert.equal(calls.length,n);
});
test('fail-closed missing IDs, invalid cascade and false confirmations',async()=>{
 const always=async()=>reply({archivedId:child,cascade:true});
 await assert.rejects(()=>archiveArubaCampaignFolder(always,campaign,folder,'true'),/non valida/);
 await assert.rejects(()=>archiveArubaCampaignFolder(always,campaign,folder,false),/non confermata/);
 await assert.rejects(()=>createArubaCampaignFolder(async()=>reply({folderId:'bad'}),
  campaign,'campaignnotes','Ok'),/non valido/);
 await assert.rejects(()=>renameOrNestArubaCampaignFolder(async()=>reply({folderId:child}),
  campaign,folder,'Ok',null),/non confermata/);
 await assert.rejects(()=>listArubaCampaignFolders(async()=>({
  status:200,ok:true,headers:{get:()=> 'text/html'},json:async()=>({folders:[]})
 }),campaign,'campaignnotes'),/JSON/);
 await assert.rejects(()=>listArubaCampaignFolders(async()=>({status:401,ok:false}),
  campaign,'campaignnotes'),/scaduta/);
});
