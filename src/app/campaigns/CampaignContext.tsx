import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { useAuth } from '../auth/AuthContext';
import type { Campaign, CampaignCreateInput, RulesetId } from './campaignTypes';
import { ensureCampaignExistsInDB } from '../../services/supabase/campaignSyncService';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;
const ACTIVE_CAMPAIGN_LS_KEY = 'hsc-active-campaign-id';
const CAMPAIGNS_CACHE_LS_KEY = 'hsc-campaigns-cache';

type CampaignContextValue = {
  campaigns: Campaign[];
  joinedCampaigns: Campaign[];
  activeCampaign: Campaign | null;
  activeCampaignId: string;
  isLoading: boolean;
  setActiveCampaign: (campaign: Campaign) => void;
  createCampaign: (input: CampaignCreateInput) => Promise<Campaign>;
  updateCampaign: (id: string, patch: Partial<CampaignCreateInput>) => Promise<void>;
  deleteCampaign: (id: string) => Promise<void>;
  refreshCampaigns: () => Promise<void>;
  refreshJoinedCampaigns: () => Promise<void>;
  joinCampaignByCode: (code: string) => Promise<Campaign>;
};

const CampaignContext = createContext<CampaignContextValue | null>(null);

// Fallback per retrocompatibilità con dati esistenti
const LEGACY_CAMPAIGN_ID = '10000000-0000-0000-0000-000000000001';

