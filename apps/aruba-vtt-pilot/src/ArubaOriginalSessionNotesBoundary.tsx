import {ArubaCampaignNotesProvider} from './ArubaCampaignNotesContext';
import {SessionNotesPanel} from '../../../src/app/components/session/SessionNotesPanel';

/** The actual original two-column Notes panel, with Aruba transports.
 * Access is capability-gated by main.tsx and authorized by the API.
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
