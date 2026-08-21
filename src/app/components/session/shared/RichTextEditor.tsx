import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import type { JSONContent } from '@tiptap/core';
import { Bold, Italic, List, ListOrdered, ChevronRight, Underline as UnderlineIcon, Strikethrough, Quote, SeparatorHorizontal, Square, ChevronsDownUp, AlignLeft, AlignCenter, AlignRight, Image as ImageIcon, Undo2, Type as FontIcon, Check, PenLine, LayoutTemplate, ListTodo, Shapes, Sword, Swords, Shield, Target, Crosshair, Skull, Bomb, Zap, Flame, Biohazard, Sparkles, Wand, Ghost, Eye, Moon, Sun, Feather, Scroll, Radiation, Snowflake, Compass, Map, MapPin, Mountain, Tent, Footprints, Anchor, Ship, Route, Signpost, User, Users, Crown, GraduationCap, Drama, Briefcase, Key, Gem, Coins, Pickaxe, FlaskConical, Pill, Syringe, Dice6, BookOpen, Castle, Church, Landmark, DoorOpen, Home, Store, Trees, Activity, Bell, Brain, Star, Heart, Music, Theater, Newspaper, type LucideIcon } from 'lucide-react';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { MarkdownContent } from './MarkdownContent';
import { parseLines } from './markdownHeadings';
import { TIPTAP_BLOCK_EXTENSIONS } from './tiptapBlocks';
import { FontSize, FONT_SIZES, HEADING_LEVEL_TO_FONT_SIZE, migrateHeadingsToFontSize } from './tiptapFontSize';
import { FontFamily, FONT_FAMILIES } from './tiptapFontFamily';
import { InlineIcon } from './tiptapInlineIcon';
import { ICON_CATEGORIES } from './tiptapIconData';
import { flattenRemovedLayoutNodes } from './tiptapLegacyMigration';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/tabs';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { useAuth } from '../../../auth/AuthContext';
import { supabase, isSupabaseConfigured } from '../../../../lib/supabaseClient';

