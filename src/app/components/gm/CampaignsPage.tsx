import { useState, useEffect, useMemo, useRef } from 'react';
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
  memberNames: string[];
  characters: { id: string; name: string }[];
  isOwned: boolean;
}

type SortOption = 'name-asc' | 'name-desc' | 'date-asc' | 'date-desc';

// Primi 2 nomi per esteso, poi "+N altri" - spazio limitato del badge sulla
// card (icona + testo su una riga). Fallback sul conteggio quando i nomi
// non sono disponibili (es. profilo senza display_name).
function formatMemberNames(memberNames: string[], memberCount: number): string {
  if (memberNames.length === 0) {
    return `${memberCount} ${memberCount === 1 ? 'giocatore' : 'giocatori'}`;
  }

  const shown = memberNames.slice(0, 2);
  const remaining = memberNames.length - shown.length;
  return remaining > 0 ? `${shown.join(', ')}, +${remaining} ${remaining === 1 ? 'altro' : 'altri'}` : shown.join(', ');
}

interface CampaignsPageProps {
  onNavigate: (target: { tabId: string; entityId?: string; entityType?: string }) => void;
  onEnterCampaign: (campaign: OverviewCampaign) => void;
}

export function CampaignsPage({ onNavigate, onEnterCampaign }: CampaignsPageProps) {
  const { session, user } = useAuth();
  const { createCampaign, joinedCampaigns } = useCampaign();

  const [ownedCampaigns, setOwnedCampaigns] = useState<OverviewCampaign[]>([]);
  const [joinedEnriched, setJoinedEnriched] = useState<OverviewCampaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sortOption, setSortOption] = useState<SortOption>('date-desc');
  const [characterFilter, setCharacterFilter] = useState('');
  const [rulesetFilter, setRulesetFilter] = useState('');
  const [textSearch, setTextSearch] = useState('');

  const [logoUploadFor, setLogoUploadFor] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const loadSeqRef = useRef(0);
  const [onlineCharIds, setOnlineCharIds] = useState<Record<string, Set<string>>>({});

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
    const mySeq = ++loadSeqRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const accessToken = session?.access_token ?? publicAnonKey;

      const ownedRes = await fetch(`${SERVER_BASE}/campaigns/overview`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!ownedRes.ok) throw new Error('Errore caricamento campagne possedute');
      const { campaigns: ownedData } = await ownedRes.json();
      if (loadSeqRef.current !== mySeq) return;
      setOwnedCampaigns((ownedData ?? []).map((c: any) => ({ ...c, isOwned: true })));

      // Arricchisce ciascuna campagna partecipata con i personaggi attivi e i
      // nomi dei membri; /members (dati completi) nega l'accesso ai
      // non-owner, ma /member-names (solo profileId+displayName, endpoint
      // dedicato) e' apertO anche ai membri - copre anche chi non ha ancora
      // un PG, che characters.length da solo non potrebbe mostrare.
      const enriched = await Promise.all(
        joinedCampaigns.map(async (jc) => {
          try {
            const [charsRes, memberNamesRes] = await Promise.all([
              fetch(`${SERVER_BASE}/campaigns/${jc.id}/characters`, { headers: { Authorization: `Bearer ${accessToken}` } }),
              fetch(`${SERVER_BASE}/campaigns/${jc.id}/member-names`, { headers: { Authorization: `Bearer ${accessToken}` } }),
            ]);
            const charsData = charsRes.ok ? await charsRes.json() : { characters: [] };
            const memberNamesData = memberNamesRes.ok ? await memberNamesRes.json() : { memberNames: [] };
            const characters = (charsData.characters ?? []).map((ch: any) => ({ id: ch.id, name: ch.name }));
            const memberNames = memberNamesData.memberNames ?? [];
            return {
              ...jc,
              isOwned: false,
              memberCount: memberNames.length || characters.length,
              memberNames,
              characters,
            } as OverviewCampaign;
          } catch {
            return { ...jc, isOwned: false, memberCount: 0, memberNames: [], characters: [] } as OverviewCampaign;
          }
        })
      );
      if (loadSeqRef.current !== mySeq) return;
      setJoinedEnriched(enriched);
    } catch (err) {
      if (loadSeqRef.current !== mySeq) return;
      console.error(err);
      setError('Impossibile caricare le campagne. Riprova.');
    } finally {
      if (loadSeqRef.current === mySeq) setIsLoading(false);
    }
  };

  useEffect(() => { void load(); }, [session?.access_token, joinedCampaigns.length]);

  const allCampaigns = useMemo(() => [...ownedCampaigns, ...joinedEnriched], [ownedCampaigns, joinedEnriched]);

  useEffect(() => {
    const channels: Record<string, ReturnType<typeof supabase.channel>> = {};

    allCampaigns.forEach((campaign) => {
      if (campaign.characters.length === 0 || channels[campaign.id]) return;
      const ch = supabase
        .channel(`campaign:${campaign.id}`, { config: { private: true } })
        .on('presence', { event: 'sync' }, () => {
          const state = ch.presenceState();
          const ids = new Set<string>();
          Object.values(state).forEach((presences: any) => {
            presences.forEach((p: any) => {
              if (p.role === 'player' && p.characterId) ids.add(p.characterId);
            });
          });
          setOnlineCharIds(prev => ({ ...prev, [campaign.id]: ids }));
        })
        .subscribe();
      channels[campaign.id] = ch;
    });

    return () => {
      Object.values(channels).forEach((ch) => supabase.removeChannel(ch));
    };
  }, [allCampaigns.map(c => c.id).join(',')]);

  const allCharacterNames = useMemo(() => {
    const names = new Set<string>();
    allCampaigns.forEach(c => c.characters.forEach(ch => names.add(ch.name)));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [allCampaigns]);

  const filteredSorted = useMemo(() => {
    let list = [...allCampaigns];

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
  }, [allCampaigns, characterFilter, rulesetFilter, textSearch, sortOption]);

  const handleLogoUploaded = async (campaignId: string, url: string) => {
    setOwnedCampaigns(prev => prev.map(c => (c.id === campaignId ? { ...c, logoUrl: url } : c)));
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
    setOwnedCampaigns(prev => prev.map(c => (c.id === campaignId ? { ...c, logoUrl: undefined } : c)));
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
      ) : allCampaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/60 px-6 py-12 text-center">
          <p className="text-sm text-[var(--dash-muted)]">
            Non hai ancora nessuna campagna. Creane una, oppure entra in una campagna esistente con un codice invito.
          </p>
        </div>
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
                {campaign.isOwned && (
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
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col px-5 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="truncate text-lg font-semibold text-[var(--dash-text-strong)]">{campaign.name}</h3>
                    {!campaign.isOwned && (
                      <span className="shrink-0 rounded-full bg-[var(--dash-panel)] px-2 py-0.5 text-[10px] font-semibold text-[var(--dash-accent-2)]">
                        Partecipi
                      </span>
                    )}
                  </div>
                  <RulesetTag rulesetId={campaign.ruleset} />
                </div>
                {campaign.description && (
                  <p className="mt-1 truncate text-sm text-[var(--dash-muted)]">{campaign.description}</p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--dash-text)]">
                  <span className="flex items-center gap-1" title={campaign.memberNames.join(', ')}>
                    <Users className="h-3.5 w-3.5 shrink-0" /> {formatMemberNames(campaign.memberNames, campaign.memberCount)}
                  </span>
                  {campaign.characters.length > 0 && (
                    <span className="flex flex-wrap items-center gap-1 text-[var(--dash-muted)]">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      {campaign.characters.map((ch, i) => (
                        <span key={ch.id} className="flex items-center">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onNavigate({ tabId: 'players', entityId: ch.id, entityType: 'character' }); }}
                            className="inline-flex items-center gap-1 underline-offset-2 hover:text-[var(--dash-accent-2)] hover:underline"
                          >
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                onlineCharIds[campaign.id]?.has(ch.id) ? 'bg-green-400' : 'bg-gray-600'
                              }`}
                            />
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
                    {campaign.isOwned && campaign.inviteCode ? (
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
          existingImageUrl={ownedCampaigns.find(c => c.id === logoUploadFor)?.logoUrl ?? undefined}
          onUploaded={(url) => handleLogoUploaded(logoUploadFor, url)}
          onRemove={ownedCampaigns.find(c => c.id === logoUploadFor)?.logoUrl ? () => handleLogoRemoved(logoUploadFor) : undefined}
          onClose={() => setLogoUploadFor(null)}
        />
      )}

      {showCampaignForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-semibold text-[var(--dash-text-strong)]">Nuova campagna</h3>
            {campaignFormError && (
              <div className="mb-4 rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-2 text-sm text-[var(--dash-danger-text)]">
                {campaignFormError}
              </div>
            )}
            <CampaignForm
              onSave={handleCreateCampaign}
              onCancel={() => { setShowCampaignForm(false); setCampaignFormError(null); }}
              isSubmitting={isCreatingCampaign}
            />
          </div>
        </div>
      )}
    </div>
  );
}
