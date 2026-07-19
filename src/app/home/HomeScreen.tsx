import { useEffect, useRef, useState } from 'react';
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
import { useCampaign, type InvitePreview } from '../campaigns/CampaignContext';
import { CampaignForm } from '../campaigns/CampaignSelector';
import { type Campaign, type CampaignCreateInput, type RulesetId, isRulesetCompatible } from '../campaigns/campaignTypes';
import { RulesetPickerDialog } from '../campaigns/RulesetPickerDialog';
import { CharacterCreationWizard } from '../components/gm/CharacterCreationWizard';
import { CampaignBannerDisplay } from '../components/shared/CampaignBannerDisplay';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { JoinCampaignCharacterDialog, type JoinCampaignCharacterOption } from '../components/session/shared/JoinCampaignCharacterDialog';
import {
  saveCharacter as saveCharacterToSupabase, loadCharactersByOwner,
  assignCharacterToCampaign, claimCharacter, loadAvailableCharactersInCampaigns,
} from '../../services/supabase/charactersService';
import type { DashboardPalette } from '../../services/settings/dashboardSettings';
import type { Character } from '../../types/character';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;

interface HomeScreenProps {
  onEnterCampaign: (campaign: Campaign) => void;
  scrollTarget?: 'characters' | 'campaigns' | null;
  onScrollHandled?: () => void;
  palette: DashboardPalette;
}

