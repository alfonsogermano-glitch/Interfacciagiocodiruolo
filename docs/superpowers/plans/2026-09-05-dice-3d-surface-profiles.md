# Dice 3D Surface Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introdurre profili materiali riutilizzabili e rendere le facce Ghiaccio realmente indipendenti dall'illuminazione.

**Architecture:** Un modulo centrale associa ogni skin a `photo-lit`, `photo-unlit` o `physical`. Il profilo `photo-unlit` sostituisce soltanto i materiali delle facce con `MeshBasicMaterial` che riusa la mappa composita contenente fotografia e numeri; bordi ed effetti rimangono separati.

**Tech Stack:** React, TypeScript, Three.js 0.143, dice-box-threejs, Node verification scripts.

**Spec:** `docs/superpowers/specs/2026-09-05-dice-3d-surface-profiles-design.md`

## Global Constraints

- Non modificare la fotografia Ghiaccio.
- Non cambiare il profilo o l'animazione Fuoco.
- Non modificare illuminazione globale, zoom, persistenza o lifecycle.
- Pubblicare un solo commit atomico direttamente su `main`, senza PR.

---

### Task 1: Registro e applicatore dei profili materiali

**Files:**
- Create: `src/app/components/session/dice/dice3dSurfaceProfiles.ts`
- Create: `scripts/verify-dice-surface-profiles.mts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `getDice3DSurfaceProfile(skinId): Dice3DSurfaceProfile`
- Produces: `applyDice3DSurfaceProfile(mesh, descriptor): void`

- [ ] Scrivere un test che costruisca materiali Phong reali e richieda che Ghiaccio sostituisca le sole facce con `MeshBasicMaterial`, riusando la stessa mappa e mantenendo il bordo.
- [ ] Eseguire il test e verificare che fallisca perché il modulo non esiste.
- [ ] Implementare il registro dei tre profili e la sostituzione minimale dei materiali delle facce `photo-unlit`.
- [ ] Eseguire il test e verificare che passi.
- [ ] Aggiungere lo script a `package.json` e come step esplicito della CI prima di `npm run check`.

### Task 2: Collegamento alla factory esistente

**Files:**
- Modify: `src/app/components/session/dice/dice3dAppearanceMaterials.ts`
- Modify: `scripts/verify-dice-skin-regressions.mjs`
- Modify: `scripts/verify-ice-skin-consistency.mjs`

**Interfaces:**
- Consumes: `applyDice3DSurfaceProfile(mesh, descriptor): void`

- [ ] Aggiornare i test strutturali affinché richiedano l'applicatore comune e vietino la vecchia emulazione emissiva per Ghiaccio.
- [ ] Eseguire i test e osservare il fallimento atteso.
- [ ] Chiamare l'applicatore dopo la creazione del mesh e rimuovere la funzione speciale `preserveIceFaceTexture`.
- [ ] Eseguire i controlli Ghiaccio, Fuoco, colori, zoom, lifecycle e profili.

### Task 3: Verifica e pubblicazione

**Files:**
- Verify only: all modified files

- [ ] Eseguire `git diff --check`.
- [ ] Eseguire i test mirati, `npm run build` e `npm run typecheck`, distinguendo errori preesistenti.
- [ ] Verificare che `origin/main` non sia avanzato.
- [ ] Creare un solo commit `fix: standardize 3D skin surface materials` e pubblicarlo su `main`.
- [ ] Verificare GitHub Actions e Vercel sul medesimo SHA.
