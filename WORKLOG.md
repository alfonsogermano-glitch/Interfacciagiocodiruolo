# WORKLOG — Stato progetto & consigli di workflow

Ultimo aggiornamento: 2026-09-27

## Stato attuale (verde)

- **Branch**: `main` — file modificati non committati in attesa di conferma push (ArchivioView, tiptapInlineDice, tiptapInlineModifier, tiptapInlinePoints, EntityKebabMenu, EntityTabBar, DiceFormulaFolderRow, SavedDiceFormulaCard, SavedCustomDieCard, CampaignHome, theme.css, modifierFormula, NoteModifierMenu, tiptapArchivio, LeftSidebar, App, CampaignContext, index.css, package.json, verify aggiornate + verify-menu-dots-cursor.mjs, WORKLOG), `npm run check` verde (typecheck + 59 verify + build).
- **Ultimo lavoro**: cella Dado custom Archivio — quantità grande quanto il dado + faccia centrata (vedi sotto).
- **CI GitHub Actions**: verde sui commit recenti.
- **Deploy production Vercel**: auto-deploy a ogni push su `main` (nessuna preview).

## Cosa è stato fatto di recente

### Cella Dado custom Archivio: quantità grande quanto il dado + faccia centrata (2026-09-27)
Request dell'utente: nella cella Dado dell'Archivio con dado custom, la
quantità (numero) era troppo piccola (`text-sm` = 14px) rispetto al dado e
l'icona del dado appariva spostata verso il basso.
1. `fix:` `ArchivioView.tsx` (branch `mode === 'custom'`): numero da
   `text-sm` a `text-[2rem]` (= 32px, stessa scala della shell compact
   `h-8` del `CustomDieLibraryIcon`) e rimosso `faceOffsetY={3}` che
   applicava `translateY(3px)` alla faccia — ora faccia e numero sono
   centrati verticalmente (stesso center-Y).
2. `test:` `verify-note-archivio.mjs` — due asserzioni: quantità con
   `text-[2rem] font-bold leading-none` e nessun `faceOffsetY` sull'icona.
3. `npm run check` verde (typecheck + 59 verify + build).
4. Verifica live CDP: `dice-cell-check.mjs` con le classi REALI del bundle —
   **4/4 PASS** (`font-size=32px`, shell `h=32px`, numero/dado/faccia tutti
   center-Y `33`) + screenshot; le due asserzioni coprono il JSX React.

### Regola universale: i menu ⋮ restano freccia, mai manina (2026-09-27)
Request dell'utente: quando il mouse è sopra i tre puntini ⋮ di un elemento
(non sul widget stesso) il cursore non deve diventare manina ma restare
freccia, come regola universale per TUTTI i menu ⋮ a tre puntini del sito.
1. `fix:` widget inline — `tiptapInlineDice.ts`, `tiptapInlineModifier.ts`,
   `tiptapInlinePoints.ts`: i dots passano da `view.editable ? 'pointer' :
   'default'` a sempre `'default'` (combattevano con il `cursor: pointer`
   del widget, che resta manina per il tiro).
2. `fix:` bottoni ⋮ del sito — attributo `data-menu-dots="true"` su tutti i
   trigger: `TriggerButton` ArchivioView, `EntityKebabMenu` (card PG/PNG/
   mostri/Folder/NoteList), `EntityTabBar`, `DiceFormulaFolderRow`,
   `SavedDiceFormulaCard`, `SavedCustomDieCard`, menu campagna CampaignHome.
   Nessuno aveva cursor esplicito → ereditavano `cursor-pointer` dalle
   card/celle con onClick (es. EntityCard).
3. `fix:` `theme.css` — regola universale con `!important`:
   `[data-menu-dots]` + le tre classi `.tiptap-inline-*-menu-trigger` →
   `cursor: default`: batte cursor ereditato o esplicito, passato e futuro
   (ogni nuovo ⋮ basta marchi con `data-menu-dots`).
4. `test:` verify — nuovo `scripts/verify-menu-dots-cursor.mjs` (CSS
   universale, marcatore su tutti i 7 file, TriggerButton/kebab senza
   cursor-pointer, dots inline in `'default'`) iscritto in `check`
   (`verify:menu-dots-cursor`); `npm run check` verde (typecheck + 58 verify
   + build).
