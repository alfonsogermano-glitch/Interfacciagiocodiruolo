import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { ICON_DATA, DEFAULT_ICON_NAME } from './tiptapIconData';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineIcon: {
      /** Inserisce l'icona (per nome, es. "Sword") alla posizione del cursore - un nome non presente in ICON_DATA ricade su DEFAULT_ICON_NAME in fase di disegno (vedi buildIconSvg sotto), non qui: l'attributo salvato resta quello richiesto, la normalizzazione avviene solo quando si costruisce l'SVG. */
      insertIcon: (name: string) => ReturnType;
    };
  }
}

// Riprogettazione completa (sostituisce l'approccio precedente basato su un
// Node atom + contenteditable=false + handleKeyDown/filterTransaction, vedi
// git blame per la storia dei tentativi): tutti quei fix rincorrevano i
// sintomi (il cursore che "rimbalza" attorno a un elemento non-testuale nel
// DOM) invece di eliminarne la causa. Qui l'icona non e' affatto un elemento
// non-testuale: e' un singolo carattere ZWSP (U+200B) vero, dentro il testo
// normale del paragrafo, con un Mark che porta il nome dell'icona come
// attributo. Per ProseMirror/il browser e' un carattere come un altro -
// frecce, Backspace, Delete, selezione lo trattano nativamente senza alcun
// codice custom di navigazione. Il disegno dell'SVG e' un layer puramente
// visivo separato (Decoration.widget, sotto), che non introduce alcuna
// posizione di documento ne' alcun nodo DOM editabile. ProseMirror imposta
// contenteditable="false" sul DOM del widget; sotto usiamo pero uno span HTML
// come involucro dell'SVG, cosi Chromium conserva anche la geometria visiva
// della posizione del caret precedente quando l'icona apre una riga.
const ZWSP = '​';
const SVG_NS = 'http://www.w3.org/2000/svg';

// Costruisce l'SVG a runtime (DOM puro, niente JSX/React - il widget di una
// Decoration e' un nodo DOM o una funzione che lo produce, non un componente)
// - stessi attributi/stile gia' usati dal precedente renderHTML: width/
// height 1em per scalare col font-size ereditato dal contesto (compreso un
// eventuale mark fontSize sul testo circostante), vertical-align -0.125em
// per l'allineamento ottico standard di un'icona inline.
function buildIconSvg(iconName: string): SVGSVGElement {
  const primitives = ICON_DATA[iconName] ?? ICON_DATA[DEFAULT_ICON_NAME];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '1em');
  svg.setAttribute('height', '1em');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.style.display = 'block';
  svg.style.pointerEvents = 'none';
  svg.setAttribute('data-icon-name', iconName);
  for (const [tag, attrs] of primitives) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    svg.appendChild(el);
  }
  return svg;
}

// Wrapper HTML intenzionale: Checkbox e Radio usano un elemento inline HTML
// davanti al loro carattere ZWSP e il browser riesce a mostrare correttamente
// anche la posizione del caret precedente quando il controllo apre la riga.
// Un SVG usato direttamente come Decoration.widget non espone la stessa
// geometria del caret nei browser Chromium. Manteniamo quindi l'SVG puramente
// grafico dentro uno span 1em, senza introdurre nuove posizioni nel documento.
function buildIconWidget(iconName: string): HTMLSpanElement {
  const widget = document.createElement('span');
  widget.className = 'tiptap-inline-icon-widget';
  widget.style.display = 'inline-block';
  widget.style.width = '1em';
  widget.style.height = '1em';
  widget.style.verticalAlign = '-0.125em';
  widget.style.userSelect = 'text';
  widget.appendChild(buildIconSvg(iconName));
  return widget;
}

