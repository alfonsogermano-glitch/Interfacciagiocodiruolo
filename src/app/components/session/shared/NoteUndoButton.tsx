import { useEffect, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { useScopedNoteEditor } from './noteUndoScope';

// Tasto Annulla spostato FUORI dall'editor: vive nella EntityTabBar ed e'
// FISSO a fine della PRIMA riga delle tab (absolute right-0 top-0 nello
// slot pr-10 del contenitore), cosi' l'utente lo ha sempre come riferimento
// nello stesso punto, quante righe occupino le tab. Non wrappa mai e non
// forma blocco col "+": il + vive nell'unita' della sua ultima tab.
//
// onMouseDown preventDefault: il click non ruba il focus all'editor, la
// selezione al cursore sopravvive e l'undo agisce dove si stava scrivendo
// (stessa difesa del vecchio PermanentUndo nel guscio dell'editor).

export function NoteUndoButton() {
  const editor = useScopedNoteEditor();
  const [canUndo, setCanUndo] = useState(false);

  useEffect(() => {
    if (!editor) {
      setCanUndo(false);
      return;
    }
    const update = () => setCanUndo(editor.can().undo());
    editor.on('transaction', update);
    update();
    return () => {
      editor.off('transaction', update);
    };
  }, [editor]);

  // Nessun editor montato sotto la barra (tab di base, sezione non-scheda):
  // niente tasto, la riga delle fold resta pulita.
  if (!editor) return null;

  const disabled = !canUndo;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-note-contextual-ui="true"
          aria-label="Annulla"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().undo().run()}
          className={`absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-muted)] shadow-sm transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)] ${disabled ? 'cursor-not-allowed opacity-35' : ''}`}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Annulla</TooltipContent>
    </Tooltip>
  );
}
