import {TopBar} from '../../../src/app/layout/TopBar';
import {ArubaTopBarQaIdentity,type TopBarQaUser} from './ArubaOriginalTopBarAdapter';
/** Original TopBar, unchanged. Safe QA identity is passed by in-memory
 * context; genuine map/notification backends have NOT been migrated.
 * UI controls merely emit local QA events; no mutations are sent. */
export function ArubaOriginalTopBarQA({user,section}:{user:TopBarQaUser;section:string}){
 const report=(kind:string)=>document.dispatchEvent(
  new CustomEvent('aruba-original-topbar-qa',{detail:{kind}}));
 return <ArubaTopBarQaIdentity user={user}>
  <TopBar activeSection={section} sessionWorkspaceActive={false}
   onLogout={()=>report('logout')}
   onOpenSettings={tab=>report('settings:'+tab)}
   onReportBug={()=>report('report-bug')}/>
 </ArubaTopBarQaIdentity>;
}
