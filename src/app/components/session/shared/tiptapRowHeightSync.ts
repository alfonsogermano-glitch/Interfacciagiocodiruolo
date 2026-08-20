import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

// Bug riaperto dal vivo 2026-08-20 (dopo il fix orizzontale d52f3af): in una
// row[paragrafo multi-riga, TextBox], quando il paragrafo e' piu' alto della
// TextBox (testo mandato a capo), lo spazio SOTTO la TextBox ma ancora
// dentro la row (l'altezza della row e' quella del fratello piu' alto,
// align-items:flex-start in .tiptap-row-flex, theme.css) non appartiene al
// box di NESSUNO dei due fratelli: ne' p:hover ne' .tiptap-textbox:hover vi
// scattano, quindi la guardia sulla maniglia della row (riga ~929 di
// theme.css, `:not(:has(..., p:hover))`) non si disattiva e la maniglia
// resta visibile per errore.
//
// Perche' JS e non CSS puro (valutato e scartato, vedi discussione): con
// align-items:flex-start un pseudo-elemento (::after) non puo' conoscere
// l'altezza di un fratello flex senza saperla numericamente - nessun
// selettore/valore CSS la espone. L'unico meccanismo NATIVO che fa
// combaciare automaticamente le altezze e' align-items:stretch, ma quello
// stira anche il box VISIBILE (bordo/sfondo), non solo l'area di hover -
// gia' scartato in passato per un problema simile (vedi commento riga
// 850-854 di theme.css, "gutter eccessivo per Collapse"). Una vera row che
// resta invariata nell'aspetto richiede quindi di conoscere l'altezza
// reale della row via JS e passarla alla CSS - stesso principio gia' usato
// da tiptapTextBoxEdgeCursor.ts (misura dal vivo con getBoundingClientRect
// e scrive il risultato come stile).
//
// Soluzione: --tiptap-row-height (CSS custom property, scritta qui su ogni
// .tiptap-row-flex) espone l'altezza reale della row; in theme.css un
// ::after invisibile su ciascun rowItem estende la propria area di hover
// fino al fondo della row con `height: max(0px, calc(var(--tiptap-row-
// height) - 100%))` - il "100%" dentro quel calc() si risolve contro
// l'altezza del rowItem stesso (contenitore posizionante del proprio
// ::after), quindi il risultato e' esattamente il gap, qualunque esso sia,
// senza calcoli manuali per caso specifico. Estendere l'AREA DI HOVER del
// rowItem stesso (non un elemento a parte) significa che hoverare
// l'estensione fa scattare :hover sul rowItem originale per specifica CSS
// (::after conta come discendente ai fini di :hover) - la guardia
// esistente su .tiptap-row (":has(..., p:hover)" ecc.) lo riconosce gia'
// senza bisogno di modifiche.
//
// ResizeObserver (non un listener su 'update' del plugin, ne' su window
// resize): copre GIA' da solo ogni causa di cambio altezza della row
// (testo che va a capo/torna su una riga, cambio font-size, resize
// manuale del confine fra rowItem - tiptapRowResize.ts - o della finestra)
// senza bisogno di enumerare i casi. sync() (chiamata da view() all'avvio
// e da ogni update() del plugin) tiene la LISTA di elementi osservati
// allineata al DOM corrente - una row puo' comparire/sparire in qualunque
// transazione (nuova row creata, row sciolta da RowCollapseCleanup, ecc.),
// e ResizeObserver non segue da solo l'aggiunta/rimozione di elementi.
// entry.contentRect.height (non offsetHeight): .tiptap-row-flex non ha mai
// padding/border proprio (theme.css, solo display/flex-wrap/align-items/
// column-gap/width/position), quindi content-box e border-box coincidono -
// contentRect e' comunque il valore corretto per definizione anche se in
// futuro venisse aggiunto un padding.
export const RowHeightSync = Extension.create({
  name: 'rowHeightSync',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        view(view) {
          const observed = new Set<HTMLElement>();
          const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
              const el = entry.target as HTMLElement;
              el.style.setProperty('--tiptap-row-height', `${entry.contentRect.height}px`);
            }
          });

          const sync = () => {
            const current = view.dom.querySelectorAll<HTMLElement>('.tiptap-row-flex');
            const currentSet = new Set(current);
            for (const el of observed) {
              if (!currentSet.has(el)) {
                ro.unobserve(el);
                observed.delete(el);
              }
            }
            for (const el of currentSet) {
              if (!observed.has(el)) {
                ro.observe(el);
                observed.add(el);
              }
            }
          };

          sync();

          return {
            update() {
              sync();
            },
            destroy() {
              ro.disconnect();
              observed.clear();
            },
          };
        },
      }),
    ];
  },
});
