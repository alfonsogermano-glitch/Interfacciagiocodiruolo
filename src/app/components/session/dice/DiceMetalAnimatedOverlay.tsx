import type { DiceAppearance } from './diceTypes.ts';
import './diceMetalAnimation.css';

export function isAnimatedMetalAppearance(appearance: DiceAppearance): boolean {
  return appearance.skinId === 'metal' && appearance.effectsEnabled;
}

export function DiceMetalAnimatedOverlay({ appearance }: { appearance: DiceAppearance }) {
  if (!isAnimatedMetalAppearance(appearance)) return null;
  return (
    <span aria-hidden="true" className="hollowgate-metal-overlay pointer-events-none absolute inset-0 overflow-hidden">
      <span className="hollowgate-metal-sweep absolute inset-[-35%]" />
      <span className="hollowgate-metal-sparks hollowgate-metal-sparks-a absolute inset-[-18%]" />
      <span className="hollowgate-metal-sparks hollowgate-metal-sparks-b absolute inset-[-14%]" />
      <span className="hollowgate-metal-glint absolute inset-0" />
    </span>
  );
}
