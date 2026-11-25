// TEST ONLY. No production data, authentication, network or successful fake writes.
import {Fragment} from 'react';
const fixture=()=>(window as any).__HG_SHEET_REFERENCE__;
const noWrite=()=>{throw Error('VISUAL_REFERENCE_READ_ONLY');};
export const projectId='isolated-visual-reference';
export const useAuth=()=>({user:{id:fixture().ownerId},session:null});
export const useCampaign=()=>({
 activeCampaignId:fixture().campaignId,
 activeCampaign:{id:fixture().campaignId,ownerId:fixture().ownerId,ruleset:'hsc'},
 campaigns:[],joinedCampaigns:[],
});
export const useRuleset=()=>({isHSC:true,isDnD5e:false,isPathfinder:false});
export const useCampaignChannel=()=>{};
export const loadCharacters=async()=>fixture().characters;
export const loadCharactersViaServer=loadCharacters;
export const loadNPCs=async()=>fixture().npcs;
export const loadMonsters=async()=>fixture().monsters;
export const toCamelCase=(value:unknown)=>value;
export const mapRowToCharacter=(value:unknown)=>value;
export const isLastActiveCharacterForOwner=async()=>false;
export const saveCharacter=noWrite,saveCharacterAsGm=noWrite,unassignCharacterFromCampaign=noWrite;
export const saveNPC=noWrite,saveMonster=noWrite,deleteNPC=noWrite,deleteMonster=noWrite;
export const unassignNPCFromCampaign=noWrite,unassignMonsterFromCampaign=noWrite;
export const copyNPCToCampaign=noWrite,copyMonsterToCampaign=noWrite;
export function useFolderSection(options:any){
 return {
  folders:[],currentFolderId:null,folderPath:[],createDisabledReason:null,
  iconPickerFolder:null,deleteFolderTarget:null,folderToDelete:null,
  dnd:{draggedItem:null,dropTarget:null},
  renderRows:()=>options.items.map((item:any)=><Fragment key={item.id}>{options.renderCard(item)}</Fragment>),
  renderGhost:()=>null,
  handleCreateFolder:noWrite,reloadFolders:async()=>{},setCurrentFolderId:noWrite,
 };
}
