# Dice Formula Library Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare le formule salvate in una libreria gerarchica con cartelle inline, drag & drop, icone, massimo 5 livelli e cancellazione sicura.

**Architecture:** Le formule restano in `dice_formulas`; le cartelle vivono in `dice_formula_folders`. Le operazioni strutturali vengono eseguite tramite RPC PostgreSQL atomiche; il client costruisce un albero misto formule/cartelle e usa drag & drop nativo con validazione preventiva e rollback su errore.

**Tech Stack:** React, TypeScript, Tailwind, Supabase/PostgreSQL, Vite, Node verifier scripts.

**Spec:** `docs/superpowers/specs/2026-08-31-dice-formula-library-tree-design.md`

## Global Constraints

- Root esclusa dal conteggio; massimo 5 livelli di cartelle.
- Nessuna nuova dipendenza drag & drop.
- Le formule esistenti devono restare visibili nella root.
- Nessuna modifica ai dati dei tiri o alla chat.
- Le operazioni strutturali devono essere atomiche nel database.
- Nessuna Preview Vercel durante lo sviluppo; un solo aggiornamento finale di `main`.
- TDD RED -> GREEN e `npm run check` prima della consegna.

---

### Task 1: Schema e RPC Supabase

**Files:**
- Create: `supabase/migrations/20260831173000_dice_formula_library_tree.sql`

**Interfaces:**
- Produces: tabella `dice_formula_folders`, colonne `dice_formulas.folder_id` e `dice_formulas.sort_order`, RPC `create_dice_formula_folder`, `move_dice_library_node`, `delete_dice_formula_folder`.

- [ ] **Step 1: Scrivere verifiche RED dello schema**

Usare query di introspezione che richiedano tabella, colonne, indici e funzioni non ancora presenti; verificare che almeno una condizione fallisca.

- [ ] **Step 2: Implementare la migrazione**

La migrazione deve creare la tabella cartelle con RLS equivalente alle formule, aggiungere `folder_id` e `sort_order`, backfillare l'ordine storico con `row_number() over (partition by campaign_id, owner_profile_id order by updated_at desc, id) - 1`, creare indici e validazioni di ownership/profondità/ciclo. Le RPC devono serializzare il livello interessato, aggiornare posizioni in una singola transazione e rifiutare profondità > 5.

- [ ] **Step 3: Applicare la migrazione e verificare GREEN**

Controllare via `information_schema`, `pg_proc`, `pg_policies` e query transazionali che schema e RPC siano presenti e coerenti.

### Task 2: Tipi e servizi della libreria

**Files:**
- Modify: `src/app/components/session/dice/diceTypes.ts`
- Modify: `src/services/supabase/diceFormulasService.ts`
- Create: `src/services/supabase/diceFormulaFoldersService.ts`
- Create: `src/app/components/session/dice/diceFormulaLibrary.ts`

**Interfaces:**
- Produces: `SavedDiceFormula.folderId`, `SavedDiceFormula.sortOrder`, `DiceFormulaFolder`, `DiceLibraryNode`, helper di profondità/descendenza/ordinamento; servizi `loadDiceFormulaFolders`, `createDiceFormulaFolder`, `updateDiceFormulaFolder`, `moveDiceLibraryNode`, `deleteDiceFormulaFolder`.

- [ ] **Step 1: RED sui contratti TypeScript**

Il verifier deve richiedere i nuovi campi e i servizi RPC prima della loro implementazione.

- [ ] **Step 2: Estendere mapping e input formula**

`diceFormulasService` deve leggere/scrivere `folder_id` e `sort_order`; le nuove formule in root usano `folder_id: null`, mentre la duplicazione conserva la cartella della formula sorgente.

- [ ] **Step 3: Implementare servizio cartelle e helper puri**

Gli helper devono calcolare profondità, altezza sottoalbero, discendenti e validità dello spostamento senza dipendere da React.

- [ ] **Step 4: GREEN sui contratti e helper**

Verificare massimo 5 livelli, self-drop e descendant-drop invalidi, formula sempre consentita in cartella valida.

### Task 3: Componenti UI cartella, dialog e picker condiviso

**Files:**
- Create: `src/app/components/session/dice/DiceFormulaFolderRow.tsx`
- Create: `src/app/components/session/dice/DeleteDiceFormulaFolderDialog.tsx`
- Create: `src/app/components/session/dice/DiceLibraryIconPicker.tsx`
- Modify: `src/app/components/session/dice/SavedDiceFormulaCard.tsx`

**Interfaces:**
- Produces: riga cartella con chevron/menu, dialog cancellazione con checkbox, picker icona riusabile, card formula pronta per indentazione/drag.

- [ ] **Step 1: RED sulla UI attesa**

