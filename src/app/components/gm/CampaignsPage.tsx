import { useState, useEffect, useMemo } from 'react';
import { Search, Users, User, KeyRound, Copy, Check, Camera, Loader2, Plus } from 'lucide-react';
import { useAuth, supabase } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { CampaignForm } from '../../campaigns/CampaignSelector';
import { RULESETS, VISIBLE_RULESETS, type RulesetId, type CampaignCreateInput } from '../../campaigns/campaignTypes';
import { ImageCropUploadModal } from '../shared/ImageCropUploadModal';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { RulesetTag } from '../shared/RulesetTag';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;

interface OverviewCampaign {
  id: string;
  name: string;
  description: string;
  ruleset: RulesetId;
  ownerId: string;
  inviteCode?: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  logoUrl?: string;
  sessionActive?: boolean;
  memberCount: number;
  characters: { id: string; name: string }[];
}

type SortOption = 'name-asc' | 'name-desc' | 'date-asc' | 'date-desc';

interface CampaignsPageProps {
  onNavigate: (target: { tabId: string; entityId?: string; entityType?: string }) => void;
  onEnterCampaign: (campaign: OverviewCampaign) => void;
}

export function CampaignsPage({ onNavigate, onEnterCampaign }: CampaignsPageProps) {
  const { session } = useAuth();
  const [campaigns, setCampaigns] = useState<OverviewCampaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sortOption, setSortOption] = useState<SortOption>('date-desc');
  const [characterFilter, setCharacterFilter] = useState('');
  const [rulesetFilter, setRulesetFilter] = useState('');
  const [textSearch, setTextSearch] = useState('');

  const [logoUploadFor, setLogoUploadFor] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [togglingSession, setTogglingSession] = useState<string | null>(null);
  const [gmPresenceStatus, setGmPresenceStatus] = useState<Record<string, 'tracking' | 'idle'>>({});

  const { createCampaign } = useCampaign();
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
  const [campaignFormError, setCampaignFormError] = useState<string | null>(null);

  const handleCreateCampaign = async (data: CampaignCreateInput) => {
    setIsCreatingCampaign(true);
    setCampaignFormError(null);
    try {
      await createCampaign(data);
      setShowCampaignForm(false);
      await load();
    } catch (err) {
      setCampaignFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreatingCampaign(false);
    }
  };

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      const res = await fetch(`${SERVER_BASE}/campaigns/overview`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Errore caricamento campagne');
      const { campaigns: data } = await res.json();
      setCampaigns(data ?? []);
    } catch (err) {
      console.error(err);
      setError('Impossibile caricare le campagne. Riprova.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void load(); }, [session?.access_token]);

  useEffect(() => {
    const channels: Record<string, ReturnType<typeof supabase.channel>> = {};

    campaigns.forEach((campaign) => {
      if (campaign.sessionActive && !channels[campaign.id]) {
        const ch = supabase
          .channel(`campaign:${campaign.id}`, { config: { private: true } })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await ch.track({ role: 'gm', online_at: new Date().toISOString() });
              setGmPresenceStatus(prev => ({ ...prev, [campaign.id]: 'tracking' }));
            }
          });
        channels[campaign.id] = ch;
      }
    });

    return () => {
      Object.values(channels).forEach((ch) => {
        ch.untrack();
        supabase.removeChannel(ch);
      });
    };
  }, [campaigns.map(c => `${c.id}:${c.sessionActive}`).join(',')]);

  const allCharacterNames = useMemo(() => {
    const names = new Set<string>();
    campaigns.forEach(c => c.characters.forEach(ch => names.add(ch.name)));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [campaigns]);

  const filteredSorted = useMemo(() => {
    let list = [...campaigns];

    if (characterFilter) {
      list = list.filter(c => c.characters.some(ch => ch.name === characterFilter));
    }
    if (rulesetFilter) {
      list = list.filter(c => c.ruleset === rulesetFilter);
    }
    if (textSearch.trim()) {
      const q = textSearch.trim().toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      switch (sortOption) {
        case 'name-asc': return a.name.localeCompare(b.name);
        case 'name-desc': return b.name.localeCompare(a.name);
        case 'date-asc': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'date-desc': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        default: return 0;
      }
    });

    return list;
  }, [campaigns, characterFilter, rulesetFilter, textSearch, sortOption]);

  const handleLogoUploaded = async (campaignId: string, url: string) => {
    setCampaigns(prev => prev.map(c => (c.id === campaignId ? { ...c, logoUrl: url } : c)));
    setLogoUploadFor(null);
    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      await fetch(`${SERVER_BASE}/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ logoUrl: url }),
      });
    } catch (err) {
      console.error('Errore salvataggio logo:', err);
    }
  };

  const handleLogoRemoved = async (campaignId: string) => {
    setCampaigns(prev => prev.map(c => (c.id === campaignId ? { ...c, logoUrl: undefined } : c)));
    setLogoUploadFor(null);
    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      await fetch(`${SERVER_BASE}/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ logoUrl: null }),
      });
    } catch (err) {
      console.error('Errore rimozione logo:', err);
    }
  };

  const copyInviteCode = (campaign: OverviewCampaign) => {
    if (!campaign.inviteCode) return;
    navigator.clipboard.writeText(campaign.inviteCode).then(() => {
      setCopiedId(campaign.id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  const toggleSession = async (campaign: OverviewCampaign) => {
    setTogglingSession(campaign.id);
    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      const res = await fetch(`${SERVER_BASE}/campaigns/${campaign.id}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ active: !campaign.sessionActive }),
      });
      if (!res.ok) throw new Error('Errore cambio stato sessione');
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingSession(null);
    }
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: 'var(--dash-surface)', border: '1px solid var(--dash-border)', borderRadius: 10,
    padding: '0.55rem 0.85rem', color: 'var(--dash-text)', fontSize: '0.85rem', outline: 'none',
  };

  return (
    <div className="space-y-6 select-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-wide text-[var(--dash-text-strong)]">Campagne</h2>
        <button
          type="button"
          onClick={() => setShowCampaignForm(true)}
          className="group inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-bg)] px-5 py-2.5 text-sm font-semibold text-[var(--dash-text-strong)] shadow-lg shadow-black/20 transition-colors hover:bg-[var(--dash-panel)]"
        >
          <Plus className="h-4 w-4 group-hover:animate-[plusPulse_0.75s_ease-in-out_infinite]" />
          Nuova Campagna
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <select value={sortOption} onChange={e => setSortOption(e.target.value as SortOption)} style={inputStyle}>
          <option value="date-desc">Più recenti prima</option>
          <option value="date-asc">Più vecchie prima</option>
          <option value="name-asc">Nome A → Z</option>
          <option value="name-desc">Nome Z → A</option>
        </select>

        <select value={characterFilter} onChange={e => setCharacterFilter(e.target.value)} style={inputStyle}>
          <option value="">Tutti i personaggi</option>
          {allCharacterNames.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        <select value={rulesetFilter} onChange={e => setRulesetFilter(e.target.value)} style={inputStyle}>
          <option value="">Tutti i regolamenti</option>
          {VISIBLE_RULESETS.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>

        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--dash-muted)' }} />
          <input
            type="text"
            value={textSearch}
            onChange={e => setTextSearch(e.target.value)}
            placeholder="Cerca per nome o descrizione..."
            style={{ ...inputStyle, width: '100%', paddingLeft: '2rem', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[var(--dash-muted)]" /></div>
      ) : error ? (
        <p className="text-sm text-[var(--dash-danger-text)]">{error}</p>
      ) : filteredSorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/60 px-6 py-12 text-center">
          <p className="text-sm text-[var(--dash-muted)]">Nessuna campagna corrisponde ai filtri.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredSorted.map(campaign => (
            <div
              key={campaign.id}
              role="button"
              tabIndex={0}
              onClick={() => onEnterCampaign(campaign)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEnterCampaign(campaign); } }}
              className="flex h-[156px] cursor-pointer overflow-hidden rounded-2xl border-2 border-[var(--dash-border-soft)] bg-[var(--dash-surface)] shadow-xl transition-colors hover:border-[var(--dash-accent)]"
            >
              <div className="relative h-full w-[154px] shrink-0 overflow-hidden bg-black/30">
                {campaign.logoUrl ? (
                  <img src={campaign.logoUrl} alt={campaign.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center p-7">
                    <img
                      src="/icon-source-1024.png"
                      alt="Hollow Gate"
                      className="h-full w-full object-contain opacity-80"
                      style={{ filter: 'invert(1)' }}
                    />
                  </div>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setLogoUploadFor(campaign.id); }}
                      style={{ position: 'absolute', bottom: 6, right: 6, width: 26, height: 26, borderRadius: '50%',
                               backgroundColor: 'var(--dash-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                               border: '2px solid var(--dash-bg)', cursor: 'pointer' }}>
                      <Camera size={13} color="var(--dash-bg)" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Modifica il logo della Campagna</TooltipContent>
                </Tooltip>
              </div>

              <div className="flex min-w-0 flex-1 flex-col px-5 py-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate text-lg font-semibold text-[var(--dash-text-strong)]">{campaign.name}</h3>
                  <RulesetTag rulesetId={campaign.ruleset} />
                </div>
                {campaign.description && (
                  <p className="mt-1 truncate text-sm text-[var(--dash-muted)]">{campaign.description}</p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--dash-text)]">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {campaign.memberCount} {campaign.memberCount === 1 ? 'giocatore' : 'giocatori'}
                  </span>
                  {campaign.characters.length > 0 && (
                    <span className="flex flex-wrap items-center gap-1 text-[var(--dash-muted)]">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      {campaign.characters.map((ch, i) => (
                        <span key={ch.id} className="flex items-center">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onNavigate({ tabId: 'players', entityId: ch.id, entityType: 'character' }); }}
                            className="underline-offset-2 hover:text-[var(--dash-accent-2)] hover:underline"
                          >
                            {ch.name}
                          </button>
                          {i < campaign.characters.length - 1 && <span className="ml-1">,</span>}
                        </span>
                      ))}
                    </span>
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {campaign.inviteCode ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); copyInviteCode(campaign); }}
                        className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2.5 py-1 text-xs text-[var(--dash-muted)] transition-colors hover:border-[var(--dash-accent)] hover:text-[var(--dash-text)]"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        <span className="font-mono tracking-[0.2em]">{campaign.inviteCode}</span>
                        {copiedId === campaign.id ? <Check className="h-3.5 w-3.5 text-[var(--dash-accent)]" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleSession(campaign); }}
                      disabled={togglingSession === campaign.id}
                      className={`inline-flex w-fit items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                        campaign.sessionActive
                          ? 'border-green-700 bg-green-900/40 text-green-300'
                          : 'border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-muted)]'
                      }`}
                    >
                      {togglingSession === campaign.id ? '...' : campaign.sessionActive ? '🟢 Sessione ON' : '⚪ Sessione OFF'}
                    </button>
                    {campaign.sessionActive && (
                      <span className="text-[10px] text-[var(--dash-muted)]">
                        Presenza: {gmPresenceStatus[campaign.id] === 'tracking' ? '✅ tracciata' : '⏳...'}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end text-xs text-[var(--dash-muted)]">
                    <span>
                      Creata il {new Date(campaign.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                    {campaign.updatedAt && new Date(campaign.updatedAt).getTime() !== new Date(campaign.createdAt).getTime() && (
                      <span>
                        Ultima modifica il {new Date(campaign.updatedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {logoUploadFor && (
        <ImageCropUploadModal
          bucket="campaign-logos"
          storagePath={`${logoUploadFor}/logo.jpg`}
          cropShape="rect"
          aspect={1}
          uploadLabel="Seleziona l'immagine del Logo Campagna"
          onUploaded={(url) => handleLogoUploaded(logoUploadFor, url)}
          onRemove={campaigns.find(c => c.id === logoUploadFor)?.logoUrl ? () => handleLogoRemoved(logoUploadFor!) : undefined}
          onClose={() => setLogoUploadFor(null)}
        />
      )}

      {showCampaignForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-surface)] p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-semibold tracking-wide text-[var(--dash-text-strong)]">Nuova campagna</h3>
            {campaignFormError && (
              <div className="mb-4 rounded-xl border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-4 py-3 text-sm text-[var(--dash-danger-text)]">
                {campaignFormError}
              </div>
            )}
            <CampaignForm
              onSave={data => void handleCreateCampaign(data)}
              onCancel={() => { setShowCampaignForm(false); setCampaignFormError(null); }}
              isSubmitting={isCreatingCampaign}
            />
          </div>
        </div>
      )}
    </div>
  );
}
