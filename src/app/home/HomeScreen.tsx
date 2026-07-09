import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  DoorOpen,
  KeyRound,
  Loader2,
  Plus,
  Scroll,
  Skull,
  UserCircle2,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useCampaign } from '../campaigns/CampaignContext';
import { CampaignForm } from '../campaigns/CampaignSelector';
import { RULESETS, type Campaign, type CampaignCreateInput, type RulesetId } from '../campaigns/campaignTypes';
import { RulesetPickerDialog } from '../campaigns/RulesetPickerDialog';
import { CharacterCreationWizard } from '../components/gm/CharacterCreationWizard';
import { RulesetTag } from '../components/shared/RulesetTag';
import { saveCharacter as saveCharacterToSupabase, loadCharactersByOwner } from '../../services/supabase/charactersService';
import type { DashboardPalette } from '../../services/settings/dashboardSettings';
import type { Character } from '../../types/character';

function formatCreatedAt(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface HomeScreenProps {
  onEnterCampaign: (campaign: Campaign) => void;
  scrollTarget?: 'characters' | 'campaigns' | null;
  onScrollHandled?: () => void;
  palette: DashboardPalette;
}

export function HomeScreen({ onEnterCampaign, scrollTarget, onScrollHandled, palette }: HomeScreenProps) {
  const { user } = useAuth();
  const {
    campaigns,
    joinedCampaigns,
    isLoading: campaignsLoading,
    createCampaign,
    joinCampaignByCode,
    generateInviteCode,
  } = useCampaign();

  const allCampaigns = useMemo(() => [...campaigns, ...joinedCampaigns], [campaigns, joinedCampaigns]);

  const charactersSectionRef = useRef<HTMLDivElement | null>(null);
  const campaignsSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!scrollTarget) return;

    const target = scrollTarget === 'characters' ? charactersSectionRef.current : campaignsSectionRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onScrollHandled?.();
  }, [scrollTarget, onScrollHandled]);

  // ─── Personaggi ────────────────────────────────────────────────────────────
  // Creazione PG: prima si scelge il regolamento, poi si apre il wizard
  const [showRulesetPicker, setShowRulesetPicker] = useState(false);
  const [characterWizardRuleset, setCharacterWizardRuleset] = useState<RulesetId | null>(null);

  const openRulesetPicker = () => setShowRulesetPicker(true);

  const chooseRulesetForNewCharacter = (rulesetId: RulesetId) => {
    setCharacterWizardRuleset(rulesetId);
    setShowRulesetPicker(false);
  };

  const handleAddCharacter = async (character: Character & { player: string; notes: string }) => {
    if (!user) return;

    try {
      await saveCharacterToSupabase(null, character, user.id, characterWizardRuleset ?? undefined);
    } catch (error) {
      console.error('Errore salvataggio personaggio:', error);
    } finally {
      setCharacterWizardRuleset(null);
    }
  };

  // ─── Campagne (GM) ──────────────────────────────────────────────────────────
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
  const [campaignFormError, setCampaignFormError] = useState<string | null>(null);
  const [copiedCampaignId, setCopiedCampaignId] = useState<string | null>(null);
  const [isGeneratingInviteCode, setIsGeneratingInviteCode] = useState(false);

  const handleGenerateInviteCode = async (campaignId: string) => {
    setIsGeneratingInviteCode(true);
    try {
      await generateInviteCode(campaignId);
    } finally {
      setIsGeneratingInviteCode(false);
    }
  };

  const handleCreateCampaign = async (data: CampaignCreateInput) => {
    setIsCreatingCampaign(true);
    setCampaignFormError(null);
    try {
      const created = await createCampaign(data);
      setShowCampaignForm(false);
      onEnterCampaign(created);
    } catch (err) {
      setCampaignFormError(String(err));
    } finally {
      setIsCreatingCampaign(false);
    }
  };

  const copyInviteCode = (campaign: Campaign) => {
    if (!campaign.inviteCode) return;
    void navigator.clipboard.writeText(campaign.inviteCode);
    setCopiedCampaignId(campaign.id);
    window.setTimeout(() => setCopiedCampaignId(null), 1800);
  };

  // ─── Sessioni a cui partecipo (Player) ─────────────────────────────────────
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null);
  const [myCharacters, setMyCharacters] = useState<Awaited<ReturnType<typeof loadCharactersByOwner>>>([]);
  const inviteCodeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    loadCharactersByOwner(user.id).then(setMyCharacters);
  }, [user?.id]);

  const focusInviteCodeInput = () => {
    window.setTimeout(() => {
      inviteCodeInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      inviteCodeInputRef.current?.focus();
    }, 100);
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCodeInput.trim()) return;

    setIsJoining(true);
    setJoinError(null);
    setJoinSuccess(null);

    try {
      const joined = await joinCampaignByCode(inviteCodeInput.trim());
      setJoinSuccess(`Ti sei unito a "${joined.name}".`);
      setInviteCodeInput('');
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div
      data-dashboard-palette={palette}
      className="relative min-h-screen overflow-x-hidden select-none bg-[var(--dash-bg)] text-[var(--dash-text)]"
    >
      {/* Atmosfera di fondo */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-50"
        style={{
          background:
            'radial-gradient(circle at 15% -10%, var(--dash-accent) 0%, transparent 40%), radial-gradient(circle at 85% 0%, var(--dash-card-shadow) 0%, transparent 45%)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_transparent_0%,_var(--dash-bg)_75%)]" />

      <main className="relative z-10 mx-auto max-w-[1400px] space-y-14 px-6 py-10">
        {/* ─── Hero ───────────────────────────────────────────────────────── */}
        <section className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] shadow-[0_0_18px_var(--dash-card-shadow)]">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Skull className="h-7 w-7 text-[var(--dash-accent)]" />
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--dash-muted)]">Hollow Gate Dashboard</p>
            <h1 className="font-serif text-3xl font-semibold tracking-wide text-[var(--dash-text-strong)] sm:text-4xl">
              Bentornato, {user?.displayName ?? user?.email}
            </h1>
          </div>
        </section>

        {/* ─── Azioni rapide ──────────────────────────────────────────────── */}
        <section>
          <div className="mb-5 flex items-center gap-2.5">
            <Zap className="h-5 w-5 text-[var(--dash-accent)]" />
            <h2 className="text-xl font-semibold tracking-wide text-[var(--dash-text-strong)]">Azioni rapide</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => { setCampaignFormError(null); setShowCampaignForm(true); }}
              className="group relative overflow-hidden rounded-2xl border border-[var(--dash-border-soft)] bg-gradient-to-br from-indigo-600 to-indigo-950 p-6 text-left text-white shadow-lg transition-all hover:-translate-y-1 hover:shadow-2xl"
            >
              <Scroll className="mb-4 h-9 w-9" />
              <h3 className="text-lg font-semibold tracking-wide">Crea campagna</h3>
              <p className="mt-1 text-sm text-white/80">Avvia una nuova storia e diventa il Game Master.</p>
            </button>

            <button
              type="button"
              onClick={openRulesetPicker}
              className="group relative overflow-hidden rounded-2xl border border-[var(--dash-border-soft)] bg-gradient-to-br from-rose-700 to-red-950 p-6 text-left text-white shadow-lg transition-all hover:-translate-y-1 hover:shadow-2xl"
            >
              <UserCircle2 className="mb-4 h-9 w-9" />
              <h3 className="text-lg font-semibold tracking-wide">Crea personaggio</h3>
              <p className="mt-1 text-sm text-white/80">Dai vita a un nuovo eroe pronto per l'avventura.</p>
            </button>

            <button
              type="button"
              onClick={focusInviteCodeInput}
              className="group relative overflow-hidden rounded-2xl border border-[var(--dash-border-soft)] bg-gradient-to-br from-emerald-600 to-teal-950 p-6 text-left text-white shadow-lg transition-all hover:-translate-y-1 hover:shadow-2xl"
            >
              <DoorOpen className="mb-4 h-9 w-9" />
              <h3 className="text-lg font-semibold tracking-wide">Unisciti a sessione</h3>
              <p className="mt-1 text-sm text-white/80">Inserisci un codice invito per entrare in una campagna.</p>
            </button>
          </div>
        </section>

        {/* ─── Sezione 2: Campagne recenti ─────────────────────────────── */}
        <section ref={campaignsSectionRef}>
          <div className="mb-5">
            <div className="flex items-center gap-2.5">
              <Scroll className="h-5 w-5 text-[var(--dash-accent)]" />
              <h2 className="text-xl font-semibold tracking-wide text-[var(--dash-text-strong)]">Campagne recenti</h2>
            </div>
          </div>

          {campaignsLoading ? (
            <div className="flex items-center justify-center rounded-2xl border border-dashed border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/60 py-12">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--dash-accent)]" />
            </div>
          ) : (() => {
            const mostRecentCampaign = campaigns.length > 0
              ? [...campaigns].sort((a, b) =>
                  new Date(b.lastOpenedAt ?? 0).getTime() - new Date(a.lastOpenedAt ?? 0).getTime()
                )[0]
              : null;

            if (!mostRecentCampaign) {
              return (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/60 px-6 py-12 text-center">
                  <Scroll className="h-10 w-10 text-[var(--dash-muted)]" />
                  <p className="text-sm text-[var(--dash-muted)]">
                    Nessuna campagna creata.
                  </p>
                </div>
              );
            }

            const ruleset = RULESETS[mostRecentCampaign.ruleset] ?? RULESETS.custom;

            return (
              <button
                type="button"
                onClick={() => onEnterCampaign(mostRecentCampaign)}
                className="w-full group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-4 pt-5 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--dash-accent)] hover:shadow-[0_8px_28px_var(--dash-card-shadow)]"
              >
                <span
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ backgroundColor: ruleset.color }}
                />

                <div className="mb-2">
                  <RulesetTag rulesetId={mostRecentCampaign.ruleset} />
                </div>
                <h3 className="text-base font-semibold tracking-wide text-[var(--dash-text-strong)]">{mostRecentCampaign.name}</h3>
                {mostRecentCampaign.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-[var(--dash-muted)]">{mostRecentCampaign.description}</p>
                )}

                {formatCreatedAt(mostRecentCampaign.createdAt) && (
                  <p className="mt-2 text-xs text-[var(--dash-muted)]">
                    Creata il {formatCreatedAt(mostRecentCampaign.createdAt)}
                  </p>
                )}

                {mostRecentCampaign.inviteCode ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={e => { e.stopPropagation(); copyInviteCode(mostRecentCampaign); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); copyInviteCode(mostRecentCampaign); } }}
                    title="Copia codice invito"
                    className="mt-3 inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2.5 py-1 text-xs text-[var(--dash-muted)] transition-colors hover:border-[var(--dash-accent)] hover:text-[var(--dash-text)]"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    <span className="font-mono tracking-[0.2em]">{mostRecentCampaign.inviteCode}</span>
                    {copiedCampaignId === mostRecentCampaign.id ? (
                      <Check className="h-3.5 w-3.5 text-[var(--dash-accent)]" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); handleGenerateInviteCode(mostRecentCampaign.id); }}
                    disabled={isGeneratingInviteCode}
                    className="mt-3 inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2.5 py-1 text-xs text-[var(--dash-muted)] transition-colors hover:border-[var(--dash-accent)] hover:text-[var(--dash-text)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isGeneratingInviteCode ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="h-3.5 w-3.5" />
                    )}
                    <span>{isGeneratingInviteCode ? 'Generazione...' : 'Genera codice invito'}</span>
                  </button>
                )}
              </button>
            );
          })()}
        </section>

        {/* ─── Sezione 3: Sessioni a cui partecipo ──────────────────────────── */}
        <section>
          <div className="mb-5">
            <div className="flex items-center gap-2.5">
              <DoorOpen className="h-5 w-5 text-[var(--dash-accent)]" />
              <h2 className="text-xl font-semibold tracking-wide text-[var(--dash-text-strong)]">Sessioni a cui partecipo</h2>
            </div>
          </div>

          <form onSubmit={handleJoinSubmit} className="mb-5 flex flex-col gap-3 rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-4 sm:flex-row sm:items-start">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs uppercase tracking-[0.2em] text-[var(--dash-muted)]">
                Codice invito
              </label>
              <input
                ref={inviteCodeInputRef}
                type="text"
                value={inviteCodeInput}
                onChange={e => setInviteCodeInput(e.target.value.toUpperCase())}
                placeholder="es. AB12CD"
                maxLength={12}
                className="w-full rounded-xl border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-2.5 text-sm uppercase tracking-[0.25em] text-[var(--dash-text)] placeholder-[var(--dash-muted)] outline-none transition-shadow focus:border-[var(--dash-accent)] focus:shadow-[0_0_0_3px_var(--dash-card-shadow)]"
              />
              {joinError && <p className="mt-1.5 text-xs text-[var(--dash-danger-text)]">{joinError}</p>}
              {joinSuccess && <p className="mt-1.5 text-xs text-[var(--dash-accent-2)]">{joinSuccess}</p>}
            </div>
            <button
              type="submit"
              disabled={isJoining || !inviteCodeInput.trim()}
              className="flex items-center justify-center gap-2 rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--dash-text-strong)] shadow-[0_0_20px_var(--dash-card-shadow)] transition-all hover:bg-[var(--dash-accent-2)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:mt-[22px]"
            >
              {isJoining && <Loader2 className="h-4 w-4 animate-spin" />}
              Unisciti
            </button>
          </form>

          {joinedCampaigns.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/60 px-6 py-12 text-center">
              <DoorOpen className="h-10 w-10 text-[var(--dash-muted)]" />
              <p className="text-sm text-[var(--dash-muted)]">
                Non partecipi ancora a nessuna sessione come giocatore. Inserisci un codice invito per unirti a una campagna.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {joinedCampaigns.map(campaign => {
                const ruleset = RULESETS[campaign.ruleset] ?? RULESETS.custom;
                const myCharacterHere = myCharacters.find(c => c.campaignId === campaign.id);
                return (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => onEnterCampaign(campaign)}
                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-4 pt-5 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--dash-accent)] hover:shadow-[0_8px_28px_var(--dash-card-shadow)]"
                  >
                    <span
                      className="absolute inset-x-0 top-0 h-1"
                      style={{ backgroundColor: ruleset.color }}
                    />
                    <div className="mb-2">
                      <RulesetTag rulesetId={campaign.ruleset} />
                    </div>
                    <h3 className="text-base font-semibold tracking-wide text-[var(--dash-text-strong)]">{campaign.name}</h3>
                    {campaign.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--dash-muted)]">{campaign.description}</p>
                    )}
                    <p className="mt-2 text-xs text-[var(--dash-accent-2)]">
                      {myCharacterHere ? `Stai giocando come: ${myCharacterHere.name}` : 'Nessun personaggio assegnato'}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* ─── Modale: scegli regolamento per nuovo PG ──────────────────────── */}
      {showRulesetPicker && (
        <RulesetPickerDialog
          onChoose={chooseRulesetForNewCharacter}
          onClose={() => setShowRulesetPicker(false)}
        />
      )}

      {/* ─── Wizard creazione personaggio ─────────────────────────────────── */}
      {characterWizardRuleset && (
        <CharacterCreationWizard
          onClose={() => setCharacterWizardRuleset(null)}
          onAdd={character => void handleAddCharacter(character)}
          existingCharacters={[]}
        />
      )}

      {/* ─── Modale: crea nuova campagna ───────────────────────────────────── */}
      {showCampaignForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-surface)] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold tracking-wide text-[var(--dash-text-strong)]">Nuova campagna</h3>
              <button
                type="button"
                onClick={() => setShowCampaignForm(false)}
                className="rounded-lg p-1.5 text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {campaignFormError && (
              <div className="mb-4 rounded-xl border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-4 py-3 text-sm text-[var(--dash-danger-text)]">
                {campaignFormError}
              </div>
            )}

            <CampaignForm
              onSave={data => void handleCreateCampaign(data)}
              onCancel={() => setShowCampaignForm(false)}
              isSubmitting={isCreatingCampaign}
            />
          </div>
        </div>
      )}
    </div>
  );
}
