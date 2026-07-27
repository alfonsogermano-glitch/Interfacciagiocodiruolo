import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { JSONContent } from '@tiptap/core';
import { Bold, Italic, Heading1, Heading2, Heading3, Heading4, List, ListOrdered } from 'lucide-react';
import { MarkdownContent } from './MarkdownContent';
import { parseLines } from './markdownHeadings';

interface RichTextEditorProps {
  /** entity_notes.content - formato legacy (markdown-leggero a righe). */
  legacyContent: string;
  /** entity_notes.content_rich - null = nota mai promossa al nuovo editor. */
  richContent: JSONContent | null;
  onChangeRich: (json: JSONContent) => void;
  disabled: boolean;
  placeholder?: string;
  className?: string;
}

// Converte il formato legacy (righe con prefisso "#"+spazio, vedi
// markdownHeadings.ts) in un documento TipTap iniziale equivalente, cosi'
// "promuovere" una nota vecchia al nuovo editor parte dal suo contenuto
// invece che da una pagina vuota - riusa parseLines, stessa unica fonte di
// verita' del parsing legacy gia' usata da MarkdownContent.tsx.
function legacyToTipTapDoc(content: string): JSONContent {
  const lines = parseLines(content);
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: line.level === 0 ? 'paragraph' : 'heading',
      ...(line.level !== 0 ? { attrs: { level: line.level } } : {}),
      content: line.text ? [{ type: 'text', text: line.text }] : [],
    })),
  };
}

// Estrae il solo testo da un documento TipTap - usata dalla guardia
// difensiva sotto (isDocEmpty).
function docText(doc: JSONContent | null | undefined): string {
  if (!doc) return '';
  const walk = (node: JSONContent): string => {
    let out = node.text ?? '';
    if (node.content) out += node.content.map(walk).join(node.type === 'doc' ? '\n' : '');
    return out;
  };
  return walk(doc);
}

// Un documento "vuoto" ha solo spazi/a-capo o nessun nodo di testo - usata
// dalla guardia difensiva sotto per non confondere un documento genuinamente
// vuoto (nota nuova) con uno svuotato per errore da un payload esterno
// incompleto.
function isDocEmpty(doc: JSONContent | null | undefined): boolean {
  return docText(doc).trim() === '';
}

// Costante di modulo, non un letterale dentro il componente: useEditor (con
// deps di default, vedi TipTapEditor) confronta l'intero oggetto opzioni ad
// OGNI render e richiama editor.setOptions()/view.setProps() se qualcosa
// risulta diverso per riferimento - un oggetto nuovo creato ad ogni render
// (anche a contenuto identico) risultava sempre "diverso", forzando
// ProseMirror a rielaborare le props della view ad ogni tasto digitato.
// Causa concreta (verificata leggendo il sorgente di @tiptap/react) dietro
// il flash di ridimensionamento/riga che sparisce/grassetto che non si
// disattiva.
const TIPTAP_EDITOR_PROPS = { attributes: { class: 'tiptap-content' } };