export const InlineIcon = Mark.create({
  name: 'inlineIcon',
  // inclusive:false (il default sarebbe true): senza questo, digitare subito
  // dopo un'icona "eredita" il mark sul nuovo testo (stessa meccanica di
  // grassetto/corsivo a fine selezione) - qui non ha senso, il testo digitato
  // dopo un'icona non deve portare data-icon-name ne' apparire come icona.
  inclusive: false,

  addAttributes() {
    return {
      name: {
        default: DEFAULT_ICON_NAME,
        parseHTML: (element) => element.getAttribute('data-icon-name'),
        renderHTML: (attributes) => ({ 'data-icon-name': attributes.name }),
      },
    };
  },

  // Caso limite di un incolla da HTML esterno/futuro import - il contenuto
  // della nota fa sempre il giro tramite editor.commands.setContent(JSON),
  // mai da stringa HTML (stesso principio gia' verificato per FontFamily/
  // FontSize in questa sessione).
  parseHTML() {
    return [{ tag: 'span[data-icon-name]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      insertIcon:
        (name: string) =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({ type: 'text', text: ZWSP, marks: [{ type: this.name, attrs: { name } }] })
            .run(),
    };
  },

  // Un solo plugin, un solo scopo: disegnare l'SVG sopra ogni carattere ZWSP
  // marcato. Nessuna gestione di stato/selezione/tasti qui (NON
  // reintrodurre filterTransaction/appendTransaction/handleKeyDown per le
  // icone - il problema che risolvevano non esiste piu' con questa
  // architettura, vedi commento in cima al file).
  //
  // decorations(state) ricalcola l'intero DecorationSet ad ogni cambio di
  // stato scansionando il documento, invece di mappare in modo incrementale
  // un set precedente - piu' semplice e senza rischio di decorazioni
  // disallineate, costo accettabile per il volume di testo di una nota.
  //
  // Loop su ogni offset del text node (non un widget per nodo): due icone
  // identiche consecutive hanno lo stesso identico mark (stesso tipo+attrs),
  // quindi ProseMirror le fonde in un UNICO text node "​​" - un
  // solo giro di descendants() su quel nodo deve comunque produrre DUE
  // widget (uno per carattere), altrimenti la seconda icona sparirebbe
  // visivamente pur essendo presente nel documento.
  addProseMirrorPlugins() {
    const markName = this.name;

    // Unico ritocco di selezione dell'intera architettura, e solo per il
    // caso d'angolo residue del browser: quando l'icona e' l'ULTIMO
    // carattere del blocco, un click a destra dell'icona viene mappato da
    // Chromium tra lo span del widget e il carattere ZWSP a larghezza zero;
    // ProseMirror risolve quel punto DOM come posizione PRIMA del widget
    // (sinistra dell'icona) mentre le frecce raggiungono correttamente P+1.
    // Si interviene sul mousedown e non sul click: lasciando fare il giro
    // normale il caret farebbe "destra (nativo) -> sinistra (mapping PM) ->
    // destra (nostro aggiustamento)" con un flicker visibile. Qui il
    // mousedown viene intercettato PRIMA che il browser piazzi il caret
    // nativo, il default viene evitato e si dispatcha direttamente P+1.
    // handleClick resta come rete di sicurezza per i percorsi che non
    // passano dal nostro mousedown (es. click a selezione gia' presente,
    // touch): stessi controlli, stesso risultato, e senza doppio dispatch
    // quando la selezione e' gia' al posto giusto. Le guardie sono
    // volutamente strette: solo click sinistro, solo su un'icona, solo se
    // e' l'ultimo carattere del paragrafo e solo se il punto del click e'
    // davvero a destra dell'icona. Rischia di bloccare solo il drag di
    // selezione che parte da quel punto minuscolo dopo l'icona di fine riga
    // - contestualmente al rimbalzo, il comportamento meno rilevante.
    const nudgeToRightOfTrailingIcon = (view: EditorView, pos: number, event: MouseEvent): boolean => {
      if (event.defaultPrevented || !view.editable) return false;
      if (event.button !== 0) return false;
      if (!view.state.selection.empty) return false;
      if (!(event.target instanceof Element)) return false;
      if (event.target.closest('.tiptap-inline-icon-widget')) return false;
      const markType = view.state.schema.marks.inlineIcon;
      if (!markType || view.state.doc.textBetween(pos, pos + 1) !== ZWSP) return false;
      let hasIconMark = false;
      view.state.doc.nodesBetween(pos, pos + 1, (node) => {
        if (node.isText && node.text === ZWSP) hasIconMark = node.marks.some((mark) => mark.type === markType);
      });
      if (!hasIconMark) return false;
      const $pos = view.state.doc.resolve(pos);
      if (!$pos.parent.isTextblock) return false;
      if ($pos.parentOffset + 1 !== $pos.parent.content.size) return false;
      if (event.clientX < view.coordsAtPos(pos + 1).left) return false;
      if (view.state.selection.from === pos + 1) return true;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1)));
      return true;
    };

    return [
      new Plugin({
        key: new PluginKey('inlineIconWidget'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText) return;
              const mark = node.marks.find((m) => m.type.name === markName);
              if (!mark) return;
              const iconName = mark.attrs.name as string;
              for (let offset = 0; offset < node.nodeSize; offset++) {
                decorations.push(Decoration.widget(pos + offset, () => buildIconWidget(iconName), {
                  side: 0,
                  key: `icon:${pos + offset}:${iconName}`,
                }));
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
          // handleDOMEvents.mousedown educa il caret PRIMA del rendering
          // nativo (vedi commento sopra il helper nudgeToRightOfTrailingIcon)
          // e handleClick e' solo la rete di sicurezza per i percorsi che non
          // passano dal nostro mousedown.
          handleDOMEvents: {
            mousedown(view, event) {
              if (!view.editable || event.button !== 0) return false;
              if (!(event.target instanceof Element)) return false;
              if (event.target.closest('.tiptap-inline-icon-widget')) return false;
              const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (!coords) return false;
              if (nudgeToRightOfTrailingIcon(view, coords.pos, event)) {
                event.preventDefault();
                view.focus();
                return true;
              }
              return false;
            },
          },
          handleClick(view, pos, event) {
            return nudgeToRightOfTrailingIcon(view, pos, event);
          },
        },
      }),
    ];
  },
});
