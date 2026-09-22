import { useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Plus, Pencil, EyeOff, Eye, Trash2, Copy, Lock, AlertTriangle } from 'lucide-react';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { usePortalContainer } from '../../ui/portal-container';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { NoteUndoButton } from './NoteUndoButton';
import { useScopedNoteEditor } from './noteUndoScope';
import type { UseEntityTabsResult } from './useEntityTabs';

interface EntityTabBarProps {
  canEdit: boolean;
  tabs: UseEntityTabsResult;
  /** Icone di stato per tab base, per id (es. "origins": lucchetto quando il
   *  personaggio è già in una campagna, punto esclamativo quando manca un
   *  campo obbligatorio). Le due icone coesistono se entrambe vere. */
  tabIndicators?: Record<string, { locked?: boolean; warning?: boolean }>;
  /** Assente = comportamento invariato, il "+" crea sempre 'Nuova tab' senza
   *  hidden/cartella (PG/PNG/Mostro). Presente = il chiamante decide nome/
   *  hidden iniziali (vedi NoteSubTabs.tsx, sotto-tab di una nota). */
  onAddTab?: () => void;
  /** Messaggio del ConfirmDialog di eliminazione - assente = testo di
   *  default (hard-delete immediato, PG/PNG/Mostro, invariato). Le sotto-tab
   *  di una nota (NoteSubTabs.tsx) sono invece cestinabili (vedi
   *  supabase-add-notes-trash.sql) e passano un testo diverso, coerente col
   *  comportamento reversibile - stessa tab, stesso componente, testo
   *  diverso perche' il "cosa succede davvero" dipende dal chiamante, non
   *  da EntityTabBar stesso. */
  deleteConfirmMessage?: (tabName: string) => string;
  /** Titolo del ConfirmDialog - il default resta quello degli hard-delete.
   *  Le sotto-tab delle Note lo sovrascrivono con "Spostare ... nel cestino?". */
  deleteConfirmTitle?: string;
  /** Etichetta del pulsante di conferma - default "Elimina" per gli
   *  hard-delete; le sotto-tab delle Note usano "Sposta nel cestino". */
  deleteConfirmLabel?: string;
  /** Etichetta della voce "Elimina" nel menu ⋮ - assente = "Elimina"
   *  (default, PG/PNG/Mostro, hard-delete immediato invariato). Le sotto-tab
   *  di una nota (NoteSubTabs.tsx) passano "Sposta nel cestino", stesso
   *  principio di deleteConfirmMessage sopra. */
  deleteMenuLabel?: string;
}

