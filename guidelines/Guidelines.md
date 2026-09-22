# Guidelines — Hollow Gate

Regole operative per gli AI agent (OpenCode e altri). Aggiornare questo file quando le regole del progetto cambiano.
Riferimento vivente: `WORKLOG.md` (stato e regole dettagliate) e `docs/superpowers/` (specifiche, piani e report).

---

## All'inizio di ogni sessione

- Leggere `WORKLOG.md`: dà lo stato aggiornato del progetto, i commit recenti e le regole operativhe.
- Per contesto su una feature, consultare la spec corrispondente in `docs/superpowers/specs/`.
- Iniziare una sessione nuova per ogni task distinto (come da prassi in WORKLOG).

## General guidelines

- **Windows + PowerShell**: `core.autocrlf=true`, nessun `.gitattributes` → i file sorgenti sono CRLF.
  Molti `verify-*.mjs` cercano stringhe con `\n` letterale: **in locale (CRLF) possono fallire falsamente, in CI (Linux, LF) passano**. Prima di dichiarare un verify rotto, testare su copie normalizzate a LF (vedi WORKLOG → workflow CRLF).
- Mantenere i file piccoli: helper e componenti nei loro own file.
- Preferire layout responsive con flex/grid; evitare absolute positioning quando non necessario.
- Non introdurre nuove dipendenze senza averle richieste all'utente.

## Regole di codice

- **Stack**: Vite + React 18 + TypeScript + Tailwind CSS v4 + Radix UI, editor **tiptap**, dadi 3D (`dice-box-threejs`), backend **Supabase** (`@supabase/supabase-js`).
- Struttura principale: componenti in `src/app/`, feature dei dadi in `src/app/components/session/dice/`, editor note in `src/app/components/session/shared/`.
- `src/app/components/session/shared/tiptapIconData.ts` è **generato** da `generate:note-icons` (210 icone Lucide): **non editarlo mai a mano**. Si rigenera automaticamente a ogni `typecheck`/`predev`/`prebuild` e sporca il working tree — è normale, non usare `git stash pop` cieco.
- Config Supabase: `src/config/supabase.config.ts` (URL + anon key con fallback hardcoded). Le variabili `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` hanno la precedenza se presenti.
- Ogni nuova feature con logica verificabile deve avere il suo script in `scripts/verify-*.mjs|mts` e la relativa voce in `package.json` (`verify:*` + inserimento in `check`), seguendo il pattern RED→GREEN dei verify esistenti.

## Verifiche (NON skippare)

- **`npm run check`** — obbligatorio prima di **ogni commit**: typecheck + tutti i verify + build.
- `node scripts/verify-dice-skin-regressions.mjs` — step CI separato (non incluso in `check`).
- `npm audit --audit-level=high` — deve restare pulito.
- `npm run check` rigenera `tiptapIconData.ts` a ogni run → fare `git add` **dopo** il check, non prima.

## Git e deploy

- **Stile commit**: prefissi `fix:` / `test:` / `feat:` in lower-case, body con i dettagli. Esempi: `git log --oneline -20`.
- **Niente force-push.**
- **Notificare l'utente prima di ogni push.**
- **Vercel: SOLO deploy production, mai preview.** Il deploy parte automaticamente dal push su `main` (www.hollowgate.quest).
- Workflow a due computer (fisso + portatile): `git pull` all'inizio del lavoro, `git add -A` → `commit` → `push` alla fine.

## Design

- Il tema di riferimento è `default_shadcn_theme.css` (root) — usare i token esistenti invece di introdurre valori ad hoc.
- Per decisioni di design già prese, fare riferimento alle spec in `docs/superpowers/specs/` (dadi, pelle 3D, tabelle note, icone, ecc.) invece di re-inventare la soluzione.
