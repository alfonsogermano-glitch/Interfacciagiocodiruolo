import {
 listArubaCampaignNotes,createArubaCampaignNote,saveArubaCampaignNote,
 archiveArubaCampaignNote,moveArubaCampaignNoteToFolder,
 setArubaCampaignSubtabOrder,toOriginalCampaignNoteTab,
} from './campaign-notes-client.mjs';
export const listArubaEntityNotes=async(fetcher,campaignId,_entityId,parentId=null)=>
 (await listArubaCampaignNotes(fetcher,campaignId,parentId))
  .map(n=>({...toOriginalCampaignNoteTab(n),campaign_id:campaignId}));
export const createArubaEntityNote=async(fetcher,campaignId,_entityId,title,parentId=null,scope=undefined)=>
 ({...toOriginalCampaignNoteTab(await createArubaCampaignNote(fetcher,campaignId,title,parentId,scope)),
   campaign_id:campaignId});
export const saveArubaEntityNote=async(fetcher,campaignId,_entityId,noteId,row)=>
 saveArubaCampaignNote(fetcher,campaignId,{
 id:noteId,campaignId,title:row.tab_name,contentRich:row.content_rich,
 position:row.position,visibility:row.visibility,
 });
export const archiveArubaEntityNote=async(fetcher,campaignId,_entityId,noteId)=>
 archiveArubaCampaignNote(fetcher,campaignId,noteId);
export const setArubaSubtabOrder=async(fetcher,campaignId,_entityId,noteId,order)=>
 setArubaCampaignSubtabOrder(fetcher,campaignId,noteId,order);
export const moveArubaEntityNote=async(fetcher,campaignId,_entityId,noteId,folderId)=>
 moveArubaCampaignNoteToFolder(fetcher,campaignId,noteId,folderId);