5. Verifica live CDP su lab (`archivio-dots-test.mjs`, **21/21**): cursor
   `default` su puntini Dado/Modificatore/Punti, cella Dado Archivio e
   header colonna; manina persistente sul corpo del widget Dado e sul
   pulsante di tiro cella; test sintetico `data-menu-dots` dentro un div con
   `cursor-pointer` → `default` sia ereditato sia esplicito; console clean.
   Note tecniche dalla diagnosi: il lab serve `data-dashboard-palette` sul
   `<html>` (senza le `--dash-*` tutti i colori di test crollano) e lo slash
   menu va scrollato (`scrollIntoView`) prima del click sull'item, altrimenti
   l'ultimo item (es. Punti) cade fuori dall'`overflow-y-auto` e il click
   finisce sull'editor (nessun bug di prodotto).

### Puntini ⋮ e cursore cella Dado Archivio + highlight hover puntini Dado (2026-09-27)
Request dell'utente: (1) i puntini ⋮ della cella Dado nell'Archivio devono
stare in alto a destra; (2) se si sovrappongono alla pill modificatore devono
avere precedenza di selezione (la pill ha un'ampia zona cliccabile, i puntini
no); (3) all'hover devono cambiare colore/illuminarsi come negli altri
elementi; (4) bug: i puntini del Dado normale non si evidenziano mai
all'hover diretto; (5) hover sulla cella Dado → cursore manina come nel Dado
normale.
Seconda request (rifinitura): (a) i ⋮ della cella Dado Archivio non devono
coprire la cornice arrotondata della cella; (b) nel Dado normale il colore di
fondo dei puntini deve essere uguale al colore di fondo dell'elemento e non
deve coprire la cornice della pill "Modificatore", restando comunque in primo
piano rispetto alla pill.
1. `fix:` `ArchivioView.tsx` — `HOVER_DOTS_TOP` (`absolute right-1 top-1
   z-[2]`, gruppo nominato `group/cell`) solo per `cell.kind === 'dice'`:
   puntini in alto a destra con inset di 4px (a filo di bordo coprivano la
   cornice della cella) e `z-[2]` sopra lo span formula (`relative z-[1]`);
   `HOVER_DOTS` esistente ora ha anch'esso `z-[2]`; nuovo prop `plain` su
   `TriggerButton` (celle Dado: niente `hover:bg` - un bg pieno coprirebbe il
   bordo della pill/text sotto i puntini; resta il `hover:text` come feedback);
   `cursor-pointer` sul pulsante di tiro (prima solo il Dado normale).
2. `fix:` `tiptapInlineDice.ts` — hover diretto sui puntini del Dado normale:
   i pallini si illuminano (`--dash-muted` → `--dash-text`) ma il contenitore
   resta trasparente: il colore di fondo che si vede è quello del Dado e la
   cornice della pill che arriva sotto i puntini non viene mai coperta; i
   puntini restano in primo piano (z-index/DOM sopra la pill). Un bg colorato
   (surface-2) era un colore diverso dal Dado (color-mix accent) e copriva
   l'angolo della pill (sovrapposizione reale misurata: 21px²).
3. `test:` verify — `verify-note-archivio.mjs` (5 asserzioni: `HOVER_DOTS_TOP`
   `right-1 top-1` z-[2], uso condizionale per `cell.kind === 'dice'`,
   `plain` sul trigger Dado + TriggerButton senza hover bg, `cursor-pointer`)
   + `verify-note-inline-dice.mjs` (pallini illuminati in hover + divieto di
   `dots.style.background`); `npm run check` verde.
4. Verifica live CDP su lab (`archivio-dots-test.mjs`, 13/13): Dado normale
   con formula `1d6+"Modificatore"` (scenario reale, pill sotto i puntini
   inter=21px²) — reveal, pallini muted→testo, contenitore trasparente,
   puntini in cima; cella Archivio — inset 4px dal bordo della cella
   (topInset=4 rightInset=4), pill che raggiunge la zona dei puntini
   (inter=116) con `elementFromPoint` sul trigger (precedenza z-[2]), nessun
   riquadro di sfondo in hover, colore muted→testo, `cursor=pointer`;
   screenshot ritagliati `dots-1-normal-dice`, `dots-2-archivio-idle`,
   `dots-3-archivio-hover`; console clean.

