import type { DiceAppearance } from './diceTypes.ts';
import './diceObsidianAnimation.css';

export function isAnimatedObsidianAppearance(appearance: DiceAppearance): boolean {
  return appearance.skinId === 'obsidian' && appearance.effectsEnabled;
}

export function DiceObsidianAnimatedOverlay({ appearance }: { appearance: DiceAppearance }) {
  if (!isAnimatedObsidianAppearance(appearance)) return null;
  return (
    <span aria-hidden="true" className="hollowgate-obsidian-overlay pointer-events-none absolute inset-0 overflow-hidden">
      <span className="hollowgate-obsidian-sheen absolute inset-[-25%]" />
      <span className="hollowgate-obsidian-glint hollowgate-obsidian-glint-a absolute" />
      <span className="hollowgate-obsidian-glint hollowgate-obsidian-glint-b absolute" />
      <span className="hollowgate-obsidian-glint hollowgate-obsidian-glint-c absolute" />
    </span>
  );
}
