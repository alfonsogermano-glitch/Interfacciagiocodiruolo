import { useCallback, useEffect } from 'react';
import { useDiceSession } from './DiceSessionContext';

export function Dice3DOverlay() {
  const { setAnimationContainer } = useDiceSession();

  const setContainer = useCallback((node: HTMLDivElement | null) => {
    setAnimationContainer(node);
  }, [setAnimationContainer]);

  // Preriscalda il modulo 3D (dice-box + three incorporato): il primo Tira
  // dopo il refresh non deve pagare parse+init a menù già chiuso sembrando
  // morto. Stesso specifier dell'import dinamico del renderer: condivide la
  // cache moduli, nessun doppio caricamento.
  useEffect(() => {
    void import('@3d-dice/dice-box-threejs').catch(() => {});
  }, []);

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
