import { Node } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { ICON_DATA, DEFAULT_ICON_NAME } from './tiptapIconData';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineIcon: {
      /** Inserisce l'icona (per nome, es. "Sword") alla posizione del cursore - un nome non presente in ICON_DATA ricade su DEFAULT_ICON_NAME in renderHTML (vedi sotto), non qui: l'attributo salvato resta quello richiesto, la normalizzazione avviene solo in fase di rendering. */
      insertIcon: (name: string) => ReturnType;
    };
  }
}

// Nodo atom (icona = elemento singolo, non testo modificabile) - Node.create
// come TextBox/CollapseBlock in tiptapBlocks.tsx, non Mark.create come
// FontSize/FontFamily (quelli decorano testo GIA' esistente, questo
// inserisce un elemento nuovo). group:'inline'/inline:true: valido ovunque
// il testo normale lo sia (dentro un paragrafo in mezzo ad altre parole),
// niente content proprio da tracciare in tiptapLegacyMigration.ts - quel
// modulo traccia solo tipi di nodo a livello BLOCCO (DOC_LEVEL_TYPES/
// SIMPLE_BLOCK_TYPES), mai il contenuto inline di un paragrafo (dove
// vivono i nodi 'text' e i mark, mai validati da un elenco simile) -
// verificato leggendo tiptapLegacyMigration.ts prima di scrivere questo
// file: 'inlineIcon' e' automaticamente valido ovunque 'inline*' lo sia
// gia' (paragraph, collapseSummary), nessuna modifica li' necessaria.
// selectable:true (esplicito, gia' il default per un atom, per chiarezza):
// click-to-select/Backspace-elimina-nodo gestiti nativamente da
// ProseMirror, nessun codice in piu' qui.
// Nessun addNodeView/ReactNodeViewRenderer: renderHTML puro (sotto) basta,
// stesso identico principio di TextBox - l'icona e' statica (nessuna
// interazione oltre selezionare/eliminare l'intero nodo), non serve una
// NodeView React solo per disegnare un <svg>.
export const InlineIcon = Node.create({
  name: 'inlineIcon',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      name: {
        default: DEFAULT_ICON_NAME,
        parseHTML: (element) => element.getAttribute('data-icon-name'),
        renderHTML: (attributes) => ({ 'data-icon-name': attributes.name }),
      },
    };
  },

  // Il contenuto della nota fa SEMPRE il giro tramite
  // editor.commands.setContent(JSON) (mai da una stringa HTML - verificato
  // piu' volte in questa sessione per FontFamily/TaskList), quindi
  // parseHTML qui serve solo per il caso limite di un incolla da HTML
  // esterno (o un futuro import) - riconosce l'attributo scritto sotto da
  // renderHTML.
  parseHTML() {
    return [{ tag: 'svg[data-icon-name]' }];
  },

  // Namespace SVG: un tag DOMOutputSpec puo' portare un prefisso XML
  // separato da uno spazio (es. "http://www.w3.org/2000/svg svg") -
  // ProseMirror lo riconosce (renderSpec, node_modules/prosemirror-model)
  // e usa createElementNS per quell'elemento E per tutti i suoi figli
  // ricorsivamente (lo stesso xmlNS si propaga giu' da solo, non va
  // ripetuto su ogni "path"/"line"/ecc. sotto) - verificato leggendo la
  // sorgente prima di scrivere questo file, e' il meccanismo standard di
  // ProseMirror per SVG dentro DOMOutputSpec, non un trucco specifico di
  // questo progetto.
  // width/height:1em (non un px fisso): eredita il font-size dal contesto
  // CSS in cui l'icona si trova - se il testo circostante ha un mark
  // FontSize (tiptapFontSize.ts) l'icona scala insieme, nessun calcolo
  // manuale necessario, esattamente il requisito "scala con la dimensione
  // del font".
  // vertical-align:-0.125em: un <svg> inline di default si allinea alla
  // baseline del testo (il suo BORDO INFERIORE tocca la baseline) e sembra
  // "appeso" troppo in basso rispetto alle lettere circostanti - stesso
  // aggiustamento ottico standard usato da altre librerie di icone
  // testuali (Bootstrap Icons, Heroicons in modalita' inline).
  // ICON_DATA[name] ?? ICON_DATA[DEFAULT_ICON_NAME]: la normalizzazione va
  // QUI (in renderHTML), non solo in parseHTML - stesso bug reale gia'
  // trovato e corretto per FontFamily in questa sessione:
  // setContent(json) non passa MAI da parseHTML, un name non riconosciuto
  // (salvato da una versione futura/diversa dell'app) arriverebbe intatto
  // fino allo schermo bypassando del tutto il fallback se la validazione
  // stesse solo li'.
  renderHTML({ node }) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const iconName = node.attrs.name as string;
    const primitives = ICON_DATA[iconName] ?? ICON_DATA[DEFAULT_ICON_NAME];
    return [
      `${svgNS} svg`,
      {
        viewBox: '0 0 24 24',
        width: '1em',
        height: '1em',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        style: 'display:inline-block;vertical-align:-0.125em',
        'data-icon-name': iconName,
      },
      ...primitives.map(([tag, attrs]) => [`${svgNS} ${tag}`, attrs] as const),
    ];
  },

  addCommands() {
    return {
      insertIcon:
        (name: string) =>
        ({ chain }) =>
          chain().focus().insertContent({ type: this.name, attrs: { name } }).run(),
    };
  },

  // Frecce attorno al nodo (bug segnalato dal vivo, tre casi):
  // 1) cursore di testo (TextSelection) subito PRIMA/DOPO l'icona - il
  //    comportamento di default di ProseMirror per un atom trasforma la
  //    PRIMA pressione di freccia in una NodeSelection sull'icona invece
  //    di spostare il cursore oltre.
  // 2) quella NodeSelection, se gia' presente (es. dopo un click - vedi
  //    test "ancora selezionabile con NodeSelection" nel piano approvato),
  //    andrebbe comunque superata dalla freccia successiva.
  // 3) caso limite verificato dal vivo: con l'icona come PRIMO figlio del
  //    paragrafo, ArrowLeft non forma nemmeno una NodeSelection (a
  //    differenza del caso 1 a meta' testo) - ProseMirror la tratta come
  //    "nessuna posizione valida a sinistra" e non fa nulla, cursore
  //    bloccato dopo l'icona senza alcun modo di arrivare prima di essa.
  // Un solo handler copre tutti e tre i casi (senza mai passare da una
  // NodeSelection intermedia quando parte da un semplice cursore di testo,
  // il caso 3 sopra: bypassarla e' proprio cio' che la evita) invece di
  // reagire soltanto a una NodeSelection gia' esistente (coprirebbe solo
  // il caso 2, non 1 ne' 3). Il click continua a formare una NodeSelection
  // regolarmente (Canc/digitazione sopra la selezione la sostituiscono
  // gia' nativamente, comportamento voluto, non toccato qui) - solo le
  // frecce la scavalcano sempre, non la creano mai da sole.
  addKeyboardShortcuts() {
    const moveCursorAroundIcon = (direction: 'left' | 'right') => () => {
      const { editor } = this;
      const { selection } = editor.state;

      // Caso 2: la selezione e' gia' una NodeSelection su questa icona
      // (es. dopo un click) - la freccia la supera. selection.to/from di
      // una NodeSelection sono gia' rispettivamente pos+nodeSize e pos del
      // nodo selezionato, non serve ricalcolarli a mano.
      if (selection instanceof NodeSelection && selection.node.type.name === this.name) {
        return editor.commands.setTextSelection(direction === 'right' ? selection.to : selection.from);
      }

      // Casi 1 e 3: cursore di testo semplice adiacente all'icona nella
      // direzione di marcia - la supera direttamente. $from.nodeBefore/
      // nodeAfter (non doc.nodeAt) restano validi anche a inizio/fine
      // paragrafo, dove non c'e' nulla oltre l'icona in quella direzione.
      if (!selection.empty) return false;
      const { $from } = selection;
      const adjacentNode = direction === 'right' ? $from.nodeAfter : $from.nodeBefore;
      if (!adjacentNode || adjacentNode.type.name !== this.name) return false;
      const targetPos = direction === 'right' ? $from.pos + adjacentNode.nodeSize : $from.pos - adjacentNode.nodeSize;
      return editor.commands.setTextSelection(targetPos);
    };
    return {
      ArrowRight: moveCursorAroundIcon('right'),
      ArrowLeft: moveCursorAroundIcon('left'),
    };
  },
});
