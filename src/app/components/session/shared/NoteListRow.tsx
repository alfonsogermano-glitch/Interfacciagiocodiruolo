import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, EyeOff, Eye, Trash2, Copy, FolderInput, Lock, Globe, Shapes } from 'lucide-react';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { usePortalContainer } from '../../ui/portal-container';
import { useAuth } from '../../../auth/AuthContext';
import { EntityKebabMenu, type EntityKebabMenuColors } from './EntityKebabMenu';
import { NoteIconGrid, NOTE_ICON_COMPONENTS } from './NoteIconGrid';
import type { UseEntityTabsResult, EntityCustomTab } from './useEntityTabs';
import {
  duplicateCampaignNoteWithTitleIcon,
  setNoteTitleIcon,
  type CampaignNoteDuplicateSource,
} from '../../../../services/supabase/noteTitleIconService';

interface NoteListRowProps {
  note: EntityCustomTab;
  /** Istanza di useEntityTabs di cui `note` fa parte (customTabs) - stessi
   *  handler gia' usati da EntityTabBar.tsx per le pillole, qui applicati a
   *  una riga verticale invece che a una pillola. */
  tabs: UseEntityTabsResult;
  /** Puo' modificare/eliminare/rendere privata QUESTA nota - gia' calcolato
   *  per-riga dal chiamante (canEditNote: GM sempre, altrimenti solo il
   *  creatore), non piu' un canEdit piatto di sezione. */
  canEdit: boolean;
  /** true solo per il GM della campagna - a differenza di `canEdit` sopra,
   *  che un giocatore ottiene per le proprie note, "Nascondi" (sposta la
   *  nota tra sezione Campagna/GM) resta un'azione esclusivamente GM: e'
   *  uno spostamento tra sezioni, non un'azione sul contenuto proprio. */
  isGm: boolean;
  /** Cartelle disponibili per "Muovi in cartella..." - vuoto = la voce di
   *  menu resta comunque presente (solo "Nessuna cartella" nel submenu),
   *  stesso comportamento di EntityTabBar.tsx. */
  folders: { id: string; name: string }[];
  colors: EntityKebabMenuColors;
  isSelected: boolean;
  onSelect: () => void;
}

