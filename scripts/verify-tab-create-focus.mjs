import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Creazione tab: quattro sintomi collegati, tutti verificati qui.
//
// 1) handleAddCustomTab/handleDuplicateCustomTab aggiornano customTabs e
//    currentTab ma NON tabOrder (la fonte di orderedTabs). L'effetto "la
//    tab attiva e' sparita" gira nello stesso commit leggendo orderedTabs
//    STALE, non trova la nuova id e scatta il fallback a defaultTabId /
//    orderedTabs[0] - cioe' la tab precedente o la prima (sintomo: "il
//    focus non si sposta sulla tab creata") - marcando per giunta
//    pendingFocusTabId sull'editor di un'altra tab.
// 2) Quel pendingFocus fa rubare il focus all'input di rinomina (che si
//    affidava solo ad autoFocus, non deterministico dopo l'async della
//    POST): il testo del nome non si evidenzia e a volte l'utente non
//    resta nella rinomina.
// 3) L'editor di un'altra tab che si prende il focus col segnale e' anche
//    il cursore che lampeggia dove non deve (fine riga invece che inizio).
// 4) Il seed iniziale di setContent finisce nello history di ProseMirror:
//    il tasto Annulla si accende su una tab appena creata e vuota.
//    + regress mia: l'unita' [+ e ultima tab] esisteva solo sull'ultima,
//    quindi al clic sul "+" React ripatchava la struttura della vecchia
//    ultima tab sotto la stessa chiave e ne rimontava il DOM (il bottone
//    "+" su cui si e' appena cliccato perdeva il focus). Wrapper stabile
//    per OGNI tab: la struttura di una chiave non cambia mai.

const [useEntityTabs, entityTabBar, editor] = await Promise.all([
  readFile(new URL('../src/app/components/session/shared/useEntityTabs.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/EntityTabBar.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/shared/RichTextEditor.tsx', import.meta.url), 'utf8'),
]);

assert.match(
  useEntityTabs,
  /setTabOrder\(prev => \(?prev\.includes\(data\.note\.id\)/,
  'handleAddCustomTab must append the new id to tabOrder in the same batch as setCurrentTab, so the stale orderedTabs fallback cannot steal the selection back to the previous/first tab',
);

assert.match(
  useEntityTabs,
  /setTabOrder\(prev => \(?prev\.includes\(putData\.note\.id\)/,
  'handleDuplicateCustomTab must append the copy id to tabOrder in the same batch',
);

assert.match(
  entityTabBar,
  /input\?\.focus\(\);[\s\S]*?input\?\.select\(\)/,
  'Rename input must be focused and its text selected programmatically: autofocus alone is not deterministic after the async POST',
);

assert.doesNotMatch(
  entityTabBar,
  /if \(!isLastTab \|\| !plusButton\) return tabElement;/,
  'Every tab must render through a stable wrapper: adding a tab must not remount the previously last tab and steal the focus of the click',
);

// tiptap v3 (UndoRedo) non espone clearHistory: l'unico modo corretto e'
// impedire al seed stesso di entrare nello history, marcando la transazione
// con addToHistory:false (meccanismo documentato di prosemirror-history).
// Nota: setContent lavora sul tr condiviso della chain, quindi basta una
// command che setti la meta prima dello stesso setContent.
assert.match(
  editor,
  /setMeta\('addToHistory', false\)/,
  'The initial setContent seed must dispatch with addToHistory:false so undo starts inactive on a brand-new empty tab',
);
assert.doesNotMatch(
  editor,
  /clearHistory\(\)/,
  'tiptap v3 has no clearHistory command - it would not even typecheck; use addToHistory:false on the seed instead',
);

console.log('Tab creation focus verification: PASS');