export function EntityTabBar({
  canEdit,
  tabs,
  tabIndicators = {},
  onAddTab,
  deleteConfirmMessage,
  deleteConfirmTitle = 'Eliminare questa tab?',
  deleteConfirmLabel = 'Elimina',
  deleteMenuLabel = 'Elimina',
}: EntityTabBarProps) {
  const portalContainer = usePortalContainer();
  // Il menu ⋮ e' portato fuori dal DOM locale con position:fixed alle
  // coordinate del bottone al click, per non finire tagliato dall'
  // overflow-hidden del contenitore di EntityDetailView (visto in
  // CampaignHome/rail Note, ma preesistente anche per PG/PNG/Mostri).
  const [menuAnchorRect, setMenuAnchorRect] = useState<{ top: number; right: number } | null>(null);

  const {
    orderedTabs,
    currentTab,
    selectTabByClick,
    draggedTabId,
    dragOverId,
    tabsContainerRef,
    handlePointerDownTab,
    renamingTabId,
    setRenamingTabId,
    renameDraft,
    setRenameDraft,
    handleRenameCustomTab,
    openMenuTabId,
    setOpenMenuTabId,
    handleToggleHideCustomTab,
    handleDuplicateCustomTab,
    confirmDeleteTabId,
    setConfirmDeleteTabId,
    handleDeleteCustomTab,
    handleAddCustomTab,
    customTabs,
  } = tabs;

  // Editor montato sotto questa barra (contesto NoteUndoScope): la sua
  // presenza decide sia la resa dell'Annulla sia lo slot pr-10 riservato a
  // fine prima riga, cosi' lo slot non resta mai vuoto (tab di base senza
  // editor) ne' manca quando il tasto c'e'.
  const scopeEditor = useScopedNoteEditor();

  // Pulsante "+" condiviso: vive nell'unita' dell'ultima tab quando le tab
  // ci sono, e' figlio diretto della barra quando la barra e' vuota.
  const plusButton = canEdit ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => (onAddTab ? onAddTab() : handleAddCustomTab())}
          aria-label="Aggiungi tab"
          className="flex items-center justify-center rounded-md border border-dashed border-[var(--dash-border-soft)] p-1.5 text-[var(--dash-muted)] transition-colors hover:border-[var(--dash-accent)] hover:text-[var(--dash-text)]"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">Aggiungi tab</TooltipContent>
    </Tooltip>
  ) : null;

  return (
    <>
      {/* La barra riserva (pr-10 = 32px dell'Annulla + 8px di gap) lo slot
          a fine della PRIMA riga e l'Annulla lo occupa in absolute: e'
          quindi un punto di riferimento fisso per l'utente e non wrappa
          mai, quante righe occupino le tab. Lo slot e' riservato solo se
          c'e' davvero un editor (la barra su una tab base non ha Annulla). */}
      <div
        ref={tabsContainerRef}
        className={`mb-4 flex flex-wrap items-center gap-2 border-b border-[var(--dash-border-soft)] pb-3 relative ${
          canEdit && scopeEditor ? 'pr-10 ' : ''
        }${draggedTabId ? 'pointer-events-none select-none' : ''}`}
      >
        {orderedTabs.map((tab, index) => {
          const isLastTab = index === orderedTabs.length - 1;
          const tabElement = (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              onPointerDown={(e) => handlePointerDownTab(e, tab.id)}
              className={`group relative flex items-center ${
                dragOverId === tab.id
                  ? 'border-l-2 border-[var(--dash-accent)] pl-1'
                  : ''
              }`}
            >
              <div className={draggedTabId === tab.id ? 'flex items-center opacity-40' : 'flex items-center'}>
                {renamingTabId === tab.id ? (
                  <input
                    type="text"
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => handleRenameCustomTab(tab.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameCustomTab(tab.id);
                      if (e.key === 'Escape') setRenamingTabId(null);
                    }}
                    className="w-28 rounded-md border border-[var(--dash-accent)] bg-[var(--dash-input)] px-2 py-1 text-sm text-[var(--dash-text)]"
                  />
                ) : (
                  <button
                    onClick={() => selectTabByClick(tab.id)}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                      currentTab === tab.id
                        ? 'border border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                        : 'border border-transparent bg-transparent text-[var(--dash-text)] hover:bg-[var(--dash-panel)]'
                    } ${tab.hidden ? 'opacity-50' : ''} ${tab.isCustom && canEdit ? 'pr-7' : ''}`}
                  >
                    {tab.hidden && <EyeOff className="h-3 w-3" />}
                    {tabIndicators[tab.id]?.locked && <Lock className="h-3 w-3" />}
                    {tabIndicators[tab.id]?.warning && (
                      <AlertTriangle className="h-3 w-3 text-[var(--dash-danger-text)]" />
                    )}
                    {tab.label}
                  </button>
                )}

                {/* Menu ⋮ — SOLO tab personalizzate. Sempre visibile (non piu'
                    legato a group-hover); il menu a comparsa e' un portale in
                    position:fixed (vedi sotto il map) per non finire tagliato
                    dall'overflow-hidden del contenitore di EntityDetailView. */}
                {tab.isCustom && canEdit && renamingTabId !== tab.id && (
                  <div className="absolute right-1 top-1/2 -translate-y-1/2">
                    <button
                      data-no-drag
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setMenuAnchorRect({ top: rect.bottom, right: window.innerWidth - rect.right });
                        setOpenMenuTabId(prev => (prev === tab.id ? null : tab.id));
                      }}
                      className="cursor-default rounded p-0.5 text-[var(--dash-text-strong)] transition-colors"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );

          // Il "+" vive nella STESSA unita' flex dell'ultima tab: e' l'unico
          // modo per far valere la regola "il + mai solo su una riga", che se
          // l'unita' [ultima tab + +] non entra scende insieme alla riga dopo.
          // L'Annulla NON fa parte dell'unita': resta fissata (absolute) alla
          // fine della prima riga.
          if (!isLastTab || !plusButton) return tabElement;
          return (
            <div key={tab.id} data-tab-plus-unit="true" className="flex shrink-0 items-center gap-2">
              {tabElement}
              {draggedTabId && dragOverId === 'END' && (
                <div className="h-6 w-0.5 rounded bg-[var(--dash-accent)]" />
              )}
              {plusButton}
            </div>
          );
        })}

        {orderedTabs.length === 0 && plusButton}

        {/* Annulla FISSA a fine della PRIMA riga: esce dal flusso flex            (absolute) e occupa lo slot che il contenitore riserva con pr-10,
            quindi non wrappa mai ed e' sempre nello stesso punto per
            l'utente, quante che siano le righe delle tab. */}
        {canEdit && <NoteUndoButton />}
      </div>

      {openMenuTabId && menuAnchorRect && (() => {
        const openTab = orderedTabs.find(t => t.id === openMenuTabId);
        if (!openTab) return null;
        return createPortal(
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'fixed', top: menuAnchorRect.top + 4, right: menuAnchorRect.right }}
            className="z-[9999] w-40 overflow-hidden rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] py-1 shadow-xl"
          >
            <button
              onClick={() => {
                setRenamingTabId(openTab.id);
                setRenameDraft(openTab.label);
                setOpenMenuTabId(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-input)] hover:text-[var(--dash-text-strong)]"
            >
              <Pencil className="h-3.5 w-3.5" /> Rinomina
            </button>
            <button
              onClick={() => {
                handleToggleHideCustomTab(openTab.id);
                setOpenMenuTabId(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-input)] hover:text-[var(--dash-text-strong)]"
            >
              {openTab.hidden ? (
                <><Eye className="h-3.5 w-3.5" /> Mostra</>
              ) : (
                <><EyeOff className="h-3.5 w-3.5" /> Nascondi</>
              )}
            </button>
            <button
              onClick={() => {
                handleDuplicateCustomTab(openTab.id);
                setOpenMenuTabId(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-input)] hover:text-[var(--dash-text-strong)]"
            >
              <Copy className="h-3.5 w-3.5" /> Duplica
            </button>
            <div className="mx-2 my-1 border-t border-[var(--dash-border-soft)]" />
            <button
              onClick={() => {
                setConfirmDeleteTabId(openTab.id);
                setOpenMenuTabId(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--dash-danger-text)] transition-colors hover:bg-[var(--dash-input)]"
            >
              <Trash2 className="h-3.5 w-3.5" /> {deleteMenuLabel}
            </button>
          </div>,
          portalContainer ?? document.body
        );
      })()}

      {confirmDeleteTabId && (
        <ConfirmDialog
          title={deleteConfirmTitle}
          message={
            deleteConfirmMessage
              ? deleteConfirmMessage(customTabs.find(t => t.id === confirmDeleteTabId)?.tab_name ?? '')
              : `"${customTabs.find(t => t.id === confirmDeleteTabId)?.tab_name}" e tutto il suo contenuto andranno persi. L'azione non è reversibile.`
          }
          confirmLabel={deleteConfirmLabel}
          onConfirm={() => handleDeleteCustomTab(confirmDeleteTabId)}
          onCancel={() => setConfirmDeleteTabId(null)}
        />
      )}
    </>
  );
}