// Limite dimensione file per l'upload da locale (bucket 'note-images',
// Supabase Storage) - stessa soglia gia' usata per lo stesso identico
// scopo in NewsPage.tsx, nessun motivo per un valore diverso qui.
const MAX_IMAGE_MB = 5;
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
// verita' del parsing legacy gia' usata da MarkdownContent.tsx. Le righe con
// livello (ex "#"-N) diventano paragraph con mark fontSize invece del nodo
// "heading" (rimosso dallo schema, vedi StarterKit.configure({heading:false})
// sotto) - stesso mapping livello->px di migrateHeadingsToFontSize, per
// coerenza fra le due strade che portano a una nota gia' con "titoli".
function legacyToTipTapDoc(content: string): JSONContent {
  const lines = parseLines(content);
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line.text
        ? [{ type: 'text', text: line.text, ...(line.level !== 0 ? { marks: [{ type: 'fontSize', attrs: { size: HEADING_LEVEL_TO_FONT_SIZE[line.level] } }] } : {}) }]
        : [],
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
const TIPTAP_EDITOR_PROPS = {
  attributes: { class: 'tiptap-content' },
  // Bug segnalato dal vivo 2026-08-20: Ctrl+Shift+R (Cmd+Shift+R su Mac,
  // hard refresh del browser) veniva intercettato dentro il
  // contentEditable invece di raggiungere il browser. Nessuna scorciatoia
  // dell'editor usa questa combinazione (verificato: nessun
  // addKeyboardShortcuts la registra), ma restituire esplicitamente false
  // (= "non gestito da me") garantisce che ProseMirror non chiami
  // preventDefault/stopPropagation su questo evento per nessun motivo,
  // lasciando il comportamento nativo del browser intatto.
  // Frecce attorno al nodo InlineIcon (bug segnalato dal vivo con tastiera
  // fisica, tre casi - vedi tiptapInlineIcon.ts per la cronologia): un
  // primo tentativo con addKeyboardShortcuts (nel Node stesso) NON
  // funzionava con la tastiera reale - il keymap di ProseMirror applica lo
  // shortcut ma poi il comportamento nativo per gli atom veniva comunque
  // eseguito dopo (il cursore "rimbalzava" indietro), perche' entrambi i
  // gestori vivono nello stesso plugin keymap e ProseMirror non garantisce
  // che il nostro handler vinca sempre sul default lì. handleKeyDown qui
  // (un plugin separato, valutato PRIMA della keymap dell'editor - vedi
  // EditorView.someProp priority) risolve alla radice: return true blocca
  // ESPLICITAMENTE ogni comportamento nativo successivo per quell'evento,
  // niente puo' piu' sovrascriverlo.
  handleKeyDown(view, event: KeyboardEvent) {
    const isHardRefresh = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'r';
    if (isHardRefresh) return false;

    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const direction = event.key === 'ArrowRight' ? 'right' : 'left';
      const { state } = view;
      const { selection } = state;
      const { $from } = selection;

      // Caso: NodeSelection gia' attiva sull'icona (es. dopo un click) -
      // la freccia la supera. selection.to/from sono gia' rispettivamente
      // pos+nodeSize e pos del nodo selezionato.
      if (selection instanceof NodeSelection && selection.node.type.name === InlineIcon.name) {
        const targetPos = direction === 'right' ? selection.to : selection.from;
        view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, targetPos)));
        return true;
      }

      // Caso: cursore di testo semplice adiacente all'icona nella direzione
      // di marcia - la scavalca direttamente in una sola pressione, senza
      // mai passare da una NodeSelection intermedia (questo e' cio' che
      // evita il caso limite dell'icona a inizio/fine paragrafo, dove il
      // default di ProseMirror non forma nemmeno una NodeSelection).
      // $from.nodeBefore/nodeAfter (non doc.nodeAt) restano validi anche
      // li'.
      if (selection.empty) {
        const adjacentNode = direction === 'right' ? $from.nodeAfter : $from.nodeBefore;
        if (adjacentNode && adjacentNode.type.name === InlineIcon.name) {
          const targetPos = direction === 'right' ? $from.pos + adjacentNode.nodeSize : $from.pos - adjacentNode.nodeSize;
          view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, targetPos)));
          return true;
        }
      }

      // Il caso limite del vero bordo del paragrafo (icona come
      // ultimo/primo contenuto, nodeAfter/nodeBefore nullo qui sopra - il
      // nativo genera li' una TextSelection-range spuria che copre
      // esattamente l'icona) NON si corregge qui: un tentativo reattivo al
      // keydown successivo arrivava troppo tardi (la transazione di sync
      // selezione del browser precede la lettura dello stato in questo
      // handler, quindi la freccia che la genera mostrava gia' il salto
      // per una pressione intera). Bloccata alla radice da
      // filterTransaction in tiptapInlineIcon.ts (addProseMirrorPlugins) -
      // vedi il commento li' per i dettagli.
    }

    return false;
  },
};

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
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md p-1.5 transition-colors ${
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

// Tendina numerica (stile word processor) per la dimensione del testo
// selezionato - un <select> nativo invece di un dropdown custom: piu'
// semplice, gia' accessibile via tastiera/screen reader senza codice
// aggiuntivo, coerente con lo stesso pattern gia' usato altrove nell'app
// (vedi EntityFilterToolbar.tsx) solo ristretto qui a text-xs/padding minore
// per stare nella colonna toolbar stretta. Sostituisce l'ex tendina
// Normale/1-4 (Heading, rimosso dallo schema - vedi
// StarterKit.configure({heading:false}) sotto): fontSize e' un Mark
// inline (come Grassetto/Corsivo), non un Node di blocco, quindi si applica
// alla sola selezione invece che a tutta la riga. 16 = la dimensione
// effettivamente ereditata quando NON c'e' nessun mark fontSize (root
// --font-size:16px in theme.css, nessun override in .tiptap-content) - la
// tendina mostra sempre un numero reale, mai un placeholder vuoto, e
// selezionare 16 esplicitamente e' un no-op visivo ma comunque valido
// (stesso trattamento di qualunque altro valore, nessun caso speciale
// "rimuovi formattazione" richiesto). Nessun comando nuovo da scrivere per
// il cursore senza selezione: setMark (usato da setFontSize in
// tiptapFontSize.ts) ha gia' il branch stored-mark per selezione vuota,
// stesso codice condiviso da toggleBold/toggleItalic (verificato nel
// sorgente di @tiptap/core).
//
// onMouseDown con stopPropagation (non preventDefault, l'opposto):
// bug 2026-07-31, la tendina non si apriva affatto al click, stesso sintomo
// gia' visto con l'ex HeadingSelect e mai risolto davvero. Causa reale
// (verificata nel sorgente): il contenitore Toolbar piu' sotto ferma il
// mousedown con preventDefault per i pulsanti (evita che rubino il focus
// all'editor), ma per un <select> nativo preventDefault sul mousedown
// sopprime ANCHE l'apertura della lista a discesa, che e' il suo stesso
// default action nativo - non solo lo spostamento del focus. stopPropagation
// QUI, sul mousedown della select stessa, impedisce all'evento di
// raggiungere l'handler dell'antenato (mai chiamato per questo elemento),
// lasciando che il browser apra la lista normalmente. Il focus che la select
// prende di conseguenza e' gestito dall'onBlur con relatedTarget in
// TipTapEditor sopra (senza, l'editor uscirebbe dalla modalita' modifica a
// meta' interazione, disabilitando la select prima ancora che l'utente
// riesca a scegliere un valore).
function FontSizeSelect({ editor, editable, onCommand }: { editor: Editor; editable: boolean; onCommand: (fn: () => void) => void }) {
  const currentSize = (editor.getAttributes('fontSize').size as number | undefined) ?? 16;

  return (
    <select
      disabled={!editable}
      value={currentSize}
      onMouseDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        const size = Number(e.target.value);
        onCommand(() => editor.chain().focus().setFontSize(size).run());
      }}
      aria-label="Dimensione testo"
      className={`w-full rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-0.5 py-1.5 text-center text-xs text-[var(--dash-text)] ${
        editable ? '' : 'cursor-not-allowed opacity-40'
      }`}
    >
      {FONT_SIZES.map((size) => (
        <option key={size} value={size}>{size}</option>
      ))}
    </select>
  );
}

// Pulsante Font con Popover (stesso pattern del Popover "Immagine" piu'
// sotto, non un <select> nativo come FontSizeSelect - una tendina nativa coi
// nomi degli 11 font occupava troppa larghezza fissa nella colonna stretta
// (w-11) della toolbar; un'icona singola che apre un Popover ha lo stesso
// ingombro di ToolbarButton/il pulsante Immagine, indipendentemente da
// quanti font ci siano in lista).
//
// span intermedio tra TooltipTrigger e PopoverTrigger: stesso identico
// disaccoppiamento gia' documentato sotto per il Popover Immagine (due
// Popper.Anchor annidati sullo stesso nodo lascerebbero il tooltip bloccato
// sul placeholder iniziale di Radix, mai rimisurato).
//
// onMouseDown/stopPropagation su PopoverContent: stesso motivo di
// FontSizeSelect/Popover Immagine - il mousedown di un pulsante nella lista
// risalirebbe altrimenti fino al div radice di Toolbar (preventDefault li',
// vedi Toolbar sotto), che React fa risalire lungo l'albero dei COMPONENTI
// (non quello del DOM) quindi il Portal da solo non basta a isolarlo.
//
// side="top"/align="start"/collisionPadding/z-[9999]/le variabili
// --dash-panel/--dash-text-strong/--dash-border-soft: stessi identici motivi
// gia' documentati per il Popover Immagine sotto (colonna Toolbar stretta,
// SlideOverPanel a z-[900], --popover/--popover-foreground non legate alla
// palette attiva).
//
// classe "tiptap-font-popover": stesso bug cursor:text del Portal gia' visto
// per "tiptap-image-popover" (theme.css) - il Portal di Radix monta FUORI
// dall'albero DOM di .tiptap-toolbar, quindi quella regola non lo
// raggiunge; qui pero' non c'e' nessun <input> da escludere (a differenza
// del popover Immagine), ogni riga e' un <button>.
function FontFamilyPicker({ editor, editable, onCommand }: { editor: Editor; editable: boolean; onCommand: (fn: () => void) => void }) {
  const [open, setOpen] = useState(false);
  const currentFamily = editor.getAttributes('fontFamily').family as string | undefined;
  const currentLabel = FONT_FAMILIES.find((f) => f.value === currentFamily)?.label ?? FONT_FAMILIES[0].label;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={!editable}
                aria-label="Font"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md p-1.5 transition-colors text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)] ${!editable ? 'cursor-not-allowed opacity-40' : ''}`}
              >
                <FontIcon className="h-4 w-4" />
              </button>
            </PopoverTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">Font</TooltipContent>
      </Tooltip>
      <PopoverContent side="top" align="start" collisionPadding={8} className="tiptap-font-popover w-48 z-[9999] bg-[var(--dash-panel)] text-[var(--dash-text-strong)] border-[var(--dash-border-soft)] p-1" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
          {FONT_FAMILIES.map(({ label, value }) => {
            const active = label === currentLabel;
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  onCommand(() => editor.chain().focus().setFontFamily(label).run());
                  setOpen(false);
                }}
                className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--dash-surface-2)] ${
                  active ? 'border-[var(--dash-accent)] text-[var(--dash-text-strong)]' : 'border-transparent text-[var(--dash-text)]'
                }`}
                style={{ fontFamily: value }}
              >
                <span className="truncate">{label}</span>
                {active && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--dash-accent)]" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Nome -> componente React lucide-react, solo per la GRIGLIA del Popover
