import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [node, view, commands, editor, policy, blocks, migration] = await Promise.all([
  readFile(new URL('../src/app/components/session/shared/tiptapArchivio.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/ArchivioView.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/noteEditorCommands.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/RichTextEditor.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/noteContainerPolicy.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/tiptapBlocks.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/tiptapLegacyMigration.ts', import.meta.url), 'utf8'),
]);

// Nodo blocco atomico con titolo, colonne e righe persistiti come JSON.
assert.match(node, /name:\s*'archivio'/, 'archivio must define a Node with name "archivio"');
assert.match(node, /atom:\s*true/, 'archivio must be an atom block without ProseMirror content');
assert.match(node, /title:[\s\S]*titleVisible:[\s\S]*columns:[\s\S]*rows:/, 'archivio must persist title, title visibility, columns and rows');
assert.match(node, /div\[data-type="archivio"\]/, 'archivio must parse and render a data-type archivio marker');
assert.match(node, /insertArchivio/, 'archivio must expose an insertArchivio command');

// Colonne predefinite a quattro e riga di esempio del nuovo archivio:
// Nome=Arco Lungo, Tipo=Distanza, Raggio d'azione=15/30/45, Danno=Dado 1d6.
assert.match(
  node,
  /label:\s*'Nome'[\s\S]*label:\s*'Tipo'[\s\S]*label:\s*['"]Raggio d'azione['"][\s\S]*label:\s*'Danno'/,
  "new archivi must start with Nome, Tipo, Raggio d'azione and Danno columns",
);
assert.match(
  node,
  /'Nome':\s*'Arco Lungo'[\s\S]*'Tipo':\s*'Distanza'[\s\S]*['"]Raggio d'azione['"]:\s*'15\/30\/45'[\s\S]*defaultArchivioCell\('dice'\)/,
  'the starter row must ship Arco Lungo, Distanza, 15/30/45 and a dice cell',
);
assert.match(node, /rows:\s*\[createArchivioStarterRow\(columns\)\]/, 'insertArchivio must seed an array with the starter row (rows is an ArchivioRow[])');

// Selezione post-insert: su una nota vuota (o la cui unica riga di testo e'
// il paragrafo di coda) il caso speciale di insertContentAt di Tiptap fa
// from -= 1 / to += 1 e il replace copre l'intero documento; dopo l'insert
// non resta alcun blocco di testo e TextSelection.near() cade su
// AllSelection (prosemirror-state: `|| new AllSelection($pos.node(0))`).
// ProseMirror seleziona tutto e Chrome dipinge di blu ogni archivio della
// nota: il primo che si crea su nota vuota, oppure tutti quelli presenti
// quando si crea il secondo. Il comando deve rilevare il fallback e
// agganciare il cursore a un paragrafo di coda.
assert.match(node, /import \{[^}]*AllSelection[^}]*\} from '@tiptap\/pm\/state'/, 'insertArchivio must import AllSelection to detect the select-all fallback');
assert.match(node, /tr\.selection instanceof AllSelection/, 'insertArchivio must detect when the insert left an AllSelection (whole document selected)');
assert.match(node, /tr\.setSelection\(TextSelection\.create\(tr\.doc, end \+ 1\)\)/, 'insertArchivio must park the caret inside a trailing paragraph instead of selecting everything');
assert.match(node, /dice:\s*'Dado'/, 'the dice cell kind must be labelled "Dado"');
assert.match(node, /nextValue > nextMax[\s\S]*nextValue = nextMax|value > max/, 'archivio points cells must clamp like inline points');
assert.match(editor, /import \{\s*Archivio\s*\}[\s\S]*Archivio,/, 'RichTextEditor must register the Archivio extension');

// Modello del Dado nella cella: solo valore (nessun titolo), standard o custom,
// quantita' e snapshot del dado della libreria persistiti con la cella.
assert.match(node, /mode: ArchivioDiceMode/, 'dice cells must persist the standard/custom mode');
assert.match(node, /quantity: number/, 'dice cells must persist the custom roll quantity');
assert.match(node, /customDie: CustomDieRollSnapshot \| null/, 'dice cells must persist the custom die snapshot');
assert.match(node, /item\.mode === 'custom' \? 'custom' : 'standard'/, 'cell normalization must restore the dice mode');
assert.match(
  node,
  /cell\.kind === 'dice' && cell\.mode === 'custom' && cell\.customDie/,
  'custom dice cells must display quantity and die name when copied as text',
);

// Slash menu e policy strutturale.
assert.match(commands, /id:\s*'archivio'[\s\S]*label:\s*'Archivio'[\s\S]*icon:\s*Archive/, 'slash menu must expose Archivio with the Archive icon');
assert.match(commands, /case 'archivio':\s*return chain\.insertArchivio\(\)\.run\(\)/, 'slash command must route archivio to the insert call');
assert.match(policy, /'archivio'/, 'container policy must recognize archivio as a structural container');
assert.match(blocks, /archivio/, 'block content expression must allow archivio');
assert.match(migration, /'archivio'/, 'legacy migration must preserve archivio nodes');

// Intestazione: titolo, aggiunta riga che copia gli elementi senza valori, menu blocco.
assert.match(view, /Titolo archivio/, 'archivio header must expose an editable title');
assert.match(view, /Aggiungi riga/, 'archivio must offer row addition from the header and the block menu');
assert.match(view, /Aggiungi colonna/, 'archivio must offer column addition');
assert.match(view, /Nascondi il Titolo/, 'block menu must toggle title visibility');
assert.match(view, /Mostra il Titolo/, 'block menu must restore a hidden title');
for (const label of ['Duplica', 'Copia', 'Elimina']) {
  assert.ok(view.includes(label), `block menu must include ${label}`);
}

// Intestazione colonne: rinomina, ordinamento, movimenti, conversioni, cancellazione.
for (const label of ['Rinomina', 'Ordinamento crescente', 'Ordinamento decrescente', 'Aggiungi una colonna prima', 'Aggiungi una colonna dopo', 'Muovi a sinistra', 'Muovi a destra', 'Cancella colonna']) {
  assert.ok(view.includes(label), `column menu must include ${label}`);
}
for (const label of ['Converti tutto in testo', 'Converti tutto in dadi', 'Converti tutto in Modificatori', 'Converti tutto in Checkbox', 'Converti tutto in punti']) {
  assert.ok(view.includes(label), `column menu must include ${label}`);
}
assert.match(view, /Nuova colonna/, 'new columns must start with the "Nuova colonna" label');

// Prima colonna: solo testo e menu righe dedicato.
for (const label of ['Aggiungi riga prima', 'Aggiungi riga dopo', 'Aggiungi colonna dopo', 'Muovi riga sopra', 'Muovi riga sotto', 'Cancella riga']) {
  assert.ok(view.includes(label), `first-column menu must include ${label}`);
}

// Celle dati: i cinque tipi con trasformazione ed editing dedicato.
for (const label of ['Trasforma in testo', 'Trasforma in Dado', 'Trasforma in checkbox', 'Trasforma in Punti', 'Trasforma in modificatore', 'Modifica']) {
  assert.ok(view.includes(label), `data cells must support ${label}`);
}

// Ridimensionamento colonne senza altezza regolabile.
assert.match(view, /Ridimensiona colonna[\s\S]*tiptap-archivio-resize-handle/, 'columns must resize by dragging their divider');
assert.match(view, /ARCHIVIO_CELL_MIN_WIDTH/, 'column resize must respect the shared minimum width');
assert.ok((view.match(/className="tiptap-archivio-resize-handle"/g) ?? []).length >= 2, 'every vertical cell divider must expose the column resize handle');
assert.doesNotMatch(view, /row-resize|resize-row|cursor-row-resize/, 'archivio must not offer row height resizing');

// Scroll orizzontale: la griglia resta un contenitore locale dentro la
// shell (l'overflow-hidden del riquadro tiene le celle dentro il frame
// arrotondato) e la sua scrollbar deve essere visibile. La regola globale
// di index.css nasconde ogni scrollbar dell'app: l'ultima cella veniva
// tagliata sulla destra senza alcun indizio, mentre la Tabella non aveva
// il problema perche' il suo overflow arriva ai scrollbar visibili a
// livello di nota (.tiptap-content/.tiptap-viewport-scroll, esclusi dalla
// regola globale).
assert.match(view, /tiptap-archivio-scroll overflow-x-auto/, 'archivio grid must keep a local horizontal scroller marked with tiptap-archivio-scroll');
assert.match(view, /overflow-hidden rounded-\[var\(--note-block-radius\)\]/, 'archivio shell must keep clipping so cells never spill past the rounded frame');
const indexCss = await readFile(new URL('../src/styles/index.css', import.meta.url), 'utf8');
assert.match(indexCss, /:not\(\.tiptap-archivio-scroll\)/, 'the global scrollbar-hiding selectors in index.css must exclude the archivio scroller');
assert.match(indexCss, /\.tiptap-archivio-scroll\s*\{[^}]*scrollbar-width:\s*thin/, 'the archivio scroller must expose a styled thin scrollbar');
assert.match(indexCss, /\.tiptap-archivio-scroll::-webkit-scrollbar\s*\{[^}]*display:\s*block/, 'the archivio webkit scrollbar must be forced visible');

// Creazione su misura: alla prima creazione le colonne dividono la
// larghezza reale della nota invece di nascere 160px fissi (640px che
// tagliavano l'ultima cella quando la tab e' piu' stretta).
assert.match(node, /fitArchivioColumnsToEditor\(editor, columns\)/, 'insertArchivio must fit the default columns to the editor width');
assert.match(node, /editor\.view\.dom/, 'the fit must measure the rendered editor');
assert.match(node, /Math\.floor\(available \/ columns\.length\)/, 'the fit must split the available width across the columns');
assert.match(node, /Math\.max\(ARCHIVIO_CELL_MIN_WIDTH/, 'the fit must respect the shared minimum column width');

// Puntini verticali, menu in portal sopra lo sfondo, nessuna evidenziazione permanente.
assert.match(view, /MoreVertical/, 'archivio menu triggers must use vertical dots');
assert.doesNotMatch(view, /MoreHorizontal/, 'archivio menu triggers must not use horizontal dots');
assert.match(view, /createPortal[\s\S]*data-note-contextual-ui/, 'archivio menus must render in a portal above clipped containers');
assert.match(view, /placeFloatingNoteUI/, 'archivio menus must anchor next to their trigger inside the viewport');
assert.match(view, /background:\s*'var\(--dash-panel\)'/, 'archivio portal menus must carry an opaque inline background');
assert.match(view, /usePortalContainer[\s\S]*portalContainer \?\? document\.body/, 'archivio menus must inherit the active dashboard palette');
// Il gruppo Tailwind deve avere il nome "cell": il contenitore generico
// dell'editor e' gia' un "group" senza nome, quindi con group-hover/focus-within
// senza nome tutti i puntini della nota si accendevano insieme appena il focus
// entrava nell'editor (e sembrava che "selezionasse" tutti gli archivio).
assert.match(view, /HOVER_DOTS[\s\S]*group-hover\/cell:opacity-100/, 'cell and header dots must be hover-only overlays scoped to their named cell group');
assert.match(view, /group-focus-within\/cell:opacity-100/, 'dots must also show while the caret blinks inside the cell');
assert.doesNotMatch(view, /group-hover:opacity-100/, 'unnamed group-hover leaks to the editor shell group (dots stay visible)');
assert.doesNotMatch(view, /group-focus-within:opacity-100/, 'unnamed group-focus-within leaks to the editor shell group (dots stay visible');

// Allineamento: th e td appartengono al gruppo hover/focus e i puntini si
// ancorano allo span interno (stesso insetto in testa e nel corpo). Prima il
// gruppo stava sugli span e il th ancorava a se stesso: i puntini della
// testata risultavano piu' a destra di quelli delle celle dati.
assert.match(view, /className="group\/cell relative border-b/, 'header cells must own the named hover/focus group');
assert.match(view, /className="group\/cell relative px-\[var\(--note-cell-padding-x\)\]/, 'data cells must own the named hover/focus group');
assert.doesNotMatch(view, /className="group relative/, 'no unnamed group may sit on th/td (it matches every hover/focus trigger in the note)');

// Il posizionamento deve usare l'altezza reale del menù: con 360px fissi il
// ribaltamento "sopra l'ancora" scattava anche quando il menù (circa 206px)
// stava comodamente sotto il trigger e finiva in cima allo schermo, all'altezza
// della barra delle tab invece che accanto ai tre puntini cliccati.
assert.doesNotMatch(view, /placeFloatingNoteUI\(\s*\{[^}]*\},\s*224,\s*360/, 'menu placement must not assume a fixed 224x360 size');
assert.match(view, /useLayoutEffect\(/, 'menu placement must measure the real size before paint');
assert.match(view, /el\.offsetWidth,\s*el\.offsetHeight/, 'menu placement must anchor to the measured width and height');
assert.match(view, /new ResizeObserver\(/, 'menu placement must re-measure while the content resizes');
assert.ok(
  (view.match(/className="relative flex min-w-0 items-center/g) ?? []).length >= 3,
  'th and td inner spans must anchor every dots trigger at the same inset',
);

// Cella Dado: pulsante a tutta larghezza senza titolo, click = tiro in chat
// intitolato "<Nome riga> - <colonna>"; il testo puo' andare a capo (nessun
// troncamento) e Modifica apre la finestra condivisa DiceEditPanel (senza il
// campo Nome: il nome del tiro lo danno riga e colonna).
assert.match(view, /data-archivio-dice="true"/, 'dice cells must render a roll button instead of a bare input');
assert.match(view, /data-archivio-dice="true"[\s\S]{0,1200}?w-full/, 'the dice roll button must fill the cell width');
assert.match(
  view,
  /onClick=\{\s*\(event\) => \{[\s\S]{0,160}?rollCellDice\(rowIndex, colIndex\)/,
  'clicking the dice cell must roll',
);
assert.doesNotMatch(view, /customDie\.name/, 'the dice widget must not render a title/name');
assert.match(view, /useOptionalDiceSession\(\)/, 'archivio dice cells must reach the dice session context');
assert.match(
  view,
  /submitModifierRoll\(\{ name, expression: formula, formula, resolveName \}\)/,
  'standard dice cells must submit a modifier roll',
);
assert.match(
  view,
  /submitInlineCustomDieRoll\(\{ name, quantity: cell\.quantity, customDie: cell\.customDie \}\)/,
  'custom dice cells must submit a custom die roll',
);
// Rendering cella Dado custom: quantita' grande quanto il dado (shell mini
// h-6 = 24px) e faccia centrata (niente faceOffsetY che la spostava giu').
assert.match(
  view,
  /text-2xl font-bold leading-none">\{cell\.quantity\}/,
  'the custom quantity must render as big as the mini custom die (24px)',
);
assert.doesNotMatch(
  view,
  /<CustomDieLibraryIcon die=\{cell\.customDie\}[^/]*faceOffsetY/,
  'the archivio custom die icon must stay centered (no faceOffsetY shift)',
);
assert.match(view, /getModifierLookup\(editor\.view\)/, 'archivio rolls must resolve [Nome] tags like inline rolls');
assert.match(view, /`\$\{rowName\} — \$\{label\}`/, 'dice rolls must be titled "<Nome riga> - <colonna>"');
assert.match(view, /openDiceEditor\(rowIndex, colIndex\)/, '"Modifica" must open the shared dice edit window for dice cells');
assert.match(view, /<DiceEditPanel[\s\S]{0,2400}?showName=\{false\}/, 'the dice window must hide the Nome field in archivio cells');
assert.match(
  view,
  /onSave=\{\(_name, formula, _title, mode, quantity, customDie\)/,
  'saving the dice window must persist mode/quantity/customDie back into the cell',
);
assert.doesNotMatch(view, /Scegli Dado custom/, 'the dice cell menu must not offer a separate custom die picker');
assert.doesNotMatch(view, /label="Dado standard"/, 'the dice cell menu must not offer a standard/custom toggle outside the edit window');
assert.match(view, /min-h-7[\s\S]{0,1600}?break-words/, 'dice cell text must wrap to multiple lines instead of truncating');
assert.match(view, /function DiceFormulaText[\s\S]*splitModifierFormula[\s\S]*data-modifier-tag[\s\S]*FORMULA_TAG_CLASS[\s\S]*showInlineBoxTipAbove/, 'dice cells must render [Nome] references as tooltip tags instead of quoted text');
assert.match(view, /<DiceFormulaText\s+formula=\{cell\.text \|\| '1d6'\}/, 'dice cells must display their formula through DiceFormulaText');
assert.match(view, /loadCustomDice\(activeCampaign\.id, user\.id\)/, 'the custom die picker must load the campaign dice library');

// Puntini cella Dado: in alto a destra ma INSET dal bordo arrotondato del
// pulsante (a filo coprivano la cornice), sopra le pill della formula (la pill
// ha un'ampia zona cliccabile, i puntini no, quindi quando si sovrappongono
// devono vincere loro) e senza riquadro di sfondo in hover (coprirebbe il
// bordo della pill); manina sul pulsante di tiro come nel Dado normale.
assert.match(
  view,
  /const HOVER_DOTS_TOP =\s*'absolute right-1 top-1 z-\[2\]/,
  'dice cell dots must sit inset from the top-right corner with z-index above the formula pills',
);
assert.match(
  view,
  /cell\.kind === 'dice' \? HOVER_DOTS_TOP : HOVER_DOTS/,
  'dice cells must use the top-right dots variant',
);
const triggerBtn = (view.match(/function TriggerButton\(\{[\s\S]{0,900}?\}\) \{/) ?? [''])[0];
assert.doesNotMatch(
  triggerBtn,
  /plain/,
  'TriggerButton must not carry the old plain prop anymore (frameless rule made it useless)',
);
assert.doesNotMatch(
  triggerBtn,
  /hover:bg/,
  'TriggerButton must not paint a hover background over the formula pills (frameless rule)',
);
assert.doesNotMatch(
  view,
  /plain=\{cell\.kind === 'dice'\}/,
  'dice cell dots must not paint an opaque hover box over the formula pills',
);
assert.match(
  view,
  /data-archivio-dice="true"[\s\S]{0,900}?min-h-7 w-full min-w-0 cursor-pointer/,
  'the dice roll button must keep the pointer cursor like the inline dice widget',
);

assert.match(node, /selectable:\s*false/, 'archivio must not be selectable as a block, only removable through its Elimina menu');
const theme = await readFile(new URL('../src/styles/theme.css', import.meta.url), 'utf8');
assert.match(theme, /\.tiptap-archivio\.ProseMirror-selectednode[\s\S]*outline:\s*none/, 'a selected archivio must not keep the global selection outline');
assert.match(theme, /\.tiptap-content \.tiptap-archivio\s*\{[^}]*margin:\s*0 0 var\(--note-block-gap\) 0/, 'archivio must stack with the shared --note-block-gap standard (see verify-note-element-standards)');

// Nessun colore hardcoded: solo variabili di palette e classi Tailwind.
for (const [name, source] of [['tiptapArchivio', node], ['ArchivioView', view]]) {
  assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}/, `${name} must not hardcode hex colors`);
}

console.log('Archivio verification: PASS');
