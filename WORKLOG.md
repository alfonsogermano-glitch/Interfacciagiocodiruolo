# WORKLOG — Stato progetto & consigli di workflow

Ultimo aggiornamento: 2026-10-03

## Stato attuale (verde)

- **Branch**: `main` — commit più recente `983f65e` (cursore ⋮ + cella dado custom) già pushato; **non committati** i lavori successivi (altezza Archivio compatta, regola cursore disabled universale, menù dado Custom in palette, "Svuota" disabled, standard animazioni icone), `npm run check` verde (typecheck + 62 verify + build).
- **Ultimo lavoro**: menu ⋮ senza cornice e visibili solo all'elemento evidenziato (regola globale `[data-menu-dots]` opacity in theme.css + `group` sui contenitori); fix verify copia `--dash-panel`. `npm run check` verde, test live 7/7.
- **CI GitHub Actions**: verde sui commit recenti.
- **Deploy production Vercel**: auto-deploy a ogni push su `main` (nessuna preview).

## Cosa è stato fatto di recente

### Standard animazioni icone: regola globale hover su tutti i pulsanti/menù + indice icone non animate (2026-09-28)
Request dell'utente: recuperare ed estendere le animazioni icone (iniziose
delle sezioni GM — Ambientazione/PNG-Mostri/Personaggi — e mai estese al
resto), con un progressivo standard animato per TUTTE le icone, e produrre
un indice delle icone ancora non animate per i round futuri.
1. Analisi: in `index.css` esistevano 6 keyframes (`locationArrowPulse`
   0.8s, `cancelWiggle` 0.55s, `trashShake` 0.55s, `plusPulse` 0.75s,
   `editWrite` 0.65s, `saveDiskInsert` 0.7s) usati con
   `group-hover:animate-[...]` solo in 6 file (CampaignsPage,
   EnvironmentManager, MyCharactersPage, VisualAssetsManager,
   EquipmentCatalogPage, CatalogItemEditorModal); ~150 occorrenze in ~70
   file restavano immuni.
2. `feat:` `index.css` — **regola universale** accanto ai keyframes: hover su
   `button:not(:disabled)`, `[role='button']` e `[role='menuitem']`
   (non `data-disabled`) anima l'icona lucide con la stessa animazione/durata
   dello standard: `lucide-plus`→plusPulse, `lucide-save`→saveDiskInsert,
   `lucide-x`→cancelWiggle, `lucide-pen`/`lucide-pencil`→editWrite (nota:
   `Edit2` è alias di Pen in lucide-react 0.487), `lucide-trash-2`→trashShake,
   `lucide-chevron-*`/`lucide-arrow-*`/`lucide-archive`/`lucide-rotate-ccw`
   →locationArrowPulse. Un solo punto copre il sito senza toccare i ~150 TSX;
   gli usi `group-hover:animate-[...]` esistenti restano (stessa animazione,
   nessun conflitto); disabilitati e icone fuori da pulsanti/voci menù non
   animano.
3. `test:` nuovo `scripts/verify-icon-animations.mjs`, iscritto in `check`
   come `verify:icon-animations` (ora 62 verify); esteso nel round 1 sotto
   (8 keyframes, 15 famiglie, menuitem coperto, `button:disabled` mai).
4. Verifica live CDP `icon-anim-test.mjs` **14/14 PASS** (incluso round 1):
   ogni icona anima con la durata corretta; bottone disabilitato →
   `animationName: none`; icona fuori pulsante → `none`; frame reali
   letti dal DOM (matrice scale, drop-shadow).
5. Censimento completo (file interi, escluse icone interne UI): **90 icone
   distinte fuori standard** → indice nella sotto-sezione seguente.
6. Criterio **funzione → stile** approvato dall'utente: *moto* se l'icona
   descrive un movimento nello spazio dell'azione (Play/Upload/Undo),
   *trasformazione* se rappresenta un cambio di stato (Eye→battito,
   Copy→duplicato), *micro-movimento* per le icone-menù (⋮/Search/Sparkles).

