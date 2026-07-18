import { Skull, Swords, Castle, Sparkles, FileText, BookOpen } from 'lucide-react';
import { RULESETS, type RulesetId } from '../../campaigns/campaignTypes';

export const RULESET_ICONS: Record<RulesetId, React.ReactNode> = {
  hsc: <Skull className="h-3.5 w-3.5" />,
  dnd5e: <Swords className="h-3.5 w-3.5" />,
  pathfinder: <Castle className="h-3.5 w-3.5" />,
  coc7e: <FileText className="h-3.5 w-3.5" />,
  cocclassic: <BookOpen className="h-3.5 w-3.5" />,
  custom: <Sparkles className="h-3.5 w-3.5" />,
};

export function RulesetTag({
  rulesetId,
  variant,
}: {
  rulesetId: RulesetId;
  /** Assente/default = stile invariato (colore specifico per ruleset,
   *  pensato per lo sfondo pannello/superficie standard dell'app - usato
   *  altrove, non toccare). "onDark" sostituisce lo stile con testo chiaro
   *  + sfondo semi-trasparente scuro, ignorando il colore del ruleset:
   *  serve per i contesti in cui il badge sta sopra una foto (es. il banner
   *  di CampaignHome), dove un colore scuro specifico per ruleset avrebbe
   *  scarso contrasto. */
  variant?: 'onDark';
}) {
  const ruleset = RULESETS[rulesetId] ?? RULESETS.custom;
  const style =
    variant === 'onDark'
      ? { borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'rgba(0,0,0,0.35)', color: '#fff' }
      : { borderColor: `${ruleset.color}55`, backgroundColor: `${ruleset.color}1a`, color: ruleset.color };

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tracking-wide"
      style={style}
    >
      {RULESET_ICONS[rulesetId]}
      {ruleset.name}
    </span>
  );
}
