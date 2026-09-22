import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';

// Ambito Annulla per le note: il tasto vive nella EntityTabBar (fuori dal
// guscio dell'editor, a fine riga delle fold delle tab) ma agisce
// sull'unico RichTextEditor montato sotto quella barra. Editor e barra non
// condividono un genitore diretto stretto (EntityDetailView e' enorme e
// monta barra ed editor distanti tra loro; NoteSubTabs li monta da
// fratelli), quindi il legame passa da questo provider: ogni coppia
// "barra + editor" si wrappa col proprio ambito, con scope annidati se una
// nota con sotto-tab vive dentro una scheda entity.
//
// Perche' un solo editor per ambito: sia EntityDetailView (key={tab.id} con
// gating su currentTab) sia NoteSubTabs montano il RichTextEditor SOLO per
// la tab attiva, quindi il claim vince in esclusiva fino allo smont.

interface NoteUndoScopeValue {
  editor: Editor | null;
  claim: (editor: Editor) => void;
  release: (editor: Editor) => void;
}

const NoteUndoScopeContext = createContext<NoteUndoScopeValue | null>(null);

const noop = () => {};

export function NoteUndoScope({ children }: { children: ReactNode }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const claim = useCallback((next: Editor) => setEditor((prev) => (prev === next ? prev : next)), []);
  // Release identita'-guidato: il cleanup del vecchio editor (swap di tab via
  // key) non azzera il nuovo, qualunque sia l'ordine dei commit di React.
  const release = useCallback((gone: Editor) => setEditor((prev) => (prev === gone ? null : prev)), []);
  const value = useMemo(() => ({ editor, claim, release }), [editor, claim, release]);
  return <NoteUndoScopeContext.Provider value={value}>{children}</NoteUndoScopeContext.Provider>;
}

/**
 * RichTextEditor: rivendica l'ambito con l'istanza viva e la rilascia allo
 * smont. Fuori da un provider e' no-op (nessuna barra = nessun tasto).
 */
export function useClaimNoteUndoScope(editor: Editor | null) {
  const scope = useContext(NoteUndoScopeContext);
  const claim = scope?.claim ?? noop;
  const release = scope?.release ?? noop;
  useEffect(() => {
    if (!editor) return;
    claim(editor);
    return () => release(editor);
  }, [editor, claim, release]);
}

/**
 * NoteUndoButton: l'editor attualmente rivendicato in questo ambito
 * (null = nessun editor montato sotto la barra, es. tab di base senza note).
 */
export function useScopedNoteEditor(): Editor | null {
  return useContext(NoteUndoScopeContext)?.editor ?? null;
}