Richiedere data marker per cartella, chevron, menu, checkbox distruttiva, drag zone e picker condiviso.

- [ ] **Step 2: Estrarre il picker senza regressioni**

Mantenere il portal palette-aware, chiusura su vero outside pointerdown/Escape e nessun Radix Popover accoppiato al DropdownMenu.

- [ ] **Step 3: Implementare riga cartella e dialog**

Menu: `Nuova sottocartella`, `Rinomina`, `Icona`, `Elimina`. La checkbox è deselezionata di default e appare solo per cartelle non vuote.

- [ ] **Step 4: GREEN UI verifier**

Confermare fallback `Folder`, icona Lucide personalizzata e permanenza di `caret-transparent` sulle formule.

### Task 4: Albero inline e drag & drop

**Files:**
- Create: `src/app/components/session/dice/DiceFormulaLibraryTree.tsx`
- Create: `src/app/components/session/dice/useDiceFormulaLibraryDrag.ts`

**Interfaces:**
- Consumes: `DiceLibraryNode`, helper di validazione, callback strutturali dal pannello.
- Produces: rendering ricorsivo misto, drop `before|after|inside|root`, auto-apertura cartella chiusa.

- [ ] **Step 1: RED su albero e drop target**

Verificare marker per livelli, indicatori before/after, target inside/root e timer auto-open.

- [ ] **Step 2: Implementare rendering ricorsivo**

Indentare fino a 5 livelli e renderizzare solo i figli di cartelle espanse. Stato espanso letto/scritto in localStorage con chiave `dice-formula-folders:<campaignId>:<userId>`.

- [ ] **Step 3: Implementare drag nativo**

Il drag parte dalla zona non interattiva; `button,input,[role=menuitem]` e picker non devono avviarlo. Usare ghost trasparente coerente con la UI dadi e feedback preciso before/after/inside.

- [ ] **Step 4: Implementare auto-open e validazione preventiva**

Hover su cartella chiusa programma apertura; leave/drop/end cancella il timer. Drop invalido non invoca il server.

- [ ] **Step 5: GREEN albero/drag**

Coprire root -> cartella, cartella -> root, cartella -> cartella, riordino misto e vincoli di profondità.

### Task 5: Integrazione nel pannello dadi

**Files:**
- Modify: `src/app/components/session/dice/SessionDicePanel.tsx`

**Interfaces:**
- Consumes: servizi formula/cartella e `DiceFormulaLibraryTree`.
- Produces: caricamento coordinato, CRUD, rollback e toast italiani.

- [ ] **Step 1: RED sull'integrazione**

Richiedere caricamento simultaneo formule/cartelle, pulsante `Nuova cartella`, callbacks per rename/icon/delete/move e conservazione delle funzioni formula esistenti.

- [ ] **Step 2: Integrare caricamento e stato**

Se formule o cartelle falliscono, non mostrare una gerarchia parziale come affidabile. Reset coerente al cambio campagna/utente.

- [ ] **Step 3: Integrare CRUD cartella**

Creazione root/sottocartella, rinomina, icona e cancellazione aggiornano lo stato; eliminazione senza contenuti promuove i figli, quella distruttiva rimuove il sottoalbero.

- [ ] **Step 4: Integrare move con snapshot rollback**

Applicare l'ordine ottimistico, invocare RPC, ripristinare snapshot e mostrare toast se l'RPC fallisce.

- [ ] **Step 5: Conservare semantica formula**

Tiro, segretezza, modifica, duplica, icona ed elimina devono continuare a funzionare; il builder non cambia.

### Task 6: Verifier permanente e verifica finale

**Files:**
- Create: `scripts/verify-dice-formula-library-tree.mjs`
- Modify: `package.json`
- Modify: `scripts/verify-saved-dice-menu-layer.mjs`

**Interfaces:**
- Produces: regressione permanente inclusa in `npm run check`.

- [ ] **Step 1: Aggiungere verifier RED**

Il verifier deve controllare schema migration, servizi, marker UI, massimo 5 livelli, cancellazione protetta, picker stabile, localStorage e RPC atomiche.

- [ ] **Step 2: Portare GREEN e ripristinare regressioni esistenti**

Mantenere esplicitamente anche l'asserzione `caret-transparent` per la card formula.

- [ ] **Step 3: Eseguire verifiche complete**

Run: `npm run check`
Expected: exit code 0 e tutti i verifier dadi verdi.

- [ ] **Step 4: Pubblicazione atomica**

Creare tutti i blob e un unico tree/commit finale con parent dell'attuale `main`, quindi un solo `update_ref` di `main`. Nessun branch temporaneo.

- [ ] **Step 5: Verifica post-push**

Confermare GitHub Actions `npm run check` verde e Vercel Production `success` sullo stesso SHA del commit finale.
