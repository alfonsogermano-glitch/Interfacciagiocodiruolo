import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../auth/AuthContext';
import { useCampaign } from '../../../campaigns/CampaignContext';
import { useCampaignChannel, useRealtimeChannel } from '../../../../services/realtime/campaignChannel';
import { isRollResultPayload, sendSecretRollToGm } from '../../../../services/realtime/diceRealtime';
import { rollDiceFormula } from './diceEngine.ts';
import type { DiceRollRequest, RollResult } from './diceTypes.ts';

interface DiceSessionValue {
  rolls: RollResult[];
  submitLocalRoll: (request: DiceRollRequest) => RollResult;
  reroll: (resultId: string) => RollResult | null;
  clearLocalHistory: () => void;
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
}

const DiceSessionContext = createContext<DiceSessionValue | null>(null);

export function DiceSessionProvider({ children }: { children: React.ReactNode }) {
  const { user, session } = useAuth();
  const { activeCampaign } = useCampaign();
  const [rolls, setRolls] = useState<RollResult[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const seenRollIds = useRef(new Set<string>());
  const isGm = activeCampaign?.ownerId === user?.id;

  const ingestRoll = useCallback((result: RollResult): boolean => {
    if (seenRollIds.current.has(result.id)) return false;
    seenRollIds.current.add(result.id);
    setRolls((current) => [...current, result]);
    setHistoryOpen(true);
    return true;
  }, []);

  useEffect(() => {
    seenRollIds.current.clear();
    setRolls([]);
    setHistoryOpen(false);
  }, [activeCampaign?.id]);

  const publicChannel = useCampaignChannel(activeCampaign?.id, {
    onBroadcast: {
      dice_roll: (message) => {
        const payload = message?.payload;
        if (!activeCampaign || !isRollResultPayload(payload)) return;
        if (payload.campaignId !== activeCampaign.id) return;
        if (payload.visibility !== 'public') return;
        ingestRoll(payload);
      },
    },
  });

  useRealtimeChannel(isGm && user ? `profile:${user.id}` : null, {
    onBroadcast: {
      dice_roll: (message) => {
        const payload = message?.payload;
        if (!activeCampaign || !isRollResultPayload(payload)) return;
        if (payload.campaignId !== activeCampaign.id) return;
        if (payload.visibility !== 'secret') return;
        if (payload.rollerId === activeCampaign.ownerId) return;
        ingestRoll(payload);
      },
    },
  });

  const buildResult = useCallback((request: DiceRollRequest): RollResult => {
    if (!user || !activeCampaign) {
      throw new Error('Per tirare i dadi devi essere dentro una campagna con un utente autenticato.');
    }

    return rollDiceFormula({
      identity: {
        campaignId: activeCampaign.id,
        rollerId: user.id,
        rollerName: user.displayName,
        rollerAvatarUrl: user.avatarUrl,
      },
      request,
    });
  }, [activeCampaign, user]);

  const dispatchRoll = useCallback((result: RollResult) => {
    if (!activeCampaign || !user) return;

    if (result.visibility === 'public') {
      void publicChannel.send(
        'dice_roll',
        result as unknown as Record<string, unknown>,
      ).catch((error) => {
        console.error('Errore broadcast tiro pubblico:', error);
        toast.error('Tiro registrato localmente, ma non inviato agli altri giocatori.');
      });
      return;
    }

    if (result.visibility === 'secret') {
      if (activeCampaign.ownerId === user.id) return;
      const accessToken = session?.access_token;
      if (!accessToken) {
        toast.error('Tiro segreto registrato localmente, ma non inviato al Game Master.');
        return;
      }
      void sendSecretRollToGm(activeCampaign.id, result, accessToken).catch((error) => {
        console.error('Errore invio tiro segreto al GM:', error);
        toast.error('Tiro segreto registrato localmente, ma non inviato al Game Master.');
      });
    }
  }, [activeCampaign, publicChannel.send, session?.access_token, user]);

  const submitLocalRoll = useCallback((request: DiceRollRequest): RollResult => {
    const result = buildResult(request);
    ingestRoll(result);
    dispatchRoll(result);
    return result;
  }, [buildResult, dispatchRoll, ingestRoll]);

  const reroll = useCallback((resultId: string): RollResult | null => {
    const previous = rolls.find((roll) => roll.id === resultId);
    if (!previous) return null;

    return submitLocalRoll({
      items: previous.sourceItems.map((item) => ({ ...item })) as DiceRollRequest['items'],
      formulaId: previous.formulaId,
      formulaName: previous.formulaName,
      visibility: previous.visibility,
    });
  }, [rolls, submitLocalRoll]);

  const clearLocalHistory = useCallback(() => {
    setRolls([]);
  }, []);

  const value = useMemo<DiceSessionValue>(() => ({
    rolls,
    submitLocalRoll,
    reroll,
    clearLocalHistory,
    historyOpen,
    setHistoryOpen,
  }), [rolls, submitLocalRoll, reroll, clearLocalHistory, historyOpen]);

  return (
    <DiceSessionContext.Provider value={value}>
      {children}
    </DiceSessionContext.Provider>
  );
}

export function useDiceSession(): DiceSessionValue {
  const context = useContext(DiceSessionContext);
  if (!context) throw new Error('useDiceSession deve essere usato dentro DiceSessionProvider.');
  return context;
}
