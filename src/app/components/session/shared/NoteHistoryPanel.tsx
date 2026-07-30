import { useEffect, useState } from 'react';
import { X, History as HistoryIcon } from 'lucide-react';
import type { JSONContent } from '@tiptap/core';
import { useNoteHistory, type NoteHistoryVersion } from './useNoteHistory';
import { NoteHistoryRow } from './NoteHistoryRow';
import { NoteHistoryPreview } from './NoteHistoryPreview';

function formatVersionTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface NoteHistoryPanelProps {
  noteId: string;
  accessToken: string | null | undefined;
  onClose: () => void;
  /** Il ripristino ha gia' scritto su DB (endpoint dedicato, vedi
   *  useNoteHistory.ts) - questo callback serve SOLO a specchiare il
   *  risultato nello stato locale della tab chiamante (vedi
   *  applyRestoredTabContent in useEntityTabs.ts) senza aspettare il
   *  broadcast realtime, che arriverebbe comunque poco dopo con lo stesso
   *  contenuto (entity_notes_broadcast_trigger, gia' condiviso da tutte le
   *  altre scritture su questa tabella). */
  onRestored: (content: string | null, contentRich: JSONContent | null) => void;
}

/**
 * Modale "Cronologia versioni" per UNA nota - a differenza del Cestino
 * (SessionNotesPanel.tsx, pannello di livello campagna, elenca elementi
 * eliminati di TUTTE le note) questa e' per-nota, aperta dal pulsante
 * Cronologia nel toolbar di RichTextEditor.tsx (vedi onOpenHistory). Stesso
 * pattern di modale hand-rolled gia' usato in questo modulo (ConfirmDialog.tsx/
 * CampaignAssignDialog.tsx: fixed inset-0 + overlay + pannello), qui pero'
 * con le variabili CSS --dash-* (come TrashRow/TrashItemPreview, stessa
 * famiglia di feature "Note") invece del lookup getCurrentPaletteColors()
 * usato da quei due (scelta di stile, non di necessita' tecnica: nessuno
 * dei due e' in un portal, entrambi restano dentro l'albero DOM normale).
 *
 * Fetch on-demand al mount (nessun useEffect ricorrente, nessuna
 * sottoscrizione realtime - vedi useNoteHistory.ts): la modale esiste solo
 * mentre e' aperta, quindi "al mount" equivale gia' ad "all'apertura".
 */
export function NoteHistoryPanel({ noteId, accessToken, onClose, onRestored }: NoteHistoryPanelProps) {
  const { versions, loading, fetchHistory, restoreVersion } = useNoteHistory({ noteId, accessToken });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // Seleziona automaticamente la versione piu' recente non appena la lista
  // arriva - solo se non c'e' gia' una selezione (non forza la selezione
  // via' ogni volta che `versions` cambia riferimento).
  useEffect(() => {
    if (!selectedId && versions.length > 0) setSelectedId(versions[0].id);
  }, [versions, selectedId]);

  const selected = versions.find((v) => v.id === selectedId) ?? null;

  const handleRestore = async (version: NoteHistoryVersion) => {
    const restored = await restoreVersion(version.id);
    if (!restored) return;
    onRestored(restored.content, restored.content_rich);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[32rem] w-full max-w-3xl overflow-hidden rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] shadow-2xl"
      >
        <div className="flex w-64 shrink-0 flex-col border-r border-[var(--dash-border-soft)]">
          <div className="flex items-center justify-between border-b border-[var(--dash-border-soft)] px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--dash-text-strong)]">
              <HistoryIcon className="h-4 w-4" /> Cronologia
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5">
            {loading && <div className="px-2 py-3 text-xs text-[var(--dash-muted)]">Caricamento…</div>}
            {!loading && versions.length === 0 && (
              <div className="px-2 py-3 text-xs text-[var(--dash-muted)]">
                Nessuna versione salvata ancora. Le versioni compaiono qui man mano che modifichi la nota (con pause di almeno 15 minuti tra un salvataggio e l'altro).
              </div>
            )}
            {versions.map((v) => (
              <NoteHistoryRow
                key={v.id}
                timestampLabel={formatVersionTimestamp(v.created_at)}
                active={v.id === selectedId}
                onSelect={() => setSelectedId(v.id)}
                onRestore={() => handleRestore(v)}
              />
            ))}
          </div>
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          {selected ? (
            <NoteHistoryPreview
              timestampLabel={formatVersionTimestamp(selected.created_at)}
              legacyContent={selected.content}
              richContent={selected.content_rich}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-center text-sm text-[var(--dash-muted)]">
              {versions.length === 0 ? 'Nessuna versione da mostrare.' : "Seleziona una versione per vederne l'anteprima."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
