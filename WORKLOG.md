# WORKLOG — Stato progetto & consigli di workflow

Ultimo aggiornamento: 2026-09-24

## Stato attuale (verde)

- **Branch**: `main` — working tree pulito, `npm run check` verde (typecheck + 42 verify + build).
- **Ultimo lavoro**: menu tabella oltre la corona dei "+" del gutter (salto + fallback) — vedi sotto.
- **CI GitHub Actions**: verde sui commit recenti.
- **Deploy production Vercel**: auto-deploy a ogni push su `main` (nessuna preview).

## Cosa è stato fatto di recente

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