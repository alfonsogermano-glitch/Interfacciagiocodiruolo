import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, User, Loader2, Pencil, Trash2, KeyRound, MoreVertical, Users2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { CharacterCreationWizard } from './CharacterCreationWizard';
import { CharacterDetailModal } from './CharacterDetailModal';
import { loadCharactersByOwner, saveCharacter, deleteCharacter } from '../../../services/supabase/charactersService';
import type { Character } from '../../../types/character';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;
const INVITE_OPTION_VALUE = '__invite__';

type OwnedCharacter = Character & { player: string; notes: string; ownerProfileId: string; campaignId: string | null };

export function MyCharactersPage() {
  const { user, session } = useAuth();
  const { campaigns, joinedCampaigns, refreshCampaigns, refreshJoinedCampaigns } = useCampaign();

  const [characters, setCharacters] = useState<OwnedCharacter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<OwnedCharacter | null>(null);
  const [detailCharacter, setDetailCharacter] = useState<OwnedCharacter | null>(null);
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);

  const [inviteModeFor, setInviteModeFor] = useState<string | null>(null);
  const [inviteCodeDraft, setInviteCodeDraft] = useState('');
  const [pendingCharacterId, setPendingCharacterId] = useState<string | null>(null);
  const [assignErrors, setAssignErrors] = useState<Record<string, string>>({});

  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const allCampaignOptions = [
    ...campaigns.map(c => ({ id: c.id, name: c.name, suffix: '(tua campagna)' })),
    ...joinedCampaigns.map(c => ({ id: c.id, name: c.name, suffix: '(partecipi)' })),
  ];

  const campaignNameFor = (campaignId: string | null) => {
    if (!campaignId) return null;
    return allCampaignOptions.find(c => c.id === campaignId)?.name ?? null;
  };

  const load = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    const data = await loadCharactersByOwner(user.id);
    setCharacters(data);
    setIsLoading(false);
  };

  useEffect(() => { void load(); }, [user?.id]);

  useEffect(() => {
    const closeMenu = () => setOpenMenuFor(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const handleAdd = async (character: Character & { player: string; notes: string }) => {
    if (!user?.id) return;
    await saveCharacter(editingCharacter?.campaignId ?? null, character, user.id);
    setShowWizard(false);
    setEditingCharacter(null);
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Eliminare questo personaggio? L\'azione non è reversibile.')) return;
    await deleteCharacter(id);
    setOpenMenuFor(null);
    await load();
  };

  const persistCharacter = useCallback((id: string, updatedChar: OwnedCharacter) => {
    setCharacters(prev => prev.map(c => (c.id === id ? updatedChar : c)));
    if (saveTimersRef.current[id]) {
      clearTimeout(saveTimersRef.current[id]);
    }
    saveTimersRef.current[id] = setTimeout(async () => {
      try {
        await saveCharacter(updatedChar.campaignId, updatedChar, user?.id ?? '');
      } catch (error) {
        console.error('Errore salvataggio personaggio su Supabase:', error);
      }
    }, 150);
  }, [user?.id]);

  const callAssignEndpoint = async (characterId: string, body: { campaignId?: string | null; inviteCode?: string }) => {
    const accessToken = session?.access_token ?? publicAnonKey;
    const res = await fetch(`${SERVER_BASE}/characters/${characterId}/assign-campaign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Errore durante l\'operazione');
    return data;
  };

  const handleSelectChange = async (characterId: string, value: string) => {
    setAssignErrors(prev => ({ ...prev, [characterId]: '' }));
    if (value === INVITE_OPTION_VALUE) {
      setInviteModeFor(characterId);
      setInviteCodeDraft('');
      return;
    }
    setPendingCharacterId(characterId);
    try {
      await callAssignEndpoint(characterId, { campaignId: value || null });
      await Promise.all([load(), refreshCampaigns(), refreshJoinedCampaigns()]);
    } catch (err) {
      setAssignErrors(prev => ({ ...prev, [characterId]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setPendingCharacterId(null);
    }
  };

  const handleConfirmInvite = async (characterId: string) => {
    if (!inviteCodeDraft.trim()) return;
    setPendingCharacterId(characterId);
    setAssignErrors(prev => ({ ...prev, [characterId]: '' }));
    try {
      await callAssignEndpoint(characterId, { inviteCode: inviteCodeDraft.trim() });
      setInviteModeFor(null);
      setInviteCodeDraft('');
      await Promise.all([load(), refreshCampaigns(), refreshJoinedCampaigns()]);
    } catch (err) {
      setAssignErrors(prev => ({ ...prev, [characterId]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setPendingCharacterId(null);
    }
  };

  return (
    <div className="space-y-6 select-none">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-wide text-[var(--dash-text-strong)]">I miei personaggi</h2>
        <button type="button" onClick={() => { setEditingCharacter(null); setShowWizard(true); }}
          className="group inline-flex items-center gap-2 rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-bg)] px-5 py-2.5 text-sm font-semibold text-[var(--dash-text-strong)] shadow-lg shadow-black/20 transition-colors hover:bg-[var(--dash-panel)]">
          <Plus className="h-4 w-4 group-hover:animate-[plusPulse_0.75s_ease-in-out_infinite]" /> Nuovo personaggio
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[var(--dash-muted)]" /></div>
      ) : characters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/60 px-6 py-12 text-center">
          <p className="text-sm text-[var(--dash-muted)]">Non hai ancora creato nessun personaggio.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {characters.map(char => {
            const isPending = pendingCharacterId === char.id;
            const isInviteMode = inviteModeFor === char.id;
            const error = assignErrors[char.id];
            const isMenuOpen = openMenuFor === char.id;
            const campaignName = campaignNameFor(char.campaignId);

            return (
              <div
                key={char.id}
                className="group relative flex h-[156px] overflow-hidden rounded-[1.65rem] border-2 border-[var(--dash-border-soft)] bg-[var(--dash-surface)] shadow-xl transition-colors hover:border-[var(--dash-accent)]"
              >
                <button
                  type="button"
                  onClick={() => setDetailCharacter(char)}
                  className="flex flex-1 items-stretch text-left"
                >
                  <div className="relative h-full w-[130px] shrink-0 overflow-hidden bg-black/30">
                    {char.portraitCroppedImageUrl || char.portraitImageUrl ? (
                      <img src={char.portraitCroppedImageUrl || char.portraitImageUrl} alt={char.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center p-6">
                        <img
                          src="/icon-source-1024.png"
                          alt=""
                          className="h-full w-full object-contain opacity-80"
                          style={{ filter: 'invert(1)' }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-4 py-3 pr-10">
                    <h3 className="truncate text-lg font-semibold text-[var(--dash-text-strong)]">{char.name}</h3>
                    <p className="truncate text-sm text-[var(--dash-muted)]">{char.style} · {char.viaggio}</p>
                    <span className="mt-1 flex items-center gap-1 truncate text-xs text-[var(--dash-accent-2)]">
                      <Users2 className="h-3.5 w-3.5 shrink-0" />
                      {campaignName ?? 'Nessuna campagna'}
                    </span>
                  </div>
                </button>

                <div className="absolute right-3 top-3 z-10">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setOpenMenuFor(isMenuOpen ? null : char.id); }}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--dash-border-soft)] bg-black/40 text-[var(--dash-muted)] transition-colors hover:border-[var(--dash-accent)] hover:text-[var(--dash-text-strong)]"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>

                  {isMenuOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-9 z-20 w-56 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1.5 shadow-2xl"
                    >
                      <button
                        type="button"
                        onClick={() => { setEditingCharacter(char); setShowWizard(true); setOpenMenuFor(null); }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
                      >
                        <Pencil className="h-4 w-4" /> Modifica
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(char.id)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--dash-danger-text)] hover:bg-[var(--dash-danger-bg)]"
                      >
                        <Trash2 className="h-4 w-4" /> Elimina
                      </button>
                      <div className="my-1 border-t border-[var(--dash-border-soft)]" />
                      <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--dash-muted)]">
                        Assegna a campagna
                      </div>
                      {isInviteMode ? (
                        <div className="flex flex-col gap-1.5 px-3 pb-2">
                          <input
                            type="text"
                            value={inviteCodeDraft}
                            onChange={e => setInviteCodeDraft(e.target.value.toUpperCase())}
                            placeholder="Codice invito"
                            disabled={isPending}
                            className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 py-1 text-xs uppercase tracking-[0.15em] text-[var(--dash-text)]"
                          />
                          <div className="flex gap-2">
                            <button type="button" onClick={() => handleConfirmInvite(char.id)} disabled={isPending || !inviteCodeDraft.trim()}
                              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--dash-accent)] px-2 py-1 text-xs text-[var(--dash-accent)] disabled:opacity-50">
                              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                              Conferma
                            </button>
                            <button type="button" onClick={() => { setInviteModeFor(null); setInviteCodeDraft(''); }} disabled={isPending}
                              className="rounded-lg px-2 py-1 text-xs text-[var(--dash-muted)] hover:text-[var(--dash-text)]">
                              Annulla
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="px-3 pb-2">
                          <select
                            value={char.campaignId ?? ''}
                            onChange={e => handleSelectChange(char.id, e.target.value)}
                            disabled={isPending}
                            className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 py-1 text-xs text-[var(--dash-text)]"
                          >
                            <option value="">— Nessuna campagna —</option>
                            {allCampaignOptions.map(c => (
                              <option key={c.id} value={c.id}>{c.name} {c.suffix}</option>
                            ))}
                            <option value={INVITE_OPTION_VALUE}>+ Usa un codice invito...</option>
                          </select>
                          {isPending && <Loader2 className="mt-1 h-3.5 w-3.5 animate-spin text-[var(--dash-muted)]" />}
                        </div>
                      )}
                      {error && <p className="px-3 pb-2 text-xs text-[var(--dash-danger-text)]">{error}</p>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showWizard && (
        <CharacterCreationWizard
          onClose={() => { setShowWizard(false); setEditingCharacter(null); }}
          onAdd={handleAdd}
          existingCharacters={characters.filter(c => c.id !== editingCharacter?.id).map(c => ({ id: c.id, name: c.name }))}
          initialCharacter={editingCharacter}
        />
      )}

      {detailCharacter && (
        <CharacterDetailModal
          character={detailCharacter}
          onClose={() => setDetailCharacter(null)}
          onUpdate={(updated) => {
            setDetailCharacter(updated);
            persistCharacter(updated.id, updated);
          }}
        />
      )}
    </div>
  );
}
