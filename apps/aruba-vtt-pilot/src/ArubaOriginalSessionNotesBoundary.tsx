import {ArubaCampaignNotesProvider} from './ArubaCampaignNotesContext';
import {SessionNotesPanel} from '../../../src/app/components/session/SessionNotesPanel';

/** Isolated compile contract: the ACTUAL original two-column Notes panel.
 * Not used by main.tsx; no navigation or service is activated.
 * Owner identity must come from a trusted authenticated campaign response. */
export function ArubaOriginalSessionNotesBoundary({campaignId,userId,ownerId}:{
 campaignId:string;userId:string;ownerId:string;
}){
 const isOwner=!!ownerId&&userId===ownerId;
 return <ArubaCampaignNotesProvider enabled campaignId={campaignId}
  userId={userId} ownerId={ownerId} isGm={isOwner}>
  <SessionNotesPanel/>
 </ArubaCampaignNotesProvider>;
}
