import {GamePhases} from '../../../src/app/components/gm/GamePhases';
import {CampaignScopeOverride} from './ArubaCampaignScopeContext';
import type {Campaign} from '../../../src/app/campaigns/campaignTypes';
export function ArubaOriginalGamePhases({campaign,enabled}:{campaign:Campaign;enabled:boolean}){if(!enabled)return <div className="placeholder"><span className="placeholder-mark">✧</span><h2>Fasi di Gioco non disponibili</h2><p>Il servizio documenti Aruba è disabilitato; nessuno stato locale simulato viene creato.</p></div>;return <section aria-label="Fasi di Gioco Aruba"><CampaignScopeOverride campaign={campaign}><GamePhases/></CampaignScopeOverride></section>;}
