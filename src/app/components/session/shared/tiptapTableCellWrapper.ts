import { mergeAttributes } from '@tiptap/core';
import { TableCell, TableHeader } from '@tiptap/extension-table';

// display:flex sulla cella stessa (td/th) rompe l'algoritmo di layout della
// tabella (bug segnalato 2026-08-01, vedi theme.css): il browser decide se
// un elemento partecipa al calcolo delle colonne (table-layout:fixed +
// colgroup, costruito con cura per il ridimensionamento colonne) in base al
// suo essere display:table-cell - cambiarlo a flex lo fa uscire da quel
// calcolo, facendo sparire ogni colonna tranne la prima. td/th restano
// quindi table-cell (default nativo, invariati) - il flex-wrap per
// affiancare TextBox/Collapse (rifinitura precedente) vive in un div
// aggiunto QUI dentro la cella (.tiptap-td-flex, stile in theme.css), non
// sulla cella stessa.
//
// contentElement in forma FUNZIONE (supportata da prosemirror-model, non
// solo selettore stringa): cerca .tiptap-td-flex solo se presente (HTML
// prodotto da questo stesso editor - round-trip interno), altrimenti usa la
// cella stessa come sorgente del contenuto. Senza questo fallback, incollare
// una tabella da fuori (Word/Google Docs/un'altra pagina), che non ha mai
// visto questo wrapper, non troverebbe .tiptap-td-flex e perderebbe il
// contenuto della cella.
//
// parseHTML delega a this.parent?.() invece di reimplementare le regole
// originali: la prima regola (celle vuote, "backfill") usa helper interni
// al pacchetto @tiptap/extension-table (isEmptyCellElement/
// fillEmptyCellContent) non esportati pubblicamente - richiamare il parent
// preserva quel comportamento intatto invariato; tocchiamo solo la SECONDA
// regola (celle con contenuto reale, senza getContent) aggiungendo il
// fallback sopra.
function withFlexWrapperContentElement(rules: unknown): unknown {
  if (!Array.isArray(rules)) return rules;
  return rules.map((rule) => {
    if (rule && typeof rule === 'object' && !('getContent' in rule)) {
      return {
        ...rule,
        contentElement: (dom: HTMLElement) => dom.querySelector<HTMLElement>('.tiptap-td-flex') ?? dom,
      };
    }
    return rule;
  });
}

export const TableCellWithFlexWrapper = TableCell.extend({
  parseHTML() {
    return withFlexWrapperContentElement(this.parent?.());
  },
  renderHTML({ HTMLAttributes }) {
    return ['td', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), ['div', { class: 'tiptap-td-flex' }, 0]];
  },
});

export const TableHeaderWithFlexWrapper = TableHeader.extend({
  parseHTML() {
    return withFlexWrapperContentElement(this.parent?.());
  },
  renderHTML({ HTMLAttributes }) {
    return ['th', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), ['div', { class: 'tiptap-td-flex' }, 0]];
  },
});
