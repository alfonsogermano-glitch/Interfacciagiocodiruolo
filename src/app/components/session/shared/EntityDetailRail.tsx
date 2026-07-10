import { FileText, Image as ImageIcon, Circle } from 'lucide-react';

export type EntityDetailRailSection = 'scheda' | 'immagine' | 'token';

// Rail verticale "Scheda/Immagine/Token" per EntityDetailView. Estratta in un
// componente a se' perche' deve poter comparire in due punti diversi:
// - inline dentro EntityDetailView (uso in SessionCharactersPanel.tsx)
// - nello slot rightSidebar di AppShell, ancorata al bordo schermo (uso da
//   MyCharactersPage.tsx tramite il rightSidebarContext sollevato in App.tsx)
// Tutte e tre le sezioni sono funzionanti.
export function EntityDetailRail({
  activeSection = 'scheda',
  onSectionChange,
}: {
  activeSection?: EntityDetailRailSection;
  onSectionChange?: (section: EntityDetailRailSection) => void;
}) {
  return (
    <div className="flex h-full w-20 shrink-0 flex-col items-center gap-1 border-l border-[var(--dash-border-soft)] bg-[var(--dash-sidebar-bg)] p-2">
      <button
        type="button"
        onClick={() => onSectionChange?.('scheda')}
        className={`flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-center text-[11px] transition-colors ${
          activeSection === 'scheda'
            ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
            : 'text-[var(--dash-muted)] hover:text-[var(--dash-text)]'
        }`}
      >
        <FileText className="h-[18px] w-[18px]" />
        Scheda
      </button>
      <button
        type="button"
        onClick={() => onSectionChange?.('immagine')}
        className={`flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-center text-[11px] transition-colors ${
          activeSection === 'immagine'
            ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
            : 'text-[var(--dash-muted)] hover:text-[var(--dash-text)]'
        }`}
      >
        <ImageIcon className="h-[18px] w-[18px]" />
        Immagine
      </button>
      <button
        type="button"
        onClick={() => onSectionChange?.('token')}
        className={`flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-center text-[11px] transition-colors ${
          activeSection === 'token'
            ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
            : 'text-[var(--dash-muted)] hover:text-[var(--dash-text)]'
        }`}
      >
        <Circle className="h-[18px] w-[18px]" />
        Token
      </button>
    </div>
  );
}