#### Round 1 — Occhio + Copia: prime trasformazioni (2026-09-28)
Gruppo scelto dall'utente fra i candidati B (il più numeroso dopo Loader2,
tutti in bottoni/menù, nessun uso decorativo): introduce lo stile
**trasformazione**, che mancava fra i 6 keyframes (tutti moto).
1. `feat:` `index.css` — 2 nuovi keyframes: `eyeBlink` 0.65s (doppio
   battito via compressione verticale `scale(1.14,0.1)`→rimbalzo→secondo
   battito, vale per Eye **ed** EyeOff = feedback dello stato visibile) e
   `copyPop` 0.7s (il doppione si stacca: `translate(-3px,-3px)
   scale(1.15)` con rimbalzo + `filter: drop-shadow(...)` in sync che
   disegna la silhouette dell'originale dietro). Famiglie aggiunte alla
   regola universale: `.lucide-eye`/`.lucide-eye-off`→eyeBlink,
   `.lucide-copy`/`.lucide-copy-plus`→copyPop.
2. `test:` `verify-icon-animations.mjs` estesa a 8 keyframes + 15 famiglie.
3. Verifica live 14/14 con frame reali: Eye `matrix(1.05,0,0,0.63,0,0)`,
   Copy `matrix(1.11,...)` + `drop-shadow(rgba(10,10,10,0.72) 2.2px 2.2px 0)`;
   disabilitato/fuori-pulsante restano `none`.
4. `npm run check` verde (62 verify + build). Badge statici (EntityCard,
   DraggablePortrait, "Segreto") non animano: non stanno in un button →
   la regola universale li risparmia da sola.
5. `fix:` (rifiniture chieste dall'utente, iterate) **pausa tra i cicli**
   allungata: entrambi i keyframes durano **1.8s** — occhio: battito
   ~0.54s (primi 30%) + ~1.26s fermo; copia: scatto ~0.43s + ~1.37s fermo.
6. `fix:` **`copyPop` ridisegnata su richiesta ("confusionaria")**: prima
   faceva due spinte + rimbalzi + fantasma che pulsava; ora **un solo
   scatto netto** (il doppione si stacca una volta e rientra, drop-shadow
   compare/scompare una volta per ciclo) poi lunga pausa.
7. `fix:` **l'icona Copia partiva senza mouse sul bottone** (in due punti,
   entrambi confermati dall'utente con screenshot): (a) card campagna in
   CampaignsPage = `role="button"` con dentro il `<button>` del codice;
   (b) card "Campagne recenti" in HomeScreen:249 = **`<button>` per
   intero** con dentro il `div[role=button]` del codice (261). Rimozione
   semplice di `[role='button']` non bastava (caso b). **Formula finale
   "interattivo piu' prossimo" con `:has`** per ogni famiglia:
   `button:hover:not(:has([role='button'] .icona)) .icona` +
   `[role='button']:hover:not(:has(button .icona)) .icona` +
   `[role='menuitem']:hover` (invariato) — l'icona anima SOLO
   dall'interattivo che la contiene davvero: mouse sulla card grande →
   nessuna animazione, mouse sul bottone/div del codice → anima. Gruppi
   multi-icona con `:is()`. Verify estesa (formula :has obbligatoria,
   anti-regresso sul role=button "nudo").
8. Verifica live ora **24/24 PASS**: pausa confermata (a ~1s l'occhio e'
   a riposo), mouse via → `none`, card role=button → ferma / bottone
   interno → `copyPop`, **card-button HomeScreen lontano dal codice →
   ferma / sul div codice → `copyPop`**, scroll → hover rivalutato.
9. `change:` **frecce verticali separate**: `arrowUpPulse`/`arrowDownPulse`
   nuovi keyframes sull'asse Y (su: prima sale poi rientra; giu': prima
   scende poi rientra — mai X, come richiesto). `arrow-up`/`chevron-up` e
   `arrow-down`/`chevron-down` escono dalla famiglia orizzontale
   `locationArrowPulse` (che resta per left/right + archive + rotate-ccw);
   allineati i 2 `ChevronDown` con classe Tailwind in
    CatalogItemEditorModal (754/890). Verify: +2 keyframes, +2 famiglie.
    Test: ArrowUp `matrix(..., 0, -0.71)`, ArrowDown `matrix(..., 0, +0.93)`
    → tx=0, solo asse Y.
10. `change:` **copia ridisegnata piu' volte su richiesta**: prima split
    diagonale (`copySplit*`, bocciato), poi lampeggio fill-opacity
    (`copyFillFront/Back`) — bocciato dall'utente ("ancora non va bene").
    Design finale su **direttiva esplicita**: alternanza chiaro<->scuro
    con z-order corretto ("quando il quadrato dietro si illumina il +
    torna chiaro"). Fase A: davanti pieno colore icona, dietro solo
    contorno, `+` SCURO (pannello); fase B: davanti col fill del pannello
    (si confonde col fondo = "spento"), dietro illuminato (fill chiaro con
    `d` chiuso in rettangolo), `+` torna colore icona. Ciclo **2.4s**
    continuo: `copyFrontSwap` (fill currentColor 0-38% <-> pannello
    44-84%), `copyBackSwap` (fill-opacity 0<->1 sfasato + snap `d` aperto
    -> rettangolo chiuso (2,2)-(16,16) r2 dove non si vede),
    `copyMarkSwap` (stroke del +: pannello in faseA, currentColor in
    faseB). Fuori hover si torna a `fill:none`. Quadrati fermi
    (`transform: none`). Storia tentativi falliti: `clip-path:
    path(evenodd, ...)` (Chrome allinea male le coordinate `path()` su
    SVG al viewBox: assoluto=rect sparito, relativo=brandelli) e
    `mask-image` data-URI (funzionava ma **pixelloso** per l'utente) ->
    entrambi ABANDONATI, zero mask/clip nel CSS (verify lo impone).
10b. `fix:` **`var(--dash-bg)` non esisteva nel browser**: i colori tema
    vivono su `[data-dashboard-palette='...']` (9 palette in index.css) e
    senza quell'attributo (root pre-login, test CDP) `var(--dash-bg)` e'
    invalido -> il keyframe decadeva e il fill del front cadeva su `none`
    (scoperto campionando getComputedStyle a t=120/600/1400/2000ms).
    Sostituito con **`var(--dash-panel, #0a0a0a)`** (fallback esplicito):
    `--dash-panel` e' la variabile tema usata ovunque nel sito (9 usi).
    Test con palette `noir` iniettata sul DOM + confronti relativi fase
    A/B (non stringhe colore, che mistiano oklch/rgb).
11. `add:` **round 2 — ⋮/⋯ + Sparkles + UserPlus/UserMinus** (tutte in
    pulsanti/menu reali): `dotsWaveV`/`dotsWaveH` onda fra i3 puntini con
    sfasamento via `animation-delay: 0/0.53s/1.06s` (giro1.6s con pausa);
    `signPulse` il segno + / - (ultimi figli, `:nth-child(n+3)`) pulsa in
    scale1.45 (giro1.4s); `sparkleTwinkle` scintille a gruppi sfalsati
    (stella +0.45s, crocetta dx 0s, crocetta sx +0.9s, giro1.8s) — scale
    con `transform-box: fill-box`. Scoperta: `MoreVertical`/`MoreHorizontal`
    sono alias lucide di `ellipsis-*` → classi DOM **`lucide-ellipsis-vertical`**
    / **`lucide-ellipsis`** (non lucide-more-*). I `animation-delay` servono
    `!important` perché la shorthand `animation:` del selettore hover ha
    specificita' piu' alta. Test live **36/36**, verify estesa a21 famiglie.
12. `fix:` **+ / − disallineati nelle card ambiti della scheda
    personaggi** (EntityDetailView:585): erano testo Unicode (`−` U+2212 e
    `+` U+002B) con metriche verticali diverse nel font → sostituiti con
    le icone `Minus`/`Plus` (h-3.5, stessa geometria lucide: linee centrate
    a y=12, come DiceNumericStepper). Bonus: il `+` ora anima con
    `plusPulse` in hover grazie alla regola universale. Nessun altro
    testo `+`/`−` isolato nel codice.
13. `fix:` **"+" di CopyPlus sempre visibile, senza maschere**: l'ordine
    lucide mette le2 linee del + PRIME e il rect (disegnato dopo) le
    copre quando si riempie. Soluzione finale: **ordine DOM custom** nel
    modulo locale `src/app/components/IconeCopia.tsx` (createLucideIcon,
    stesse geometrie/classi lucide) — `Copy`: `[path(dietro), rect(davanti)]`,
    `CopyPlus`: `[path, rect, line, line]` (+ ULTIME = sopra tutto).
    Il CSS identifica front/back **per tag** (`> rect`, `> path`,
    `> line`), non per `:last-child` (che con l'ordine custom
    cambierebbe significato). 13 file importano Copy/CopyPlus da lì
    (rimossi dagli import lucide-react). Il + inverte lo stroke via
    `copyMarkSwap` in fase col davanti -> sempre leggibile in entrambe le
    fasi. **Storia**: prima `clip-path: path(evenodd)` (coordinate
    non allineate al viewBox) poi `mask-image` data-URI (pixelloso) ->
    abbandonati; la soluzione "dietro sotto, davanti sopra, + ultime" non
    ha bisogno di clip/mask alcuna. Verify: letture IconeCopia (ordine
    path-prima-di-rect, anti-regresso ordine lucide) + assenza
    mask/clip-path nel CSS. Test live: `ord === 'path,rect'` /
    `'path,rect,line,line'`, swap colore fra fase A e B, mask `none`.
14. Regola universale: tutte le regole button hanno anche
    `:not([aria-disabled='true'])` (15 regole) — le voci di
    `EntityKebabMenu` usano `aria-disabled` e prima avrebbero animato da
    disabilitate; verify aggiornata con asserzione esplicita.
    Utente: "bene, le ho trovate e vanno benissimo" su ⋮/⋯+Sparkles+User.
15. `change:` **menu ⋮ senza cornice + visibili solo all'elemento
    evidenziato** (richiesta utente con screenshot di un ⋮ in cerchio con
    bordo). Controllo completo sito: la cornice era
    `MyCharactersPage.photoCornerButtonClass` (`rounded-full border
    border-white/25 bg-black/50`) + `CampaignHome` menu campagna
    (`rounded-xl border bg-panel`) + sfondi persistenti sui kebab foto.
    Standard unico in `theme.css`: `[data-menu-dots] { opacity: 0;
    transition: opacity 140ms }` visibile con `.group:hover`,
    `.group:focus-within`, `:hover` diretto (fallback), `:focus-visible`,
    `[aria-expanded='true']` (menù aperto), e SEMPRE su touch
    (`@media (hover: none)`). Rimossi bordi/sfondi persistenti dai trigger
    (photoCorner ×2, menu campagna); `group` aggiunto ai contenitori che
    ne mancavano: EntityCard (list+grid), EntityDetailView header (kebab
    PG/PNG/Mostro), articles dice ×3, `data-tab-unit` EntityTabBar,
    toolbar home campagna, toolbar blocco Archivio. `aria-expanded` su
    EntityKebabMenu e trigger ⋮ EntityTabBar. I trigger inline della nota
    hanno già il loro sistema JS (mouseenter sull'elemento) — invariati;
    breadcrumb/pagination "…" non sono menù ⋮ — non toccati. Verify
    `verify-menu-dots-cursor` estesa: regole opacity/theme.css + no
    `border` nei trigger (costanti photoCorner, kebab default, tag
    menu campagna, classi dice/TabBar/TriggerButton). Test live CDP
    **7/7** (nascosti di default, hover group→1, mouse fuori→0,
    aria-expanded→1, fallback hover diretto, border none) + screenshot.
    Fix verify copia: le righe `var\(--dash-bg\)` erano sfuggite al
    replaceAll (escape backslash) — ora puntano `var(--dash-panel,
    #0a0a0a)`.

16. `change:` **⋮ senza sfondo all'hover + animazione di LUCE al posto
    dell'onda** (richiesta utente: niente fondo quando si punta i tre
    puntini; i puntini non devono muoversi, devono accendersi a turno —
    alto → centro → basso → centro, poi senso inverso, ritmo moderato).
    (a) Rimossi tutti gli `hover:bg-*` dai trigger `data-menu-dots`:
    menu campagna + kebab foto CampaignHome, kebab foto
    MyCharactersPage, dice DiceFormulaFolderRow/SavedCustomDieCard/
    SavedDiceFormulaCard, kebab default EntityKebabMenu, buttonClassName
    NoteListRow/FolderRow, TriggerButton ArchivioView (proposito
    `plain` rimosso del tutto: prop, destruzione, call-site e
    commento). (b) `index.css`: keyframes `dotsWaveV/H` (movimento
    `translateY/X`) sostituiti da6 keyframes di sola `opacity`
    `dotsLightVTop/VCenter/VBottom` + `HLeft/HCenter/HRight` (ciclo4
    step su 2.4s, crossfade ~11%, pallino acceso=1 / spento=0.3; il
    centrale batte due volte a ciclo). Regole hover universali ora
    longhand (`animation-duration/timing/iteration-count` su `> *`) e
    le nth-child danno `animation-name` per POSIZIONE REALE — ordine
    SVG lucide: nth1=centro, nth2=alto/destra, nth3=basso/sinistra.
    Fuori hover resta solo il nome → nulla parte. (c) Verify:
    `verify-icon-animations` (keyframes list + families con
    `animation(?:-name)?:`), `verify-menu-dots-cursor` (ora vieta anche
    `hover:bg`, + campioni NoteListRow/FolderRow),
    `verify-note-archivio` (assert `plain`/hover:bg rimpiazzate con
    doesNotMatch). Test live CDP **19/19** (`dots-light-test.mjs`:
    animation-name/durata/infinite per i3 pallini V e H, `transform:
    none`, trigger senza bg/bordo, sequenza argmax solo con transizioni
    del ciclo, ogni pallino si spegne, fuori hover torna `0s`) + **7/7**
    opacity (`dots-test.mjs`) + screenshot `light-top/center/bottom.png`
    (fasi: alto, centro, basso acceso) e `light-horiz.png`.
    Fix follow-up utente: il ciclo "sembrava iniziare random" —
    `animation-name` statico con duration che passava da0s a2.4s non
    azzerava il tempo di animazione; l'intera shorthand `animation:`
    (name+duration) vive ora SOLO nei6 blocchi hover con `:nth-child`
     → ogni ingresso del mouse fa ripartire da t=0 = pallino ALTO (test
     restart: 3 hover successivi tutti `t1.00/c0.30/b0.30`).

17. `change:` **Archivio: ⋮ solo con caret/freccia nella cella + righe
    nota senza caret agli estremi e paragrafo di coda garantito**
    (richieste utente: i puntini delle celle tabella devono apparire solo
    quando il caret o il mouse sono sulla cella, non all'hover della nota;
    eliminare il cursore lampeggiante che compare in testa/fine riga —
    con i "+" l'inserimento agli estremi passa da lì, il caret serve solo
    tra un elemento ed un altro; ripristinare la riga vuota automatica
    sotto l'ultima riga piena per poter scrivere sotto).
    (a) `ArchivioView.TriggerButton`: nuova prop `cell` → attributo
    `data-menu-dots-cell` sui3 trigger (Menu colonna/riga/cella) — shorthand
    `cell={true}` (il shorthand solo `cell` con l'omonima variabile della
    map era ambiguo). (b) `theme.css`: reveal generico esclude
    `:not([data-menu-dots-cell])`; reveal celle via `.group/cell:hover`
    e `.group/cell:focus-within` (batte le utility Tailwind in @layer).
    (c) `tiptapBlockRow.ts` — P2: `exitRowSelection()` (pura, esportata)
    + `exitRowTo()` (dispatch): il caret nel gap ESTREMO della riga esce
    sul lato corrispondente (paragrafo → fine/inizio testo; altra riga →
    coda ultimo elemento / testa primo elemento) invece di essere
    risucchiato nel primo/ultimo figlio; usata in `onTransaction` (nudge
    con `isHead`/`isTail`), in `moveAcrossRowItems` (Left/Right in
    gap estremo) e in `moveOutOfRowVertical` (rimossi i2 GapCursor di
    attesa al confine → stessa `near()` per paragraph e blockRow).
    (d) P3: `createBlockRowTrailingParagraphPlugin()` (`appendTransaction`
    idempotente) registrato da `BlockRow.addProseMirrorPlugins`: se
    l'ultimo blocco è una blockRow appende sempre un paragrafo vuoto.
    (e) Verify nuovo `verify-note-row-extremes.mjs` (funzionale: uscite
    up/down/trai righe, fallback null, append/idempotenza/non-docChanged +
    assert statici no `new GapCursor(`) con voce in `check`; verify
    `menu-dots-cursor` estesa (punto7 celle Archivio) e raggio0 la
    vecchia soglia220 (il blocco reveal è più lungo ora). `npm run check`
    verde. Contesto P2/P3 confermato dall'utente con domanda esplicita:
    righe della nota, caret che va nella riga di testo adiacente.

18. `fix:` **"+" del gutter: tutte le voci finiscono nella stessa riga del
    target (bug: textbox + Dado appariva "in basso")** (segnalazione
    utente: crea una textbox, "+" → Dado, il box dado finiva sotto la
    textbox fuori riga; lamenta anche assenza di un controllo generale
    delle combinazioni "+"). (a) Causa: in `NoteRowGutter.choose` solo
    Testo/Box/Collapse passavano da `addBlockToRow`; le voci inline
    (Dado/Modificatore/Punti, e anche Checkbox/Radio) cadevano in
    `resolveMenuEdge`, che con `blockPos` fa un `insert` di paragraph
    GREZZO accanto al blocco (→ "in basso") e su un blockRow ritorna
    `null` (→ non faceva nulla). (b) Fix: ramo `blockPos` ora calcola
    `isInlineInsert` (i5 id) → `addBlockToRow({kind:'paragraph'})` prepara
    il paragrafo affiancato nella riga e gli insert inline ci nascono
    dentro col caret già posizionato (`clampNewBoxToRow` dopo); return
    anticipato prima di `resolveMenuEdge`. (c) Refactor: la logica di
    `addBlockToRow` è estratta in `applyBlockToRow(tr, schema, opts)`
    (pura, esportata; `blockRowItemNode` ora prende lo schema) per essere
    testabile senza editor. (d) **Verify definitivo
    `verify-note-row-insertions.mjs`** (voce in `check`): matrice completa
    5 target (textbox/collapse/paragraph standalone, figlio in riga,
    riga intera) × 3 kind × 2 side = **30 combinazioni funzionali** con
    invarianti (target SEMPRE dentro un blockRow = nessun paragrafo
    orfano "in basso", nuovo elemento al bordo scelto e vuoto, caret
    dentro la riga, `doc.childCount` invariato) + caso di regressione
    textbox+Dado + wiring statico del gutter (i5 inline → addBlockToRow,
    insert dopo ok, return prima di resolveMenuEdge, vecchia catena kind
    rimossa). `npm run check` verde.

19. `fix:` **Punti "schiacciato in fondo" nella riga (regola fissa:
    elementi a larghezza adattabile si dividono lo spazio in parti
    uguali)** (segnalazione utente: riga [textbox, dado, punti] → il box
    Punti restava piccolo/troncato "Pun..." in fondo; dopo il primo
    tentativo il risultato era peggiorato: dado in alto e Punti larghi
    sotto, entrambi nello stesso paragrafo). (a) Cause: `.tiptap-row > p`
    è deliberatamente hug (`flex: 0 1 auto`, centrato — pensato per il
    testo affiancato); shell del widget con `width` fisso `'4em'`; e il
    "+" di bordo dei box inline (`insertInlineAtEdge`, `blockPos: null`)
    inseriva i Punti nello STESSO paragrafo del box vicino, dove un box
    a larghezza piena va a capo sotto il dado. Dado/Modificatore restano
    hug perché la loro larghezza è detta da variabili (nome/formula).
    (b) `NoteRowGutter.insertInlineAtEdge`: i Punti dal "+" di bordo
    preparano ora un paragrafo proprio con `addBlockToRow({kind:
    'paragraph', pos: state.paraStart - 1})` — come dal "+" di riga —
    così ogni box sta nel suo `p`; fallback al vecchio bordo se il
    paragrafo è scaduto. (c) `tiptapInlinePoints.buildPointsWidget`:
    calcola `fills` (il `p` è dentro `blockRow` E contiene solo lo ZWSP
    dei Punti) → `width: '100%'` + `data-points-fills`, altrimenti la
    larghezza nominale di prima (`replacedWidget` px / `'4em'`, makeRoom
    invariato). (d) `theme.css`: quota equa solo per
    `p:has(.tiptap-inline-points-widget[data-points-fills])` →
    `flex: 1 1 0; align-self: stretch`.     (e) Verify: shell ternaria e
    selettore `[data-points-fills]` in `verify-note-inline-points`;
    `verify-note-inline-layout` (assert `fills`, quota equa theme,
    wiring `addBlockToRow` dal bordo) + tutti gli altri invariati.
    (f) **Doppie "+" ai lati**: i paragrafi con box dentro la riga
    esponevano anche i loro bordi, che nella colonna fissa del gutter si
    sovrapponevano ai `row-left`/`row-right` (top quasi uguali). Fix in
    `NoteRowGutter.refresh`: i `p` figli di `blockRow` non espongono
    bordi (stessa regola già applicata a TextBox/Collapse) → restano solo
    i due `+` di riga. (g) **Altezza**: il widget Punti dentro il `p`
    fills ora è un figlio di `p { display: flex }` → si stira a tutta
    l'altezza della riga (e `justify-content: space-between` distribuisce
    header/barra/numeri) così il rettangolo Punti combacia con quello
    della TextBox affiancata invece di restare più basso con vuoto sotto;
    verificato con test CDP (iniezione riga replicata: riga/textbox/
    widget tutti alla stessa altezza). `npm run check` verde (EXIT 0).

20. `fix:` **Spazio vuoto residuo dopo l'eliminazione di un box inline**
    (segnalazione utente: "quando si elimina un elemento, che sia in
    mezzo o all'inizio o alla fine, si crea uno spazio vuoto" — screenshot
    [textbox][buco ~60px][textbox]). (a) Causa: i `delete*At` dei tre box
    (Punti/Modificatore/Dado) cancellavano solo lo ZWSP marcato
    (`tr.delete(pos, pos+1)`) lasciando il paragrafo che ospitava il box
    vuoto nella riga: `.tiptap-row > p { flex: 0 1 auto }` + `min-width:
    3ch` → un buco visivo dove che si trovi il box eliminato. Il
    cleanup `onTransaction` di `tiptapBlockRow` tocca solo righe con
    SOLO p vuoti (o singolo p) — con altri figli il p orfano restava.
    (b) Nuova funzione condivisa `deleteInlineBoxAndRowResidue` in
    `tiptapBlockRow.ts`: cancella il carattere e, se il `p` di riga che
    lo conteneva è rimasto senza contenuto visivo (solo spazi/ZWSP, con
    strip) e la riga ha altri figli (`childCount > 1`), cancella anche il
    `p` nel transazione stesso e sistema il caret col `Selection.near`
    sul figlio adiacente. Con un solo figlio si lascia perdere (ci
    pensa lo srotolamento della riga vuota); fuori riga nessun effetto.
    (c) `deletePointsAt`/`deleteModifierAt`/`deleteDiceAt` chiamano
    l'helper (import da `./tiptapBlockRow`, nessuna circolarità). Non ci
    sono altri percorsi di eliminazione: Backspace/Canc sui box è
    bloccato (`blocks*Deletion`) → solo il menu "Elimina".
    (d) Verify: test **funzionali** in `verify-note-row-extremes` (mezzo
    inizio/fine, solo spaziatore separativo, testo residuo tenuto, p
    unico figlio tenuto, standalone intatto, caret nel figlio
    sopravvissuto) + assert statici nei verify Punti/Modificatore/Dado.
    `npm run check` verde (EXIT 0). Punti (a)-(g) del punto 19 e questo
    punto NON sono ancora committati.

21. `fix:` **Regole cursore nelle righe di elementi (margine esterno + gap
    interno)** (segnalazione utente: "il cursore non deve stare ai margini
    esterni della riga, solo fra due elementi; fra due textbox il cursore
    non appare; il dado lo mostra anche se è l'ultimo"). (a) Regola margine:
    nuova funzione pura `rowEdgeExitTarget(state)` in `tiptapBlockRow.ts` —
    una TextSelection vuota esattamente all'inizio del PRIMO figlio o alla
    fine dell'ULTIMO figlio di una riga esce dal lato corrispondente
    (`exitRowSelection` → paragrafo adiacente o altra riga). Solo figli
    PARAGRAFI non vuoti (Box/Collapse hanno bordo/padding: il caret dentro
    è dentro l'elemento), solo transazione di sola selezione (`!docChanged`:
    mentre si scrive il caret resta dov'è) e solo senza meta
    `blockRowNudge` (l'atterraggio di un exit non deve risaltare).
    (b) Meta anti-loop: `exitRowTo`, `jumpInto` (frecce fra elementi) e i
    due dispatch di `moveOutOfRowVertical` taggano `blockRowNudge` — ogni
    selezione piazzata volutamente salta i nudge, così da un margine si
    esce una volta sola. (c) Gap interni: in `onTransaction` una GapCursor
    in un gap INTERNO della riga resta dov'è (prima veniva nudgata dentro
    un figlio e fra due Box non appariva nulla); restano invariati head/tail
    che escono. (d) Nuovo plugin `createBlockRowGapCursorPlugin` (registrato
    in `addProseMirrorPlugins`): il plugin gapcursor standard rifiuta i
    click interni (`GapCursor.valid` falso per i paragrafi adiacenti, e
    `handleClick` rifiuta comunque quando il figlio è NodeSelection-able
    come TextBox/Collapse) → qui si crea la GapCursor noi; se `posAtCoords`
    finisce dentro un figlio con bordo (Box: il click a meta' del gap
    visivo cade nel padding), si confronta `event.clientX` con il rect del
    figlio: a sinistra del bordo (o a destra del suo bordo destro) il click
    era nel gap → GapCursor sul confine, altrimenti è un click sul
    contenuto e si comporta normalmente. (e) Verify: casi funzionali P4 in
    `verify-note-row-extremes.mjs` per `rowEdgeExitTarget` (primi/ultimi/
    medi, figlio unico, textBox, slot vuoto, fuori riga, GapCursor,
    selezione non vuota) + assert sorgente (meta in `exitRowTo` e nei
    dispatch, keep GapCursor interni, wiring regola margine, plugin). Schema
    verify esteso con `textBox` come figlio di riga. (f) Misura CDP reale
    (harness `cursor-harness.mjs`, 18 fixture, confronto
    baseline→postfix3): tutti gli `internal0` ora danno GapCursor visibile
    (`GAP-between`, widget `w`) — compresi tb_tb/dice_tb/collapse_tb; margini
    esterni (`beforeRow`, `tail`, click di bordo) ora `exited-doc` (prima
    `EXT-CARET`); frecce invariate (escono tutte correttamente); GapCursor
    fra righe adiacenti e caret su righe libere invariati. Casi aperti da
    validare a mano su localhost: click su widget Dado/Punti in testo riga
    (prima finiva nel figlio vicino, ora esce a doc). `npm run check` verde
    (EXIT 0). Punti 19-21 NON sono ancora committati.
    (g) Fix sintomi residui 2026-10-01 — A) click fra due textbox: la guard
    `index <= 0` abortiva quando `posAtCoords` risolveva dentro il PRIMO
    figlio (caso tipico del click nel gap fra due Box, dove il bordo
    sinistro del gap è appena a destra di `child0.right`): rimossa, resta
    solo la target guard (`target <= 0 || target >= childCount`, margini
    gestiti da head/tail). B) frecce su/giù "bloccate" attorno a textbox:
    da paragrafo adiacente alla riga il gapcursor creava GapCursor sul
    bordo ESTERNO, `exitRowTo` lo respingeva sullo stesso caret → loop;
    nuovo `enterAdjacentRowVertical` (solo depth 1 + `endOfTextblock` +
    fratello `blockRow`, `Selection.near` + meta nudge) e
    `moveOutOfRowVertical` con `rowDepth < 0` che delega a lì; con
    `rowIndex <= 0` (nessun blocco sopra la prima riga) esplicita la
    GapCursor sul gap adiacente (`GapCursor.valid` con cast @internal come
    `noteTableContainerGapCursor`) — la lasciava fare al gapcursor standard
    che dava il bordo in-testa. C) textbox inserita dopo testo cadeva nella
    riga sottostante: `setTextBox` in `tiptapBlocks.tsx` usa ora
    `addBlockToRow({kind:'textBox', side, pos})` quando il caret è vuoto in
    paragrafo top-level (depth 1) o in paragrafo-in-riga (depth 2,
    node(1)=blockRow) CON testo (`textContent.length > 0`), side = left se
    caret a `contentStart` altrimenti right; paragrafi vuoti restano su
    `insertContent` (flusso slash su riga fresca invariato). Verify: assert
    sorgente `new GapCursor(` esteso a `moveOutOfRowVertical`. Misura:
    harness 219 righe confronto postfix3→postfix5 = 0 diff; `dbg-arrows`
    A/B/C/D/E tutti in movimento (D con GapCursor esplicita a doc-start,
    non più bordo in-testa); `dbg-tb`/`dbg-tb2` Fix C: righe attese in
    tutti i flussi (caret inizio/fine, con/senza spazio, slash, vuoto,
    in-row); click fix A verificati con press reale (120ms: gapA/gapMid/
    gapB → GapCursor interno, click contenuto → caret) — con press
    sintetico 0ms un race `selectionchange`→`readDOMChange` riscrive la
    selezione (non riproducibile con click umano). `npm run check` verde
    (EXIT 0). Punti 19-21 NON sono ancora committati.

22. `fix:` **Frecce verticali in uscita dalla Tabella (gap verso i nodi
    adiacenti)** (segnalazione utente 2026-10-02: ↑ dalla tabella verso
    l'Archivio sopra non mostrava il cursore verticale fra i due; ↓ dalla
    tabella verso la TextBox sotto idem; nelle direzioni inverse sì).
    (a) Diagnosi riprodotta in CDP (`dbg-tablegap.mjs`): l'uscita verticale
    dalla tabella viene inghiottita dal `arrow()` di prosemirror-tables
    (`tableEditing`: `atEndOfCell` ok, `nextCell` null → `Selection.near`
    sul bordo esterno; se atterra in un testo diverso da quello corrente
    `maybeSetSelection` ritorna true e il plugin gapcursor standard non gira
    mai). L'asimmetria dipende da cosa c'è dall'altro lato: se la near
    coincide col caret corrente (eq → false) il gap appariva lo stesso, con
    un paragrafo sopra l'Archivio o la TextBox sotto la near trova testo
    diverso → swallow. (b) Fix in `noteTableContainerGapCursor.ts`:
    `TableCellContext` espone `tablePos` (`before(tableDepth)`); nuova
    `tableOuterGapSelection(state, context, dir)` che al bordo esterno
    (`verticalNeighborCell` null) ritorna GapCursor sul gap subito
    prima/dopo il nodo tabella se `isValidNoteTableGapCursor` lo valida
    (Archivio atom / TextBox isolating → sì; paragrafo plain → null, status
    quo per la regola "solo fra due elementi"), con guardia `hasSibling`
    (ai confini del doc resta null: quelle posizioni sono già del gapcursor
    standard — un primo tentativo senza guardia ha fatto fallire l'assert
    "mixed" del verify). Chiamata dai due rami (`TextSelection` e `GapCursor`
    in movingOutward) dell'hook capture-phase preesistente (priority 1100),
    quindi previene `tableEditing`. (c) Verify: nuovi casi in
    `verify-note-table-container-gap.mjs` (textBox sopra + tabella →
    GapCursor esattamente a `tablePos`; tabella + textBox sotto → dopo
    `tablePos + nodeSize`; paragrafo plain sotto → null; tabella ultima al
    doc → null). Misura CDP: `[p, archivio, tabella]` ↑ ora GapCursor@15
    (prima TextSelection a fine paragrafo), `[tabella, textBox]` ↓ ora
    GapCursor@20 (prima TextSelection dentro la TextBox), ↓ dal gap entra
    nella TextBox; controlli negativi invariati (paragrafo plain → caret nel
    paragrafo; archivio al doc-start invariato). Harness 219 righe
    postfix5→postfix7 = 0 diff; `dbg-arrows` A/B/C/D/E invariati;
    `npm run check` verde (EXIT 0). Punti 19-22 NON sono ancora committati.

23. `fix:` **Matrice di controllo generale cursore/gap (M1-M5) + due fix
    reali emersi** (task 2026-10-02: distinguere bug veri da asimmetrie
    documentate su tutti gli elementi). (a) Harness CDP
    `%TEMP%\opencode\dbg-matrix.mjs` (mode `full`/`probe`/`probe2`):
    oracle unico `GapCursor.valid` (già l'oracle del sito via
    `isValidNoteTableGapCursor`) + eccezioni note E1-E4 (p→riga in basso,
    riga→p in alto con meta `blockRowNudge`, riga→riga); 16 elementi ×
    16 in coppie: M1 frecce su/giù ai 4 bordi, M2 confini doc, M3 click e
    bordi interni della riga, M4 celle tabella (5 varianti + riga doppia),
    M5 click sul gap esterna. Wrapper `P` resiliente (retry+reinstall su
    race), guardie null con SKIP esplicito, `clickAt` azzera
    `view.input.lastClick` (PM rileva doppio-click a <500ms e azzera il
    plugin `handleClick`: artefatto da 2 click ravvicinati, non bug).
    (b) **Bug reale 1 - gap interna in testa riga verso non-paragrafo**:
    `moveOutOfRowVertical` (dir<0, prev non paragrafo) ritorna false → il
    gapcursor standard creava GapCursor a `rowPos+1` (margine interno
    vietato dalle regole) e `onTransaction` non poteva uscire
    (`exitRowTo` vuole un paragrafo adiacente). Fix in
    `tiptapBlockRow.ts::onTransaction`, ramo isHead/isTail: se
    `exitRowTo` fallisce e la selection è GapCursor → GapCursor sul
    confine ESTERNO (`rowPos`/`rowPos+row.nodeSize`) se `GapCursor.valid`
    lo ammette, altrimenti `Selection.near` nel testo del blocco adiacente;
    meta `blockRowNudge`. (c) **Bug reale 2 - Punti bloccavano la freccia
    su**: `Decoration.widget(side:0)` degli inlinePoints precede il testo
    nel DOM → `view.endOfTextblock('up')` (DOM-based) torna false anche a
    inizio paragrafo → `enterAdjacentRowVertical` non partiva mai (0
    dispatch riprovato con dispatch-stack; il dado reale idem, il fixture
    con ZW non decorato lo nascondeva). Fix: fallback doc-based
    (`textBetween(start,pos)` vuoto = bordo effettivo), OR-combinato con
    il vecchio check. (d) **Classificazioni - NON bug**: `edge=true`
    (`rowEdgeExitTarget`) è la condizione interna voluta per l'uscita
    nudge, non violazione (harness: nota, mai FAIL); click su div box →
    `BlockClickSelect` NodeSelection (comportamento voluto, INFO);
    click ravvicinato → doppio-click PM (harness); riga `pEmpty,pEmpty`
    srotolata in paragrafo dalla regola "riga vuota" (SKIP); PLACE-FAIL su
    hr/image/arch senza testo (strutturale). (e) Misure: run finale
    1588 casi → **0 FAIL, 0 OBS** (M1 832 pass, M3 245, M4 30/30 incluso
    S4 dopo fix `forEach` harness che leggeva l'offset come indice riga,
    M5 157 + 99 INFO tutte artefatti di geometria/box); cluster `X,row:up`
    e `row,ptsP:up` ora PASS; harness postfix7→postfix8 = 0 diff (nessuna
    regressione); `npm run check` verde (EXIT 0, anche
    `verify-note-row-extremes` aggiornato al codice ristrutturato: regex
    isHead/isTail + eccezione `onTransaction` per il `new GapCursor(`
    del fix (b)). Punti 19-23 NON sono ancora committati.

24. `fix:` **Feedback utente: "+" laterale solo Blocchi + menu "/" ingrandito**
    (2026-10-02: nei menù "+" appariva anche Testo; il menu "/" tagliava
    l'ultima riga di icone). (a) `NoteRowGutter.tsx`: `menuGroups` ora
    sempre `['block']` per tutti e 3 i "+" (riga, box standalone, widget
    bordo) — Testo resta solo al menu "/". (b) `NoteSlashMenu.tsx`: stima
    `placeFloatingNoteUI(coords, 248, Math.min(640, innerHeight*0.85), 8)`
    + `max-h-[min(85vh,640px)]` (prima 420px/70vh → ultima riga fuori).
    (c) Harness CDP 4 fasi (`dbg-guttermenu.mjs`, typing reale slash via
    `Input.dispatchKeyEvent`): A/B/C → 1 sezione "Blocchi" 14 voci;
    D → 2 sezioni (Testo+Blocchi) 25 voci, `truncated:false`,
    `lastItemVisible:true`, `maxH 640px` → **4/4 PASS**. (d) Diagnosi
    FASE D (menu "/" che non si apriva in harness): doppia istanza del
    modulo `tiptapNoteSlashMenu` — vite aveva trasformato l'import
    relativo del componente con `?t=<timestamp>` stale mentre l'import
    diretto dell'harness era senza query → due `PluginKey`
    (`noteSlashMenu$1` vs `noteSlashMenu$`) e slot diversi; artefatto
    dell'harness (nell'app un solo grafo), risolto scoprendo l'URL reale
    dal resource timing e usando quello per `sme`/`smo`. Rimossi tutti i
    TEMP-DEBUG/trace da `NoteSlashMenu.tsx`. `npm run check` verde
    (EXIT 0), mojibake 0. Punti 19-24 NON sono ancora committati.

25. `fix:` **Riga Punti+TextBox: spazio morto dopo una modifica ai Punti**
    (2026-10-02, feedback utente con screenshot: rimuovendo il massimo dal
    menu Punti il box si restringe ma la TextBox accanto resta ferma e nel
    mezzo resta vuoto). (a) Diagnosi via harness CDP
    `%TEMP%\opencode\dbg-pointsrow.mjs` (4 misure: inserimento →
    `maxEnabled:false` → cambio value → resize): la riga è
    `row > p(flex frame, :has data-points-fills) > span[data-inline-points]
    (mark span del renderHTML, figlio flex del p) > widget(width:100%)`.
    Al rebuild del widget (la key della decoration include max/maxEnabled →
    nuovo elemento) lo span mark si ricolloca come flex item con
    `flex:0 1 auto` e si rimpicciolisce al contenuto (455→234px): il frame
    `p` resta pieno ma dentro resta vuoto → gap 225px fra Punti e TextBox;
    `measureLine` non corregge perche' `getWidgetLineContainer` si ferma allo
    span (display:block) e la sua "fine riga" e' gia' lo span ristretto
    (auto-consistente). (b) Fix CSS in `theme.css`: nuova regola
    `.tiptap-row > p:has(...[data-points-fills]) > span[data-inline-points]
    { flex: 1 1 0; }` — il mark span riempie il frame in tutti gli stati.
    (c) Verifica: harness 4/4 stati con `gapWrapToBox:4` (solo il gap di
    riga standard) e `deadRight:0`; altezze invariare (105/105/105);
    `npm run check` verde (EXIT 0), mojibake 0. Punti 19-25 NON sono ancora
    committati.

26. `fix:` **Feedback utente: caret verticale fra due righe + altezza Dado pari
    al vicino** (2026-10-03, screenshot: riga [Punti+TextBox] sopra riga
    [Dado+TextBox]). (a) Cursore fra righe: `moveOutOfRowVertical` (su da
    inizio riga, figlio precedente = altra riga) atterrava con `Selection.near`
    dentro la riga sopra (coda dell'ultimo elemento) — nessun cursore visibile
    nel gap; la spec di `.repro/driver.ts` ("Scenario utente: Up da inizio
    riga 2 → caret tra le righe, X digitata resta li'") non era implementata.
    Fix in `tiptapBlockRow.ts`: nuovo ramo nel keydown — GapCursor sul
    confine (`GapCursor.valid(rowPos)`, stessa posizione gia' usata sopra la
    prima riga) quando su sale da inizio riga con un'altra riga sopra, piu'
    ramo che muove una GapCursor fra due righe su/gi' con meta
    `blockRowNudge` (senza la meta la regola margine risbatterebbe il caret
    in testa alla riga sotto e si entrerebbe in un loop gap<->testa a ogni
    pressione); il ramo intercetta SOLO gap fra due `blockRow`, tabelle e
    confini doc restano al default. Verifica harness CDP
    `%TEMP%\opencode\dbg-rowcaret.mjs` (A righe plain / B Punti+Dado): su da
    inizio riga2 → GapCursor sul confine (widget `.ProseMirror-gapcursor`
    nel gap, y fra le righe), X digitata li' → paragrafo top-level fra le
    righe (`[row, paragraph:X, row, p']`), su da figlio2 idem, giu' da fine
    riga1 → testa riga2 invariato, sequenza su ripetuti riga2 → gap → coda
    riga1 (nudge, nessun rimbalzo) → fermo; il click nel gap resta
    NodeSelection sulla riga (invariato). (b) Altezza Dado: `theme.css`
    nuove regole `.tiptap-row > p:has(.tiptap-inline-dice-widget) {
    align-self: stretch; }` + `... .tiptap-inline-dice-widget { height: 100%
    }` — il Dado riempie l'altezza della riga (pari alla TextBox accanto)
    restando a larghezza contenuto (hug, invariata). Harness
    `%TEMP%\opencode\dbg-diceheight.mjs`: box wrappata 88px → Dado 88px
    (delta 0), riga sola naturale 41=41, Dado+testo invariato, larghezza
    64px ovunque; Punti invariati. (c) `npm run check` verde (EXIT 0),
    mojibake 0. Punti 19-26 NON sono ancora committati.

27. `fix:` **Feedback utente: il Collapse si crea su una seconda riga quando lo
    si inserisce dopo l'elemento Dado** (2026-10-03). Il Dado finisce in un
    paragrafo di PRIMO LIVELLO (riga con un solo paragrafo che viene srotolata
    dal cleanup, oppure Dado digitato in una nota fresca): lì
    `setCollapseBlock` usava solo `commands.insertContent`, che il Collapse lo
    pone come blocco separato SOTTO il paragrafo (e a inizio testo SOPRA) —
    stessa sintassi che `setTextBox` ha appena risolto con l'affiancamento.
    Fix in `tiptapBlocks.tsx`: branch speculare a `setTextBox` — caret in
    collasso, paragrafo con testo, `depth === 1` → `addBlockToRow({
    kind: 'collapseBlock', side })` (lato dal caret: a inizio a sinistra,
    altrimenti a destra) che wrappa paragrafo + Collapse in una riga
    affiancata, caret gia' nel sommario. Solo primo livello: IN RIGA
    l'insertContent si comporta gia' bene (harness: il Collapse nasce figlio
    subito dopo il Dado, stessa riga visiva) e non va cambiato; paragrafi
    vuoti (linea fresca col "/") restano sul vecchio inserimento. Verifica
    harness `%TEMP%\opencode\dbg-collapse.mjs` (E = Dado top-level / in riga,
    G = casi limite): post-fix Dado top-level con caret a fine/inizio → riga
    [Dado, Collapse]/[Collapse, Dado] affiancati sulla stessa riga visiva
    (rettangoli con stesso `top`), caret nel sommario; in riga (caret dopo
    Dado, in TextBox, a inizio Dado) e linea fresca vuota invariati. Nota:
    emerso anche errore TS2451 (`const $from` doppio nel comando, che faceva
    tornare 500 il transform di vite) — rinominato `$at`. `npm run check`
    verde (EXIT 0), mojibake 0. Punti 19-27 NON sono ancora committati.

28. `fix:` **Feedback utente: il Dado non era allineato d'altezza al Collapse
    (e non deve allinearsi quando il Collapse è aperto)** (2026-10-03). Due
    difetti in theme.css, entrambi misurati sull'harness: (a) a collapse
    CHIUSO il box visivo `.tiptap-collapse` risultava 8px più corto del Dado
    affiancato — il figlio diretto della riga è il wrapper React del node
    view (`.react-renderer.node-collapseBlock`), quindi la regola
    `.tiptap-row > * { margin-bottom: 0 }` azzera il margine del WRAPPER ma
    non quello del blocco interno, che restava dentro il wrapper come 8px di
    spazio morto sotto il box; (b) a collapse APERTO il Dado si stirava per
    tutta l'altezza del corpo espanso, mentre il feedback chiede
    l'allineamento SOLO da chiuso. Fix in theme.css (dopo le regole Dado del
    punto 26): `.tiptap-row > .node-collapseBlock > .tiptap-collapse {
    margin-bottom: 0; height: 100%; box-sizing: border-box; }` (box pieno del
    wrapper in entrambi gli stati) e coppia di regole
    `:has(> .node-collapseBlock .tiptap-collapse[data-open='true'])` che
    riportano il paragrafo Dado a `align-self: center` + widget `height:
    auto` (misura naturale, centrato come il testo vicino agli altri box).
    Verifica con harness `%TEMP%\opencode\dbg-dicecollapse.mjs` — montaggio
    CORRETTO solo dopo aver montato l'editor con `<EditorContent>` React:
    con `new Editor` da solo `editor.contentComponent` resta assente e
    ReactNodeViewRenderer ritorna `{}` (il Collapse cade sul renderHTML
    statico senza classe/padding/freccia, geometria NON rappresentativa —
    le prime misure ingannevoli mostravano "tutto allineato"). Numeriche
    post-fix: chiuso Dado 41 = Collapse 41 (delta 0, era 48 vs 40), aperto
    Dado 41 naturale centrato vs Collapse 68 (delta -27, era stirato 76),
    riga con TextBox invariata 41/41, toggle chiuso↔aperto reversibile.
    Screenshot `%TEMP%\opencode\dicecollapse.png`. `npm run check` verde
    (EXIT 0), mojibake 0. Punti 19-28 NON sono ancora committati.

29. `fix:` **Feedback utente: la Collapse selezionata con il mouse non si
    cancellava con Canc, e il tasto evidenziava la freccia** (2026-10-03).
    Riprodotto con harness `%TEMP%\opencode\dbg-collapse-delete.mjs` (editor
    montato con `<EditorContent>` React, doc resettato per scenario, click e
    tasto reali via CDP): baseline — click sul bordo creava NodeSelection ma
    `activeElement` restava `BODY` (il `preventDefault` sul mousedown blocca
    il focus di default e ProseMirror non lo imposta da solo per i nodeview,
    quindi il Delete non arrivava mai all'editor), click sulla freccia dava
    `activeElement = BUTTON` (anello di focus sulla freccia, come nel
    report), stessa falla sulla TextBox. Fix in `tiptapBlocks.tsx`: (1)
    `CollapseBlockView.onMouseDown` → `editor.view.focus()` dopo il dispatch
    della NodeSelection; (2) `BlockClickSelect.mousedown` → `view.focus()`
    dopo `preventDefault` (TextBox); (3) toggle `onMouseDown` con
    `preventDefault` (nessun focus/anello, il click si genera comunque);
    (4) probe `%TEMP%\opencode\dbg-probe-toggle.mjs` (fasi separate
    mousedown/mouseup) ha mostrato che la selezione si rompeva nella fase
    CLICK: il click nativo di ProseMirror su `view.dom` (che gira prima
    dell'onClick React) risolveva il punto più vicino e infilava un caret nel
    sommario — da lì il Canc mangiava i caratteri del titolo invece di
    agire sul blocco; risolto nell'onClick del toggle con dispatch
    esplicito di NodeSelection + `editor.view.focus()` dopo
    `updateAttributes` (la freccia è un controllo del box: dopo il toggle il
    box resta selezionato). Verifica harness post-fix, tutti gli scenari
    verdi: bordo destro/sinistro, freccia, sequenza completa
    bordo→freccia→Canc e TextBox cancellano il blocco intero
    (`top: [paragraph, paragraph]`, focus su PM-DOM); click sul sommario
    (testo) invariato, cancella il carattere. Nota latente NON toccata:
    `noteTableResize.css` punta a `.tiptap-row > .tiptap-collapse` ma il
    figlio diretto della riga è il wrapper React
    (`.react-renderer.node-collapseBlock`), quindi quelle regole non
    matchano il collapse. `npm run check` verde (EXIT 0), mojibake 0.
    Punti 19-29 NON sono ancora committati.

30. `fix:` **Feedback utente: Invio nel titolo della Collapse creava una
    seconda box invece di andare nel corpo, e la creazione slash non
    lasciava il caret nel titolo** (2026-10-03). Riprodotto con harness
    `%TEMP%\opencode\dbg-collapse-enter.mjs` (editor React montato, doc
    resettato per scenario, keymap/selector reali, spy `view.dispatch` con
    stack + log transazioni via listener): due cause distinte.
    **Bug Invio**: i keymap tiptap sono costruiti sull'elenco estensioni
    INVERTITO (`sortExtensions([...extensions].reverse())` in `@tiptap/core`)
    → il keymap di BlockRow gira PRIMA di CollapseSummary e
    `splitBlockRowAtCaret` tagliava il `blockRow` in due box (la seconda
    senza sommario = contenuto invalido); stessa cosa a metà del corpo
    (Invio nel body → split della box in due). Fix A in
    `tiptapBlockRow.ts::splitBlockRowAtCaret`: guard in cima — se
    `from`/`to` cade in `collapseSummary` o `collapseBody` (ancestor walk)
    restituisce `false` e lascia il campo a CollapseSummary/default.
    **Bug caret slash**: due sovrapposizioni — (a) i rami di
    `applyBlockToRow` con riga esistente atterravano nel corpo via
    `caretIntoRowItem`/`Selection.near` backward (branche 1-2: 12/paragraph
    invece di 9/summary); (b) ~2-4ms dopo la dispatch il `readDOMChange`
    di ProseMirror-view (stack: `DOMObserver.observer → flush →
    handleDOMChange → readDOMChange`) spedisce una transazione SENZA step
    che riporta il caret alla posizione vecchia nel DOM (il nodeview React
    monta/rimonta in modo asincrono e la correzione DOM arriva dopo).
    Fix P1: `applyBlockToRow` ora posiziona il caret a `+2` (primo punto
    di testo in `collapseSummary`) per `kind==='collapseBlock'` in tutti e
    quattro i rami (insertIntoRow, row-children, row-target, standalone)
    tramite helper locale `placeRowCaret`; paragrafo/TextBox invariati.
    Fix P2: `reassertCollapseSelectionAfterRender(view, from)` (esportata
    da `tiptapBlockRow.ts`) — `queueMicrotask` (cattura il doc
    post-dispatch) + `requestAnimationFrame`, guard su `isDestroyed` ed
    identità del doc, dispatch solo se la selezione differisce (quindi
    idempotente): cablata nel comando `addBlockToRow` e nel percorso
    `insertContent` di `setCollapseBlock` (`tiptapBlocks.tsx`). Verifica
    harness post-fix, tutti gli scenari verdi: slash riga vuota/dopo testo/
    in riga → caret nel titolo dopo il revert (`tiptapBlockRow.ts` stack
    visibile nello spy), gutter standalone/riga/paragrafo → titolo, Invio
    nel titolo in riga → **una sola box, `open:true`, caret nel corpo**
    (riga intatta), standalone invariato, Invio in paragrafo di riga →
    riga divisa come prima (nessuna regressione), Invio nel corpo →
    a capo dentro lo stesso box. Regressione `dbg-collapse-delete.mjs`
    6/6 verdi. `npm run check` verde (EXIT 0), mojibake 0.
    Punti 19-30 NON sono ancora committati.


31. `fix:` **Frecce verticali fra tre Collapse su righe diverse: mancava
    il cursore intermedio** (2026-10-04). Riprodotto con editor React e
    tasti reali CDP in `%TEMP%\opencode\dbg-collapse-arrows.mjs`: Down
    saltava da titolo a titolo; Up poteva selezionare il corpo nascosto
    della Collapse chiusa. Stesso problema con Collapse dentro blockRow.
    In `tiptapBlockRow.ts`: uscita verticale della Collapse standalone
    verso il GapCursor esterno valido, attraversamento del gap fra
    Collapse/righe in entrambe le direzioni, atterraggio nel testo visibile
    (titolo se chiusa, corpo se aperta). Per la Collapse chiusa in riga il
    bordo si misura con `endOfTextblock`, senza contare il corpo nascosto;
    Down fra righe espone ora il gap come Up. Il verify row-extremes
    riconosce anche il nuovo gestore verticale Collapse autorizzato a
    creare GapCursor. Harness con assert PASS: tre Collapse chiuse,
    standalone e in righe, ciclo Down/Up con sosta visibile in entrambi i
    gap; scrittura nel gap crea un paragrafo e mantiene le tre Collapse;
    Collapse aperte: uscita dal corpo e rientro nel corpo visibile.
    `npm run check` PASS (typecheck, tutti i verify, build).
    Modifiche del punto 31 non ancora committate.

32. `fix:` **Caret lampeggiante a destra del Dado, sia intermedio sia
    ultimo in riga** (2026-10-04). Due screenshot utente: Collapse + Dado
    + TextBox, e Collapse + Dado finale. Riprodotto con harness React/CDP
    `%TEMP%\opencode\dbg-dice-right-caret.mjs`: nel primo caso il click
    creava un GapCursor della riga invece del caret nativo dopo il Dado;
    nel secondo `rowEdgeExitTarget` rispediva la selezione sotto la riga
    anche dopo ArrowRight. In `tiptapBlockRow.ts` il bordo destro del
    carattere Dado marcato finale e' ora esente dalla regola margine; il
    plugin dei gap di riga seleziona la fine del paragrafo Dado quando si
    clicca subito dopo, invece del gap strutturale. In `theme.css` il
    paragrafo con Dado finale riserva il gap standard a destra come area
    cliccabile dentro il contentDOM. Harness con assert PASS in entrambe
    le configurazioni: click destro, ArrowRight e selezione esplicita
    restano dopo il Dado; coordinate del caret nativo coincidenti con il
    bordo destro del widget; scrittura sul lato destro resta nella riga
    e mantiene un solo Dado. Esteso `verify-note-row-extremes.mjs` per
    distinguere Dado finale e testo normale dopo un Dado.
    `npm run check` PASS (typecheck, verify, build).
    Punti 31-32 non ancora committati.

33. `fix:` **Follow-up Dado: caret a destra ancora invisibile e Backspace
    bloccato sul testo dopo un Dado finale** (2026-10-04). Il punto 32
    verificava la posizione della selezione, ma non la linea effettivamente
    disegnata dal browser. In `tiptapInlineDice.ts` aggiunto un caret
    decorato a larghezza zero subito dopo il Dado (solo TextSelection
    collassata), con linea di 2px, colore accent e lampeggio CSS in
    `theme.css`; il caret nativo viene nascosto solo in quella posizione.
    Il click dopo un Dado finale usa anche il bordo reale del widget e il
    gap finale della riga puo' selezionare il suo punto di testo destro.
    Backspace riprodotto con tasti CDP: dopo la scrittura, transazioni di
    sola selezione innescavano la regola margine e rispedivano il caret
    sotto la riga, impedendo la cancellazione. `rowEdgeExitTarget` ora
    mantiene editabile anche il testo nello slot finale contenente il
    Dado, non solo lo ZWSP finale. Aggiornato il relativo test funzionale.
    Harness `%TEMP%\opencode\dbg-dice-right-caret.mjs` PASS: caret
    decorato a destra, stile/colore/altezza/animazione verificati; click e
    ArrowRight; scrittura di "right" e cinque Backspace reali eliminano
    un carattere alla volta in entrambe le configurazioni; ulteriore
    Backspace conserva il Dado. Ispezionati gli screenshot
    `%TEMP%\opencode\dice-caret-middle.png` e `dice-caret-last.png`
    (sola fase del blink congelata per la cattura): linea visibile in
    entrambi. `npm run check` PASS (typecheck, verify, build).
    Punti 31-33 non ancora committati.

34. `fix:` **Caret sinistro del Dado troppo alto rispetto al destro**
    (2026-10-04). Esteso il caret decorato del punto 33 a entrambi i lati
    dello ZWSP Dado: stessa altezza 1.15em, spessore 2px, colore accent
    e lampeggio; il solo offset orizzontale cambia per stare fuori dal
    bordo sinistro/destro. Il click nel gap prima del Dado seleziona il
    suo punto di testo sinistro invece del GapCursor di riga; tale punto
    resta ammesso anche quando il Dado e' il primo figlio della riga.
    Harness CDP PASS nelle configurazioni Dado intermedio/finale:
    click sinistro/destro producono caret decorati della stessa altezza
    (20.696px con font 18px), ArrowRight attraversa il Dado, scrittura e
    cinque Backspace cancellano il testo e conservano il Dado.
    Screenshot del lato sinistro ispezionato in
    `%TEMP%\opencode\dice-caret-left-last.png` (blink congelato per la
    cattura). `npm run check` PASS. Punti 31-34 non ancora committati.

35. `fix:` **Regola universale delle frecce: stesso percorso completo con
    Down/Right e Up/Left, senza saltare lettere, spazi, elementi o righe**
    (2026-10-04). Censiti i gestori separati di BlockRow, gapcursor e
    tabella: creavano percorsi diversi, con uscita al bordo visuale o
    atterraggio diretto nel vicino. Nuova estensione
    `noteCaretNavigation.ts::NoteCaretNavigation`, registrata in
    `TIPTAP_BLOCK_EXTENSIONS` con priority 2000: percorso ordinato unico
    nel documento, tutti i punti testo (grapheme Unicode interi), limiti
    degli elementi inline e gap strutturali raggiungibili. Down e Right
    avanzano di un punto, Up e Left arretrano di un punto, anche nel testo.
    I corpi delle Collapse chiuse sono esclusi; i corpi aperti, tutti i
    paragrafi, liste e celle di tabella si attraversano senza salti.
    Gli atomi senza testo PM espongono i confini esterni; Archivio resta
    non selezionabile e i suoi campi hanno il proprio focus. Capture prima
    dei gestori storici, meta blockRowNudge per evitare deviazioni della
    regola margine, nessun wrap agli estremi. Menù slash, input, pulsanti,
    composizione IME e combinazioni con modificatori conservano i propri
    eventi; anche il capture della tabella rispetta input/menu.
    Cache del percorso per identità del doc, ricerca binaria del punto
    corrente. Gap fra box in riga posizionato sul confine reale fra i
    rettangoli DOM, con linea verticale di altezza testo e colore accent.
    Nuovo `scripts/verify-note-caret-navigation.mjs` incluso dal verify
    row-extremes e quindi in `npm run check`: PASS su percorso misto di
    147 punti, andata/ritorno, Unicode, corpi nascosti, tabelle e atomi.
    Harness `%TEMP%\opencode\dbg-universal-note-arrows.mjs`: 440 tasti
    reali CDP, 8 configurazioni PASS (testo, Collapse chiuse/aperte, righe,
    tutti gli inline, liste, tabelle, confini Archivio/HR). Per Archivio
    solo nodeview minimale nel browser harness: quello React necessita
    dei provider app; schema reale e test funzionale dei confini invariati.
    Input Punti e menu slash ricevono le proprie frecce. Regressione Dado
    PASS: caret dei due lati, scrittura/Backspace e protezione dell'elemento;
    geometria gap fra box verificata (x 586 coincide col centro del gap,
    altezza 20.696px, linea 2px con font 18px). `npm run check` PASS.
    Punti 31-35 non ancora committati.

36. `fix:` **Lancio 3D mediamente vigoroso: alzata la forza minima dei
    tiri deboli** (2026-10-04). In `dice3dMotion.ts`, calibrazione gia'
    applicata ai vettori del renderer: velocita' orizzontale minima da
    1.3 a 2.0 volte il lato corto del viewport (+54%), rotazione minima
    da 8 a 10 (+25%). Massimi 3.1/15 e strength generale 1.6 invariati,
    cosi' la variazione casuale resta nei tiri gia' vigorosi. Il clamp
    alza solo i vettori sotto soglia mantenendo direzione, asse e velocita'
    verticale; non introduce un nuovo sorteggio. Esteso il verify 3D con
    tiri prima deboli e vettori diversi gia' entro la fascia: nuove soglie
    rispettate, variazioni conservate, limiti superiori invariati.
    `npm run check` PASS (typecheck, verify, build).
    Punti 31-36 non ancora committati.

39. `fix:` **Stati visivi checkbox Archivio: opacità progressiva e simboli
    asterisco/bandiera rifiniti** (2026-10-05). Tre livelli: vuota 0.4,
    mezzo 0.75, piena 1.0 — il simbolo pieno mantiene la luminosità
    originale della palette. Mezzo asterisco ora **+**, pieno `*`; bandiera
    mezzi stati con contorno (vuoto) e riempimento (piena), come i simboli
    geometrici. CSS `tiptap-archivio-checkbox[data-checkbox-state]` con
    `opacity` e transizione su `--note-ui-duration`. Anteprima pannello
    aggiornata con attributi `data-checkbox-state` su ogni stadio.
    `npm run check` PASS.

40. `refactor:` **Quantità checkbox Archivio spostata nel menu a tre puntini**
    (2026-10-05). Lo stepper per il numero di checkbox (1–50) è stato
    rimosso dal pannello Modifica e inserito direttamente nel menu a tre
    puntini della cella, sopra la voce "Modifica". Così l'utente varia
    rapidamente la quantità senza aprire il pannello; il pannello Modifica
    resta per simboli, Mezzo valore e anteprima. `DiceNumericStepper`
    condiviso, limiti 1–50, aggiornamento immediato via `updateCell`.
    `npm run check` PASS.

#### Indice icone senza standard (per round futuri — censimento statico, verificare a mano i contesti "in pulsante")
**A. Già coperte dalla regola globale**: Plus, Save, X, Edit2/Pencil
(`lucide-pen`/`lucide-pencil`), Trash2, ChevronDown/Up/Left/Right,
ArrowDown/Up/Left/Right, Archive, RotateCcw, Eye/EyeOff, Copy/CopyPlus
(round 1), **MoreVertical/MoreHorizontal (round 2, `lucide-ellipsis-*`),
Sparkles, UserPlus/UserMinus**.

**B. Candidate per nuovi keyframes (icone-azione, priorità per occorrenze)**:
`Loader2` 24 (esclusa: spin di caricamento, non hover),
`Search` 8 → lente che fa zoom (6 usi in input decorativi,2 in menu),
`Dices` 6 → dadi che rimbalzano, `Play` 6 → slancio avanti (riuso
locationArrowPulse; diversi usi decorativi), `FolderPlus` 6, `KeyRound` 6,
`Shapes` 4 → trasformazione, `Palette` 3 → oscillazione,
`Undo2`+`RefreshCw` 6 → ritorno/refresh, `Upload`+`FileDown` 2 →
salita/discesa.

**C. Da valutare caso per caso** (spesso stato/decorative, non sempre in
pulsante): `AlertTriangle` 9, `MapPin` 9, `Swords` 8, `CheckCircle` 8,
`Skull` 7, `User` 6, `BookOpen` 6, `Ghost` 5, `Shield` 5, `Users` 5,
`Package` 5, `Heart` 4, `AlertCircle` 4, `Lock` 4, `Brain` 4, `Check` 4,
`Star` 2, `Zap` 2, `Bookmark` 2, `DoorOpen` 3, `FileText` 3, `UserCog` 3 e
le ~40 restanti a singola occorrenza (Bell, LogOut, Settings, Bug,
Newspaper, Lightbulb, Globe, Upload, Command...).

**D. Esclusa**: `Loader2` (animato da `animate-spin` durante il caricamento);
icone interne componenti UI (CheckIcon/CircleIcon/Chevron*Icon Radix e i
componenti wrapper `Icon`/`DropdownMenuItem`/`DialogHeader`).

### Regola universale: cursore simbolo di divieto su tutti i disabilitati + menù dado Custom in palette (2026-09-28)
Request dell'utente: (1) nel menù del dado Custom nella libreria dadi le voci
evidenziate non combaciavano con l'etichetta del dado; (2) ogni pulsante non
selezionabile del sito deve mostrare, oltre agli effetti grafici, il cursore
simbolo di divieto - regola fondamentale su TUTTI i pulsanti.
1. `fix:` `SavedCustomDieCard.tsx` — voci del menù ⋮ con la palette della
   libreria (`focus:bg-[var(--dash-surface-2)] focus:text-[var(--dash-text-strong)]`,
   separatore `bg-[var(--dash-border)]`, Elimina con focus rosso): prima
   ereditavano i token fissi shadcn `--accent`/`--border` (grigio non
   palette-aware) — unica card della libreria anomala rispetto a
   SavedDiceFormulaCard/DiceFormulaFolderRow.
2. `fix:` `theme.css` — regola universale `button:disabled, input:disabled,
   select:disabled, textarea:disabled, [aria-disabled='true'] { cursor:
   not-allowed !important; }`: batte cursor-pointer ereditato dalle card e
   gli inline `style={{cursor:'pointer'}}`; le eccezioni `cursor-wait`
   (attesa) usano la variante Tailwind v4 `disabled:cursor-wait!` (3 file).
3. `fix:` `ui/button.tsx` — rimosso `disabled:pointer-events-none` (il
   disabled era non colpibile e il cursore ereditato dal genitore): ora
   `disabled:cursor-not-allowed` dichiarato.
4. `test:` nuovo `scripts/verify-disabled-cursor.mjs` (regola globale,
   Tira/Salva con disabled nativo, button.tsx, eccezioni wait con `!`)
   iscritto in `check` (`verify:disabled-cursor`); `verify-saved-dice-menu-layer`
   estesa a SavedCustomDieCard (3 voci con className + separatore palette);
   `npm run check` verde (typecheck + 61 verify + build).
5. Verifica live CDP `disabled-cursor-test.mjs` **8/8 PASS**: not-allowed su
   button in card manina, button con inline pointer, input/select/textarea,
   aria-disabled; abilitato senza regresso; eccezione `wait` preservata.
6. `fix:` "Svuota" (`SessionDicePanel`) diventa come gli altri due:
   `disabled={items.length===0&&editingId===null&&name===DEFAULT_FORMULA_NAME}`
   (niente da cancellare = builder gia' alle condizioni iniziali) con lo
   stesso `disabled:opacity-40` di Tira/Salva formula; asserzioni in
   `verify-disabled-cursor`, `npm run check` verde.

### Blocco Archivio più compatto in altezza (2026-09-28)
Request dell'utente: il blocco Archivio era troppo alto/ingombrante (larghezza
ok, dimensione del dado ok) - tanto spazio vuoto per poche righe.
1. `fix:` `ArchivioView.tsx` — solo altezza, larghezza invariata: header
   `py-[var(--note-block-padding-y)]` → `py-1` (40→32px), th/td
   `py-[var(--note-cell-padding-y)]` → `py-1` (px resta la variabile
   standard), wrapper scroll `pb-2` → `pb-1`, pulsante cella Dado
   `min-h-8 py-1` → `min-h-7 py-0.5` (con il dado mini 24px il min-h-8 non
   serviva più).
2. `test:` verify aggiornate ai contratti compatti: `verify-note-element-standards`
   (header/celle Archivio con `py-1` + px standard) e `verify-note-archivio`
   (`min-h-7`); `npm run check` verde.
3. Misura live CDP (`archivio-height-measure.mjs`, 1 riga): blocco
   **124.6px → 99px (-21%)** — header 40→32, thead 29.3→24.5, riga
   45.3→36.5, pb 8→4; con N righe il risparmio è ~9.5px per riga.
   Screenshot dopo: `archivio-after.png`.

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
5. `fix:` rifinitura (2026-09-28): 32px risultava troppo grande → nuova size
   `mini` in `CustomDieLibraryIcon` (shell `h-6 w-6`, glifo `h-4 w-4`, d100
   `h-3 w-3`, fallback `text-[8px]`, img `p-0.5`) e cella Archivio passata a
   `size="mini"` + numero `text-2xl` (24px); verify aggiornate, live CDP
   **4/4 PASS** (`font-size=24px`, shell `h=24px`, center-Y `29`), `npm run
   check` verde.

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

37. `feat:` **Checkbox Archivio: inserimento standard a sinistra con menu
    di trasformazione** (2026-10-04). `defaultArchivioCell('checkbox')` ora
    restituisce la cella base senza convertire in testo; la cella viene
    disegnata come `<input type="checkbox">` nativo allineato a sinistra,
    con `appearance:none` e bordo/spunta identici alla checkbox inline della
    nota. Sostituisce il contenuto precedente della cella. Menu a cinque voci
    (icone Lucide): **Modifica** (disabilitata, pannello da definire),
    **Trasforma in Testo**, **Trasforma in Dado**, **Trasforma in Punti**,
    **Trasforma in Modificatore**; ogni trasforma chiama
    `defaultArchivioCell(kind)` cancellando i campi specifici (valore,
    massimale, quantita', snapshot custom). Click e **Spazio** su checkbox
    con focus commutano lo stato; persistenza dopo `setContent`. Verifica
    Archivio PASS (include le etichette aggiornate con maiuscola). Harness
    `%TEMP%\opencode\dbg-archivio-checkbox.mjs` PASS: allineamento a
    sinistra, geometria 16×16, cinque voci esatte con icone, Modifica
    disabilitata, click/Spazio toggle, quattro trasformazioni cicliche,
    persistenza e cella vicina invariata. `npm run check` PASS (typecheck,
    verify, build).
    Punti 31-37 non ancora committati.

38. `feat:` **Modifica Checkbox Archivio: quantità 1–50, simboli e Mezzo
    valore** (2026-10-05). Voce Modifica attiva: pannello tematizzato nel
    PortalContainer della dashboard, posizionato con le dimensioni reali,
    trascinabile come il pannello Dado, con Salva/Annulla, Escape e click
    fuori. Stepper condiviso DiceNumericStepper (minus/input centrale/plus),
    minimo 1 massimo 50. Catalogo di 12 simboli: X, Spunta, Cerchio,
    Triangolo, Quadrato, Rombo, Stella, Cuore, Più, Asterisco, Bandiera e
    Fulmine; SVG e anteprima condivisi fra pannello e casella. Opzione
    Mezzo valore: ogni casella ha stato indipendente 0/1/2 (vuota/mezzo/piena)
    e ciclo 0→1→2→0; senza opzione 0→2→0. X intermedia '/', geometrie
    e cuore/fulmine a contorno poi pieni, spunta e asterisco parziali,
    plus prima trattino, bandiera prima asta. Anteprima visiva del ciclo.
    Nuovo modello puro `archivioCheckbox.ts`: normalizzazione bounded,
    migrazione delle vecchie checkbox checked, array stati indipendenti,
    quantità crescente aggiunge caselle vuote e decrescente conserva il
    prefisso. Disattivando Mezzo valore, stati intermedi diventano pieni.
    `ArchivioCell` persiste configurazione e stati; sorting/copia testo
    riconoscono i mezzi. Cella allineata a sinistra con wrap fino a 50
    caselle, role checkbox/aria-checked mixed e attivazione da tastiera.
    Nuova riga conserva quantità/simbolo/opzione della riga di riferimento
    ma azzera tutte le marcature. Test funzionale
    `scripts/verify-archivio-checkbox.mts` agganciato a verify:note-archivio.
    Harness con editor e provider React reali:
    `%TEMP%\opencode\dbg-archivio-checkbox-edit.mjs` PASS su limiti,
    12 cicli con SVG intermedi diversi, 9 palette (endpoint colore con
    transition disabilitata nel solo harness), persistenza, resizing,
    binario, Salva/Annulla/Escape/click fuori e viewport. Test capacità
    `dbg-checkbox-capacity.mjs` PASS: 50 caselle dentro la cella, toggle
    dell'ultima e nuova riga con configurazione copiata e stati vuoti.
    Screenshot pannello ispezionato: `archivio-checkbox-edit.png`.
    `npm run check` PASS (typecheck, tutti i verify, build).
    Punto 38 non ancora committato.

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

41. `feat:` **Punti Archivio: riquadro unico con +/- integrati e toggle Massimo** (2026-10-05). Creando o convertendo una cella Punti dentro l'Archivio, compare un solo riquadro con valore iniziale 0, pulsanti −/⁺ ai lati (stile identico all'elemento Punti standalone), senza titolo né barra di progresso. Il menu della cella ha due voci principali: **Abilita/Disabilita Massimo** (attiva/disattiva il campo massimo e la barra) e le solite trasformazioni in Testo/Dado/Checkbox/Modificatore. Niente voce Modifica, niente pannello secondario. Aggiunto campo `maxEnabled` su `ArchivioCell` e normalizzazione. `npm run check` PASS.

42. `fix:` **Input Punti Archivio: niente spinner nativi e larghezza fluida** (2026-10-05). Nelle celle Punti dentro l'Archivio i campi numerici (valore e massimo) non mostrano più gli spinner nativi del browser (`appearance:none`, `-moz-appearance:textfield`, webkit spinner hidden). Le due caselle ora usano `flex-1 min-w-0` invece di larghezza fissa: si espandono per occupare tutto lo spazio disponibile tra i pulsanti −/⁺, sia quando c'è solo il valore sia quando c'è anche il massimo. `npm run check` PASS.

43. `fix:` **Punti Archivio: tre puntini fuori dalla casella, numero centrato** (2026-10-05). I tre puntini del menu sono ora posizionati **fuori dalla casella di testo**, all'estrema destra della cella (`absolute right-[0.5rem]`), senza sovrapporsi al pulsante +. Il numero dentro la casella di testo ora è **perfettamente centrato** (rimosso `pr-[1.65em]` asimmetrico). Il gruppo flex interno usa `justify-center` per allineare il contenuto. `npm run check` PASS.

44. `fix:` **Punti Archivio: pulsante + ripristinato, menu fuori dalla casella** (2026-10-05). Ripristinato il pulsante `+` a destra del campo valore. Il menu a tre puntini ora usa `right-[0.5rem]` posizionato rispetto alla cella (contenitore `relative`), posizionato **fuori dalla casella di testo** a destra del pulsante `+`. Il numero è centrato grazie a `text-center` e padding simmetrico. `npm run check` PASS.

45. `feat:` **Punti Archivio: struttura completa con due gruppi −/+ separati** (2026-10-05). Struttura finale come richiesto:
   - Con massimo: `[−] [ valore ] [ + ] [ / ] [−] [ max ] [ + ] [ ⋮ ]`
   - Senza massimo: `[−] [ valore ] [ + ] [ ⋮ ]`
   Il menu a tre puntini è **fuori dalla casella di testo**, posizionato `absolute right-[0.5rem]` rispetto alla cella. Il pulsante `+` del valore è sempre presente. Il gruppo max ha i propri pulsanti `−/+` quando abilitato. Numero centrato grazie a `text-center` e padding simmetrico. `npm run check` PASS.

46. `fix:` **Punti Archivio: overflow su colonna fissa + menu ⋮ mai aperto** (2026-10-05). Due bug reali trovati con harness CDP che monta l'editor:
   - **Overflow**: la tabella Archivio usa `table-layout:fixed`, ma i gruppi `[−][input][+]` della cella Punti non avevano `min-w-0`: il `min-width:auto` (basato sull'intrinseco ~170px dell'input `type=number`) impediva la compressione, quindi contenuto e ⋮ (assoluto) sforavano nella colonna Danno adiacente. Fix: `min-w-0` su entrambi i gruppi e sui wrapper, pulsanti `−/+` con `shrink-0`, gap ridotti a `gap-0.5`, pulsanti `w-3.5`, input `px-0.5` (compatto anche a 130px di colonna).
   - **Menu mai renderizzato**: il branch `cell.kind === 'points'` in `ArchivioView` montava il trigger ⋮ ma **non** il `<MenuPortal>` con `transformItems` — il menu non appariva mai. Fix: trigger spostato nel branch td (in flusso, `HOVER_DOTS_INLINE`, fuori dalle caselle) + `MenuPortal` aggiunto, come per le altre celle.
   - Coerenza: la voce "Disabilita/Abilita Massimo" ora chiude il menu dopo la selezione (`closeMenu()`), come le altre voci azione; lo stepper checkbox resta aperto (multi-azione).
   - Harness `dbg-points-cell.mjs` (CDP, headless Chrome): PASS — nessun overflow a 130/160/360px, numeri centrati, struttura esatta `[− val + / − max + ⋮]` e `[− val + ⋮]`, ⋮ fuori dalle caselle, menu con toggle Massimo apre/chiude e roundtrip, hover che rivela −/+ e ⋮. Screenshot `points-cell.png`. `npm run check` PASS.

47. `feat:` **Punti Archivio: stepper condiviso `DiceNumericStepper` dentro la casella** (2026-10-05). Su scelta esplicita dell'utente, i due gruppi manuali `[−][input][+]` sono stati sostituiti dallo stepper condiviso del sito `DiceNumericStepper`: `+`/`−` stanno **dentro** la casella, agli lati del numero, stesso stile usato ovunque (menu checkbox, quantità, pannelli dadi). Con massimo: `[− 10 +] / [− 10 +] ⋮`; senza massimo: `[− 10 +] ⋮`; i tre puntini restano fuori dalle caselle ma dentro la cella (`HOVER_DOTS_INLINE` in flusso + `MenuPortal`). Fix di supporto:
   - Input dello stepper con `min-w-[3ch]` (prima `min-w-0`): in colonna stretta l'input (basis 0) collassava a larghezza 0 e **i numeri sparivano del tutto**; ora resta spazio minimo per le cifre anche a 130px (22.6px garantiti, larghezza piena 80.5px a 360px di colonna).
   - Contenuto cella con `justify-start`: l'eventuale overflow (colonne < ~130px) finisce verso destra, sotto i puntini (`z-[2]` vince), invece di sforare a sinistra nel bordo della cella.
   - Harness: fixture con somma colonne = 770px (larghezza disponibile della tabella nel fixture) per rendere i pixel renderizzati pari agli attributi — con `table-layout:fixed` e somma inferiore il browser dilata le colonne in proporzione; resize colonna via `setNodeMarkup` (il comando `updateAttributes` ritorna false se la selection è fuori dal nodo archivio); nuove assertion: td = 160/130/360 e larghezza cifre ≥ 20px. PASS: cifre visibili, struttura, menu con toggle Massimo, roundtrip, hover. Screenshot `points-cell.png`. `npm run check` PASS.

48. `fix:` **Punti Archivio: font 12px come le altre celle + puntini compatti** (2026-10-05). Feedback utente: i tre puntini occupavano troppo spazio e con il Massimo risultava tutto schiacciato; il font era più grande delle altre celle (che usano tutte `text-xs`). Fix:
   - Input degli stepper della cella Punti a **`text-xs` (12px)** via `[&_input]:text-xs` sul wrapper (gli altri usi dello stepper condiviso restano `text-sm`), padding orizzontale ridotto a `px-0.5` (`[&_input]:px-0.5`), slash `/` a `text-xs`.
   - Trigger puntini della cella Punti con `padding="p-0.5"` (nuovo prop opzionale `padding` su `TriggerButton`, default `p-1` invariato per tutti gli altri): 22px → 18px di larghezza.
   - Harness: assertion font = 12px e larghezza trigger ≤ 18.5px; soglia cifre aggiustata a ≥ 17px (min-w-[3ch] si ricalcola a ~19.4px con font 12). PASS a 160/130/360px. `npm run check` PASS.

49. `fix:` **Punti Archivio: stepper compatto h-7 con pulsanti w-7** (2026-10-05). Feedback utente: pulsanti `+`/`−` sproporzionati rispetto al numero centrale e caselle troppo alte. Fix (override solo sulla cella, lo stepper condiviso resta h-9/w-9 altrove):
   - `[&>div]:h-7`: i due riquadri ora sono **28px di altezza, identici al pulsante Dado della stessa riga** (`min-h-7`), la riga non è più plus alta delle altre.
   - `[&_button]:w-7`: pulsanti `−`/`+` a 28px (da 36): a 360px di colonna il numero centrale passa da ~84px a ~100px; in colonna stretta i pulsanti si comprimono comunque fino a 14px (icona).
   - Harness: nuove assertion altezza stepper = altezza dado (`stepper.h === diceH === 28`) e pulsanti ≤ 28.5px (160 e 360). PASS a 160/130/360px, screenshot conferma allineamento visivo con il dado. `npm run check` PASS.
50. `fix:` **Punti Archivio: pulsanti laterali ancora più compatti**. Pulsanti −/+ da 28 a 20px, icone da 14 a 12px; altezza 28px e font 12px mantenuti. Typecheck e harness browser PASS.

51. `feat:` **Modificatore nell'Archivio senza titolo e con pannello condiviso**. La cella mostra il valore centrato (font 12px, altezza minima 28px), con menu Modifica e Trasforma in Testo/Dado/Checkbox/Punti. Modifica usa direttamente `ModifierEditPanel`, lo stesso componente del Modificatore standalone: Valore, Formula, riferimenti, validazione, Salva/Annulla e trascinamento. Formula persistita negli attributi della cella, con valore delle celle precedenti preservato. Le celle senza titolo non diventano riferimenti nominati; possono usare i modificatori della nota. Formule anomale evidenziate, valori/formule con dadi collegati al tiro tramite il contesto dadi. Pannello identificato tramite ID della cella, chiusura con Escape/click esterno. Harness CDP PASS: migrazione, menu esatto, pannello condiviso, salvataggio/riapertura, riferimenti mancanti, Annulla/Escape. `npm run check` PASS completo.
52. `fix:` **Ingranaggio Modificatore Archivio e riga scrivibile dopo gli elementi**. Aggiunto Cog decorativo in basso a sinistra nella cella Modificatore, semitrasparente e dietro il valore. Riprodotta via CDP la sequenza Dado/Punti/Archivio/Modificatore della foto: il documento terminava con il paragrafo-widget (ZWSP), senza una riga vuota reale. Esteso `createBlockRowTrailingParagraphPlugin` ai paragrafi contenenti solo widget e ai blocchi finali; riparazione anche al montaggio/attivazione dell'editor per note già salvate, senza aggiungere un passo Annulla. Il paragrafo finale resta unico e viene ripristinato se cancellato. Test permanenti per tutti i tipi widget, idempotenza, cancellazione e paragrafi misti con testo. Harness browser PASS: riga iniziale, click mouse, frecce giù/su, scrittura, Invio, reload e ripristino della coda. Pannello Modificatore Archivio ancora PASS; `npm run check` PASS completo.
53. `test:` **Regressione di chiusura dell'editor Note** (2026-10-05). Inventariata la copertura precedente: diverse verifiche erano sul sorgente e gli harness browser vivevano solo in temp. Aggiunti fixture condivisi e runner permanenti nel progetto:
   - `verify-note-combination-matrix.mjs`: 18 tipi/casi, tutte le sequenze di 1/2/3 elementi (6.174 documenti), 170.716 passi del cursore avanti/indietro, 864 inserimenti laterali, JSON roundtrip, scrittura, Annulla/Ripristina, riga finale e preservazione dei contenuti. Integrato in `npm run check`.
   - `verify-notes.mjs`: esegue tutte le 29 suite delle note, incluse quelle preesistenti di Radio/hit area/Icone/Annulla non presenti in check.
   - `verify-notes-browser.mjs` + `note-browser-driver.mjs`: Chrome/CDP senza dipendenze aggiunte, Vite dedicato avviato/chiuso automaticamente. NodeView e componente `RichTextEditor` reali con provider; 1.076 layout a 1.100/360px, 41.104 passi dei quattro handler freccia, 36 scenari con eventi nativi mouse/frecce/digitazione/Invio, roundtrip e undo/redo. Archivio: 20 trasformazioni, 3 pannelli condivisi, 11 operazioni CRUD/conversione, Punti con/senza massimo a larghezze renderizzate 130/160/360px. Componente della pagina: attivazione da sola lettura, salvataggio controllato, checkbox/radio senza spostamento caret, menu slash e Modificatore normale a due larghezze.
   - Difetto concreto trovato: disabilitando Massimo nei Punti Archivio, il valore rimaneva limitato al massimo nascosto. Corretto clamp sia in update sia in normalizzazione; il valore senza massimo resta invariato dopo reload, riabilitando il massimo torna il limite. Export testo coerente senza `/max` quando disabilitato. Caso incluso nel runner browser.
   - Comando completo `npm run verify:notes-all` PASS; `npm run check` PASS completo. Ultimo report browser: `notes-regression-report.json` nella temp `opencode`. Copertura e limiti documentati in `docs/NOTE-REGRESSION.md`: editor chiuso con baseline verificata, roundtrip locale JSON/componente (non test remoto Supabase). Nessun blocco residuo rilevato nelle verifiche eseguite.
54. `feat:` **Chat: pannello strutturato con filtri e cronologia tiri** (2026-10-05). Nuovo `SessionChatPanel` ispirato al mockup: tab Tutti/Chat/Tiri/File con indicatore attivo, lista scorrevole con auto-scroll, card tiri che riusano `DiceRollHistoryCard` (avatar, nome, formula, totale, Ritira), campo messaggio in basso con placeholder e bottoni allega/immagine/emoji. Icona Chat nella rail di sessione ora abilitata (`enabled: true`). Typecheck PASS.
55. `fix:` **Chat: resize, avatar grande e invio messaggi** (2026-10-05). (1) Pannello Chat ridimensionabile come gli altri: nuovo `chatPanelWidth` con clamp 320–viewport, handle `data-chat-panel-resizer`, persistenza `hollowgate.chat.panel-width`, incluso in `resizablePanelOpen`. (2) Variant `chat` di `DiceRollHistoryCard`: avatar 40px (da 28px) con iniziale più grande. (3) Invio messaggi funzionante: `handleSend` aggiunge alla lista locale `messages` con avatar e nome da `useAuth`, bolle chat stile messaggistica, auto-scroll su nuovi messaggi. Typecheck PASS.
56. `feat:` **Chat: menu tre puntini con Pulisci chat** (2026-10-05). Bottone `MoreVertical` in fondo alla fila tab, menu dropdown con singola voce danger "Pulisci chat" (stile Elimina), dialog di conferma con avvertimento che cancellando la chat vengono eliminati anche gli allegati, azione `handleClearChat` che svuota messaggi locali e storico tiri. Typecheck PASS.
57. `feat:` **Chat: persistenza Supabase e rimozione Pulisci chat** (2026-10-05). La chat ora usa il database Supabase invece dello stato locale: nuova tabella `chat_messages` (migration `20261005195000_chat_messages.sql`, fix cast `auth.uid()::text` nella policy DELETE per errore `text = uuid`) con RLS per lettura/inserimento autenticati e cancellazione riservata all'autore o al GM. Nuovo service `chatService.ts` con `loadChatMessages`, `sendChatMessage`, `deleteChatMessage`. `SessionChatPanel` caricamento messaggi da DB all'apertura, invio asincrono con salvataggio, nuovi messaggi in coda (ordine `created_at` ascendente). Rimosso menu "Pulisci chat" e dialog di conferma: la chat non si cancella, i messaggi persistono. Typecheck PASS.
58. `feat:` **Chat: timeline unificata persistita — testi + tiri (+ allegati futuri)** (2026-10-05). La chat salva tutto, non solo i testi: migration `supabase/20261005220000_chat_messages_kind_payload.sql` aggiunge `kind text ('message'|'roll'|'attachment')` e `payload jsonb` più indice `(campaign_id, created_at)`. `chatService`: `ChatMessage.kind`/`roll`, `saveRollEntry(roll)` che upserta il tiro con `id = roll.id` e `ignoreDuplicates` (idempotente: ogni client che riceve il tiro via realtime o in locale può tentare l'insert, la riga nasce una sola volta); tiri `secret` non persistiti. `DiceSessionContext`: `ingestRoll` salva il tiro pubblico in chat, nuovo `rerollResult(previous)` (refactor di `reroll`) così funziona anche sui tiri ricaricati dal DB. `SessionChatPanel`: timeline unica ordinata per tempo (voci DB + merge dei tiri locali non ancora in DB, dedup per id), tab con filtro per `kind` (Chat = testi + tiri modifier, Tiri = tutti i tiri, File = vuoto in attesa allegati). Typecheck PASS.
59. `feat:` **Chat: menu ⋮ "Pulisci chat" ripristinato con cancellazione DB** (2026-10-05). Ritorno del menu tre puntini a fine tab row (voce danger "Pulisci chat" + dialog di conferma). Nuova `clearChatMessages(campaignId)` in `chatService`: delete delle righe della campagna limitato dalla RLS (GM cancella tutta la timeline, giocatore i propri); dopo la cancellazione la timeline viene ricaricata dal DB (mostra solo ciò che è stato realmente rimosso) e `clearLocalHistory` svuota i tiri locali di sessione, altrimenti il merge li ri-aggiungerebbe. Typecheck + `npm run check` verdi (fix preesistente: `verify-note-panel-resize` non contemplava Chat/Dadi in `resizablePanelOpen`).
60. `feat:` **Chat: pallino "nuovi messaggi" sull'icona della barra destra** (2026-10-05). Pallino (`data-chat-unread`, stile `bg-[var(--dash-accent)]` + ring) sull'icona Chat nella rail quando arrivano messaggi nuovi, **anche da altri partecipanti**: nuovo evento broadcast `chat_message` su `campaignChannel` (tipo + `KNOWN_BROADCAST_EVENTS`), inviato da `SessionChatPanel.handleSend` dopo il salvataggio. `SessionRightSidebar` (sempre montato) ascolta: mittente ignoro, chat chiusa → pallino, chat aperta → il messaggio viene passato come prop `incomingMessage` al pannello che lo appende in coda (dedup per id). Persistenza del "visto": `hollowgate.chat.last-seen.<campaignId>` in localStorage con timestamp `created_at` **del server** (confronto lessicografico ISO esatto, immune a sfasamenti di orologio); al montaggio `loadLatestChatMessageAt` confronta col messaggio più recente → pallino anche per messaggi arrivati con browser chiuso; il pannello segna il visto al load e dopo ogni invio (altrimenti riaprirebbe col pallino sul proprio messaggio). Pallino spento all'apertura del pannello. Typecheck PASS.
61. `feat:` **Chat: pallino anche per i tiri di dado** (2026-10-05). Come per la cronica tiri, un tiro pubblico (mio o di altri) segnala la chat: `DiceSessionProvider` accetta `onRollIngested(serverCreatedAt)` invocato da `ingestRoll` dopo `saveRollEntry` (ora restituisce il `created_at` del server, rileggendolo dalla riga esistente in caso di conflitto d'insert). La sidebar, se il pannello chat è chiuso, accende il pallino; se è aperto, marca il tiro come visto (nessun falso pallino al riavvio). `loadLatestChatAt` (rinominata, senza filtro `kind`) confronta all'ingresso l'ultima voce **sia messaggi sia tiri** col timestamp "visto", così anche i tiri arrivati con il browser chiuso accendono il pallino; il load del pannello segna l'ultima voce di qualunque tipo. Tiri segreti esclusi (non persistiti in chat). Typecheck PASS.
62. `fix:` **Chat: tiri e pallino a fine rotolamento** (2026-10-05). Prima il tiro veniva salvato in DB e segnalava la chat (pallino) all'inizio del tiro: aprirla durante l'animazione mostrava il risultato in anticipo. Ora `ingestRoll` accoda solo (`pendingChatRolls` Map id→result, prima di `playAnimation` perché con 3D disattivo il reveal è sincrono) e il salvataggio + `onRollIngested` avvengono in `revealRoll`, l'unico canale di "fine dado" (successo, errore, reveal immediato, interruzione): la riga nel DB nasce a rotolamento finito, quindi la cronica tiri e la chat si comportano allo stesso modo (card e pallino insieme, allineati anche fra client diversi). Coda svuotata a cambio campagna e a `clearLocalHistory` (Pulisci chat: niente tiri che rientrano dopo lo svuotamento). Durata della finestra di persistenza = durata animazione; idempotenza su più client già garantita dall'upsert. Typecheck PASS.
63. `fix:` **Chat: il pallino non si accende più per la propria attività** (2026-10-05). Segnalato in test: tirando con la chat chiusa e facendo refresh si ritrovava il pallino, perché i propri tiri accendevano il pallino della propria chat (i propri messaggi invece no) e il controllo d'ingresso guardava l'ultima voce in assoluto. Fix in tre punti: (1) `onRollIngested` ora passa il `RollResult` e la sidebar non accende il pallino se `roll.rollerId === user.id`; (2) `loadLatestChatAt(campaignId, excludeOwnFrom?)` filtra con `sender_id != user.id` — al rientro conta solo l'ultima voce **di altri**, quindi i propri tiri non riaccendono nulla mentre i messaggi/tiri altrui non letti sì; (3) `writeChatLastSeen` diventa monotona (non abbassa mai il valore: interleaving fra messaggi e rivelazioni di tiro poteva far prevalere un `created_at` più vecchio). Typecheck PASS.
64. `feat:` **Chat: pallino anche per i propri tiri (ripristino richiesto)** (2026-10-05). Su richiesta dell'utente si torna al comportamento della cronica tiri: tirare con la chat chiusa accende il pallino dell'icona Chat anche per la propria attività, e il controllo d'ingresso conta di nuovo **tutte** le voci (anche proprie) — annullati i punti dell'esclusione-propri del punto 63 (`onRollIngested` torna a passare solo `serverCreatedAt`, `loadLatestChatAt` senza filtro `sender_id`). Resta invece il fix utile del punto 63: `writeChatLastSeen` monotona (non abbassa mai il timestamp "visto"). Typecheck PASS.
65. `feat:` **Impostazioni in primo piano e ruoli applicativi** (2026-10-06). Impostazioni e ritaglio avatar renderizzati via portal su document.body con z-index 20000, sopra Note/Schede e relativi menu; rimosso il sottotitolo Personalizzazione & Database. Nuova tab Amministrazione dopo Generale e Profilo, visibile solo tramite isAdmin e contenente Database Supabase (rimosso da Generale). SupabaseDebug verifica anche internamente il ruolo. AuthUser espone role admin/standard, AuthContext espone isAdmin; il ruolo è letto da user_roles e non derivato da email o metadata modificabili dal client. Migrazione supabase/20261006200000_user_roles.sql: ruoli per tutti gli auth.users esistenti (alfonso.germano@gmail.com admin, tutti gli altri standard), trigger nuove registrazioni standard, RLS lettura proprio ruolo, nessun permesso di scrittura per utenti autenticati. Tipologia mostrata nel Profilo. npm run check PASS (typecheck, verify, build). Migrazione online ancora da eseguire tramite SQL Editor Supabase; assegnazioni non ancora applicate al database remoto.
    Aggiornamento: migrazione SQL caricata/eseguita dall'utente su Supabase (2026-10-06). Punti 64-65 inclusi nel commit di ruoli, Impostazioni e ripristino pallino propri tiri; 31-63 nel commit 5891d80.

## Verifiche "di unione" per file tipici

## Suggerimenti workflow (per sessioni lunghe)

- Iniziare sessione nuova per ogni task (finestra di contesto ~100%, non ripartire da zero:
  rileggere prima questo file).
- Directory dei worktree temporanei per test LF:
  `C:\Users\Alfonso\AppData\Local\Temp\opencode\`
- Per validare script CRLF-sensibili: copiare i sorgenti `.ts/.tsx` in una temp dir,
  convertire a LF (`-replace "`r`n","`n"`), puntare i path dello script → girare con `node`.
