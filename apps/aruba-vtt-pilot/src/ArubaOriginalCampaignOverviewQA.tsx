import type {Campaign} from '../../../src/app/campaigns/campaignTypes';
import {RULESETS} from '../../../src/app/campaigns/campaignTypes';

/** Read-only Aruba campaign overview for the ORIGINAL shell QA.
 * This intentionally does not mount CampaignHome: that original component
 * still writes through Supabase and its realtime campaign context.
 * Only fields returned by the owner-scoped Aruba campaign API are shown.
 */
export function ArubaOriginalCampaignOverviewQA({campaigns,campaign,section,onSelectCampaign}:{
 campaigns:Campaign[];campaign:Campaign|null;section:string;
 onSelectCampaign:(campaign:Campaign)=>void;
}){
 if(section==='campaign-home'){
  if(!campaign)return <p data-campaign-overview-state="missing">Nessuna campagna selezionata.</p>;
  return <article data-campaign-overview-state="selected" data-campaign-id={campaign.id}
   className="mx-auto max-w-5xl space-y-6 p-6">
   <header className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)] p-6">
    <h1 className="text-2xl font-semibold text-[var(--dash-text-strong)]">{campaign.name}</h1>
    <p className="mt-2 text-sm text-[var(--dash-muted)]">{RULESETS[campaign.ruleset]?.name??'Regolamento non disponibile'}</p>
    {campaign.description&&<p className="mt-4 whitespace-pre-wrap break-words text-sm">{campaign.description}</p>}
   </header>
   <p className="text-sm text-[var(--dash-muted)]" data-campaign-session-state="not-connected">
    La sessione originale non è ancora collegata ad Aruba in questa anteprima di verifica.
   </p>
  </article>;
 }
 if(section==='campaigns')return <section data-campaign-overview-state="list" className="mx-auto max-w-5xl p-6">
  <h1 className="mb-5 text-2xl font-semibold text-[var(--dash-text-strong)]">Campagne</h1>
  {campaigns.length===0?<p data-campaign-overview-empty="true">Nessuna campagna disponibile.</p>:
   <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {campaigns.map(item=><button key={item.id} type="button"
     onClick={()=>onSelectCampaign(item)}
     className="min-w-0 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)] p-5 text-left hover:border-[var(--dash-accent)]">
     <span className="block break-words font-semibold text-[var(--dash-text-strong)]">{item.name}</span>
     <span className="mt-2 block text-xs text-[var(--dash-muted)]">{RULESETS[item.ruleset]?.name??'Regolamento non disponibile'}</span>
    </button>)}
   </div>}
 </section>;
 if(section==='home')return <section data-campaign-overview-state="home" className="mx-auto max-w-5xl p-6">
  <h1 className="text-2xl font-semibold text-[var(--dash-text-strong)]">Panoramica</h1>
  <p className="mt-3 text-sm text-[var(--dash-muted)]">Campagne del GM: {campaigns.length}</p>
 </section>;
 return <section data-campaign-overview-state="unavailable" className="p-6">
  <h1 className="text-xl font-semibold text-[var(--dash-text-strong)]">Sezione in migrazione</h1>
  <p className="mt-3 text-sm text-[var(--dash-muted)]">Questa sezione non è ancora collegata ai servizi Aruba.</p>
 </section>;
}
