// Estratto da NPCManager.tsx (dove era una function privata non esportata)
// per essere riusabile anche in EntityDetailView.tsx senza duplicare la
// logica delle caselle di freschezza/caselle cruciali.
export function FreschezzaBoxesEditor({
  current,
  max,
  crucialBoxes,
  onUpdate
}: {
  current: number;
  max: number;
  crucialBoxes: number[];
  onUpdate: (value: { current: number; crucialBoxes: number[] }) => void;
}) {
  const toggleCrucialBox = (box: number) => {
    const nextCrucialBoxes = crucialBoxes.includes(box)
      ? crucialBoxes.filter(item => item !== box)
      : [...crucialBoxes, box].sort((a, b) => a - b);

    onUpdate({
      current,
      crucialBoxes: nextCrucialBoxes
    });
  };

  return (
    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[var(--dash-text)]">Freschezza</h3>
          <p className="text-xs text-[var(--dash-muted)]">
            Clicca una casella per impostare la freschezza attuale. Usa i pulsanti sotto per segnare le caselle cruciali.
          </p>
        </div>

      <div className="text-sm text-[var(--dash-text-strong)]">
  {current}/{max}
</div>
      </div>

      <div className="grid grid-cols-6 gap-2 md:grid-cols-8 lg:grid-cols-10">
        {Array.from({ length: max }, (_, index) => {
          const box = index + 1;
          const isFilled = box <= max - current;
          const isCrucial = crucialBoxes.includes(box);

          return (
            <button
              key={box}
              type="button"
              onClick={() => {
  const lostPoints = max - current;
  const nextCurrent = lostPoints === box ? max : Math.max(0, max - box);

  onUpdate({
    current: nextCurrent,
    crucialBoxes
  });
}}

              className={`relative flex h-9 items-center justify-center rounded-md border text-sm transition-colors ${
                isFilled
                  ? 'border-red-700 bg-red-900/70 text-[var(--dash-text-strong)]'
                  : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] text-[var(--dash-muted)]'
              }`}
            >
              {box}
              {isCrucial && (
                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border border-[var(--dash-text-strong)] bg-[var(--dash-accent-2)]" />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-muted)]">
          Caselle cruciali
        </div>

        <div className="flex flex-wrap gap-2">
          {Array.from({ length: max }, (_, index) => {
            const box = index + 1;
            const isCrucial = crucialBoxes.includes(box);

            return (
              <button
                key={box}
                type="button"
                onClick={() => toggleCrucialBox(box)}
                className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                  isCrucial
                    ? 'border-[var(--dash-accent-2)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                    : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] text-[var(--dash-muted)]'
                }`}
              >
                {box}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
