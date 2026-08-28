import { useCallback } from 'react';
import { useDiceSession } from './DiceSessionContext';

export function Dice3DOverlay() {
  const { setAnimationContainer } = useDiceSession();

  const setContainer = useCallback((node: HTMLDivElement | null) => {
    setAnimationContainer(node);
  }, [setAnimationContainer]);

  return (
    <div
      data-dice-3d-overlay
      className="pointer-events-none fixed inset-0 z-[1050]"
      aria-hidden="true"
    >
      <div ref={setContainer} className="h-full w-full" />
    </div>
  );
}