// sotto (interfaccia della toolbar, React normale) - non c'entra col nodo
// del documento inlineIcon (tiptapInlineIcon.ts), che renderizza SVG puro
// via renderHTML/DOMOutputSpec senza mai passare da questi componenti (la
// restrizione "niente ReactNodeViewRenderer" del piano approvato riguarda
// SOLO il contenuto del documento TipTap, non la UI della toolbar che lo
// inserisce). Stessa identica lista di nomi di ICON_CATEGORIES
// (tiptapIconData.ts) - se le due divergessero un'icona apparirebbe nella
// categoria ma senza componente per disegnarla in griglia; nessuna verifica
// automatica dell'allineamento fra le due liste, stesso compromesso gia'
// accettato altrove in questo file (es. SIMPLE_BLOCK_TYPES duplicato in
// tiptapBlocks.tsx/tiptapLegacyMigration.ts) per non introdurre una
// dipendenza fra un modulo di soli dati e uno di sola UI.
const ICON_COMPONENTS: Record<string, LucideIcon> = {
  Sword, Swords, Shield, Target, Crosshair, Skull, Bomb, Zap, Flame, Biohazard,
  Sparkles, Wand, Ghost, Eye, Moon, Sun, Feather, Scroll, Radiation, Snowflake,
  Compass, Map, MapPin, Mountain, Tent, Footprints, Anchor, Ship, Route, Signpost,
  User, Users, Crown, GraduationCap, Drama, Briefcase,
  Key, Gem, Coins, Pickaxe, FlaskConical, Pill, Syringe, Dice6, BookOpen,
  Castle, Church, Landmark, DoorOpen, Home, Store, Trees,
  Activity, Bell, Brain, Star, Heart, Music, Theater, Newspaper,
};

