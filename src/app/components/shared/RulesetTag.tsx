import { Skull, Swords, Castle, Sparkles, FileText, BookOpen } from 'lucide-react';
import { RULESETS, type RulesetId } from '../../campaigns/campaignTypes';

const RULESET_ICONS: Record<RulesetId, React.ReactNode> = {
  hsc: <Skull className="h-3.5 w-3.5" />,
  dnd5e: <Swords className="h-3.5 w-3.5" />,
  pathfinder: <Castle className="h-3.5 w-3.5" />,
  coc7e: <FileText className="h-3.5 w-3.5" />,
  cocclassic: <BookOpen className="h-3.5 w-3.5" />,
  custom: <Sparkles className="h-3.5 w-3.5" />,
};

export function RulesetTag({ rulesetId }: { rulesetId: RulesetId }) {
  const ruleset = RULESETS[rulesetId] ?? RULESETS.custom;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tracking-wide"
      style={{
        borderColor: `${ruleset.color}55`,
        backgroundColor: `${ruleset.color}1a`,
        color: ruleset.color,
      }}
    >
      {RULESET_ICONS[rulesetId]}
      {ruleset.name}
    </span>
  );
}
