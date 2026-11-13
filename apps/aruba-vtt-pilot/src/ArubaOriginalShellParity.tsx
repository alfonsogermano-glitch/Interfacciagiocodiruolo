import {useState} from 'react';
import {AppShell} from '../../../src/app/layout/AppShell';
import {LeftSidebar} from '../../../src/app/layout/LeftSidebar';
import {GmSectionSidebar} from '../../../src/app/layout/GmSectionSidebar';
import type {Campaign} from '../../../src/app/campaigns/campaignTypes';

/** Internal parity QA harness, NOT a substitute VTT and never a production
 * route. Original components are mounted unchanged, without legacy auth.
 * This proves original shell composition before replacing the pilot.
 * TopBar and SessionRightSidebar still require their Aruba service adapters.
 */
const fixtureCampaign:Campaign={
 id:'00000000-0000-4000-8000-000000000001',name:'Campagna di collaudo',
 description:'Dati locali di prova',ruleset:'hsc',
 ownerId:'00000000-0000-4000-8000-000000000002',
 createdAt:'2026-11-13T00:00:00.000Z',updatedAt:'2026-11-13T00:00:00.000Z',
};
export function ArubaOriginalShellParity({campaigns=[fixtureCampaign],displayName='GM di collaudo'}:{
 campaigns?:Campaign[];displayName?:string;
}={}){
 const [view,setView]=useState<'home'|'dashboard'|'campaign-home'>('dashboard');
 const [section,setSection]=useState('chapters');
 const [campaign,setCampaign]=useState<Campaign|null>(null);
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
    onSelectCampaign={value=>{setCampaign(value);setView('campaign-home');setSection('campaign-home');}}/>}
   topbar={<header data-original-topbar-slot="pending-Aruba-adapter"
    className="flex h-[76px] shrink-0 items-center justify-between border-b border-[var(--dash-border)] px-6">
    <strong>HOLLOWGATE · {displayName}</strong>
    <span className="text-xs text-[var(--dash-muted)]">TopBar originale non ancora collegata</span>
   </header>}
   rightSidebar={view==='dashboard'&&!['characters','campaigns'].includes(section)?
    <GmSectionSidebar activeTab={section} onChangeTab={go}/>:null}>
   <section className="p-6" aria-label="Contenuto di collaudo" data-active-section={section}>
    <h1 className="text-xl">Verifica struttura e navigazione</h1>
    <p>Componenti originali AppShell, LeftSidebar, GmSectionSidebar.</p>
    <p>Questa schermata non rappresenta la versione completa del VTT.</p>
   </section>
  </AppShell>
 </div>;
}
