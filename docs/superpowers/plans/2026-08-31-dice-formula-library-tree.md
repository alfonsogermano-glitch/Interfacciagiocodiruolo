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

- [x] **Step 1: Scrivere verifiche RED dello schema**
- [x] **Step 2: Implementare la migrazione**
- [x] **Step 3: Applicare la migrazione e verificare GREEN**

### Task 2: Tipi e servizi della libreria

**Files:**
- Modify: `src/app/components/session/dice/diceTypes.ts`
- Modify: `src/services/supabase/diceFormulasService.ts`
- Create: `src/services/supabase/diceFormulaFoldersService.ts`
- Create: `src/app/components/session/dice/diceFormulaLibrary.ts`

- [x] **Step 1: RED sui contratti TypeScript**
- [x] **Step 2: Estendere mapping e input formula**
- [x] **Step 3: Implementare servizio cartelle e helper puri**
- [x] **Step 4: GREEN sui contratti e helper**

### Task 3: Componenti UI cartella, dialog e picker condiviso

**Files:**
- Create: `src/app/components/session/dice/DiceFormulaFolderRow.tsx`
- Create: `src/app/components/session/dice/DeleteDiceFormulaFolderDialog.tsx`
- Create: `src/app/components/session/dice/DiceLibraryIconPicker.tsx`
- Modify: `src/app/components/session/dice/SavedDiceFormulaCard.tsx`

- [x] **Step 1: RED sulla UI attesa**
- [x] **Step 2: Estrarre il picker senza regressioni**
- [x] **Step 3: Implementare riga cartella e dialog**
- [x] **Step 4: GREEN UI verifier**

### Task 4: Albero inline e drag & drop

**Files:**
- Create: `src/app/components/session/dice/DiceFormulaLibraryTree.tsx`

- [x] **Step 1: RED su albero e drop target**
- [x] **Step 2: Implementare rendering ricorsivo**
- [x] **Step 3: Implementare drag nativo**
- [x] **Step 4: Implementare auto-open e validazione preventiva**
- [x] **Step 5: GREEN albero/drag**

### Task 5: Integrazione nel pannello dadi

**Files:**
- Modify: `src/app/components/session/dice/SessionDicePanel.tsx`

- [x] **Step 1: RED sull'integrazione**
- [x] **Step 2: Integrare caricamento e stato**
- [x] **Step 3: Integrare CRUD cartella**
- [x] **Step 4: Integrare move con snapshot rollback**
- [x] **Step 5: Conservare semantica formula**

### Task 6: Verifier permanente e verifica finale

**Files:**
- Create: `scripts/verify-dice-formula-library-tree.mjs`
- Modify: `package.json`
- Modify: `scripts/verify-saved-dice-menu-layer.mjs`

- [x] **Step 1: Aggiungere verifier RED**
- [x] **Step 2: Portare GREEN e ripristinare regressioni esistenti**
- [ ] **Step 3: Eseguire verifiche complete**
- [ ] **Step 4: Pubblicazione atomica**
- [ ] **Step 5: Verifica post-push**
