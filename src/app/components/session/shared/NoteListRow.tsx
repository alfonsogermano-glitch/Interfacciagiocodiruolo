import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, EyeOff, Eye, Trash2, Copy, FolderInput } from 'lucide-react';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { usePortalContainer } from '../../ui/portal-container';
import { EntityKebabMenu, type EntityKebabMenuColors } from './EntityKebabMenu';
import type { UseEntityTabsResult, EntityCustomTab } from './useEntityTabs';

interface NoteListRowProps {
  note: EntityCustomTab;
  /** Istanza di useEntityTabs di cui `note` fa parte (customTabs) - stessi
   *  handler gia' usati da EntityTabBar.tsx per le pillole, qui applicati a
   *  una riga verticale invece che a una pillola. */
  tabs: UseEntityTabsResult;
  canEdit: boolean;
  /** Cartelle disponibili per "Muovi in cartella..." - vuoto = la voce di
   *  menu resta comunque presente (solo "Nessuna cartella" nel submenu),
   *  stesso comportamento di EntityTabBar.tsx. */
  folders: { id: string; name: string }[];
  colors: EntityKebabMenuColors;
  isSelected: boolean;
  onSelect: () => void;
}

/**
 * Riga verticale per una nota nella lista a sinistra (SessionNotesPanel.tsx),
 * al posto della pillola orizzontale che EntityTabBar disegnava prima per le
 * note di primo livello (EntityTabBar resta invariato, usato ora solo per le
 * sotto-tab dentro NoteSubTabs.tsx). Stesse azioni/stessi handler di
 * useEntityTabs di allora (rinomina/nascondi/duplica/muovi/elimina), menu ⋮
 * via EntityKebabMenu (stesso componente gia' usato da FolderRow.tsx) invece
 * del dropdown su misura di EntityTabBar - "Muovi in cartella..." riusa lo
 * stesso submenu portalato (lista cartelle) gia' scritto li', ancorato qui
 * al rect della riga stessa invece che al bottone ⋮ (EntityKebabMenu non
 * espone le coordinate del click ai propri item).
 */
export function NoteListRow({ note, tabs, canEdit, folders, colors, isSelected, onSelect }: NoteListRowProps) {
  const portalContainer = usePortalContainer();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const [moveMenuAnchor, setMoveMenuAnchor] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!moveMenuOpen) return;
    const close = () => setMoveMenuOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [moveMenuOpen]);

  const isRenaming = tabs.renamingTabId === note.id;

  return (
    <div
      ref={rowRef}
      data-tab-id={note.id}
      className={`group flex items-center gap-1 rounded-xl px-3 py-2 transition-colors ${
        isSelected ? 'bg-[var(--dash-surface-2)]' : 'hover:bg-[var(--dash-surface-2)]/50'
      }`}
    >
      {isRenaming ? (
        <input
          type="text"
          autoFocus
          data-no-drag
          value={tabs.renameDraft}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => tabs.setRenameDraft(e.target.value)}
          onBlur={() => tabs.handleRenameCustomTab(note.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') tabs.handleRenameCustomTab(note.id);
            if (e.key === 'Escape') tabs.setRenamingTabId(null);
          }}
          className="w-full rounded-md border border-[var(--dash-accent)] bg-[var(--dash-input)] px-2 py-1 text-sm text-[var(--dash-text)]"
        />
      ) : (
        <button
          type="button"
          onClick={() => { tabs.setCurrentTab(note.id); onSelect(); }}
          className={`flex min-w-0 flex-1 items-start gap-1.5 text-left text-sm ${note.hidden ? 'opacity-50' : ''} ${
            isSelected ? 'font-medium text-[var(--dash-text-strong)]' : 'text-[var(--dash-text)]'
          }`}
        >
          {note.hidden && <EyeOff className="mt-0.5 h-3 w-3 shrink-0" />}
          <span className="whitespace-normal break-words">{note.tab_name}</span>
        </button>
      )}

      {canEdit && !isRenaming && (
        <div data-no-drag>
          <EntityKebabMenu
            colors={colors}
            buttonClassName="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]"
            items={[
              {
                key: 'rename',
                icon: <Pencil className="h-4 w-4" />,
                label: 'Rinomina',
                onClick: () => { tabs.setRenamingTabId(note.id); tabs.setRenameDraft(note.tab_name); },
              },
              {
                key: 'hide',
                icon: note.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />,
                label: note.hidden ? 'Mostra' : 'Nascondi',
                onClick: () => tabs.handleToggleHideCustomTab(note.id),
              },
              {
                key: 'duplicate',
                icon: <Copy className="h-4 w-4" />,
                label: 'Duplica',
                onClick: () => tabs.handleDuplicateCustomTab(note.id),
              },
              {
                key: 'move',
                icon: <FolderInput className="h-4 w-4" />,
                label: 'Muovi in cartella...',
                onClick: () => {
                  const rect = rowRef.current?.getBoundingClientRect();
                  if (rect) setMoveMenuAnchor({ top: rect.bottom + 4, left: rect.left });
                  setMoveMenuOpen(true);
                },
              },
              {
                key: 'delete',
                icon: <Trash2 className="h-4 w-4" />,
                label: 'Elimina',
                onClick: () => tabs.setConfirmDeleteTabId(note.id),
                danger: true,
              },
            ]}
          />
        </div>
      )}

      {moveMenuOpen && moveMenuAnchor && createPortal(
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: moveMenuAnchor.top, left: moveMenuAnchor.left }}
          className="z-[9999] max-h-64 w-48 overflow-y-auto rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] py-1 shadow-xl"
        >
          <button
            onClick={() => { tabs.handleMoveCustomTabToFolder(note.id, null); setMoveMenuOpen(false); }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-[var(--dash-input)] ${
              note.folder_id === null ? 'text-[var(--dash-text-strong)] font-medium' : 'text-[var(--dash-text)]'
            }`}
          >
            Nessuna cartella
          </button>
          {folders.length > 0 && <div className="mx-2 my-1 border-t border-[var(--dash-border-soft)]" />}
          {folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => { tabs.handleMoveCustomTabToFolder(note.id, folder.id); setMoveMenuOpen(false); }}
              className={`flex w-full items-center gap-2 truncate px-3 py-1.5 text-left text-sm transition-colors hover:bg-[var(--dash-input)] ${
                note.folder_id === folder.id ? 'text-[var(--dash-text-strong)] font-medium' : 'text-[var(--dash-text)]'
              }`}
            >
              {folder.name}
            </button>
          ))}
        </div>,
        portalContainer ?? document.body
      )}

      {tabs.confirmDeleteTabId === note.id && (
        <ConfirmDialog
          title="Eliminare questa tab?"
          message={`"${note.tab_name}" e tutto il suo contenuto andranno persi. L'azione non è reversibile.`}
          confirmLabel="Elimina"
          onConfirm={() => tabs.handleDeleteCustomTab(note.id)}
          onCancel={() => tabs.setConfirmDeleteTabId(null)}
        />
      )}
    </div>
  );
}
