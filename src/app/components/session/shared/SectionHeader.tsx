import { ChevronDown, ChevronRight } from 'lucide-react';

// Estratto da SessionCharactersPanel.tsx (Personaggi/PNG/Mostri) - riusato
// identico da SessionNotesPanel.tsx (Note della Campagna/Note del GM), stessa
// intestazione di sezione collassabile a colonna sinistra.
export function SectionHeader({
  title, count, isOpen, onToggle, extraAction,
}: {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  /** Pulsante/i azione extra (es. "Nuova cartella") - reso come sibling del
   *  toggle (non annidato dentro, altrimenti sarebbe un <button> dentro un
   *  <button>, HTML non valido e un click sopra farebbe scattare anche il
   *  collapse/espandi). Assente = comportamento invariato. */
  extraAction?: React.ReactNode;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-1 px-4 py-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
      >
        <span className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
          {title} <span className="text-[var(--dash-muted)]">({count})</span>
        </span>
        {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--dash-muted)]" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--dash-muted)]" />}
      </button>
      {extraAction}
    </div>
  );
}
