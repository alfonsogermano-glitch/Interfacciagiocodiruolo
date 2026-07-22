import { createPortal } from 'react-dom';
import { usePortalContainer } from '../ui/portal-container';
import { type Folder } from '../../../services/supabase/foldersService';
import { useFolderDragDrop } from '../session/shared/useFolderDragDrop';
import { getFolderIconComponent } from './folderIconCatalog';

// Ghost visivo simulato via portal (Fase 5) - stesso principio del ghost
// nativo di DraggablePortrait.tsx (nodo fuori flusso via createPortal), ma
// riposizionato manualmente a ogni pointermove invece di affidarsi a
// dataTransfer.setDragImage (API nativa, non applicabile al drag
// pointer-based usato qui - vedi indagine sul feedback visivo di drag).
// Riceve solo dati grezzi dall'hook (draggedItem/pointerPosition) piu'
// folders/items del chiamante e decide da solo cosa disegnare - l'hook
// resta "solo meccanica", questo componente resta agnostico rispetto alla
// forma di T (stesso principio di renderCard in renderFolderedSection).
//
// Portato su usePortalContainer() (il nodo [data-dashboard-palette] di
// AppShell.tsx) invece che su document.body: cosi' le classi Tailwind
// var(--dash-*) usate da EntityCard arrivano per cascata e non serve piu'
// l'hack dei colori inline usato qui prima di riusare EntityCard (stesso
// bug gia' diagnosticato per il menu ⋮ invisibile, vedi portal-container.tsx
// - stesso hook gia' usato da EntityTabBar.tsx per il suo menu portato).
export function DragGhost<T extends { id: string }>({
  dnd, folders, items, renderCard,
}: {
  dnd: ReturnType<typeof useFolderDragDrop>;
  folders: Folder[];
  items: T[];
  renderCard: (item: T) => React.ReactNode;
}) {
  const portalContainer = usePortalContainer();
  if (!dnd.draggedItem || !dnd.pointerPosition) return null;

  const content = dnd.draggedItem.kind === 'folder' ? (() => {
    const folder = folders.find((f) => f.id === dnd.draggedItem!.id);
    if (!folder) return null;
    const Icon = getFolderIconComponent(folder.icon);
    return (
      <div className="flex max-w-[220px] items-center gap-1.5 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] px-2.5 py-1.5 text-xs font-medium text-[var(--dash-text)] opacity-90 shadow-2xl">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{folder.name}</span>
      </div>
    );
  })() : (() => {
    const item = items.find((it) => it.id === dnd.draggedItem!.id);
    if (!item) return null;
    // Card completa in miniatura, non la sola etichetta - il box foto di
    // EntityCard (variant grid) e' a larghezza fissa (140px) indipendente
    // dal contenitore, quindi per restringere il ghost si scala l'intera
    // card invece di dargli una larghezza piccola (altrimenti la foto
    // dominerebbe lo spazio, sproporzionata rispetto al testo).
    return (
      <div className="w-[280px] origin-top-left scale-[0.65] overflow-hidden rounded-2xl opacity-80 shadow-2xl">
        {renderCard(item)}
      </div>
    );
  })();

  if (!content) return null;

  return createPortal(
    <div
      style={{ position: 'fixed', left: dnd.pointerPosition.x + 14, top: dnd.pointerPosition.y + 14, zIndex: 2000 }}
      className="pointer-events-none"
    >
      {content}
    </div>,
    portalContainer ?? document.body
  );
}
