import type { JSONContent } from '@tiptap/core';
import { RichTextEditor } from './RichTextEditor';

interface NoteHistoryPreviewProps {
  timestampLabel: string;
  legacyContent: string | null;
  richContent: JSONContent | null;
}

/**
 * Anteprima in sola lettura di una versione storica selezionata - a
 * differenza di TrashItemPreview.tsx (che mostra il solo `content` legacy
 * via MarkdownContent), qui si riusa RichTextEditor stesso in modalita'
 * disabled: stesso motore di rendering gia' usato per lo stato read-only
 * corrente, quindi TextBox/Collapse/Tabella vengono resi identici
 * all'originale senza scrivere un renderer nuovo. onChangeRich e' un no-op:
 * disabled=true impedisce comunque qualunque digitazione (editable resta
 * sempre false, vedi RichTextEditor.tsx), quindi non scatta mai davvero.
 * Nessuna onOpenHistory passata: niente pulsante "Cronologia" dentro
 * un'anteprima di cronologia.
 */
export function NoteHistoryPreview({ timestampLabel, legacyContent, richContent }: NoteHistoryPreviewProps) {
  return (
    <div>
      <div className="mb-3 text-xs text-[var(--dash-muted)]">{timestampLabel} · Anteprima di sola lettura</div>
      <RichTextEditor
        legacyContent={legacyContent ?? ''}
        richContent={richContent}
        onChangeRich={() => {}}
        disabled
        className="min-h-[3rem] rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3"
      />
    </div>
  );
}
