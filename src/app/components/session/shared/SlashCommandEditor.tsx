import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Command, CommandGroup, CommandItem, CommandList } from '../../ui/command';
import { usePortalContainer } from '../../ui/portal-container';
import { MarkdownContent } from './MarkdownContent';
import { insertHeadingAtCursor, type HeadingLevel } from './markdownHeadings';
import { getTextareaCaretRect } from './textareaCaretPosition';

const HEADING_COMMANDS: { value: string; label: string; level: HeadingLevel }[] = [
  { value: 'h1', label: 'Titolo 1', level: 1 },
  { value: 'h2', label: 'Titolo 2', level: 2 },
  { value: 'h3', label: 'Titolo 3', level: 3 },
  { value: 'h4', label: 'Titolo 4', level: 4 },
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
 * Editor markdown-leggero con comando "/" per inserire intestazioni H1-H4 -
 * contratto drop-in identico a una <textarea> (value/onChange/disabled),
 * cosi' sostituisce 1:1 le due textarea che oggi condividono
 * useEntityTabs.handleCustomTabContentChange (NoteSubTabs.tsx,
 * EntityDetailView.tsx). Due modalita': vista renderizzata (MarkdownContent,
 * sempre per disabled=true) e modifica (textarea di testo grezzo, solo al
 * click quando canEdit). Il comando slash scatta SOLO a inizio riga vuota
 * (stesso comportamento di Notion) - evita falsi positivi (es. una "/" in
 * un URL).
 */
export function SlashCommandEditor({ value, onChange, disabled, placeholder, className }: SlashCommandEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const portalContainer = usePortalContainer();

  const [slashStart, setSlashStart] = useState<number | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [highlighted, setHighlighted] = useState(HEADING_COMMANDS[0].value);
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

  const closeMenu = () => {
    setSlashStart(null);
    setMenuAnchor(null);
  };

  const filterQuery = slashStart !== null && textareaRef.current
    ? value.slice(slashStart + 1, textareaRef.current.selectionStart)
    : '';
  const filteredCommands = HEADING_COMMANDS.filter((c) =>
    c.label.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const updateMenuPosition = () => {
    if (!textareaRef.current) return;
    const rect = getTextareaCaretRect(textareaRef.current, textareaRef.current.selectionStart);
    setMenuAnchor({ top: rect.top + rect.height + 4, left: rect.left });
  };

  const selectCommand = (level: HeadingLevel) => {
    if (slashStart === null || !textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart;
    const result = insertHeadingAtCursor(value, slashStart, cursor, level);
    onChange(result.content);
    pendingCursorRef.current = result.cursorPos;
    closeMenu();
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursor = e.target.selectionStart;
    onChange(newValue);

    if (slashStart !== null) {
      // Un comando slash non contiene mai spazi/a-capo nel filtro - se
      // compare uno, o il cursore torna prima della "/", il menu si chiude
      // (stesso comportamento "solo a inizio riga vuota" del trigger).
      const query = newValue.slice(slashStart + 1, cursor);
      if (cursor <= slashStart || /\s/.test(query)) {
        closeMenu();
      } else {
        requestAnimationFrame(updateMenuPosition);
      }
      return;
    }

    if (newValue[cursor - 1] === '/') {
      const lineStart = newValue.lastIndexOf('\n', cursor - 2) + 1;
      const beforeSlash = newValue.slice(lineStart, cursor - 1);
      if (beforeSlash.trim() === '') {
        setSlashStart(cursor - 1);
        setHighlighted(HEADING_COMMANDS[0].value);
        requestAnimationFrame(updateMenuPosition);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashStart === null) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredCommands.length === 0) return;
      const idx = filteredCommands.findIndex((c) => c.value === highlighted);
      const nextIdx = e.key === 'ArrowDown'
        ? (idx + 1) % filteredCommands.length
        : (idx - 1 + filteredCommands.length) % filteredCommands.length;
      setHighlighted(filteredCommands[nextIdx].value);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filteredCommands.find((c) => c.value === highlighted) ?? filteredCommands[0];
      if (cmd) selectCommand(cmd.level);
    }
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
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => { closeMenu(); setIsEditing(false); }}
        autoFocus
        placeholder={placeholder}
        className={className ?? 'h-48 w-full resize-none rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3 text-sm text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)]'}
      />
      {slashStart !== null && menuAnchor && filteredCommands.length > 0 && createPortal(
        <div
          // Impedisce alla textarea di perdere il focus quando si clicca una
          // voce del menu (altrimenti onBlur chiuderebbe l'editing PRIMA che
          // il click arrivi a CommandItem) - stesso principio gia' in uso
          // per i submenu portalati di NoteListRow.tsx (li' con
          // stopPropagation sul click, qui serve fermare il mousedown perche'
          // e' quello che sposta il focus).
          onMouseDown={(e) => e.preventDefault()}
          style={{ position: 'fixed', top: menuAnchor.top, left: menuAnchor.left }}
          className="z-[9999]"
        >
          <Command
            value={highlighted}
            onValueChange={setHighlighted}
            className="w-44 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] py-1 shadow-xl"
          >
            <CommandList>
              <CommandGroup>
                {filteredCommands.map((cmd) => (
                  <CommandItem
                    key={cmd.value}
                    value={cmd.value}
                    onSelect={() => selectCommand(cmd.level)}
                    className="cursor-pointer px-3 py-1.5 text-sm text-[var(--dash-text)] data-[selected=true]:bg-[var(--dash-surface-2)] data-[selected=true]:text-[var(--dash-text-strong)]"
                  >
                    {cmd.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>,
        portalContainer ?? document.body
      )}
    </div>
  );
}