function ToolbarButton({ active, disabled, onClick, label, children }: {
  active: boolean; disabled?: boolean; onClick: () => void; label: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex shrink-0 items-center justify-center rounded-md p-1.5 transition-colors ${
        active ? 'bg-[var(--dash-surface-2)] text-[var(--dash-text-strong)]' : 'text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]'
      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
    >
      {children}
    </button>
  );
}

// Barra di formattazione standard (Fase 0: nessuna estensione RPG) - griglia
// 2 colonne x 4 righe, verticale a sinistra del testo, sempre visibile (non
// solo durante la modifica): una singola colonna di 8 pulsanti avrebbe
// richiesto ~280px di altezza, piu' del contenitore fisso h-64 usato da
// EntityDetailView.tsx (vedi piano approvato) - la griglia 2x4 dimezza
// l'ingombro verticale. onMouseDown con preventDefault sull'intero
// contenitore per non far perdere la selezione nell'editor al click di un
// bottone (qui serve ancora di piu' che con una <textarea>: senza, TipTap
// perderebbe il focus/la selezione PRIMA che il comando venga eseguito sul
// punto giusto del documento).
function Toolbar({ editor, editable }: { editor: Editor; editable: boolean }) {
  // Aggiornamento esplicito, non delegato al ri-render automatico di
  // useEditor sulle transazioni: confermato che quel meccanismo (interno a
  // TipTap, via useEditorState/useSyncExternalStore) non ri-renderizza la
  // barra in modo sincrono per una transazione lanciata da un click - lo
  // stato interno (storedMarks/isActive) risultava sempre corretto e
  // tempestivo nei log, ma il bottone restava visivamente al valore
  // precedente finche' non arrivava un'ALTRA transazione (il carattere
  // successivo) a farlo scattare. Bump esplicito di uno stato locale, dentro
  // lo stesso gestore del click, forza React a ri-renderizzare la barra
  // nello stesso giro sincrono del click stesso.
  const [, forceRerender] = useState(0);
  const runCommand = (fn: () => void) => {
    fn();
    forceRerender((n) => n + 1);
  };

  const boldActive = editor.isActive('bold');

  return (
    <div onMouseDown={(e) => e.preventDefault()} className="grid shrink-0 grid-cols-2 gap-1">
      <ToolbarButton disabled={!editable} label="Grassetto" active={boldActive} onClick={() => runCommand(() => editor.chain().focus().toggleBold().run())}>
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton disabled={!editable} label="Corsivo" active={editor.isActive('italic')} onClick={() => runCommand(() => editor.chain().focus().toggleItalic().run())}>
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton disabled={!editable} label="Titolo 1" active={editor.isActive('heading', { level: 1 })} onClick={() => runCommand(() => editor.chain().focus().toggleHeading({ level: 1 }).run())}>
        <Heading1 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton disabled={!editable} label="Titolo 2" active={editor.isActive('heading', { level: 2 })} onClick={() => runCommand(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}>
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton disabled={!editable} label="Titolo 3" active={editor.isActive('heading', { level: 3 })} onClick={() => runCommand(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}>
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton disabled={!editable} label="Titolo 4" active={editor.isActive('heading', { level: 4 })} onClick={() => runCommand(() => editor.chain().focus().toggleHeading({ level: 4 }).run())}>
        <Heading4 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton disabled={!editable} label="Elenco puntato" active={editor.isActive('bulletList')} onClick={() => runCommand(() => editor.chain().focus().toggleBulletList().run())}>
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton disabled={!editable} label="Elenco numerato" active={editor.isActive('orderedList')} onClick={() => runCommand(() => editor.chain().focus().toggleOrderedList().run())}>
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

// Editor TipTap vero e proprio - montato solo quando c'e' un documento da
// modificare (richContent non nullo, o nota nuova senza legacy da
// proteggere). Componente separato (non condizionali dentro lo stesso corpo
// di RichTextEditor) perche' useEditor va chiamato in modo incondizionato
// per le regole degli Hook - isolarlo qui evita di doverlo montare/smontare
// insieme al ramo "legacy in sola lettura" dove non serve affatto.
function TipTapEditor({ richContent, onChangeRich, editable, autoFocus, onBlurEditor, onClickText, containerClassName }: {
  richContent: JSONContent; onChangeRich: (json: JSONContent) => void; editable: boolean; autoFocus: boolean;
  onBlurEditor?: () => void;
  /** Click sulla colonna di testo per entrare in modifica (sola lettura) -
   *  assente/non invocato mentre editable e' gia' true, per non interferire
   *  col normale posizionamento del cursore durante la scrittura. */
  onClickText?: () => void;
  /** Applicata SOLO alla colonna di testo, non alla riga toolbar+testo -
   *  vedi piano approvato: il riquadro che avvolgeva toolbar+editor insieme
   *  e' stato rimosso, ne resta uno solo attorno al solo testo. */
  containerClassName: string;
}) {
  // Ultimo documento emesso NOI STESSI - stessa distinzione eco/esterno gia'
  // vista nell'editor precedente (lastEmittedRef): senza, un aggiornamento
  // esterno legittimo (cambio nota, realtime da un altro client) non
  // arriverebbe mai a editor.commands.setContent, ma un giro dello stesso
  // valore che ritorna come prop dopo il nostro stesso onChangeRich
  // romperebbe inutilmente cursore/selezione ad ogni tasto.
  const lastEmittedRef = useRef<JSONContent>(richContent);

  // content: SOLO per la creazione iniziale (confermato nel sorgente di
  // @tiptap/core: letto una volta in createDoc(), mai riapplicato da
  // useEditor dopo il mount) - va congelato con useState lazy invece di
  // passare `richContent` diretto, che cambia riferimento ad ogni tasto e
  // farebbe risultare le options "diverse" ad ogni render (vedi
  // TIPTAP_EDITOR_PROPS sopra, stessa causa). La sincronizzazione REALE dei
  // cambi successivi resta interamente affidata all'effect con setContent
  // piu' sotto.
  const [initialContent] = useState(() => richContent);

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent,
    editable,
    // .tiptap-content: vedi theme.css - ripristina list-style/padding per
    // ul/ol dentro il documento (il preflight di Tailwind li toglie
    // globalmente altrove nell'app).
    editorProps: TIPTAP_EDITOR_PROPS,
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      lastEmittedRef.current = json;
      onChangeRich(json);
    },
    // Evento nativo dell'editor invece di un onBlur React sul contenitore:
    // la barra qui sopra ferma gia' il mousedown (preventDefault), quindi
    // cliccare un bottone non fa mai perdere il focus all'editor - questo
    // scatta solo per un blur genuino (click fuori, Tab), esattamente
    // quando vogliamo davvero tornare alla vista di sola lettura.
    onBlur: () => onBlurEditor?.(),
  });
  // Nessun onSelectionUpdate/onTransaction manuale per aggiornare lo stato
  // "active" della barra: useEditor si iscrive gia' da solo alle transazioni
  // e ri-renderizza il componente (shouldRerenderOnTransaction e' attivo di
  // default, verificato nel sorgente) - un secondo meccanismo manuale era
  // ridondante e amplificava la frequenza dei render ad ogni tasto.

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  // Il focus non puo' piu' passare dall'opzione autofocus di useEditor
  // (letta solo alla creazione dell'istanza): la toolbar sempre visibile
  // significa che la STESSA istanza resta montata sia in sola lettura sia
  // in modifica (prima venivano smontata/rimontata ad ogni cambio
  // modalita'), quindi il focus va dato qui in modo imperativo ogni volta
  // che si entra davvero in modifica.
  useEffect(() => {
    if (!editor) return;
    if (editable && autoFocus) editor.commands.focus('end');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, autoFocus]);

  useEffect(() => {
    if (!editor) return;
    const isEcho = richContent === lastEmittedRef.current;
    if (isEcho) return;

    // Guardia difensiva: un documento esterno vuoto non deve MAI sovrascrivere
    // un documento locale con contenuto reale, qualunque sia la causa a monte
    // (broadcast con payload incompleto, eco malformata, futuri bug non
    // ancora scoperti). Un documento esterno genuinamente vuoto resta un
    // caso legittimo (nota appena creata da un altro client), ma SOLO se
    // anche il documento locale attuale e' vuoto.
    if (isDocEmpty(richContent) && !isDocEmpty(editor.getJSON())) {
      lastEmittedRef.current = richContent;
      return;
    }

    lastEmittedRef.current = richContent;
    editor.commands.setContent(richContent, { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [richContent]);

  if (!editor) return null;

  return (
    <div className="flex items-start gap-2">
      <Toolbar editor={editor} editable={editable} />
      <div
        onClick={!editable ? onClickText : undefined}
        className={`min-w-0 flex-1 ${!editable && onClickText ? 'cursor-text' : ''} ${containerClassName}`}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/**
 * Editor rich text (TipTap) per le note - sostituisce SlashCommandEditor.tsx
 * nei suoi due punti d'uso (NoteSubTabs.tsx, EntityDetailView.tsx). A
 * differenza del predecessore, il contratto non e' piu' un singolo
 * value/onChange su stringa: serve conoscere SIA il contenuto legacy
 * (entity_notes.content) SIA quello nuovo (content_rich) per decidere se
 * mostrare l'editor o proteggere il testo vecchio.
 *
 * Nota mai promossa (content_rich nullo) con testo legacy reale: resta in
 * sola lettura con un avviso finche' l'utente non sceglie esplicitamente di
 * passare al nuovo editor - nessun salvataggio automatico ne' sovrascrittura
 * silenziosa del contenuto vecchio.
 */
const DEFAULT_CONTAINER_CLASS = 'min-h-[3rem] rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3';

export function RichTextEditor({ legacyContent, richContent, onChangeRich, disabled, placeholder, className }: RichTextEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const hasLegacyToProtect = richContent === null && legacyContent.trim() !== '';
  // Il fallback al contenitore di default va applicato in OGNI ramo, non solo
  // nella vista di sola lettura: senza, un chiamante che non passa una
  // className esplicita (es. NoteSubTabs.tsx) perdeva bordo/sfondo/altezza
  // minima proprio nel momento in cui si passa alla modifica attiva - il
  // riquadro sembrava minuscolo/instabile perche' non c'era davvero nessun
  // contenitore stabile, solo il contenuto grezzo di ProseMirror.
  const containerClassName = className ?? DEFAULT_CONTAINER_CLASS;

  // Documento TipTap gia' esistente (nota gia' scritta col nuovo editor):
  // toolbar sempre visibile (disabilitata quando non si sta modificando o
  // !canEdit, mai nascosta - vedi Toolbar/ToolbarButton), un'unica istanza
  // condivisa fra sola lettura e modifica invece di due TipTapEditor
  // separati montati/smontati ad ogni cambio modalita' come prima - editable
  // stesso a decidere se il testo e' scrivibile.
  if (richContent !== null) {
    return (
      <TipTapEditor
        richContent={richContent}
        onChangeRich={onChangeRich}
        editable={!disabled && isEditing}
        autoFocus={isEditing}
        onBlurEditor={() => setIsEditing(false)}
        onClickText={!disabled ? () => setIsEditing(true) : undefined}
        containerClassName={containerClassName}
      />
    );
  }

  // Nessun documento TipTap ancora (nota nuova mai scritta, o nota legacy
  // non ancora promossa): nessuna toolbar da mostrare - non esiste un
  // editor reale a cui agganciarla (vedi piano approvato: costruirne una
  // finta per un editor inesistente non avrebbe beneficio concreto).
  const viewBlock = (
    <div
      onClick={() => { if (!disabled) setIsEditing(true); }}
      className={`${!disabled ? 'cursor-text' : ''} ${containerClassName}`}
    >
      {legacyContent ? (
        <MarkdownContent content={legacyContent} />
      ) : (
        <span className="text-sm text-[var(--dash-muted)]">{placeholder ?? 'Scrivi qui...'}</span>
      )}
    </div>
  );

  if (disabled || !isEditing) return viewBlock;

  if (hasLegacyToProtect) {
    return (
      <div className={containerClassName}>
        <div className="mb-2 rounded-lg border border-[var(--dash-accent)]/40 bg-[var(--dash-accent)]/10 px-3 py-2 text-xs text-[var(--dash-text)]">
          Formato precedente — modifica per aggiornare al nuovo editor.
        </div>
        <MarkdownContent content={legacyContent} />
        <button
          type="button"
          onClick={() => onChangeRich(legacyToTipTapDoc(legacyContent))}
          className="mt-2 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-3 py-1.5 text-xs font-medium text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)]"
        >
          Modifica con il nuovo editor
        </button>
      </div>
    );
  }

  // Nota nuova, prima scrittura: nessun content_rich ancora - il documento
  // vuoto e' creato solo ora, al primo ingresso in modifica (non prima, per
  // non montare un editor/toolbar per un documento che potrebbe non
  // esistere mai se l'utente esce senza scrivere nulla).
  return (
    <TipTapEditor
      richContent={{ type: 'doc', content: [{ type: 'paragraph' }] }}
      onChangeRich={onChangeRich}
      editable
      autoFocus
      onBlurEditor={() => setIsEditing(false)}
      containerClassName={containerClassName}
    />
  );
}
