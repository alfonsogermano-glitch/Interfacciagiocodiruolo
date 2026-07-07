import { FileText, Image as ImageIcon, Circle } from 'lucide-react';

// Rail verticale "Scheda/Immagine/Token" per EntityDetailView. Estratta in un
// componente a se' perche' deve poter comparire in due punti diversi:
// - inline dentro EntityDetailView (uso in SessionCharactersPanel.tsx)
// - nello slot rightSidebar di AppShell, ancorata al bordo schermo (uso da
//   MyCharactersPage.tsx tramite il rightSidebarContext sollevato in App.tsx)
// Per ora solo "Scheda" e' funzionante; "Immagine"/"Token" sono segnaposto.
export function EntityDetailRail() {
  return (
    <div className="flex h-full w-20 shrink-0 flex-col items-center gap-1 border-l border-[var(--dash-border-soft)] bg-[var(--dash-sidebar-bg)] p-2">
      <div className="flex w-full flex-col items-center gap-1 rounded-lg border-l-2 border-[var(--dash-accent)] bg-[var(--dash-panel)] px-1 py-2 text-center text-[11px] text-[var(--dash-text-strong)]">
        <FileText className="h-[18px] w-[18px]" />
        Scheda
      </div>
      <div
        className="flex w-full cursor-default flex-col items-center gap-1 rounded-lg border-l-2 border-transparent px-1 py-2 text-center text-[11px] text-[var(--dash-muted)] opacity-50"
        title="In arrivo"
      >
        <ImageIcon className="h-[18px] w-[18px]" />
        Immagine
      </div>
      <div
        className="flex w-full cursor-default flex-col items-center gap-1 rounded-lg border-l-2 border-transparent px-1 py-2 text-center text-[11px] text-[var(--dash-muted)] opacity-50"
        title="In arrivo"
      >
        <Circle className="h-[18px] w-[18px]" />
        Token
      </div>
    </div>
  );
}
