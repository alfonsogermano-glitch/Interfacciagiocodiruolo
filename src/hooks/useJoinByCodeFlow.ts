import { useCallback, useState } from 'react';
import { useAuth } from '../app/auth/AuthContext';
import { useCampaign, type InvitePreview } from '../app/campaigns/CampaignContext';
import { type Campaign, isRulesetCompatible } from '../app/campaigns/campaignTypes';
import type { JoinCampaignCharacterOption } from '../app/components/session/shared/JoinCampaignCharacterDialog';
import {
  loadCharactersByOwner, assignCharacterToCampaign, claimCharacter, loadAvailableCharactersForInvite,
} from '../services/supabase/charactersService';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;

// Flusso "unisciti con un codice invito" - estratto da HomeScreen.tsx
// (dove e' nato) perche' un secondo punto d'ingresso (MyCharactersPage.tsx)
// ne aveva bisogno identico: e' codice gia' corretto piu' volte in questa
// sessione (idempotenza di respondToInvite, RLS su available-characters,
// broadcast mancanti), duplicarlo lo avrebbe reso manutenibile due volte
// separatamente da qui in avanti.
//
// ownCharacters e' un parametro (non una fetch interna): ogni chiamante ha
// gia', o puo' avere, la propria lista di PG posseduti - MyCharactersPage.tsx
// in particolare la ha gia' in memoria (la sua griglia "I miei personaggi"),
// niente fetch ridondante.
//
// onJoined e' generico (non "onEnterCampaign" come nell'originale): l'hook
// lo invoca a fine flusso con la campagna appena unita, ma cosa farne lo
// decide il chiamante - HomeScreen.tsx naviga dentro, MyCharactersPage.tsx
// si limita a rinfrescare le proprie liste sul posto.
export function useJoinByCodeFlow(
  ownCharacters: Awaited<ReturnType<typeof loadCharactersByOwner>>,
  onJoined: (campaign: Campaign) => void
) {
  const { session } = useAuth();
  const { previewInviteCode, joinCampaignByCode, refreshJoinedCampaigns } = useCampaign();

  const [showJoinCodeStep, setShowJoinCodeStep] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [pendingJoin, setPendingJoin] = useState<{
    code: string;
    preview: InvitePreview;
    ownCharacters: JoinCampaignCharacterOption[];
    availableCharacters: JoinCampaignCharacterOption[];
  } | null>(null);

  const openJoinFlow = useCallback(() => {
    setInviteCodeInput('');
    setJoinError(null);
    setShowJoinCodeStep(true);
  }, []);

  const closeJoinCodeStep = useCallback(() => setShowJoinCodeStep(false), []);
  const closePendingJoin = useCallback(() => setPendingJoin(null), []);

  const handlePreviewCode = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const code = inviteCodeInput.trim();
    if (!code) return;

    setIsJoining(true);
    setJoinError(null);

    try {
      const preview = await previewInviteCode(code);
      const compatibleOwn = ownCharacters.filter(c => isRulesetCompatible(c.ruleset, null, preview.ruleset));
      const accessToken = session?.access_token ?? publicAnonKey;
      const availableCharacters = await loadAvailableCharactersForInvite(preview.campaignId, code, SERVER_BASE, accessToken);

      if (compatibleOwn.length === 0 && availableCharacters.length === 0) {
        setJoinError(
          `Nessuno dei tuoi personaggi è compatibile con il regolamento di "${preview.campaignName}" e non ci sono personaggi precompilati disponibili. ` +
          'Crea o richiedi un personaggio compatibile, poi riprova.'
        );
        return;
      }

      setPendingJoin({
        code,
        preview,
        ownCharacters: compatibleOwn,
        availableCharacters: availableCharacters.map(c => ({ id: c.id, name: c.name, ruleset: c.ruleset })),
      });
      setShowJoinCodeStep(false);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsJoining(false);
    }
  }, [inviteCodeInput, ownCharacters, previewInviteCode, session?.access_token]);

  const finishJoin = useCallback(async (targetCampaignId: string) => {
    const freshJoined = await refreshJoinedCampaigns();
    const entered = freshJoined.find(c => c.id === targetCampaignId);
    setPendingJoin(null);
    if (entered) onJoined(entered);
  }, [refreshJoinedCampaigns, onJoined]);

  // Assegna il PG gia' posseduto alla campagna in un'unica chiamata atomica
  // (assignCharacterToCampaign con {inviteCode} stabilisce anche la
  // membership, vedi addPlayerToCampaign lato server).
  const handleSelectOwnCharacterForJoin = useCallback(async (characterId: string) => {
    if (!pendingJoin) return;
    setIsJoining(true);
    setJoinError(null);

    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      await assignCharacterToCampaign(characterId, SERVER_BASE, accessToken, { inviteCode: pendingJoin.code });
      await finishJoin(pendingJoin.preview.campaignId);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsJoining(false);
    }
  }, [pendingJoin, session?.access_token, finishJoin]);

  // Richiede un precompilato: richiede prima la membership vera e propria
  // (joinCampaignByCode, non solo l'anteprima) e poi claimCharacter - due
  // chiamate perche' claim richiede membership preesistente e non la crea
  // da solo; joinCampaignByCode e' pero' idempotente (addPlayerToCampaign
  // non duplica un membro gia' presente), quindi sicura da ripetere se
  // claimCharacter fallisse e l'utente riprovasse con un altro personaggio.
  const handleSelectAvailableCharacterForJoin = useCallback(async (characterId: string) => {
    if (!pendingJoin) return;
    setIsJoining(true);
    setJoinError(null);

    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      await joinCampaignByCode(pendingJoin.code);
      await claimCharacter(characterId, SERVER_BASE, accessToken);
      await finishJoin(pendingJoin.preview.campaignId);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsJoining(false);
    }
  }, [pendingJoin, session?.access_token, joinCampaignByCode, finishJoin]);

  return {
    showJoinCodeStep,
    inviteCodeInput,
    setInviteCodeInput,
    isJoining,
    joinError,
    pendingJoin,
    openJoinFlow,
    closeJoinCodeStep,
    closePendingJoin,
    handlePreviewCode,
    handleSelectOwnCharacterForJoin,
    handleSelectAvailableCharacterForJoin,
  };
}