### Fix riga Modificatore + Dado: restringi prima, wrap reale poi (2026-09-27)
Request dell'utente: con Modificatore all'inizio e Dado alla fine della stessa
riga, allungando la formula del Dado (o inserendovi un modificatore) il Dado
wrappava alla riga sottostante ma il sistema continuava a considerarlo sulla
stessa riga, creando problemi. Comportamento voluto: (1) prima restringere il
Modificatore per far spazio al Dado più largo se c'è abbastanza spazio;
(2) altrimenti wrap reale del Dado e il Modificatore riempie la sua riga.
1. `fix:` `tiptapInlineModifier.ts` — `mergeWrappedDiceGroups`: gruppi di righe
   visive adiacenti dove il primo widget della riga sotto è un Dado, tra i due
   c'è solo spazio (range DOM, ZWSP incluso) e la riga unita con gli box
   espansi ristretti tiene ancora il minimo reale del box (min-width letto da
   `getComputedStyle`, floor `MIN_MODIFIER_WIDTH`) → rientrano sulla stessa
   riga con split uguale; se non ci sta, wrap reale e la misura normale fa
   riempire la riga al Modificatore.
2. `fix:` `performMeasurement` — loop di max 3 passi che riverifica posizioni
   E larghezze (`snapshot()`) dopo le proprie scritture: il wrap causato dal
   `width:auto` del Dado ricostruito (larghezza preservata in px) o dallo
   split veniva raggruppato una volta sola e restava stale se nessun resize
   dell'editor scattava; ora la riga si stabilizza nella stessa misura.
3. `test:` verify — `verify-note-inline-modifier.mjs` (due nuove asserzioni:
   merge con soglia min-width e loop di riverifica); `npm run check` verde.
4. Verifica live CDP su lab (`line-bug-test.mjs`, 7/7): iniziale stessa riga;
   formula 317px → Modificatore stretto a 368px, nessun wrap; formula 642px →
   wrap reale + Modificatore a 690px pieni, stabile nel tempo; formula corta →
   rientro sulla stessa riga; screenshot `linebug-1-shrunk/2-wrapped/3-rejoined`.

### Pill con tooltip per i riferimenti nei Dadi (2026-09-26)
Request dell'utente: nel Dado tradizionale e nella cella Dado dell'Archivio i
riferimenti `"Nome"` ai Modificatori non devono comparire come testo grezzo tra
virgolette, ma come pill tag con tooltip che ne mostra formula/valore (come
nella finestra di modifica, già stabilito in precedenza).
1. `feat:` `modifierFormula.ts` — `splitModifierFormula` (segmenti testo/tag in
   ordine), `modifierRefTipText` (`formula || value || '—'`, `"<nome>" non
   trovato`) e `FORMULA_TAG_CLASS` condiviso con la finestra di modifica.
2. `feat:` `tiptapInlineDice.ts` — il widget standard renderizza i segmenti
   della formula: tag `data-modifier-tag` come pill + tooltip
   `showInlineBoxTipAbove` con lookup vivo al passaggio del mouse; in anomalia
   il pill silenzia il tooltip del motivo; cleanup in `__destroyDiceWidget`.
3. `feat:` `ArchivioView.tsx` — componente `DiceFormulaText` per la cella Dado:
   stessi pill + tooltip; durante l'hover del pill sopprime il `title` nativo
   "Tira …" e lo ripristina all'uscita (niente doppi tooltip).
4. `test:` verify — `verify-modifier-formula.mts` (segmenti + testo tooltip),
   `verify-note-inline-dice.mjs` (pill con tooltip nel widget),
   `verify-note-archivio.mjs` (`DiceFormulaText` + pill nella cella);
   `npm run check` verde.