type RuntimeCampaignNote = EntityCustomTab & {
  /** Campi presenti perche' la GET note usa select('*'), anche se la vecchia
   *  interfaccia condivisa non li esponeva esplicitamente. */
  campaign_id?: string | null;
  title_icon?: string | null;
};

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
export function NoteListRow({ note, tabs, canEdit, isGm, folders, colors, isSelected, onSelect }: NoteListRowProps) {
  const portalContainer = usePortalContainer();
  const { session } = useAuth();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const runtimeNote = note as RuntimeCampaignNote;
  const canonicalTitleIcon = runtimeNote.title_icon ?? null;

  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const [moveMenuAnchor, setMoveMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [iconMenuOpen, setIconMenuOpen] = useState(false);
  const [iconMenuAnchor, setIconMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  // Stato locale ottimistico: la sorgente canonica resta entity_notes e viene
  // riallineata con reloadCustomTabs dopo la RPC. In questo modo la scelta e'
  // visibile immediatamente senza dover allargare useEntityTabs con logica
  // specifica della sola colonna Note.
  const [titleIcon, setTitleIcon] = useState<string | null>(canonicalTitleIcon);

  useEffect(() => {
    setTitleIcon(canonicalTitleIcon);
  }, [canonicalTitleIcon]);

  useEffect(() => {
    if (!moveMenuOpen) return;
    const close = () => setMoveMenuOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [moveMenuOpen]);

  useEffect(() => {
    if (!iconMenuOpen) return;
    const close = () => setIconMenuOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [iconMenuOpen]);

  const isRenaming = tabs.renamingTabId === note.id;
  const TitleIconComponent = titleIcon ? NOTE_ICON_COMPONENTS[titleIcon] : null;

  const openIconMenu = () => {
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect) return;
    const popupWidth = 272;
    const popupHeight = 360;
    setIconMenuAnchor({
      top: Math.max(8, Math.min(rect.top, window.innerHeight - popupHeight - 8)),
      left: Math.max(8, Math.min(rect.right + 8, window.innerWidth - popupWidth - 8)),
    });
    setIconMenuOpen(true);
  };

  const updateTitleIcon = async (nextIcon: string | null) => {
    const previousIcon = titleIcon;
    setTitleIcon(nextIcon);
    setIconMenuOpen(false);
    try {
      await setNoteTitleIcon(note.id, nextIcon);
      await tabs.reloadCustomTabs();
    } catch (error) {
      console.error('Errore aggiornamento icona titolo nota:', error);
      setTitleIcon(previousIcon);
    }
  };

  const duplicateNote = async () => {
    const campaignId = runtimeNote.campaign_id;
    const accessToken = session?.access_token;
    if (!campaignId || !accessToken) {
      console.error('Impossibile duplicare la nota: campagna o sessione mancanti');
      return;
    }

    const source: CampaignNoteDuplicateSource = {
      id: note.id,
      tab_name: note.tab_name,
      content: note.content ?? '',
      content_rich: note.content_rich,
      hidden: note.hidden,
      folder_id: note.folder_id,
      title_icon: titleIcon,
    };

    try {
      const duplicateId = await duplicateCampaignNoteWithTitleIcon(source, campaignId, accessToken);
      await tabs.reloadCustomTabs();
      tabs.setCurrentTab(duplicateId);
    } catch (error) {
      console.error('Errore duplicazione nota:', error);
    }
  };

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
          {/* Icona diversa da EyeOff/Eye (usata sopra per `hidden`, sezione
              GM/Campagna) apposta - `visibility` e' un asse ortogonale,
              confonderle con la stessa icona renderebbe ambiguo quale delle
              due si sta guardando. */}
          {note.visibility === 'private' && <Lock className="mt-0.5 h-3 w-3 shrink-0" />}
          <span className="flex min-w-0 items-start gap-2">
            {TitleIconComponent && <TitleIconComponent className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            <span className="whitespace-normal break-words">{note.tab_name}</span>
          </span>
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
                key: 'icon',
                icon: <Shapes className="h-4 w-4" />,
                label: 'Icona',
                onClick: openIconMenu,
              },
              // Per i giocatori la privacy e' l'unico asse di visibilita':
              // possono rendere privata/pubblica una propria nota, ma non
              // spostarla tra Note della Campagna e Note del GM.
              ...(!isGm ? [{
                key: 'visibility',
                icon: note.visibility === 'private' ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />,
                label: note.visibility === 'private' ? 'Rendi visibile a tutti' : 'Rendi visibile solo a me e al GM',
                onClick: () => tabs.handleSetNoteVisibility(note.id, note.visibility === 'private' ? 'all' : 'private'),
              }] : []),
              // Per il GM l'asse corretto e' Campagna <-> GM: "Nascondi"
              // e "Mostra" sostituiscono del tutto la voce privacy, che per
              // il proprietario della campagna sarebbe ridondante/ambigua.
              ...(isGm ? [{
                key: 'hide',
                icon: note.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />,
                label: note.hidden ? 'Mostra' : 'Nascondi',
                onClick: () => tabs.handleToggleHideCustomTab(note.id),
              }] : []),
              {
                key: 'duplicate',
                icon: <Copy className="h-4 w-4" />,
                label: 'Duplica',
                onClick: () => { void duplicateNote(); },
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
                // Sempre soft-delete qui: NoteListRow.tsx e' usato solo per
                // le note di Note Campagna/GM (mai per PG/PNG/Mostro, che
                // restano hard-delete via EntityTabBar.tsx).
                label: 'Sposta nel cestino',
                onClick: () => tabs.setConfirmDeleteTabId(note.id),
                danger: true,
              },
            ]}
          />
        </div>
      )}

      {iconMenuOpen && iconMenuAnchor && createPortal(
        <div
          data-note-contextual-picker="true"
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: iconMenuAnchor.top, left: iconMenuAnchor.left }}
          className="tiptap-icon-popover z-[9999] w-64 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-2 text-[var(--dash-text)] shadow-xl"
        >
          <NoteIconGrid
            selectedName={titleIcon}
            onChoose={(name) => { void updateTitleIcon(name); }}
            onRemove={titleIcon ? () => { void updateTitleIcon(null); } : undefined}
          />
        </div>,
        portalContainer ?? document.body
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
          title="Spostare questa nota nel cestino?"
          message={`"${note.tab_name}" (e le sue eventuali sotto-tab) verrà spostata nel Cestino - potrai ripristinarla in seguito.`}
          confirmLabel="Sposta nel cestino"
          onConfirm={() => tabs.handleDeleteCustomTab(note.id)}
          onCancel={() => tabs.setConfirmDeleteTabId(null)}
        />
      )}
    </div>
  );
}
