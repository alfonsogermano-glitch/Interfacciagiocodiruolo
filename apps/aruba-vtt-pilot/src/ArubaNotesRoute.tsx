import {SlideOverPanel} from '../../../src/app/components/session/SlideOverPanel';
import {ArubaOriginalSessionNotesBoundary} from 'aruba-original-session-notes-entry';
/**
 * Use the ORIGINAL SlideOverPanel DOM, sizing behavior and Escape handling.
 * This is still a gated pilot Notes entry, not yet the full SessionRightSidebar.
 */
export function ArubaNotesRoute({campaignId,userId,ownerId,onClose}:{
 campaignId:string;userId:string;ownerId:string;onClose:()=>void;
}){
 return <section className="aruba-original-notes-host" aria-label="Note della campagna">
  <SlideOverPanel isOpen onClose={onClose}
    panelWidth={Math.max(320,Math.min(1024,typeof window==='undefined'?1024:window.innerWidth-180))}
    widthClassName="max-w-none" rightOffset="5rem">
   <ArubaOriginalSessionNotesBoundary campaignId={campaignId} userId={userId}
    ownerId={ownerId}/>
  </SlideOverPanel>
 </section>;
}
