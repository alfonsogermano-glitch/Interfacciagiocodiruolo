import {ArubaCampaignNotesProvider} from './ArubaCampaignNotesContext';
import {useCampaignNotesSection} from '../../../src/app/components/session/shared/useCampaignNotesSection';

/** The actual original hook and NoteSubTabs, compiled but NOT mounted in main.tsx. */
function OriginalNotes({campaignId,userId,isGm,scope}:{
 campaignId:string;userId:string;isGm:boolean;scope:'gm'|'shared';
}){
 const section=useCampaignNotesSection({
  campaignId,sessionKey:userId,accessToken:'aruba-cookie-session',
  currentUserId:userId,canEdit:isGm,enabled:scope==='shared'||isGm,
  scope,savedTabOrder:undefined,onPersistTabOrder:()=>{},onSelectNote:()=>{},
 });
 return <section data-original-notes-scope={scope}>
  {section.renderSidebar()}{section.renderDetail()}{section.renderDialogs()}
 </section>;
}
export function ArubaOriginalCampaignNotesBoundary({campaignId,userId,isGm}:{
 campaignId:string;userId:string;isGm:boolean;
}){
 return <ArubaCampaignNotesProvider enabled campaignId={campaignId} userId={userId} isGm={isGm}>
  <OriginalNotes campaignId={campaignId} userId={userId} isGm={isGm} scope="shared"/>
  {isGm&&<OriginalNotes campaignId={campaignId} userId={userId} isGm scope="gm"/>}
 </ArubaCampaignNotesProvider>;
}