5. Verifica live CDP su lab (`dice-pill-test.mjs`): Modificatore `+2`, formula
   `1d6+"Modificatore"` salvata in entrambi → pill senza virgolette, tooltip
   `+2` su widget e cella, title rimosso durante hover e ripristinato;
   screenshot `pill-widget-tooltip.png` / `pill-cell-tooltip.png`.

### Archivio note: default 4 colonne, celle Dado, fix puntini e menù (2026-09-25)
Request dell'utente: nuovo archivio di default **1×4** (Nome / Tipo / Raggio
d'azione / Danno) con riga di esempio "Arco Lungo | Distanza | 15/30/45 |
Dado 1d6"; la cella Dado mostra **solo il valore** (nessun titolo), standard
o custom, con pulsante di tiro a tutta larghezza della cella; click = tiro in
chat intitolato `"<Nome riga> — <Colonna>"`; `⋮ → Modifica` riapre l'input
della formula, `Dado standard`/`Scegli Dado custom…` dallo stesso menù.
1. `test:` RED→GREEN `scripts/verify-note-archivio.mjs` (contratto: 4 colonne,
   `rows: [createArchivioStarterRow(columns)]` — prima mancava l'array e
   normalize azzerava la riga —, campi `mode`/`quantity`/`customDie`,
   `useOptionalDiceSession`, menù dadi, etichette rinominate Bottone→Dado).
2. `feat:` `tiptapArchivio.ts` + `ArchivioView.tsx` (colonne default, starter
   row, widget dado senza titolo `w-full`, roll con `getModifierLookup`,
   scope `'dice'` nel menù, picker libreria campagna).
