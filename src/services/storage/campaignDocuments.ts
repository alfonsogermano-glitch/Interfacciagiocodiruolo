import { supabase } from '../../lib/supabaseClient';

type CampaignDocumentTransport = {
  load: <T>(campaignId: string, key: string) => Promise<T | null>;
  save: <T>(campaignId: string, key: string, value: T) => Promise<void>;
  remove: (campaignId: string, key: string) => Promise<void>;
  allowLegacyLocalStorage?: boolean;
};
let injectedTransport: CampaignDocumentTransport | null = null;
export function configureCampaignDocumentTransport(transport: CampaignDocumentTransport | null): void {
  injectedTransport = transport;
}
export function campaignDocumentLegacyMigrationEnabled(): boolean {
  return injectedTransport?.allowLegacyLocalStorage ?? true;
}

export async function loadCampaignDocumentOrNull<T>(campaignId: string, key: string): Promise<T | null> {
  if (injectedTransport) return injectedTransport.load<T>(campaignId, key);
  if (!supabase) throw new Error('Archivio non disponibile');
  const { data, error } = await supabase.from('campaign_documents').select('payload').eq('campaign_id', campaignId).eq('document_key', key).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.payload ?? null) as T | null;
}

export async function loadCampaignDocument<T>(campaignId: string, key: string, fallback: T): Promise<T> {
  return (await loadCampaignDocumentOrNull<T>(campaignId, key)) ?? fallback;
}

export async function saveCampaignDocument<T>(campaignId: string, key: string, value: T): Promise<void> {
  if (injectedTransport) return injectedTransport.save(campaignId, key, value);
  if (!supabase) throw new Error('Archivio non disponibile');
  const { error } = await supabase.from('campaign_documents').upsert({ campaign_id: campaignId, document_key: key, payload: value, updated_at: new Date().toISOString() }, { onConflict: 'campaign_id,document_key' });
  if (error) throw new Error(error.message);
}

export async function deleteCampaignDocument(campaignId: string, key: string): Promise<void> {
  if (injectedTransport) return injectedTransport.remove(campaignId, key);
  if (!supabase) throw new Error('Archivio non disponibile');
  const { error } = await supabase.from('campaign_documents').delete().eq('campaign_id', campaignId).eq('document_key', key);
  if (error) throw new Error(error.message);
}
