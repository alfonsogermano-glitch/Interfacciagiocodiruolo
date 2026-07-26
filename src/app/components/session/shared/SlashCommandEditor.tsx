import { createPortal } from 'react-dom';
import { Command, CommandGroup, CommandItem, CommandList } from '../../ui/command';
import { usePortalContainer } from '../../ui/portal-container';
import { MarkdownContent } from './MarkdownContent';
import { useLineBasedEditor } from './useLineBasedEditor';

interface SlashCommandEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Stesso contratto delle <textarea> che sostituisce - true = sola
   *  lettura, mostra sempre MarkdownContent. */
  disabled: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Editor markdown-leggero con comando "/" per inserire intestazioni H1-H4 -
 * contratto drop-in identico a una <textarea> (value/onChange/disabled),
 * cosi' sostituisce 1:1 le due textarea che oggi condividono
 * useEntityTabs.handleCustomTabContentChange (NoteSubTabs.tsx,
 * EntityDetailView.tsx).
 *
 * Anteprima LIVE (non piu' vista/modifica separate): per canEdit=true e'
 * sempre un contentEditable a righe (motore in useLineBasedEditor.ts) - la
 * dimensione dell'intestazione cambia mentre si scrive, non solo dopo
 * l'uscita dal campo. Per disabled=true resta MarkdownContent, invariato
 * (sola lettura, nessun contentEditable necessario li').
 *
 * Il comando slash scatta su QUALUNQUE "/" digitato, ovunque nel testo -
 * non solo a inizio riga (vincolo rimosso su richiesta esplicita, rischio
 * di falsi positivi, es. una "/" in un URL, accettato).
 */
export function SlashCommandEditor({ value, onChange, disabled, placeholder, className }: SlashCommandEditorProps) {
  const portalContainer = usePortalContainer();
  const editor = useLineBasedEditor({ value, onChange });

  if (disabled) {
    return (
      <div className={className ?? 'min-h-[3rem] rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3'}>
        {value ? <MarkdownContent content={value} /> : (
          <span className="text-sm text-[var(--dash-muted)]">{placeholder ?? 'Scrivi qui...'}</span>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={editor.containerRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder ?? 'Contenuto'}
        onBeforeInput={editor.handleBeforeInput}
        onInput={editor.handleInput}
        onKeyDown={editor.handleKeyDown}
        onPaste={editor.handlePaste}
        onCompositionStart={editor.handleCompositionStart}
        onCompositionEnd={editor.handleCompositionEnd}
        className={className ?? 'h-48 w-full overflow-y-auto rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3 text-sm text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)]'}
      />
      {editor.slashMenu && editor.slashMenu.commands.length > 0 && createPortal(
        <div
          // Impedisce al contentEditable di perdere il focus/la selezione
          // quando si clicca una voce del menu - stesso principio gia' in
          // uso per i submenu portalati di NoteListRow.tsx.
          onMouseDown={(e) => e.preventDefault()}
          style={{ position: 'fixed', top: editor.slashMenu.anchor.top + 4, left: editor.slashMenu.anchor.left }}
          className="z-[9999]"
        >
          <Command
            value={editor.slashMenu.highlighted}
            onValueChange={editor.slashMenu.setHighlighted}
            className="w-44 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] py-1 shadow-xl"
          >
            <CommandList>
              <CommandGroup>
                {editor.slashMenu.commands.map((cmd) => (
                  <CommandItem
                    key={cmd.value}
                    value={cmd.value}
                    onSelect={() => editor.slashMenu!.selectCommand(cmd.level)}
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
