import { useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Plus, Pencil, EyeOff, Eye, Trash2, Copy, Lock, AlertTriangle } from 'lucide-react';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { usePortalContainer } from '../../ui/portal-container';
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
  /** Etichetta della voce "Elimina" nel menu ⋮ - assente = "Elimina"
   *  (default, PG/PNG/Mostro, hard-delete immediato invariato). Le sotto-tab
   *  di una nota (NoteSubTabs.tsx) passano "Sposta nel cestino", stesso
   *  principio di deleteConfirmMessage sopra. */
  deleteMenuLabel?: string;
}

export function EntityTabBar({ canEdit, tabs, tabIndicators = {}, onAddTab, deleteConfirmMessage, deleteMenuLabel = 'Elimina' }: EntityTabBarProps) {
  const portalContainer = usePortalContainer();
  // Il menu ⋮ e' portato fuori dal DOM locale con position:fixed alle
  // coordinate del bottone al click, per non finire tagliato dall'
  // overflow-hidden del contenitore di EntityDetailView (visto in
  // CampaignHome/rail Note, ma preesistente anche per PG/PNG/Mostri).
  const [menuAnchorRect, setMenuAnchorRect] = useState<{ top: number; right: number } | null>(null);

  const {
    orderedTabs,
    currentTab,
    setCurrentTab,
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

  return (
    <>
      <div
        ref={tabsContainerRef}
        className={`mb-4 flex flex-wrap items-center gap-2 border-b border-[var(--dash-border-soft)] pb-3 ${
          draggedTabId ? 'pointer-events-none select-none' : ''
        }`}
      >
        {orderedTabs.map((tab) => (
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
                  onClick={() => setCurrentTab(tab.id)}
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
        ))}

        {draggedTabId && dragOverId === 'END' && (
          <div className="h-6 w-0.5 rounded bg-[var(--dash-accent)]" />
        )}

        {canEdit && (
          <button
            onClick={() => (onAddTab ? onAddTab() : handleAddCustomTab())}
            className="flex items-center justify-center rounded-md border border-dashed border-[var(--dash-border-soft)] p-1.5 text-[var(--dash-muted)] transition-colors hover:border-[var(--dash-accent)] hover:text-[var(--dash-text)]"
            title="Aggiungi tab"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
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
          title="Eliminare questa tab?"
          message={
            deleteConfirmMessage
              ? deleteConfirmMessage(customTabs.find(t => t.id === confirmDeleteTabId)?.tab_name ?? '')
              : `"${customTabs.find(t => t.id === confirmDeleteTabId)?.tab_name}" e tutto il suo contenuto andranno persi. L'azione non è reversibile.`
          }
          confirmLabel="Elimina"
          onConfirm={() => handleDeleteCustomTab(confirmDeleteTabId)}
          onCancel={() => setConfirmDeleteTabId(null)}
        />
      )}
    </>
  );
}
