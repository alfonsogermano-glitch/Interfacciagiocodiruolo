import type {JSONContent} from '@tiptap/core';
import {
 listArubaCampaignNotes,createArubaCampaignNote,saveArubaCampaignNote,
 archiveArubaCampaignNote,moveArubaCampaignNoteToFolder,setArubaCampaignNoteTitleIcon,
} from './campaign-notes-client.mjs';
export interface CampaignNoteDuplicateSource{
 id:string;tab_name:string;content:string|null;content_rich:JSONContent|null;
 hidden:boolean;folder_id:string|null;title_icon:string|null;
}
export async function setNoteTitleIcon(campaignId:string,noteId:string,icon:string|null){
 await setArubaCampaignNoteTitleIcon(fetch,campaignId,noteId,icon);
}
export async function duplicateCampaignNoteWithTitleIcon(
 source:CampaignNoteDuplicateSource,campaignId:string,_legacyToken:string,
){
 if(source.content?.trim()&&!source.content_rich)
  throw Error('Duplicazione Nota legacy non supportata senza migrazione TipTap');
 const children=await listArubaCampaignNotes(fetch,campaignId,source.id);
 if(children.some(n=>n.contentRich===null))
  throw Error('Duplicazione sottoschede legacy non supportata');
 let createdId:string|null=null;
 try{
  const note=await createArubaCampaignNote(fetch,campaignId,
   source.tab_name+' (copia)',null,source.hidden?'gm':'shared');
  createdId=note.id;
  await saveArubaCampaignNote(fetch,campaignId,{
   id:note.id,campaignId,title:note.title,contentRich:source.content_rich,
   position:note.position,visibility:note.visibility,
  });
  if(source.title_icon)await setArubaCampaignNoteTitleIcon(fetch,campaignId,note.id,source.title_icon);
  if(source.folder_id)await moveArubaCampaignNoteToFolder(fetch,campaignId,note.id,source.folder_id);
  for(const child of children){
   const copied=await createArubaCampaignNote(fetch,campaignId,child.title,note.id);
   await saveArubaCampaignNote(fetch,campaignId,{
    id:copied.id,campaignId,title:child.title,contentRich:child.contentRich,
    position:child.position,visibility:child.visibility,
   });
  }
  return note.id;
 }catch(error){
  if(createdId){
   try{await archiveArubaCampaignNote(fetch,campaignId,createdId)}
   catch{throw Error('Duplicazione incompleta: controllare il Cestino',{cause:error})}
  }
  throw error;
 }
}