// Popover icone (pulsante "Icone" in "Blocchi") - stesso identico pattern
// di FontFamilyPicker sopra (Popover controllato, span intermedio per
// disaccoppiare Tooltip/PopoverTrigger dallo stesso bug Popper gia'
// documentato per il Popover Immagine, onMouseDown stopPropagation,
// side="top"/z-[9999]/variabili --dash-*). A differenza di FontFamilyPicker
// (11 voci, lista singola) qui sono 60 icone in 7 categorie: una griglia
// per categoria invece di una lista a colonna singola, altrimenti il
// popover sarebbe scomodamente alto/stretto. Nessuno stato "attivo" da
// evidenziare (a differenza del font corrente) - inserire un'icona e' un
// comando "insert", non un toggle su una selezione di testo esistente
// (stesso identico principio di Box di testo/Collapse/Linea orizzontale in
// "Blocchi" sotto, tutti senza stato attivo/non attivo).
function IconPicker({ editor, editable, onCommand }: { editor: Editor; editable: boolean; onCommand: (fn: () => void) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={!editable}
                aria-label="Icone"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md p-1.5 transition-colors text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)] ${!editable ? 'cursor-not-allowed opacity-40' : ''}`}
              >
                <Shapes className="h-4 w-4" />
              </button>
            </PopoverTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">Icone</TooltipContent>
      </Tooltip>
      {/* onOpenAutoFocus preventDefault: bug segnalato dal vivo - la prima
          icona (Sword) sembrava "evidenziata diversamente" dalle altre.
          Non e' uno stile CSS applicato (verificato dal vivo: getComputedStyle
          della prima icona e di una qualunque altra e' IDENTICO in ogni
          proprieta', nessuna regola active/selected coinvolta) - Radix
          sposta li' il focus da solo quando il Popover si apre (comportamento
          di default di Popover.Content, verificato dal vivo:
          document.activeElement === il bottone della prima icona subito
          dopo l'apertura), e Tooltip (correttamente, per accessibilita')
          mostra il proprio contenuto anche su focus, non solo su hover -
          il tooltip "Sword" restava quindi visibile in permanenza sopra la
          prima icona finche' non si spostava il mouse altrove, dando
          l'impressione di un'icona "attiva" diversa dalle altre. Questo
          picker serve solo per INSERIRE un'icona (nessun campo dentro su
          cui avrebbe senso portare il focus in automatico, a differenza di
          un form) - prevenire l'auto-focus e' la correzione giusta, non
          uno stile da sopprimere (non ce n'era nessuno) ne' un'esclusione
          CSS da aggiungere (non e' un'eredita' CSS). */}
      <PopoverContent side="top" align="start" collisionPadding={8} onOpenAutoFocus={(e) => e.preventDefault()} className="tiptap-icon-popover w-64 z-[9999] bg-[var(--dash-panel)] text-[var(--dash-text-strong)] border-[var(--dash-border-soft)] p-2" onMouseDown={(e) => e.stopPropagation()}>
        {/* tiptap-icon-popover-scroll: la regola globale
            *:not(.tiptap-content) in index.css nasconde la scrollbar
            ovunque tranne che nell'editor stesso (scelta voluta li', per
            non mostrare scrollbar di sistema fuori posto nel resto della
            UI) - questo div PERO' ha davvero bisogno di una scrollbar
            visibile (7 categorie/60 icone, ben oltre gli 80 di altezza
            massima) come indizio che sotto c'e' altro da scorrere, stesso
            identico motivo per cui .tiptap-content e' gia' esclusa da
            quella regola. Overflow verticale REALE ma scrollbar invisibile
            (bug segnalato dal vivo) - stessa causa, stessa exclusion,
            aggiunta al selettore in index.css invece di una regola qui che
            verrebbe comunque scavalcata (stessa specificita' di
            *:not(...), ma quella regola viene DOPO theme.css nell'ordine
            finale del cascade - vedi index.css, gli @import di
            fonts/tailwind/theme vengono prima del resto del file). */}
        <div className="tiptap-icon-popover-scroll flex max-h-80 flex-col gap-3 overflow-y-auto">
          {ICON_CATEGORIES.map(({ label, icons }) => (
            <div key={label}>
              <div className="mb-1 px-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--dash-muted)]">{label}</div>
              <div className="grid grid-cols-6 gap-1">
                {icons.map((name) => {
                  const IconComponent = ICON_COMPONENTS[name];
                  if (!IconComponent) return null;
                  return (
                    <Tooltip key={name}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => {
                            onCommand(() => editor.chain().focus().insertIcon(name).run());
                            setOpen(false);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]"
                        >
                          <IconComponent className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      {/* z-[10000] (sovrascrive lo z-[1200] di default di
                          TooltipContent, cn() usa tailwind-merge quindi
                          l'ultima classe vince, stesso principio gia' visto
                          per bg-[var(--dash-panel)] ecc. sul Popover
                          Immagine): questo tooltip appare mentre il
                          Popover (z-[9999]) e' gia' aperto, non prima -
                          serve superarlo, non solo il default z-50 di un
                          Popover/menu qualunque. Basta sull'elemento
                          Content stesso: Arrow e il div della cornice
                          dentro TooltipContent (ui/tooltip.tsx) restano al
                          loro z-[1200] originale, ma competono solo FRA
                          LORO dentro lo stacking context che il Content
                          stesso crea (essendone entrambi discendenti) - una
                          volta che il Content e' sopra al Popover, tutto
                          cio' che ci sta dentro lo segue automaticamente,
                          indipendentemente dal proprio z-index locale. */}
                      <TooltipContent side="top" className="z-[10000]">{name}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
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
//
// icon (non piu' <span>{label}</span> per intero): la colonna e' w-11 (44px)
// - il testo completo ("Formattazione testo"/"Blocchi") ci stava solo
// troncato con l'ellissi di truncate, illeggibile (bug segnalato dal vivo).
// Un'icona rappresentativa passata da ogni chiamata (vedi Toolbar sotto,
// stesso principio di ToolbarButton che gia' riceve la propria icona come
// children) occupa lo stesso spazio del testo troncato ma resta leggibile;
// il nome per esteso resta disponibile via tooltip (TooltipContent{label}
// sotto, invariato) e via aria-label esplicito (il bottone non ha piu' testo
// visibile da cui uno screen reader potrebbe altrimenti derivarlo). Il
// ChevronRight resta accanto per lo stesso indicatore di stato
// aperto/chiuso di prima (rotate-90), solo senza piu' testo a fianco.
function ToolbarSection({ label, icon, defaultOpen, children }: { label: string; icon: React.ReactNode; defaultOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={label}
            className="flex w-full items-center justify-center gap-0.5 rounded-md px-0.5 py-1.5 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]"
          >
            {icon}
            <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
      {open && <div className="mt-1 flex flex-col gap-1">{children}</div>}
    </div>
  );
}

// Barra di formattazione standard (Fase 0: nessuna estensione RPG) - una
// sola sezione oggi ("Formattazione testo", colonna singola, 1 elemento per
// riga - la tendina numerica di FontSizeSelect sopra piu' i pulsanti icona),
// verticale a sinistra del testo, sempre visibile (non solo durante la
// modifica). Con la sezione collassabile, l'altezza della colonna singola
// non e' piu' un vincolo fisso come lo sarebbe stata una barra
// sempre-visibile non richiudibile - l'utente puo' comprimere
// "Formattazione testo" quando non serve. onMouseDown con preventDefault
// sull'intero contenitore per non far perdere la selezione nell'editor al
// click di un bottone (qui serve ancora di piu' che con una <textarea>:
// senza, TipTap perderebbe il focus/la selezione PRIMA che il comando venga
// eseguito sul punto giusto del documento).
//
// w-11 (non w-9): leggermente piu' largo per ospitare la tendina
// FontSizeSelect coi suoi numeri a 1-2 cifre + freccina nativa (bug
// segnalato 2026-07-31: era rimasto w-20, tarato per "Normale" dell'ex
// tendina Heading, troppo largo per un semplice numero) - i pulsanti icona
// sotto (ToolbarButton, con h-9 w-9 espliciti invece di affidarsi allo
// stretch del contenitore) restano alla stessa dimensione quadrata di
// prima, solo allineati a sinistra nella colonna leggermente piu' larga
// invece di riempirla.
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

  // Inserimento immagine: un solo pulsante "Immagine" apre un Popover con
  // due sezioni (Tabs) - "Da URL" (comportamento gia' esistente, prima un
  // window.prompt) e "Da file" (upload su Supabase Storage, vedi
  // handleFileSelected sotto). imagePopoverOpen e' controllato (non
  // affidato al default non controllato di Radix) solo per poterlo chiudere
  // da codice dopo un inserimento riuscito o dopo aver aperto il file
  // picker nativo - altrimenti resterebbe aperto dietro la finestra di
  // selezione file del sistema operativo.
  const [imagePopoverOpen, setImagePopoverOpen] = useState(false);
  const [imageUrlDraft, setImageUrlDraft] = useState('');
  const insertImageFromUrl = () => {
    const url = imageUrlDraft.trim();
    if (!url) return;
    runCommand(() => editor.chain().focus().setImage({ src: url }).run());
    setImageUrlDraft('');
    setImagePopoverOpen(false);
  };

  // Upload immagine da file locale (bucket 'note-images', Supabase Storage) -
  // stesso comando finale di inserimento (setImage) di insertImageFromUrl
  // sopra, cambia solo la provenienza dell'URL. Path ${user.id}/... : stesso
  // schema "cartella = proprio user id" gia' in uso per il bucket 'avatars'
  // (SettingsModal.tsx) - la policy insert del bucket 'note-images' lo
  // richiede.
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      window.alert('Seleziona un file immagine.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      window.alert(`L'immagine non può superare i ${MAX_IMAGE_MB} MB.`);
      event.target.value = '';
      return;
    }
    if (!isSupabaseConfigured || !supabase || !user) {
      window.alert('Caricamento immagine non disponibile: utente non autenticato.');
      event.target.value = '';
      return;
    }
    setIsUploadingImage(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('note-images').upload(path, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('note-images').getPublicUrl(path);
      runCommand(() => editor.chain().focus().setImage({ src: publicUrl }).run());
    } catch (err) {
      console.log('Errore upload immagine nota:', err);
      window.alert('Caricamento immagine non riuscito. Riprova.');
    } finally {
      setIsUploadingImage(false);
      event.target.value = '';
    }
  };

  return (
    <div onMouseDown={(e) => e.preventDefault()} className="tiptap-toolbar flex w-11 shrink-0 flex-col gap-2">
      <ToolbarSection label="Formattazione testo" icon={<PenLine className="h-4 w-4" />} defaultOpen>
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
        <FontSizeSelect editor={editor} editable={editable} onCommand={runCommand} />
        <FontFamilyPicker editor={editor} editable={editable} onCommand={runCommand} />
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
        {/* setTextAlign/isActive({textAlign}): TextAlign (extension registrata
            sotto, types:['paragraph']) - active riflette l'allineamento del
            paragrafo dove si trova il cursore, 'left' e' anche il default
            implicito (nessun attributo scritto finche' non si sceglie
            un'altra opzione, TextAlign lo omette dal JSON quando coincide col
            default - vedi la sua doc). */}
        <ToolbarButton disabled={!editable} label="Allinea a sinistra" active={editor.isActive({ textAlign: 'left' })} onClick={() => runCommand(() => editor.chain().focus().setTextAlign('left').run())}>
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton disabled={!editable} label="Allinea al centro" active={editor.isActive({ textAlign: 'center' })} onClick={() => runCommand(() => editor.chain().focus().setTextAlign('center').run())}>
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton disabled={!editable} label="Allinea a destra" active={editor.isActive({ textAlign: 'right' })} onClick={() => runCommand(() => editor.chain().focus().setTextAlign('right').run())}>
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
      </ToolbarSection>
      {/* Sezione separata da "Formattazione testo": Box di testo e Collapse
          sono nodi a blocco (inseriscono/racchiudono contenuto), non marchi
          inline sul testo selezionato come grassetto/corsivo/sottolineato -
          concettualmente diversi, da cui la sezione dedicata (confermato nel
          piano). Pulsanti "insert", non toggle: nessuno stato attivo/non
          attivo da riflettere (active sempre false). */}
      <ToolbarSection label="Blocchi" icon={<LayoutTemplate className="h-4 w-4" />} defaultOpen>
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
        {/* toggleTaskList/isActive('taskList'): comando esposto da TaskList
            (registrata sopra) - a differenza di Box di testo/Collapse/Linea
            orizzontale questo E' un vero toggle (si attiva/disattiva sulla
            selezione), stesso identico pattern di Elenco puntato/numerato in
            "Formattazione testo" sopra, solo spostato qui perche' la lista
            di attivita' e' concettualmente un blocco (checkbox+testo), non
            un marchio inline. Stile checkbox/testo sbarrato in theme.css
            (.tiptap-content ul[data-type="taskList"]). */}
        <ToolbarButton disabled={!editable} label="Attività" active={editor.isActive('taskList')} onClick={() => runCommand(() => editor.chain().focus().toggleTaskList().run())}>
          <ListTodo className="h-4 w-4" />
        </ToolbarButton>
        {/* insertIcon: comando esposto da InlineIcon (tiptapInlineIcon.ts,
            registrata sotto) - come Box di testo/Collapse/Linea orizzontale
            sopra e' un comando "insert", non un toggle: nessuno stato
            attivo/non attivo da riflettere (vedi commento su IconPicker
            sopra), a differenza di FontFamilyPicker che invece evidenzia
            il font corrente. */}
        <IconPicker editor={editor} editable={editable} onCommand={runCommand} />
        {/* Immagine: un solo pulsante, due modi di inserimento dentro lo
            stesso Popover (Da URL / Da file) - vedi imagePopoverOpen/
            insertImageFromUrl/handleFileSelected sopra.
            TooltipTrigger asChild NON avvolge direttamente PopoverTrigger
            (bug trovato dal vivo: entrambi usano @radix-ui/react-popper
            internamente, e due Popper.Anchor annidati sullo stesso nodo DOM
            lasciano quello piu' interno bloccato sulla posizione segnaposto
            iniziale di Radix - transform:translate(0,-200%), mai
            rimisurata - il tooltip risultava "aperto" ma renderizzato fuori
            viewport, invisibile). Uno <span> intermedio disaccoppia i due
            Popper: il Tooltip si ancora allo span (hover), il Popover
            continua ad ancorarsi al bottone reale dentro (click) -
            indipendenti, nessun conflitto. */}
        <Popover open={imagePopoverOpen} onOpenChange={setImagePopoverOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={!editable}
                    aria-label="Immagine"
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md p-1.5 transition-colors text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)] ${!editable ? 'cursor-not-allowed opacity-40' : ''}`}
                  >
                    <ImageIcon className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">Immagine</TooltipContent>
          </Tooltip>
          {/* onMouseDown/stopPropagation: senza, il mousedown di qualunque
              controllo qui dentro (Input incluso) risalirebbe fino al div
              radice di Toolbar (onMouseDown preventDefault, in cima a questo
              componente) - React fa risalire gli eventi dei Portal lungo
              l'albero dei COMPONENTI, non quello del DOM, quindi il Portal di
              PopoverContent non basta da solo a isolarlo. Stesso identico bug
              gia' documentato sopra per FontSizeSelect (l'Input perderebbe il
              focus-on-click nativo).
              side="top"/collisionPadding: la colonna Toolbar e' stretta (w-11)
              e il pulsante Immagine e' verso il fondo della sezione "Blocchi" -
              side="right" (valore iniziale) veniva sistematicamente ribaltato
              da Radix in "bottom" per mancanza di spazio, aprendo il popover
              fuori dalla viewport verso il basso. align="start" (invece di
              "center", il default) allinea il bordo del popover a quello del
              pulsante invece che al suo centro - piu' prevedibile in una
              colonna cosi' stretta. collisionPadding aggiunge un margine di
              sicurezza dal bordo della viewport, avoidCollisions resta quello
              di default (true) per il ribaltamento automatico nei casi limite
              (es. note aperte molto in alto nella pagina).
              z-[9999] (sovrascrive lo z-50 di default di PopoverContent,
              cn() usa tailwind-merge quindi l'ultima classe vince): bug
              trovato dal vivo 2026-08-20 - la posizione calcolata da Radix
              era gia' corretta (verificato con getBoundingClientRect, side e
              align rispettati), ma il pannello Note che ospita questo editor
              e' un SlideOverPanel con z-[900] (SlideOverPanel.tsx) - il
              Popover, di default a z-50, veniva quindi disegnato SOTTO quel
              pannello e risultava invisibile (elementFromPoint sullo stesso
              punto restituiva il contenuto dell'editor, non il popover).
              z-[9999] e' lo stesso valore gia' usato per lo stesso identico
              motivo dai menu a tendina di NoteListRow.tsx/EntityTabBar.tsx,
              entrambi ospitati nello stesso pannello.
              bg-[var(--dash-panel)]/text-[var(--dash-text-strong)]/
              border-[var(--dash-border-soft)] sovrascrivono le classi di
              default di PopoverContent (bg-popover/text-popover-foreground/
              border, cn() interno usa tailwind-merge quindi vincono queste):
              bug trovato dal vivo 2026-08-20 - --popover/--popover-
              foreground sono legate SOLO a :root (chiaro) e alla classe
              .dark (mai applicata da nessuna parte in questa app - verificato
              document.querySelectorAll('.dark').length === 0), non a
              [data-dashboard-palette] come le variabili --dash-*. Il Portal
              gia' monta correttamente dentro l'elemento con
              [data-dashboard-palette] (usePortalContainer, vedi
              ui/popover.tsx) - --dash-panel infatti risultava gia' risolto
              li' al colore giusto della palette attiva - ma bg-popover
              restava comunque bianco perche' punta a una coppia di variabili
              che questa app non ritinteggia mai per palette. Stesse
              variabili gia' usate per il resto di questo popover
              (dash-muted/dash-surface-2/dash-text-strong sopra) e per
              .tiptap-collapse in theme.css (stesso identico sfondo/testo/
              bordo per un pannello "galleggiante" nel tema). */}
          <PopoverContent side="top" align="start" collisionPadding={8} className="tiptap-image-popover w-64 z-[9999] bg-[var(--dash-panel)] text-[var(--dash-text-strong)] border-[var(--dash-border-soft)]" onMouseDown={(e) => e.stopPropagation()}>
            <Tabs defaultValue="url" className="gap-3">
              {/* bg-[var(--dash-surface)]/border-[var(--dash-border-soft)]
                  sul gruppo, data-[state=active]:bg-[var(--dash-accent)] sul
                  singolo trigger: stesso identico pattern del selettore
                  griglia/lista in EntityFilterToolbar.tsx (li' via stato
                  React esplicito, qui via l'attributo data-state che Radix
                  Tabs mette gia' da solo sul trigger attivo/inattivo -
                  nessuno stato in piu' da tracciare). Sovrascrive i default
                  shadcn di TabsList/TabsTrigger (bg-muted/data-[state=active]
                  :bg-card, non legati alla palette) solo su questa istanza,
                  ui/tabs.tsx resta invariato. */}
              <TabsList className="w-full border border-[var(--dash-border-soft)] bg-[var(--dash-surface)]">
                <TabsTrigger value="url" className="text-[var(--dash-muted)] data-[state=active]:bg-[var(--dash-accent)] data-[state=active]:text-[var(--dash-text-strong)]">Da URL</TabsTrigger>
                <TabsTrigger value="file" className="text-[var(--dash-muted)] data-[state=active]:bg-[var(--dash-accent)] data-[state=active]:text-[var(--dash-text-strong)]">Da file</TabsTrigger>
              </TabsList>
              {/* min-h-[76px] su entrambi i TabsContent (Input h-9=36px +
                  gap-2=8px + Button sm h-8=32px, l'altezza del tab "Da URL"
                  che ha piu' contenuto) cosi' switchare tab non cambia
                  l'altezza del Popover e i pulsanti non si spostano sotto
                  il mouse. */}
              <TabsContent value="url" className="flex flex-col gap-2 min-h-[76px]">
                {/* bg-[var(--dash-input)]/border-[var(--dash-border-soft)]/
                    text-[var(--dash-text)]: stesso pattern gia' usato per
                    l'input di rinomina tab in EntityTabBar.tsx e per la
                    tendina di FontSizeSelect qui sopra - sovrascrivono i
                    default shadcn (bg-input-background/border-input, non
                    legati alla palette) di Input (ui/input.tsx, non
                    modificato: stesso principio del fix precedente su
                    PopoverContent, solo l'istanza qui cambia). */}
                <Input
                  type="url"
                  placeholder="https://…"
                  value={imageUrlDraft}
                  onChange={(e) => setImageUrlDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insertImageFromUrl(); } }}
                  className="border-[var(--dash-border-soft)] bg-[var(--dash-input)] text-[var(--dash-text)] placeholder:text-[var(--dash-muted)]"
                />
                {/* bg-[var(--dash-accent)]/text-[var(--dash-text-strong)]/
                    hover:bg-[var(--dash-accent-2)]: stesso "pulsante pieno"
                    gia' usato per le azioni primarie nel pannello Note (es.
                    EntityFilterToolbar.tsx, EntityPagination.tsx) al posto
                    del bg-primary/text-primary-foreground di default di
                    Button (ui/button.tsx, non modificato). */}
                <Button type="button" size="sm" disabled={!imageUrlDraft.trim()} onClick={insertImageFromUrl} className="bg-[var(--dash-accent)] text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)]">
                  Inserisci
                </Button>
              </TabsContent>
              <TabsContent value="file" className="flex flex-col gap-2 min-h-[76px]">
                <p className="text-xs text-[var(--dash-muted)]">Carica un'immagine dal tuo dispositivo.</p>
                <Button type="button" size="sm" disabled={isUploadingImage} onClick={() => { setImagePopoverOpen(false); fileInputRef.current?.click(); }} className="bg-[var(--dash-accent)] text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)]">
                  {isUploadingImage ? 'Caricamento…' : 'Scegli file'}
                </Button>
              </TabsContent>
            </Tabs>
          </PopoverContent>
        </Popover>
        {/* input[type=file] nascosto FUORI dal PopoverContent (che si
            smonta alla chiusura, portale incluso): il pulsante "Scegli file"
            sopra chiude il popover e SUBITO DOPO chiama fileInputRef.current
            ?.click() - se l'input fosse dentro il popover, a quel punto
            sarebbe gia' stato rimosso dal DOM. */}
        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileSelected} className="hidden" />
      </ToolbarSection>
      {/* Sezioni future (Widget, Oggetti speciali): aggiungere qui altre
          <ToolbarSection label="..." icon={<... />} defaultOpen={false}>...</ToolbarSection>,
          nessuna modifica a ToolbarSection/ToolbarButton necessaria. */}
      {/* Annulla: undo nativo di TipTap History (gia' incluso in StarterKit,
          nessuna estensione nuova) - stesso identico comando gia'
          disponibile da tastiera (Ctrl+Z), qui solo reso cliccabile. FUORI
          da ToolbarSection come Box di testo/Immagine sopra sarebbero
          sbagliati li' (non e' un inserimento di contenuto).
          disabled={!editable} SOLO, non anche editor.can().undo() (bug
          storico legato alle vecchie maniglie di drag, non piu' rilevante
          ma il criterio resta lo stesso: editor.can().undo() rivalutato ad
          OGNI render di Toolbar era comunque uno spreco). undo() stesso e'
          innocuo quando non c'e' nulla da annullare (verificato in
          prosemirror-history: nessun dispatch, nessuna eccezione) - la
          guardia dentro l'onClick sotto evita solo la focus() sprecata in
          quel caso, non serve per sicurezza. */}
      <ToolbarButton disabled={!editable} label="Annulla" active={false} onClick={() => runCommand(() => {
        if (!editor.can().undo()) return;
        editor.chain().focus().undo().run();
      })}>
        <Undo2 className="h-4 w-4" />
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
  // content: SOLO per la creazione iniziale (confermato nel sorgente di
  // @tiptap/core: letto una volta in createDoc(), mai riapplicato da
  // useEditor dopo il mount) - va congelato con useState lazy invece di
  // passare `richContent` diretto, che cambia riferimento ad ogni tasto e
  // farebbe risultare le options "diverse" ad ogni render (vedi
  // TIPTAP_EDITOR_PROPS sopra, stessa causa). La sincronizzazione REALE dei
  // cambi successivi resta interamente affidata all'effect con setContent
  // piu' sotto. migrateHeadingsToFontSize qui (e nell'effect sotto): una nota
  // gia' salvata PRIMA della rimozione del nodo "heading" dallo schema
  // avrebbe un content_rich con nodi che lo schema non riconosce piu' -
  // createNodeFromContent (@tiptap/core) cattura quell'errore in silenzio e
  // sostituisce l'INTERO documento con uno vuoto, non solo il nodo
  // incriminato (verificato nel sorgente): senza questa conversione qui,
  // aprire una vecchia nota con un titolo la svuoterebbe silenziosamente.
  const [initialContent] = useState(() => flattenRemovedLayoutNodes(migrateHeadingsToFontSize(richContent)));

  // Contiene sia la Toolbar sia la colonna di testo (vedi il return sotto) -
  // usato SOLO dall'onBlur qui sotto per distinguere un blur genuino (click
  // fuori dall'editor, Tab) da uno causato dallo spostamento del focus su un
  // controllo nativo DENTRO la toolbar stessa (bug 2026-07-31: la tendina
  // FontSizeSelect - e prima di lei HeadingSelect, stesso sintomo mai
  // risolto davvero - non si apriva al click). Un <select> nativo, a
  // differenza di un <button>, DEVE prendere il focus DOM per aprire la sua
  // lista a discesa (e' il default action nativo del mousedown sul select,
  // non solo "prendere il focus" - preventDefault sul mousedown, come faceva
  // gia' l'intero contenitore Toolbar qui sotto per i pulsanti, sopprime
  // ANCHE quello, non solo lo spostamento del focus - da cui il fix parallelo
  // in FontSizeSelect, stopPropagation sul proprio mousedown per non farsi
  // fermare da quel preventDefault dell'antenato).
  const toolbarWrapRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    // heading:false - il vecchio Node a blocco H1-H4 e' sostituito dal Mark
    // inline FontSize (tiptapFontSize.ts, applicabile a una selezione
    // parziale invece che a tutta la riga - cambio di scope confermato).
    // TextAlign scoped a 'paragraph' - unico tipo di blocco testuale diretto
    // nello schema oltre a bulletList/orderedList/blockquote (che restano
    // sempre allineati a sinistra, nessuna richiesta di estenderlo li').
    extensions: [
      StarterKit.configure({ heading: false }),
      FontSize,
      FontFamily,
      TextAlign.configure({ types: ['paragraph'] }),
      Image,
      // TaskList/TaskItem (pacchetti ufficiali, non un Node custom come
      // FontSize/FontFamily sopra): a differenza di @tiptap/extension-font-
      // family, la loro unica dipendenza (@tiptap/extension-list) e' gia'
      // presente in node_modules ALLA STESSA versione esatta (3.29.1),
      // portata in dotazione da StarterKit stesso (bulletList/orderedList
      // gia' in uso sotto sono implementati li') - installarli non aggiunge
      // un nuovo albero di dipendenze, solo due export in piu' sulla stessa
      // libreria gia' presente (verificato con npm view/npm pack prima di
      // installare). nested:false (il default, esplicito qui solo per
      // chiarezza): nessuna sotto-attivita' richiesta, task piatte come le
      // altre liste della toolbar.
      TaskList,
      TaskItem.configure({ nested: false }),
      InlineIcon,
      ...TIPTAP_BLOCK_EXTENSIONS,
    ],
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
    // per i pulsanti la barra ferma gia' il mousedown (preventDefault),
    // quindi cliccarne uno non fa mai perdere il focus all'editor - ma un
    // <select> nativo (FontSizeSelect) il focus lo deve prendere per forza
    // (altrimenti la sua lista a discesa non si apre affatto, vedi
    // toolbarWrapRef sopra), quindi QUI serve distinguere: event.relatedTarget
    // e' l'elemento che sta per ricevere il focus (disponibile sull'evento
    // nativo "blur", non simulato da React) - se e' dentro la toolbar
    // (es. la select stessa) non e' un vero abbandono dell'editor, si resta
    // in modifica; altrimenti (click fuori, Tab) e' un blur genuino, si
    // torna alla vista di sola lettura come prima.
    //
    // closest('[data-slot="popover-content"]') in piu' (bug trovato dal vivo
    // 2026-08-20, popover "Immagine"): toolbarWrapRef.contains() da solo non
    // basta per il contenuto del Popover (Input/Tabs/Button dentro il tab "Da
    // URL"/"Da file") - Radix lo monta in un Portal fuori dal DOM di
    // toolbarWrapRef, quindi anche se e' visivamente/logicamente "dentro" la
    // toolbar, .contains() lo vede come esterno e onBlurEditor scattava
    // (uscita indesiderata dalla modalita' modifica) al primo click dentro
    // l'Input. data-slot="popover-content" e' l'attributo che
    // PopoverContent (ui/popover.tsx) mette gia' di suo su ogni istanza,
    // nessun marcatore nuovo da aggiungere.
    onBlur: ({ event }) => {
      const related = event.relatedTarget as Node | null;
      if (toolbarWrapRef.current?.contains(related)) return;
      if (related instanceof Element && related.closest('[data-slot="popover-content"]')) return;
      onBlurEditor?.();
    },
  });
  // Nessun onTransaction manuale per aggiornare lo stato "active" della
  // barra: useEditor si iscrive gia' da solo alle transazioni e
  // ri-renderizza il componente (shouldRerenderOnTransaction e' attivo di
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

    // migrateHeadingsToFontSize PRIMA di ogni confronto/uso, non solo prima
    // di setContent: editor.getJSON() qui sotto non conterra' MAI un nodo
    // "heading" (rimosso dallo schema), quindi confrontare il richContent
    // grezzo di una nota vecchia (ancora con "heading" salvato) contro
    // editor.getJSON() risulterebbe sempre "diverso" anche a contenuto
    // gia' migrato in memoria, forzando un setContent superfluo (e la
    // perdita di selezione che questo effect esiste apposta per evitare) ad
    // ogni giro. Stesso motivo del rischio spiegato sopra per initialContent.
    const migratedRichContent = flattenRemovedLayoutNodes(migrateHeadingsToFontSize(richContent));

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
    if (docsEqual(migratedRichContent, editor.getJSON())) return;

    // Guardia difensiva: un documento esterno vuoto non deve MAI sovrascrivere
    // un documento locale con contenuto reale, qualunque sia la causa a monte
    // (broadcast con payload incompleto, eco malformata, futuri bug non
    // ancora scoperti). Un documento esterno genuinamente vuoto resta un
    // caso legittimo (nota appena creata da un altro client), ma SOLO se
    // anche il documento locale attuale e' vuoto.
    if (isDocEmpty(migratedRichContent) && !isDocEmpty(editor.getJSON())) return;

    // Documento esterno realmente diverso (un altro client/utente ha
    // modificato la stessa nota) - preserva la selezione attraverso
    // setContent(): setTextSelection clampa gia' da solo entro i limiti del
    // nuovo documento (vedi sorgente @tiptap/core), quindi e' sicuro
    // riapplicare la stessa posizione anche se il nuovo testo e' piu' corto.
    const { from, to } = editor.state.selection;
    editor.commands.setContent(migratedRichContent, { emitUpdate: false });
    editor.commands.setTextSelection({ from, to });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [richContent]);

  if (!editor) return null;

  return (
    <div ref={toolbarWrapRef} className="flex items-start gap-2">
      <Toolbar editor={editor} editable={editable} />
      <div
        onClick={!editable ? onClickText : undefined}
        // overflow-x-auto/max-w-full: un'immagine (o qualunque contenuto)
        // piu' larga della colonna scorre invece di far crescere l'intero
        // contenitore/pagina.
        className={`min-w-0 flex-1 max-w-full overflow-x-auto ${!editable && onClickText ? 'cursor-text' : ''} ${containerClassName}`}
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
