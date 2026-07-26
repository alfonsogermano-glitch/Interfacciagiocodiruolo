interface TrashItemPreviewProps {
  name: string;
  /** "Nota" | "Sotto-tab" | "Cartella" */
  typeLabel: string;
  /** "Campagna" | "GM" */
  scopeLabel: string;
  /** null per le cartelle - non hanno un contenuto testuale proprio (a
   *  differenza di note/sotto-tab, righe entity_notes con un campo content). */
  content: string | null;
}

/**
 * Anteprima in sola lettura di un elemento cestinato selezionato (nota,
 * sotto-tab o cartella) - mostrata nel pannello destro di SessionNotesPanel.tsx
 * al posto del placeholder generico quando l'utente ha selezionato una riga
 * specifica del Cestino (vedi TrashRow.tsx/onSelect). Nessuna modifica
 * possibile da qui: un elemento cestinato si modifica solo ripristinandolo
 * prima (stessa textarea/interfaccia di NoteSubTabs.tsx torna disponibile
 * una volta fuori dal cestino).
 */
export function TrashItemPreview({ name, typeLabel, scopeLabel, content }: TrashItemPreviewProps) {
  return (
    <div>
      <div className="mb-3">
        <div className="whitespace-normal break-words text-base font-medium text-[var(--dash-text-strong)]">{name}</div>
        <div className="text-xs text-[var(--dash-muted)]">{typeLabel} · {scopeLabel} · Nel cestino</div>
      </div>
      {content !== null ? (
        <textarea
          value={content}
          readOnly
          disabled
          placeholder="(vuoto)"
          className="h-48 w-full resize-none rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3 text-sm text-[var(--dash-text)] outline-none disabled:cursor-not-allowed disabled:opacity-70"
        />
      ) : (
        <div className="text-sm text-[var(--dash-muted)]">Le cartelle non hanno un contenuto testuale proprio.</div>
      )}
    </div>
  );
}
