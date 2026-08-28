import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { useCampaign } from '../../../campaigns/CampaignContext';
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
  const { user } = useAuth();
  const { activeCampaign } = useCampaign();
  const [rolls, setRolls] = useState<RollResult[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

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

  const submitLocalRoll = useCallback((request: DiceRollRequest): RollResult => {
    const result = buildResult(request);
    setRolls((current) => [...current, result]);
    setHistoryOpen(true);
    return result;
  }, [buildResult]);

  const reroll = useCallback((resultId: string): RollResult | null => {
    const previous = rolls.find((roll) => roll.id === resultId);
    if (!previous) return null;

    const result = buildResult({
      items: previous.sourceItems.map((item) => ({ ...item })) as DiceRollRequest['items'],
      formulaId: previous.formulaId,
      formulaName: previous.formulaName,
      visibility: previous.visibility,
    });
    setRolls((current) => [...current, result]);
    setHistoryOpen(true);
    return result;
  }, [buildResult, rolls]);

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
