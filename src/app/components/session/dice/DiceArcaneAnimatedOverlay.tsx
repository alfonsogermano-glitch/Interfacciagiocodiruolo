import type { DiceAppearance } from './diceTypes.ts';
import './diceArcaneAnimation.css';

export function isAnimatedArcaneAppearance(appearance: DiceAppearance): boolean {
  return appearance.skinId === 'arcane' && appearance.effectsEnabled;
}

export function DiceArcaneAnimatedOverlay({ appearance }: { appearance: DiceAppearance }) {
  if (!isAnimatedArcaneAppearance(appearance)) return null;
  return (
    <span aria-hidden="true" className="hollowgate-arcane-overlay pointer-events-none absolute inset-0 overflow-hidden">
      <span className="hollowgate-arcane-vortex hollowgate-arcane-vortex-a absolute" />
      <span className="hollowgate-arcane-vortex hollowgate-arcane-vortex-b absolute" />
      <span className="hollowgate-arcane-rune-ring absolute" />
      <span className="hollowgate-arcane-glint hollowgate-arcane-glint-a absolute" />
      <span className="hollowgate-arcane-glint hollowgate-arcane-glint-b absolute" />
    </span>
  );
}
