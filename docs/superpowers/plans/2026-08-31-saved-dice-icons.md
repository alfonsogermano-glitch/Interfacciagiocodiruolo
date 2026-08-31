# Saved Dice Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere il menu delle formule salvate palette-aware, semplificarne le etichette e permettere di associare a ogni formula una delle icone Lucide già disponibili in Hollowgate.

**Architecture:** Riutilizzare `NoteIconGrid`/`NoteIconGlyph` come catalogo e renderer condivisi, senza introdurre un secondo catalogo. Persistenza tramite nuovo campo nullable `public.dice_formulas.icon_name`, propagato nel tipo `SavedDiceFormula` e nel servizio Supabase. La card gestisce solo apertura/chiusura del picker; `SessionDicePanel` resta responsabile della persistenza e del rollback in caso di errore.

**Tech Stack:** React, TypeScript, Radix UI, Tailwind, Supabase/PostgreSQL, Lucide.

**Spec:** design approvato in chat il 2026-08-31.

## Global Constraints

- Le formule esistenti senza icona continuano a mostrare l'icona predefinita dei due dadi.
- Il menu deve restare sopra lo slide-over `z-[900]` e usare la palette `--dash-*` attiva.
- Le etichette visibili devono essere `Modifica`, `Duplica`, `Icona`, `Elimina`.
- Il catalogo icone deve riusare quello condiviso delle Note, con ricerca/categorie/recenti già esistenti.
- Nessuna modifica distruttiva ai dati esistenti.
- Un solo commit applicativo finale su `main`.

---

### Task 1: Persistenza icona formula

**Files:**
- Modify: `src/app/components/session/dice/diceTypes.ts`
- Modify: `src/services/supabase/diceFormulasService.ts`

**Interfaces:**
- Produces: `SavedDiceFormula.iconName?: string | null`, `CreateDiceFormulaInput.iconName?: string | null`, `UpdateDiceFormulaPatch.iconName?: string | null`.

- [ ] Aggiungere un test/verifier che richieda mapping e payload `icon_name`.
- [ ] Verificare il RED.
- [ ] Aggiungere `icon_name text null` a `public.dice_formulas` con migrazione Supabase.
- [ ] Implementare mapping, create/update e duplicazione dell'icona.
- [ ] Verificare il GREEN.

### Task 2: Menu palette e picker icone

**Files:**
- Modify: `src/app/components/session/dice/SavedDiceFormulaCard.tsx`
- Modify: `src/app/components/session/dice/SessionDicePanel.tsx`
- Modify: `scripts/verify-saved-dice-menu-layer.mjs`

**Interfaces:**
- Consumes: `SavedDiceFormula.iconName`.
- Produces: prop `onIconChange(iconName: string | null)` sulla card.

- [ ] Richiedere nel verifier etichette brevi, palette `--dash-*`, picker condiviso e fallback `Dices`.
- [ ] Verificare il RED.
- [ ] Integrare `NoteIconGrid`/`NoteIconGlyph` in un Popover sopra il pannello.
- [ ] Implementare aggiornamento ottimistico con rollback in `SessionDicePanel`.
- [ ] Verificare il GREEN.

### Task 3: Verifica finale

- [ ] Eseguire `npm run check` in CI sul commit finale.
- [ ] Verificare che il commit finale modifichi solo i file previsti.
- [ ] Verificare Vercel Production sullo stesso SHA.