3. `fix:` **puntini `⋮` sempre visibili** — le varianti Tailwind senza nome
   (`group-hover:`/`group-focus-within:`) rispondevano al `group` generico del
   contenitore editor (`RichTextEditor`: div `group relative max-w-full h-full`)
   e un solo focus dentro la nota accendeva **tutti** i `⋮` di **tutti** gli
   archivii (l'utente lo leggeva come "seleziona tutti gli elementi archivio").
   Fix con **gruppo nominato** `group/cell` su `th`/`td` + varianti
   `group-hover/cell:`/`group-focus-within/cell:` in `HOVER_DOTS`; il verify
   vieta le varianti senza nome e il `group` generico sulle celle.
4. `fix:` **menù cella fuori posizione** — `MenuPortal` passava a
   `placeFloatingNoteUI` un'altezza fissa **360px** contro ~206px reali: il
   flip "sopra l'ancora" scattava anche quando il menù stava comodamente sotto
   e con gli archivii bassi finiva in cima allo schermo, all'altezza della
   barra delle tab. Fix: misura reale `offsetWidth/offsetHeight` in
   `useLayoutEffect` + `ResizeObserver` (la lista dadi custom carica in async
   e l'altezza cambia: menù 206px, picker 75px) + listener `resize`.
5. Verifica live su `localhost:5173`: 32/32 `⋮` a opacity 0 a riposo e con il
   focus nell'editor (prima tutti accesi); focus dentro una cella → solo quel
   `⋮` = 1; hover reale → transizione 0 → 0.30 → 0.98 → 1; menù 2° archivio
   `top = trigger.bottom + 6` (prima 15px in cima); flip sopra attaccato al
   trigger (`bottom − h − 6`, h reale); picker 75px esatto; `Modifica` → input
   `1d6` con focus; allineamento `⋮` th/td delta X = 0; console senza errori.
6. `fix:` **creare un archivio selezionava tutto** (issue 2 dell'utente: blu
   nativo Chrome su tutto il contenuto, al 1° archivio su nota vuota e al 2°/3°
   quando il paragrafo di coda era l'unico testo rimasto). Causa radice
   individuata con patch `Selection.*` + stack: `insertContentAt` di Tiptap sul
   textblock vuoto fa `from -= 1; to += 1` → il replace copre **l'intero
   documento** → dopo l'insert non resta alcun blocco di testo →
   `selectionToInsertionEnd` → `TextSelection.near()` di prosemirror-state
   cade nel fallback `|| new AllSelection($pos.node(0))` → ProseMirror
   seleziona tutto e Chrome dipinge di blu ogni archivio (contenuto
   contenteditable=false). Fix in `insertArchivio`: se `tr.selection` è
   `AllSelection`, inserisce un paragrafo di coda e ci piazza il cursore
   (`TextSelection.create(tr.doc, end + 1)`). RED→GREEN su
   `verify-note-archivio.mjs` + `npm run check` verde.
7. Verifica live bug 2 su `localhost:5173` (nota vuota → `/` → Archivio):
   caret collassato nel `<p>` di coda, `selectednode = 0`, selezione vuota,
   screenshot senza highlight blu; stesse verdi sullo scenario "2° archivio"
   e su nota popolata (non-regressione); digitazione "x" finita nel paragrafo
   sotto l'archivio (con la vecchia AllSelection una lettera avrebbe
   cancellato tutto).

### Menu tabella oltre la corona dei "+" del gutter (2026-09-24)
Con una tabella dentro un Box di testo quasi a tutta larghezza, il menu
tabella (portale `fixed`, z 9998) partiva da `bordoDestroTabella + 8px` ed
entrava nella corona della shell dove vivono i "+" del gutter (`absolute`,
`right 2px`, 16px, z 20): lo copriva con lo sfondo opaco (foto di
regression dell'utente); in geometrie estreme il flip a sinistra copriva il
"+" sinistro — la trappola esisteva su entrambi i lati. La prima risoluzione
(clamp che scivolava il menu a sinistra della corona) è stata rifiutata
dall'utente: **il menu non deve coprire l'ultima colonna della tabella**.
Requisiti finali: menu sempre a destra dei "+" e mai sopra la tabella.
Opzioni valutate: A ("sempre a destra anche senza spazio") non è sempre
realizzabile — senza barra destra la shell finisce a ~14px dal bordo e i
40px del menu non entrano; B ("+" con z-index sopra il menu) avrebbe
piazzato il "+" su un pulsante ed è fragile perché il pannello note è
`fixed z-[900]` con transform, che intrappola i "+" nel suo stacking
context. Scelta **C — salto oltre la corona con fallback**:
1. `test:` RED→GREEN `scripts/verify-note-table-toolbar-gutter.mjs`
   (agganciato al check → 42 verify): costanti geometriche `GUTTER_EDGE = 2`,
   `GUTTER_BUTTON_SIZE = 16`, `GUTTER_CROWN_MARGIN = 4` (con
   `NOTE_TABLE_TOOLBAR_GUTTER_ZONE = 22`), `crownStart`, salto
   `beyondCrown`, fallback `gutterLimit`, divieto del flip a sinistra,
   `shellRef` passato dall'editor al menu.
2. `fix:` `noteTableToolbarPosition.ts` — se la posizione naturale invade
   la corona il menu **salta oltre il "+"** (`left = beyondCrown` =
   corona + pulsante + margine = `shellRight + 2`); se il salto esce dal
   viewport (shell a filo bordo, senza barra) si ricade su `gutterLimit` =
   stacco 4px prima della corona — è l'unico caso in cui qualcosa deve
   cedere e cedono i "+" mai visibili, non la tabella. Rimossi il flip a
   sinistra e l'input `shellRight`; `NoteTableToolbar.tsx` accetta
   `shellRef` e passa `shellRight: shellRect?.right`; `RichTextEditor.tsx`
   inietta `shellRef={editorShellRef}` (lo stesso ref del gutter).
   - Tabella stretta lontano dal bordo: posizione invariata (ancoraggio
     naturale accanto alla tabella).
   - Il menu resta **sempre** a destra: niente più flip sul "+" sinistro.
3. Verifica live su `localhost:5173` (browser sperimentale desktop): scenario
   box→tabella 3×3, `menu [818,858]` vs `+ [798,814]` → **gap 4px, zero
   sovrapposizione**; tabella `[405.4,784.4]` e box `[392.6,797.2]` **non
   coperti**; menu nel viewport; icone del rail destro `[863.4,881.4]`
   libere con 5,4px di rispetto; console senza errori. (Con il codice
   vecchio il menu sarebbe partito da 792.4 e avrebbe coperto interamente
   la corona [798,814]; con la prima risoluzione copriva la colonna
   finale.)

### Standard degli elementi note tokenizzati (2026-09-24)
Contratto unico per le proprietà "standard" di ogni elemento dell'editor note,
con enforcement automatico in `npm run check`:
1. `285c822` `test: add note element standards contract and align dependent verifies`
   - Nuovo RED→GREEN `scripts/verify-note-element-standards.mjs` (11 sezioni):
     token `--note-*` in `:root`, margini impilati, padding, raggi, bordi,
     celle, riga affiancata, GapCursor da `--note-cell-padding-y`, geometria dei
     widget (nessun letterale), raggio contenitori TSX e accoppiamento
     `transition-* duration-[var(--note-ui-duration)]`. Rinomina in
     `package.json` di `verify-note-block-spacing` in
     `verify:note-element-standards`.
   - Allineati a verde: `verify-note-archivio`, `verify-note-viewport-fill`,
     `verify-note-table-gap-layout` (prima RED, poi GREEN).
2. `1ece0fa` `fix: tokenize every standard note element property through --note-* vars`
   - `theme.css`: blocco `:root` con 11 token + banner delle eccezioni volute;
     convertiti 13 margini di impilamento, padding/raggi/bordi textbox+collapse,
     raggio pannelli e img, outline e celle tabella, gap riga, indent
     blockquote, hit-area (`8px`/`-8px` → calcoli su `--note-block-gap`),
     testata tabella → `var(--font-weight-semibold)`, tutte le `0.12s` →
     `--note-ui-duration`.
   - `noteTableResize.css`: calcoli GapCursor da `var(--note-cell-padding-y)`.
   - Widget inline: shell Dadi/Modificatori/Punti su `--note-widget-radius`
     (Punti 0.7em → 0.45em), menu tre-punti unificato (`0.32em`/`0.11em`/
     `0.22em` + `--note-widget-menu-radius`), raggi tooltip e tutte le
     `120ms/160ms` → `--note-ui-duration`.
   - TSX: raggi contenitori (Archivio, NoteSubTabs, `DEFAULT_CONTAINER_CLASS`,
     EntityDetailView), padding header/celle Archivio, durate Tailwind
     (Archivio ×3, bottone legacy RTE, bottone "nuova tab", chevron collapse).
   - Eccezioni deliberate (letterali motivati nel banner `:root`): bordo
     accent dei Dadi, hr `2px`, barra blockquote `3px`, checkbox `0.25rem`,
     input rinomina Punti, raggi `50%`, pesi font dei widget (tipografia
     propria dell'elemento), `p-4`/`text-sm` della variante compatta in
     EntityDetailView (solo raggio tokenizzato).
   - Delta visuali voluti: raggi contenitori 14px → 12px, img 8px → 12px,
     shell Punti 0.7em → 0.45em, celle Archivio +0.6px di padding,
     progress bar 160ms → 120ms.

### Bug risolti: creazione tab (2026-09-23)
Quattro sintomi collegati riportati dall'utente, più un regress dell'unità `+`:
1. **Selezione che non passava alla tab creata**: `handleAddCustomTab`/duplica non
   aggiornavano `tabOrder` (la fonte di `orderedTabs`) → l'effetto "tab attiva sparita"
   girava nello stesso commit con la lista vecchia e riportava la selezione alla tab
   precedente/alla prima. Ora l'id entra nello stesso batch di `setCurrentTab`.
2. **Nome della tab non sempre evidenziato**: rinomina con `focus()+select()`
   deterministici sull'input quando cambia `renamingTabId` (prima solo `autoFocus`,
   perso nell'async della POST).
3. **Cursore nella riga sbagliata**: il fallback del fix 1 marchiava anche
   `pendingFocusTabId` su un'altra tab, il cui editor rubava il focus → risolto col fix 1.
4. **Undo attivo su tab nuova**: il seed `setContent` entrava in prosemirror-history →
   ora chain con `addToHistory:false` (tiptap v3 non espone `clearHistory`); le
   digitazioni dell'utente non passano da quel percorso e restano annullabili.
5. **Regress unità `+`** (commit `c99e38a`): wrapper stabile `data-tab-unit` per OGNI
   tab → aggiungere una tab non rimonta più la vecchia ultima (che perdeva il focus del
   click sul `+`); il `+` resta incollato all'ultima tab come unità flex unica.
- Nuovo RED→GREEN: `scripts/verify-tab-create-focus.mjs` (agganciato al `check`) +
  assert unit aggiornati in `verify-note-contextual-controls.mjs`.

### Bug risolto: bodyColor tintava le facce fotografiche 3D
Con skin fotografica attiva il colore dado (`bodyColor`) sporcava il volto del dado.
Ora `bodyColor` influenza SOLO gli edge; le facce restano fedeli alla texture fotografica.

### Commit su main
1. `b8e8b79` `fix: stop bodyColor from tinting photographic skin faces`
   - Core fix in `src/app/components/session/dice/dice3dSkinTextures.ts`
     (bodyColor rimosso da `drawFirePhotoTexture`, `drawPattern`, cache key e nome texture).
   - Nuovo test RED→GREEN: `scripts/verify-dice-photo-face-body-color-isolation.mts`.
   - Fix typecheck: `src/app/components/session/dice/CustomDieConfigurator.tsx:78`
     (narrowing perso nella closure `onKeyDown`: `event.currentTarget.value.includes('\n')`).
   - Rigenerato `src/app/components/session/shared/tiptapIconData.ts` (210 icone Lucide, `ICON_META`).
   - Allineati verify stale: `verify-dice-3d.mts`, `verify-dice-skin-icons.mjs`,
     `verify-dice-ui.mjs`, `verify-dice-icon-style.mjs`, `verify-dice-realtime.mjs`,
     `verify-campaign-canonical.mjs`.
2. `dd05229` `fix: align ice/lightning/poison cache-key verifications and bump browserslist`
   - Cache key ora `${skinId}:${textureScale}:${readiness}` (niente bodyColor) in
     `verify-ice/lightning/poison-skin-consistency.mjs`.
   - `package.json` `overrides`: `browserslist@4.28.9` (transitivo) → audit CI pulito.
   - `package-lock.json` aggiornato (solo pacchetti dati: browserslist, caniuse-lite, ecc.).

## Comandi di verifica (NON skippare)

- `npm run check` — full: typecheck + 41 verify + build (obbligatorio prima di ogni commit).
- `node scripts/verify-dice-skin-regressions.mjs` — step CI separato (non in `check`).
- `npm audit --audit-level=high` — deve restare pulito.

## Regole del progetto (IMPORTANTI)

- **Windows + PowerShell**. `core.autocrlf=true`, nessun `.gitattributes`.
- **Fenomeno CRLF**: molti `verify-*.mjs` cercano stringhe con `\n` letterale nei file sorgente.
  In locale (CRLF) falliscono falsamente; in CI (Linux, LF) passano.
  → Prima di credere a un fallimento di verify, testare su copie normalizzate LF.
- `npm run typecheck/prebuild/predev` rigenera `tiptapIconData.ts` tramite `generate:note-icons`
  (deterministico, 210 icone) → sporca sempre il working tree. Non allarmarsi e non usare `git stash pop` cieco.
- `npm run check` rigenera il file icone ogni run: ri-dare `git add` dopo check, non prima.
- Niente force-push. Budget commit limitato → notificare l'utente prima di ogni push.
- Vercel: SOLO deploy production, mai preview.
- Stile commit: `fix:` / `test:` / lower-case, body con dettagli. Vedere `git log --oneline -20`.

## Verifiche "di unione" per file tipici

## Suggerimenti workflow (per sessioni lunghe)

- Iniziare sessione nuova per ogni task (finestra di contesto ~100%, non ripartire da zero:
  rileggere prima questo file).
- Directory dei worktree temporanei per test LF:
  `C:\Users\Alfonso\AppData\Local\Temp\opencode\`
- Per validare script CRLF-sensibili: copiare i sorgenti `.ts/.tsx` in una temp dir,
  convertire a LF (`-replace "`r`n","`n"`), puntare i path dello script → girare con `node`.