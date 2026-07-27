import { useLayoutEffect, useRef, useState } from 'react';
import { Heading1, Heading2, Heading3, Heading4, type LucideIcon } from 'lucide-react';
import { MarkdownContent } from './MarkdownContent';
import { insertHeadingAtCursor, type HeadingLevel } from './markdownHeadings';

const HEADING_COMMANDS: { label: string; level: HeadingLevel; Icon: LucideIcon }[] = [
  { label: 'Titolo 1', level: 1, Icon: Heading1 },
  { label: 'Titolo 2', level: 2, Icon: Heading2 },
  { label: 'Titolo 3', level: 3, Icon: Heading3 },
  { label: 'Titolo 4', level: 4, Icon: Heading4 },
];

interface SlashCommandEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Stesso contratto delle <textarea> che sostituisce - true = sola
   *  lettura, mostra sempre MarkdownContent, mai la textarea grezza. */
  disabled: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Editor markdown-leggero con barra icone per inserire intestazioni H1-H4 -
 * contratto drop-in identico a una <textarea> (value/onChange/disabled),
 * cosi' sostituisce 1:1 le due textarea che oggi condividono
 * useEntityTabs.handleCustomTabContentChange (NoteSubTabs.tsx,
 * EntityDetailView.tsx). Due modalita': vista renderizzata (MarkdownContent,
 * sempre per disabled=true) e modifica (textarea di testo grezzo + barra
 * icone, solo al click quando canEdit).
 *
 * La barra opera su selectionStart/selectionEnd della textarea (API nativa,
 * niente intercettazione di eventi di digitazione ne' calcolo di posizione
 * del caret) - sostituisce il precedente comando slash "/", rimosso perche'
 * fragile in altri esperimenti (vedi storia del file).
 */
export function SlashCommandEditor({ value, onChange, disabled, placeholder, className }: SlashCommandEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Posizione del cursore da ripristinare nella textarea DOPO che React ha
  // applicato il nuovo `value` (controllato dal genitore) - un
  // setSelectionRange immediato nello stesso handler leggerebbe ancora il
  // vecchio testo.
  const pendingCursorRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pendingCursorRef.current !== null && textareaRef.current) {
      const pos = pendingCursorRef.current;
      textareaRef.current.setSelectionRange(pos, pos);
      pendingCursorRef.current = null;
    }
  }, [value]);

  const applyHeading = (level: HeadingLevel) => {
    if (!textareaRef.current) return;
    // Stessa posizione per i due parametri: insertHeadingAtCursor non deve
    // rimuovere nulla (a differenza del vecchio trigger "/"+query), solo
    // trasformare la riga del cursore - un'eventuale selezione di testo
    // dell'utente resta intatta, mai cancellata per errore.
    const cursor = textareaRef.current.selectionStart;
    const result = insertHeadingAtCursor(value, cursor, cursor, level);
    onChange(result.content);
    pendingCursorRef.current = result.cursorPos;
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  if (disabled || !isEditing) {
    return (
      <div
        onClick={() => { if (!disabled) setIsEditing(true); }}
        className={`${!disabled ? 'cursor-text' : ''} ${className ?? 'min-h-[3rem] rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3'}`}
      >
        {value ? <MarkdownContent content={value} /> : (
          <span className="text-sm text-[var(--dash-muted)]">{placeholder ?? 'Scrivi qui...'}</span>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        // Impedisce alla textarea di perdere il focus al click su un
        // bottone (altrimenti onBlur chiuderebbe l'editing PRIMA che
        // il click arrivi a applyHeading, e selectionStart andrebbe perso) -
        // stesso principio gia' in uso per i submenu portalati altrove
        // nell'app, qui serve fermare il mousedown perche' e' quello che
        // sposta il focus.
        onMouseDown={(e) => e.preventDefault()}
        className="mb-1.5 flex items-center gap-1"
      >
        {HEADING_COMMANDS.map(({ label, level, Icon }) => (
          <button
            key={level}
            type="button"
            onClick={() => applyHeading(level)}
            title={label}
            aria-label={label}
            className="rounded-md p-1.5 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]"
          >
            <Icon size={16} />
          </button>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onBlur={() => setIsEditing(false)}
        autoFocus
        placeholder={placeholder}
        className={className ?? 'h-48 w-full resize-none rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3 text-sm text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)]'}
      />
    </div>
  );
}
