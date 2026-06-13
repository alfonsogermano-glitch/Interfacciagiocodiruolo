import { useRuleset } from './RulesetContext';
import type { RulesetId } from './campaignTypes';
import { RULESETS } from './campaignTypes';

/**
 * Mostra i children solo se il ruleset attivo corrisponde a uno dei valori in `only`.
 * Se `except` è specificato, nasconde i children per quei ruleset.
 */
export function RulesetGate({
  only,
  except,
  children,
}: {
  only?: RulesetId | RulesetId[];
  except?: RulesetId | RulesetId[];
  children: React.ReactNode;
}) {
  const { rulesetId } = useRuleset();

  if (only) {
    const allowed = Array.isArray(only) ? only : [only];
    if (!allowed.includes(rulesetId)) return null;
  }

  if (except) {
    const excluded = Array.isArray(except) ? except : [except];
    if (excluded.includes(rulesetId)) return null;
  }

  return <>{children}</>;
}

/** Badge compatto che mostra il regolamento attivo — da inserire negli header dei manager */
export function RulesetBadge({ className = '' }: { className?: string }) {
  const { ruleset } = useRuleset();

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-2.5 py-1 text-xs text-[var(--dash-muted)] ${className}`}
      title={ruleset.description}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: ruleset.color }}
      />
      {ruleset.name}
    </span>
  );
}

/** Titolo localizzato per "salute" nel regolamento attivo (es. "Freschezza", "Punti Ferita") */
export function useHealthLabel() {
  const { ruleset } = useRuleset();
  return ruleset.healthLabel;
}

/** Dice type del regolamento (es. "d6", "d20") */
export function useDiceType() {
  const { ruleset } = useRuleset();
  return ruleset.diceType;
}

/** Statistiche principali del regolamento */
export function useRulesetStats() {
  const { ruleset } = useRuleset();
  return ruleset.stats;
}
