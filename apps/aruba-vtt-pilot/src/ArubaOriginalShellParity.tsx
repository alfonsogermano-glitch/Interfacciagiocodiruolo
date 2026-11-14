import {useState} from 'react';
import {AppShell} from '../../../src/app/layout/AppShell';
import {LeftSidebar} from '../../../src/app/layout/LeftSidebar';
import {GmSectionSidebar} from '../../../src/app/layout/GmSectionSidebar';
import type {Campaign} from '../../../src/app/campaigns/campaignTypes';
import {ArubaOriginalTopBarQA} from './ArubaOriginalTopBarQA';
import {ArubaOriginalMapToolQA} from './ArubaOriginalMapToolQA';
import {ArubaOriginalCampaignOverviewQA} from './ArubaOriginalCampaignOverviewQA';
import {ArubaOriginalCharactersQA} from './ArubaOriginalCharactersQA';

/** Internal parity QA harness, NOT a substitute VTT and never a production
 * route. Original components are mounted unchanged, without legacy auth.
 * This proves original shell composition before replacing the pilot.
 * SessionRightSidebar still requires its Aruba service adapter.
 */
const fixtureCampaign:Campaign={
 id:'00000000-0000-4000-8000-000000000001',name:'Campagna di collaudo',
 description:'Dati locali di prova',ruleset:'hsc',
 ownerId:'00000000-0000-4000-8000-000000000002',
 createdAt:'2026-11-13T00:00:00.000Z',updatedAt:'2026-11-13T00:00:00.000Z',
};
export function ArubaOriginalShellParity({campaigns=[fixtureCampaign],displayName='GM di collaudo',
 qaUser=null,mapWorkspaceQa=false,charactersEnabled=false,rosterEnabled=false}:{
 campaigns?:Campaign[];displayName?:string;
 qaUser?:{id:string;email:string;displayName:string;role:'standard'|'admin'}|null;
 mapWorkspaceQa?:boolean;charactersEnabled?:boolean;rosterEnabled?:boolean;
}={}){
 const [view,setView]=useState<'home'|'dashboard'|'campaign-home'>('dashboard');
 const [section,setSection]=useState('chapters');
 const [campaign,setCampaign]=useState<Campaign|null>(null);
 const selectCampaign=(value:Campaign)=>{
  setCampaign(value);setView('campaign-home');setSection('campaign-home');
 };
 function go(sectionId:string){
  setView('dashboard');setSection(sectionId);
 }
 return <div data-original-shell-qa="true">
  <AppShell
   settings={{language:'it',palette:'noir',saveMode:'local'}}
   leftSidebar={<LeftSidebar view={view} activeSection={section}
    campaigns={campaigns}
    selectedCampaignId={campaign?.id??null}
    onGoHome={()=>{setView('home');setCampaign(null);setSection('home');}}
    onGoToHomeSection={go}
    onGoToCharacters={()=>go('characters')}
    onGoToCampaigns={()=>go('campaigns')}
    onSelectCampaign={selectCampaign}/>}
   topbar={<ArubaOriginalTopBarQA
    user={qaUser??{id:fixtureCampaign.ownerId,email:'qa@example.invalid',displayName,role:'standard'}}
    section={section} mapWorkspaceQa={mapWorkspaceQa}/>} 
   rightSidebar={view==='dashboard'&&!['characters','campaigns'].includes(section)?
    <GmSectionSidebar activeTab={section} onChangeTab={go}/>:null}>
   <section className="p-6" aria-label="Contenuto di collaudo" data-active-section={section}>
    {section==='characters'?<ArubaOriginalCharactersQA campaignId={campaign?.id??null}
     ownerId={qaUser?.id??fixtureCampaign.ownerId} enabled={charactersEnabled}/>:
     <ArubaOriginalCampaignOverviewQA campaigns={campaigns} campaign={campaign}
      section={section} onSelectCampaign={selectCampaign} rosterEnabled={rosterEnabled}/>}
    {mapWorkspaceQa&&<ArubaOriginalMapToolQA/>}
   </section>
  </AppShell>
 </div>;
}
