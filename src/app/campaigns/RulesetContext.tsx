import { createContext, useContext } from 'react';
import { RULESETS, type RulesetDefinition, type RulesetId } from './campaignTypes';
import { useCampaign } from './CampaignContext';

type RulesetContextValue = {
  rulesetId: RulesetId;
  ruleset: RulesetDefinition;
  isHSC: boolean;
  isDnD5e: boolean;
  isPathfinder: boolean;
};

const RulesetContext = createContext<RulesetContextValue | null>(null);

export function RulesetProvider({ children }: { children: React.ReactNode }) {
  const { activeCampaign } = useCampaign();

  const rulesetId: RulesetId = activeCampaign?.ruleset ?? 'hsc';
  const ruleset = RULESETS[rulesetId] ?? RULESETS.hsc;

  return (
    <RulesetContext.Provider value={{
      rulesetId,
      ruleset,
      isHSC: rulesetId === 'hsc',
      isDnD5e: rulesetId === 'dnd5e',
      isPathfinder: rulesetId === 'pathfinder',
    }}>
      {children}
    </RulesetContext.Provider>
  );
}

export function useRuleset(): RulesetContextValue {
  const ctx = useContext(RulesetContext);
  if (!ctx) throw new Error('useRuleset deve essere usato dentro RulesetProvider');
  return ctx;
}
