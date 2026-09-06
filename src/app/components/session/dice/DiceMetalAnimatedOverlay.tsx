import type { DiceAppearance } from './diceTypes.ts';
import './diceMetalAnimation.css';

export function isAnimatedMetalAppearance(appearance: DiceAppearance): boolean {
  return appearance.skinId === 'metal' && appearance.effectsEnabled;
}

export function DiceMetalAnimatedOverlay({ appearance }: { appearance: DiceAppearance }) {
  if (!isAnimatedMetalAppearance(appearance)) return null;
  return (
    <span aria-hidden="true" className="hollowgate-metal-overlay pointer-events-none absolute inset-0 overflow-hidden">
      <span className="hollowgate-metal-sheen absolute inset-0" />
      <span className="hollowgate-metal-sweep absolute inset-[-35%]" />
      <span className="hollowgate-metal-spark hollowgate-metal-spark-a absolute" />
      <span className="hollowgate-metal-spark hollowgate-metal-spark-b absolute" />
      <span className="hollowgate-metal-spark hollowgate-metal-spark-c absolute" />
      <span className="hollowgate-metal-spark hollowgate-metal-spark-d absolute" />
      <span className="hollowgate-metal-spark hollowgate-metal-spark-e absolute" />
      <span className="hollowgate-metal-spark hollowgate-metal-spark-f absolute" />
    </span>
  );
}
