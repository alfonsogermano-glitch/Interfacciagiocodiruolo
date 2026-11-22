import {GameMap} from '../../../src/app/components/gm/GameMap';
import {CampaignScopeOverride} from './ArubaCampaignScopeContext';
import type {Campaign} from '../../../src/app/campaigns/campaignTypes';
export function ArubaOriginalGameMap({campaign,enabled}:{campaign:Campaign;enabled:boolean}){
 if(!enabled)return <div className="placeholder"><span className="placeholder-mark">✧</span><h2>Mappa non disponibile</h2><p>Il servizio documenti Aruba è disabilitato; nessun archivio legacy viene utilizzato.</p></div>;
 return <section aria-label="Mappa di gioco Aruba"><CampaignScopeOverride campaign={campaign}><GameMap/></CampaignScopeOverride></section>;
}
