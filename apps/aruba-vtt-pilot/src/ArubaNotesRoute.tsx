import {ArubaOriginalSessionNotesBoundary} from 'aruba-original-session-notes-entry';
export function ArubaNotesRoute({campaignId,userId,ownerId}:{
 campaignId:string;userId:string;ownerId:string;
}){
 return <section className="aruba-original-notes-host" aria-label="Note della campagna">
  <ArubaOriginalSessionNotesBoundary campaignId={campaignId} userId={userId}
   ownerId={ownerId}/>
 </section>;
}
