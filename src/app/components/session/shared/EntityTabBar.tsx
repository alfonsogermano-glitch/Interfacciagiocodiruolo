import { MoreVertical, Plus, Pencil, EyeOff, Eye, Trash2, Lock } from 'lucide-react';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import type { UseEntityTabsResult } from './useEntityTabs';

interface EntityTabBarProps {
  canEdit: boolean;
  tabs: UseEntityTabsResult;
  /** Id di una tab base da marcare con un'icona lucchetto (es. "origins"
   *  quando il personaggio è già in una campagna). */
  lockedTabId?: string | null;
}

export function EntityTabBar({ canEdit, tabs, lockedTabId = null }: EntityTabBarProps) {
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
                  {tab.id === lockedTabId && <Lock className="h-3 w-3" />}
                  {tab.label}
                </button>
              )}

              {/* Menu ⋮ — SOLO tab personalizzate */}
              {tab.isCustom && canEdit && renamingTabId !== tab.id && (
                <div className="absolute right-1 top-1/2 -translate-y-1/2">
                  <button
                    data-no-drag
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuTabId(prev => (prev === tab.id ? null : tab.id));
                    }}
                    className="cursor-default rounded p-0.5 text-[var(--dash-muted)] opacity-0 transition-opacity hover:text-[var(--dash-text-strong)] group-hover:opacity-100"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>

                  {openMenuTabId === tab.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] py-1 shadow-xl"
                    >
                      <button
                        onClick={() => {
                          setRenamingTabId(tab.id);
                          setRenameDraft(tab.label);
                          setOpenMenuTabId(null);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-input)] hover:text-[var(--dash-text-strong)]"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Rinomina
                      </button>
                      <button
                        onClick={() => {
                          handleToggleHideCustomTab(tab.id);
                          setOpenMenuTabId(null);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-input)] hover:text-[var(--dash-text-strong)]"
                      >
                        {tab.hidden ? (
                          <><Eye className="h-3.5 w-3.5" /> Mostra</>
                        ) : (
                          <><EyeOff className="h-3.5 w-3.5" /> Nascondi</>
                        )}
                      </button>
                      <div className="mx-2 my-1 border-t border-[var(--dash-border-soft)]" />
                      <button
                        onClick={() => {
                          setConfirmDeleteTabId(tab.id);
                          setOpenMenuTabId(null);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--dash-danger-text)] transition-colors hover:bg-[var(--dash-input)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Elimina
                      </button>
                    </div>
                  )}
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
            onClick={handleAddCustomTab}
            className="flex items-center justify-center rounded-md border border-dashed border-[var(--dash-border-soft)] p-1.5 text-[var(--dash-muted)] transition-colors hover:border-[var(--dash-accent)] hover:text-[var(--dash-text)]"
            title="Aggiungi tab"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {confirmDeleteTabId && (
        <ConfirmDialog
          title="Eliminare questa tab?"
          message={`"${customTabs.find(t => t.id === confirmDeleteTabId)?.tab_name}" e tutto il suo contenuto andranno persi. L'azione non è reversibile.`}
          confirmLabel="Elimina"
          onConfirm={() => handleDeleteCustomTab(confirmDeleteTabId)}
          onCancel={() => setConfirmDeleteTabId(null)}
        />
      )}
    </>
  );
}