function buildHeaders(accessToken: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

export function CampaignProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>(
    () => {
      try {
        const cached = localStorage.getItem(CAMPAIGNS_CACHE_LS_KEY);
        return cached ? JSON.parse(cached) : [];
      } catch { return []; }
    }
  );
  const [activeCampaignId, setActiveCampaignId] = useState<string>(
    () => localStorage.getItem(ACTIVE_CAMPAIGN_LS_KEY) ?? LEGACY_CAMPAIGN_ID
  );
  const [joinedCampaigns, setJoinedCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const accessToken = session?.access_token ?? publicAnonKey;

  const fetchCampaigns = useCallback(async () => {
    if (!session?.access_token) {
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`${SERVER_BASE}/campaigns`, {
        headers: buildHeaders(session.access_token),
      });

      if (!res.ok) {
        console.log('Errore fetch campagne:', await res.text());
        setIsLoading(false);
        return;
      }

      const { campaigns: fetched } = await res.json();
      console.log('[CAMP-DEBUG] campagne ricevute dal server:', JSON.stringify(fetched, null, 2));
      const list: Campaign[] = fetched ?? [];
      setCampaigns(list);
      try { localStorage.setItem(CAMPAIGNS_CACHE_LS_KEY, JSON.stringify(list)); } catch { /* quota */ }
    } catch (err) {
      console.log('Errore di rete fetch campagne:', err);
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  const fetchJoinedCampaigns = useCallback(async () => {
    if (!session?.access_token) return;

    try {
      const res = await fetch(`${SERVER_BASE}/campaigns/joined`, {
        headers: buildHeaders(session.access_token),
      });

      if (!res.ok) {
        console.log('Errore fetch campagne a cui partecipo:', await res.text());
        return;
      }

      const { campaigns: fetched } = await res.json();
      setJoinedCampaigns(fetched ?? []);
    } catch (err) {
      console.log('Errore di rete fetch campagne a cui partecipo:', err);
    }
  }, [session?.access_token]);

  const joinCampaignByCode = useCallback(async (code: string): Promise<Campaign> => {
    const res = await fetch(`${SERVER_BASE}/campaigns/join`, {
      method: 'POST',
      headers: buildHeaders(accessToken),
      body: JSON.stringify({ code }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? 'Errore durante l\'iscrizione alla campagna');
    }

    const joined: Campaign = data.campaign;
    setJoinedCampaigns(prev => {
      if (prev.some(c => c.id === joined.id)) return prev;
      return [...prev, joined];
    });

    return joined;
  }, [accessToken]);

  // Carica campagne al mount e quando cambia sessione
  useEffect(() => {
    setIsLoading(true);
    void fetchCampaigns();
    void fetchJoinedCampaigns();
  }, [fetchCampaigns, fetchJoinedCampaigns]);

  // Se abbiamo campagne ma l'ID attivo non esiste più (tra quelle possedute o a cui partecipo), seleziona la prima
  useEffect(() => {
    if (isLoading || campaigns.length === 0) return;
    const all = [...campaigns, ...joinedCampaigns];
    const active = all.find(c => c.id === activeCampaignId);

    if (!active) {
      const first = campaigns[0];
      setActiveCampaignId(first.id);
      localStorage.setItem(ACTIVE_CAMPAIGN_LS_KEY, first.id);
      void ensureCampaignExistsInDB(first.id, {
        name: first.name,
        description: first.description,
        ruleset: first.ruleset,
        ownerId: first.ownerId
      });
      return;
    }

    void ensureCampaignExistsInDB(active.id, {
      name: active.name,
      description: active.description,
      ruleset: active.ruleset,
      ownerId: active.ownerId
    });
  }, [campaigns, joinedCampaigns, activeCampaignId, isLoading]);

  const markCampaignOpened = useCallback(async (campaignId: string) => {
    try {
      await fetch(`${SERVER_BASE}/campaigns/${campaignId}/open`, {
        method: 'POST',
        headers: buildHeaders(accessToken),
      });
    } catch (err) {
      console.log('Impossibile segnare la campagna come aperta:', err);
    }
  }, [accessToken]);

  const setActiveCampaign = useCallback((campaign: Campaign) => {
    setActiveCampaignId(campaign.id);
    localStorage.setItem(ACTIVE_CAMPAIGN_LS_KEY, campaign.id);
    void ensureCampaignExistsInDB(campaign.id, {
      name: campaign.name,
      description: campaign.description,
      ruleset: campaign.ruleset,
      ownerId: campaign.ownerId
    });
    if (campaign.ownerId === session?.user?.id) {
      void markCampaignOpened(campaign.id);
    }
  }, [session, markCampaignOpened]);

  const createCampaign = useCallback(async (input: CampaignCreateInput): Promise<Campaign> => {
    const res = await fetch(`${SERVER_BASE}/campaigns`, {
      method: 'POST',
      headers: buildHeaders(accessToken),
      body: JSON.stringify(input),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error ?? 'Errore durante la creazione della campagna');
    }

    const created: Campaign = data.campaign;
    setCampaigns(prev => {
      const next = [...prev, created];
      try { localStorage.setItem(CAMPAIGNS_CACHE_LS_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });

    // Seleziona la nuova campagna automaticamente
    setActiveCampaignId(created.id);
    localStorage.setItem(ACTIVE_CAMPAIGN_LS_KEY, created.id);

    return created;
  }, [accessToken]);

  const updateCampaign = useCallback(async (id: string, patch: Partial<CampaignCreateInput>) => {
    const res = await fetch(`${SERVER_BASE}/campaigns/${id}`, {
      method: 'PUT',
      headers: buildHeaders(accessToken),
      body: JSON.stringify(patch),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Errore aggiornamento campagna');

    setCampaigns(prev => {
      const next = prev.map(c => c.id === id ? data.campaign : c);
      try { localStorage.setItem(CAMPAIGNS_CACHE_LS_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, [accessToken]);

  const deleteCampaign = useCallback(async (id: string) => {
    const res = await fetch(`${SERVER_BASE}/campaigns/${id}`, {
      method: 'DELETE',
      headers: buildHeaders(accessToken),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Errore eliminazione campagna');

    setCampaigns(prev => {
      const next = prev.filter(c => c.id !== id);
      try { localStorage.setItem(CAMPAIGNS_CACHE_LS_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, [accessToken]);

  const activeCampaign =
    [...campaigns, ...joinedCampaigns].find(c => c.id === activeCampaignId) ?? null;

  return (
    <CampaignContext.Provider value={{
      campaigns,
      joinedCampaigns,
      activeCampaign,
      activeCampaignId,
      isLoading,
      setActiveCampaign,
      createCampaign,
      updateCampaign,
      deleteCampaign,
      refreshCampaigns: fetchCampaigns,
      refreshJoinedCampaigns: fetchJoinedCampaigns,
      joinCampaignByCode,
    }}>
      {children}
    </CampaignContext.Provider>
  );
}

export function useCampaign(): CampaignContextValue {
  const ctx = useContext(CampaignContext);
  if (!ctx) throw new Error('useCampaign deve essere usato dentro CampaignProvider');
  return ctx;
}