export function HomeScreen({ onEnterCampaign, scrollTarget, onScrollHandled, palette }: HomeScreenProps) {
  const { user, session } = useAuth();
  const {
    campaigns,
    isLoading: campaignsLoading,
    createCampaign,
    previewInviteCode,
    joinCampaignByCode,
    refreshJoinedCampaigns,
    generateInviteCode,
  } = useCampaign();

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

  // ─── Unisciti a campagna (Player) ──────────────────────────────────────────
  // Due passaggi, non uno: prima si risolve il codice in {campaignName,
  // ruleset} SENZA unirsi (previewInviteCode, nessun effetto collaterale),
  // si incrocia col ruleset dei propri PG e con i precompilati disponibili
  // nella campagna target (loadAvailableCharactersInCampaigns, scoped alla
  // sola campagna risolta) - se nessuna delle due liste ha qualcosa la join
  // non parte affatto (nessuna eccezione "crea un PG al volo"); solo se c'e'
  // almeno un'opzione si passa alla scelta.
  //
  // Le due scelte completano la join in modo diverso: un PG proprio passa
  // da assignCharacterToCampaign con {inviteCode} (chiamata singola atomica,
  // gestisce membership+assegnazione insieme - stessa identica funzione/
  // endpoint del terzo flusso in MyCharactersPage.tsx). Un PG precompilato
  // richiede prima la membership vera e propria (joinCampaignByCode, non
  // solo l'anteprima) e poi claimCharacter - due chiamate perche' claim
  // richiede membership preesistente e non la crea da solo; joinCampaignByCode
  // e' pero' idempotente (addPlayerToCampaign non duplica un membro gia'
  // presente), quindi sicura da ripetere se claimCharacter fallisse e
  // l'utente riprovasse con un altro personaggio.
  const [showJoinCodeStep, setShowJoinCodeStep] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [myCharacters, setMyCharacters] = useState<Awaited<ReturnType<typeof loadCharactersByOwner>>>([]);
  const [pendingJoin, setPendingJoin] = useState<{
    code: string;
    preview: InvitePreview;
    ownCharacters: JoinCampaignCharacterOption[];
    availableCharacters: JoinCampaignCharacterOption[];
  } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    loadCharactersByOwner(user.id).then(setMyCharacters);
  }, [user?.id]);

  const openJoinFlow = () => {
    setInviteCodeInput('');
    setJoinError(null);
    setShowJoinCodeStep(true);
  };

  const handlePreviewCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = inviteCodeInput.trim();
    if (!code) return;

    setIsJoining(true);
    setJoinError(null);

    try {
      const preview = await previewInviteCode(code);
      const ownCharacters = myCharacters.filter(c => isRulesetCompatible(c.ruleset, null, preview.ruleset));
      const availableCharacters = await loadAvailableCharactersInCampaigns([preview.campaignId]);

      if (ownCharacters.length === 0 && availableCharacters.length === 0) {
        setJoinError(
          `Nessuno dei tuoi personaggi è compatibile con il regolamento di "${preview.campaignName}" e non ci sono personaggi precompilati disponibili. ` +
          'Crea o richiedi un personaggio compatibile, poi riprova.'
        );
        return;
      }

      setPendingJoin({
        code,
        preview,
        ownCharacters,
        availableCharacters: availableCharacters.map(c => ({ id: c.id, name: c.name, ruleset: c.ruleset })),
      });
      setShowJoinCodeStep(false);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsJoining(false);
    }
  };

  const finishJoinAndEnter = async () => {
    const freshJoined = await refreshJoinedCampaigns();
    const entered = freshJoined.find(c => c.id === pendingJoin?.preview.campaignId);
    setPendingJoin(null);
    if (entered) onEnterCampaign(entered);
  };

  const handleSelectOwnCharacterForJoin = async (characterId: string) => {
    if (!pendingJoin) return;
    setIsJoining(true);
    setJoinError(null);

    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      await assignCharacterToCampaign(characterId, SERVER_BASE, accessToken, { inviteCode: pendingJoin.code });
      await finishJoinAndEnter();
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsJoining(false);
    }
  };

  const handleSelectAvailableCharacterForJoin = async (characterId: string) => {
    if (!pendingJoin) return;
    setIsJoining(true);
    setJoinError(null);

    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      await joinCampaignByCode(pendingJoin.code);
      await claimCharacter(characterId, SERVER_BASE, accessToken);
      await finishJoinAndEnter();
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
              onClick={openJoinFlow}
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

            return (
              <button
                type="button"
                onClick={() => onEnterCampaign(mostRecentCampaign)}
                className="w-full group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-left transition-all hover:-translate-y-0.5 hover:border-[var(--dash-accent)] hover:shadow-[0_8px_28px_var(--dash-card-shadow)]"
              >
                <CampaignBannerDisplay
                  campaign={mostRecentCampaign}
                  size="compact"
                  extraRow={
                    mostRecentCampaign.inviteCode ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={e => { e.stopPropagation(); copyInviteCode(mostRecentCampaign); }}
                            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); copyInviteCode(mostRecentCampaign); } }}
                            className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2.5 py-1 text-xs text-[var(--dash-muted)] transition-colors hover:border-[var(--dash-accent)] hover:text-[var(--dash-text)]"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                            <span className="font-mono tracking-[0.2em]">{mostRecentCampaign.inviteCode}</span>
                            {copiedCampaignId === mostRecentCampaign.id ? (
                              <Check className="h-3.5 w-3.5 text-[var(--dash-accent)]" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>Copia codice invito</TooltipContent>
                      </Tooltip>
                    ) : (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); handleGenerateInviteCode(mostRecentCampaign.id); }}
                        disabled={isGeneratingInviteCode}
                        className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2.5 py-1 text-xs text-[var(--dash-muted)] transition-colors hover:border-[var(--dash-accent)] hover:text-[var(--dash-text)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isGeneratingInviteCode ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <KeyRound className="h-3.5 w-3.5" />
                        )}
                        <span>{isGeneratingInviteCode ? 'Generazione...' : 'Genera codice invito'}</span>
                      </button>
                    )
                  }
                />
              </button>
            );
          })()}
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

      {/* ─── Modale: unisciti a campagna, passo 1 (codice invito) ─────────── */}
      {showJoinCodeStep && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-surface)] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold tracking-wide text-[var(--dash-text-strong)]">Unisciti a una campagna</h3>
              <button
                type="button"
                onClick={() => setShowJoinCodeStep(false)}
                className="rounded-lg p-1.5 text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handlePreviewCode}>
              <label className="mb-1.5 block text-xs uppercase tracking-[0.2em] text-[var(--dash-muted)]">
                Codice invito
              </label>
              <input
                type="text"
                autoFocus
                value={inviteCodeInput}
                onChange={e => setInviteCodeInput(e.target.value.toUpperCase())}
                placeholder="es. AB12CD"
                maxLength={12}
                className="w-full rounded-xl border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-2.5 text-sm uppercase tracking-[0.25em] text-[var(--dash-text)] placeholder-[var(--dash-muted)] outline-none transition-shadow focus:border-[var(--dash-accent)] focus:shadow-[0_0_0_3px_var(--dash-card-shadow)]"
              />
              {joinError && <p className="mt-1.5 text-xs text-[var(--dash-danger-text)]">{joinError}</p>}

              <button
                type="submit"
                disabled={isJoining || !inviteCodeInput.trim()}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--dash-text-strong)] shadow-[0_0_20px_var(--dash-card-shadow)] transition-all hover:bg-[var(--dash-accent-2)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {isJoining && <Loader2 className="h-4 w-4 animate-spin" />}
                Continua
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modale: unisciti a campagna, passo 2 (scegli il PG) ──────────── */}
      {pendingJoin && (
        <JoinCampaignCharacterDialog
          campaignName={pendingJoin.preview.campaignName}
          ownCharacters={pendingJoin.ownCharacters.map(c => ({ id: c.id, name: c.name, ruleset: c.ruleset }))}
          availableCharacters={pendingJoin.availableCharacters}
          isPending={isJoining}
          error={joinError}
          onSelectOwnCharacter={handleSelectOwnCharacterForJoin}
          onSelectAvailableCharacter={handleSelectAvailableCharacterForJoin}
          onClose={() => setPendingJoin(null)}
        />
      )}
    </div>
  );
}
