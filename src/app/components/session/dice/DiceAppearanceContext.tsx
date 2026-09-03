import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { useCampaign } from '../../../campaigns/CampaignContext';
import { loadStandardDiceStyles, saveStandardDiceStyles } from '../../../../services/supabase/diceStandardStyleService';
import {
  buildDefaultStandardDiceStyles,
  completeStandardDiceStyles,
  getStandardDieAppearance,
} from './diceAppearance.ts';
import type { CustomDieSides, StandardDieAppearance } from './diceTypes.ts';

interface DiceAppearanceContextValue {
  styles: StandardDieAppearance[];
  isLoading: boolean;
  getStandardAppearance: (sides: CustomDieSides) => StandardDieAppearance;
  saveStyles: (styles: readonly StandardDieAppearance[]) => Promise<StandardDieAppearance[]>;
}

const DiceAppearanceContext = createContext<DiceAppearanceContextValue | null>(null);

export function DiceAppearanceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { activeCampaign } = useCampaign();
  const [styles, setStyles] = useState<StandardDieAppearance[]>(buildDefaultStandardDiceStyles);
  const [isLoading, setIsLoading] = useState(false);
  const loadSequence = useRef(0);

  useEffect(() => {
    const campaignId = activeCampaign?.id;
    const ownerProfileId = user?.id;
    const sequence = ++loadSequence.current;

    if (!campaignId || !ownerProfileId) {
      setStyles(buildDefaultStandardDiceStyles());
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void loadStandardDiceStyles(campaignId, ownerProfileId)
      .then((stored) => {
        if (loadSequence.current !== sequence) return;
        setStyles(completeStandardDiceStyles(stored));
      })
      .catch((error) => {
        if (loadSequence.current !== sequence) return;
        console.error('Personalizzazione dadi non disponibile, uso lo stile predefinito:', error);
        setStyles(buildDefaultStandardDiceStyles());
      })
      .finally(() => {
        if (loadSequence.current === sequence) setIsLoading(false);
      });
  }, [activeCampaign?.id, user?.id]);

  const getStandardAppearance = useCallback((sides: CustomDieSides) => {
    return getStandardDieAppearance(styles, sides) ?? buildDefaultStandardDiceStyles().find((style) => style.sides === sides)!;
  }, [styles]);

  const saveStyles = useCallback(async (nextStyles: readonly StandardDieAppearance[]) => {
    const campaignId = activeCampaign?.id;
    const ownerProfileId = user?.id;
    if (!campaignId || !ownerProfileId) throw new Error('Apri una campagna prima di personalizzare i dadi.');
    const completed = completeStandardDiceStyles(nextStyles);
    const saved = await saveStandardDiceStyles(campaignId, ownerProfileId, completed);
    const merged = completeStandardDiceStyles(saved);
    setStyles(merged);
    return merged;
  }, [activeCampaign?.id, user?.id]);

  const value = useMemo<DiceAppearanceContextValue>(() => ({
    styles,
    isLoading,
    getStandardAppearance,
    saveStyles,
  }), [getStandardAppearance, isLoading, saveStyles, styles]);

  return <DiceAppearanceContext.Provider value={value}>{children}</DiceAppearanceContext.Provider>;
}

export function useDiceAppearance() {
  const context = useContext(DiceAppearanceContext);
  if (!context) throw new Error('useDiceAppearance deve essere usato dentro DiceAppearanceProvider.');
  return context;
}
