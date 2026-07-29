import { useEffect, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { JSONContent } from '@tiptap/core';
import { Bold, Italic, Heading1, Heading2, Heading3, Heading4, List, ListOrdered, ChevronRight, Underline as UnderlineIcon, Strikethrough, Quote, SeparatorHorizontal, Square, ChevronsDownUp, Table as TableIcon } from 'lucide-react';
import { TableKit } from '@tiptap/extension-table';
import { MarkdownContent } from './MarkdownContent';
import { parseLines } from './markdownHeadings';
import { TIPTAP_BLOCK_EXTENSIONS } from './tiptapBlocks';
import { TipTapTableMenu } from './TipTapTableMenu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
// @tiptap/extension-underline non va importato/aggiunto qui: StarterKit lo
// include e attiva gia' di default (verificato nel suo sorgente - "if
// (this.options.underline !== false)"), aggiungerlo di nuovo registrerebbe
// la stessa estensione due volte. Il pacchetto resta comunque una
// dipendenza diretta (non solo transitiva di starter-kit) per la stabilita'
// della risoluzione dei tipi di toggleUnderline()/isActive('underline').

interface RichTextEditorProps {
  /** entity_notes.content - formato legacy (markdown-leggero a righe). */
  legacyContent: string;
  /** entity_notes.content_rich - null = nota mai promossa al nuovo editor. */
  richContent: JSONContent | null;
  onChangeRich: (json: JSONContent) => void;
  disabled: boolean;
  placeholder?: string;
  className?: string;
  /** true = questo mount corrisponde a una tab appena selezionata con un
   *  click diretto sulla sua pillola (EntityTabBar.tsx, vedi
   *  selectTabByClick in useEntityTabs.ts) - letto SOLO all'avvio (seed
   *  dello stato isEditing iniziale), mai riletto durante la vita del
   *  componente: il chiamante deve montare una nuova istanza per ogni tab
   *  (key={tab.id}) perche' questo funzioni, esattamente come gia' fa
   *  EntityDetailView.tsx/NoteSubTabs.tsx. Assente/false = comportamento
   *  invariato (serve ancora un click nel testo per entrare in modifica -
   *  sincronizzazione da altri client, apertura iniziale della nota). */
  autoFocusOnSelect?: boolean;
  /** Consumo one-shot di autoFocusOnSelect, invocato al mount - il chiamante
   *  lo usa per azzerare il proprio pendingFocusTabId (vedi
   *  clearPendingFocusTab in useEntityTabs.ts) cosi' un rimontaggio
   *  successivo della stessa tab per un motivo diverso da un nuovo click non
   *  la ritrova ancora "in attesa di focus". */
  onAutoFocusConsumed?: () => void;
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

// Confronto strutturale (non per riferimento) fra due documenti TipTap -
// vedi il commento nell'effect di sincronizzazione in TipTapEditor sotto,
// serve a riconoscere un'eco arrivata da rete (oggetto JS diverso, stesso
// contenuto) come tale, invece di trattarla come un cambiamento esterno
// reale.
function docsEqual(a: JSONContent | null | undefined, b: JSONContent | null | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={`flex shrink-0 items-center justify-center rounded-md p-1.5 transition-colors ${
            active ? 'bg-[var(--dash-surface-2)] text-[var(--dash-text-strong)]' : 'text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]'
          } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

// Gruppo di pulsanti della toolbar con intestazione cliccabile che
// espande/collassa il contenuto (stile accordion verticale) - progettato per
// essere esteso in futuro con altri gruppi (Widget, Oggetti speciali) senza
// toccare questo componente: basta aggiungere un'altra <ToolbarSection> nel
// Toolbar sotto. Apertura indipendente per sezione (non "un solo gruppo
// aperto alla volta"): con piu' sezioni in futuro puo' avere senso tenerne
// aperte piu' di una mentre si lavora (scelta confermata dall'utente).
// L'intestazione resta sempre cliccabile anche in sola lettura/!canEdit -
// espandere/collassare e' solo UI, non modifica nulla; solo i pulsanti di
// formattazione dentro (ToolbarButton) si disabilitano in quel caso.
function ToolbarSection({ label, defaultOpen, children }: { label: string; defaultOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex w-full items-center gap-0.5 rounded-md px-0.5 py-1 text-left text-[10px] font-medium uppercase tracking-wide text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]"
          >
            <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
            <span className="truncate">{label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
      {open && <div className="mt-1 flex flex-col gap-1">{children}</div>}
    </div>
  );
}

// Barra di formattazione standard (Fase 0: nessuna estensione RPG) - una
// sola sezione oggi ("Formattazione testo", colonna singola con gli 8
// pulsanti attuali, 1 per riga), verticale a sinistra del testo, sempre
// visibile (non solo durante la modifica). Con la sezione collassabile,
// l'altezza della colonna singola (~280px da aperta) non e' piu' un
// vincolo fisso come lo sarebbe stata una barra sempre-visibile non
// richiudibile - l'utente puo' comprimere "Formattazione testo" quando non
// serve. onMouseDown con preventDefault sull'intero contenitore per non far
// perdere la selezione nell'editor al click di un bottone (qui serve ancora
// di piu' che con una <textarea>: senza, TipTap perderebbe il focus/la
// selezione PRIMA che il comando venga eseguito sul punto giusto del
// documento).
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
    <div onMouseDown={(e) => e.preventDefault()} className="flex w-9 shrink-0 flex-col gap-2">
      <ToolbarSection label="Formattazione testo" defaultOpen>
        <ToolbarButton disabled={!editable} label="Grassetto" active={boldActive} onClick={() => runCommand(() => editor.chain().focus().toggleBold().run())}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton disabled={!editable} label="Corsivo" active={editor.isActive('italic')} onClick={() => runCommand(() => editor.chain().focus().toggleItalic().run())}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        {/* toggleUnderline/isActive('underline'): comandi gia' disponibili
            senza registrare nulla in piu' - Underline e' incluso e attivo di
            default dentro StarterKit (vedi commento sull'import sopra). */}
        <ToolbarButton disabled={!editable} label="Sottolineato" active={editor.isActive('underline')} onClick={() => runCommand(() => editor.chain().focus().toggleUnderline().run())}>
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        {/* toggleStrike/isActive('strike'): come Underline sopra, gia'
            incluso e attivo di default dentro StarterKit - nessuna nuova
            estensione da registrare. */}
        <ToolbarButton disabled={!editable} label="Sbarrato" active={editor.isActive('strike')} onClick={() => runCommand(() => editor.chain().focus().toggleStrike().run())}>
          <Strikethrough className="h-4 w-4" />
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
        {/* toggleBlockquote/isActive('blockquote'): comportamento di
            Backspace/Invio nativo di ProseMirror (lift fuori dalla citazione
            a inizio riga, la riga verticale si allunga da sola su piu'
            paragrafi) - vedi lo stile in theme.css, nessun codice qui oltre
            al toggle. Gia' incluso in StarterKit come Underline/Strike. */}
        <ToolbarButton disabled={!editable} label="Citazione" active={editor.isActive('blockquote')} onClick={() => runCommand(() => editor.chain().focus().toggleBlockquote().run())}>
          <Quote className="h-4 w-4" />
        </ToolbarButton>
      </ToolbarSection>
      {/* Sezione separata da "Formattazione testo": Box di testo e Collapse
          sono nodi a blocco (inseriscono/racchiudono contenuto), non marchi
          inline sul testo selezionato come grassetto/corsivo/sottolineato -
          concettualmente diversi, da cui la sezione dedicata (confermato nel
          piano). Pulsanti "insert", non toggle: nessuno stato attivo/non
          attivo da riflettere (active sempre false). */}
      <ToolbarSection label="Blocchi" defaultOpen>
        <ToolbarButton disabled={!editable} label="Box di testo" active={false} onClick={() => runCommand(() => editor.chain().focus().setTextBox().run())}>
          <Square className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton disabled={!editable} label="Collapse (espandi/comprimi)" active={false} onClick={() => runCommand(() => editor.chain().focus().setCollapseBlock().run())}>
          <ChevronsDownUp className="h-4 w-4" />
        </ToolbarButton>
        {/* setHorizontalRule: gia' incluso in StarterKit come
            Blockquote/Strike, nessuna nuova estensione. Comando di
            inserimento (non toggle) come Box di testo/Collapse sopra. */}
        <ToolbarButton disabled={!editable} label="Linea orizzontale" active={false} onClick={() => runCommand(() => editor.chain().focus().setHorizontalRule().run())}>
          <SeparatorHorizontal className="h-4 w-4" />
        </ToolbarButton>
        {/* insertTable: unica funzionalita' di questo gruppo che richiede una
            nuova estensione (TableKit, vedi extensions sotto) - tabella 3x3
            senza riga di intestazione (si attiva dopo dal menu contestuale
            della tabella, vedi TipTapTableMenu.tsx). */}
        <ToolbarButton disabled={!editable} label="Tabella" active={false} onClick={() => runCommand(() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run())}>
          <TableIcon className="h-4 w-4" />
        </ToolbarButton>
      </ToolbarSection>
      {/* Sezioni future (Widget, Oggetti speciali): aggiungere qui altre
          <ToolbarSection label="..." defaultOpen={false}>...</ToolbarSection>,
          nessuna modifica a ToolbarSection/ToolbarButton necessaria. */}
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
    // resizable: true attiva columnResizing di prosemirror-tables (gia'
    // dentro @tiptap/extension-table, nessun codice nostro) - richiede pero'
    // il CSS dedicato in theme.css (table-layout:fixed, .tableWrapper,
    // .column-resize-handle, testo a capo) senza il quale le colonne
    // resterebbero incoerenti col contenuto durante il trascinamento.
    extensions: [StarterKit, TableKit.configure({ table: { resizable: true } }), ...TIPTAP_BLOCK_EXTENSIONS],
    content: initialContent,
    editable,
    // .tiptap-content: vedi theme.css - ripristina list-style/padding per
    // ul/ol dentro il documento (il preflight di Tailwind li toglie
    // globalmente altrove nell'app).
    editorProps: TIPTAP_EDITOR_PROPS,
    onUpdate: ({ editor }) => {
      onChangeRich(editor.getJSON());
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
  // che si entra davvero in modifica. Nessun argomento di posizione (niente
  // 'end'): il click che ha fatto scattare onClickText/setIsEditing ha gia'
  // posizionato la selezione di ProseMirror nel punto cliccato (il
  // click-handling nativo della view aggiorna la selezione anche quando
  // editable era ancora false) - forzare 'end' qui la spostava sempre alla
  // fine del testo, ignorando dove l'utente aveva davvero cliccato.
  useEffect(() => {
    if (!editor) return;
    if (editable && autoFocus) editor.commands.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, autoFocus]);

  useEffect(() => {
    if (!editor) return;

    // Confronto STRUTTURALE col documento gia' presente nell'editor, non
    // per riferimento con l'ultimo valore emesso da noi (come prima): un
    // salvataggio che torna indietro via realtime/refetch e' un oggetto JS
    // diverso anche a contenuto identico (passato per rete, serializzato/
    // deserializzato), quindi l'uguaglianza per riferimento smetteva di
    // riconoscerlo come eco non appena la finestra di soppressione lato
    // client (~1200ms, recentLocalEditRef in useEntityTabs.ts) scadeva -
    // richiamava comunque setContent() su un documento identico, e
    // sostituire l'intero documento (tr.replaceWith(0, doc.content.size,
    // ...) dentro @tiptap/core) sposta la selezione mappata verso la fine
    // invece di lasciarla dov'era. Confrontando il CONTENUTO invece del
    // riferimento, un eco (anche tardivo) non tocca mai piu' l'editor.
    if (docsEqual(richContent, editor.getJSON())) return;

    // Guardia difensiva: un documento esterno vuoto non deve MAI sovrascrivere
    // un documento locale con contenuto reale, qualunque sia la causa a monte
    // (broadcast con payload incompleto, eco malformata, futuri bug non
    // ancora scoperti). Un documento esterno genuinamente vuoto resta un
    // caso legittimo (nota appena creata da un altro client), ma SOLO se
    // anche il documento locale attuale e' vuoto.
    if (isDocEmpty(richContent) && !isDocEmpty(editor.getJSON())) return;

    // Documento esterno realmente diverso (un altro client/utente ha
    // modificato la stessa nota) - preserva la selezione attraverso
    // setContent(): setTextSelection clampa gia' da solo entro i limiti del
    // nuovo documento (vedi sorgente @tiptap/core), quindi e' sicuro
    // riapplicare la stessa posizione anche se il nuovo testo e' piu' corto.
    const { from, to } = editor.state.selection;
    editor.commands.setContent(richContent, { emitUpdate: false });
    editor.commands.setTextSelection({ from, to });
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
        {editable && <TipTapTableMenu editor={editor} />}
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

export function RichTextEditor({ legacyContent, richContent, onChangeRich, disabled, placeholder, className, autoFocusOnSelect, onAutoFocusConsumed }: RichTextEditorProps) {
  // Lazy init: valutata una sola volta, al mount di QUESTA istanza (una per
  // tab, vedi il commento su autoFocusOnSelect sopra) - un cambio successivo
  // della prop non riapre la modifica da solo, esattamente come per
  // qualunque altro useState seedato da una prop iniziale.
  const [isEditing, setIsEditing] = useState(() => !!autoFocusOnSelect && !disabled);
  useEffect(() => {
    if (autoFocusOnSelect) onAutoFocusConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
