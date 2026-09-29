# WORKLOG — Stato progetto & consigli di workflow

Ultimo aggiornamento: 2026-09-29

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