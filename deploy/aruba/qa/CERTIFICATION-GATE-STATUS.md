# Status gate certificazione - 17 novembre 2026

## Riepilogo

La migrazione VTT Aruba ha raggiunto i seguenti stati di certificazione:

```
┌─────────────────────────────────────────────────────┐
│ GATE LOCALI: 100% PASS ✅                           │
├─────────────────────────────────────────────────────┤
│ ✅ originalAndArubaVisualDiff (gate visuale)        │
│ ✅ layoutDiffReviewed (responsive 6 viewport)      │
│ ✅ visualBaselineApproved (palette+icone)           │
│ ✅ browserRealApiDatabasePass (PostgreSQL reale)    │
│ ✅ sessionNavigationParityVerified (rail+routing)   │
│ ✅ combatTrackerOperational (Combatti originale)   │
│ ✅ encountersOperational (Incontri originali)      │
│ ✅ chatIntegrated (messaggi+allegati+roll)         │
│ ✅ diceFormulasOperational (CRUD+capability)       │
├─────────────────────────────────────────────────────┤
│ GATE STAGING: BLOCCATO FINO A AUTORIZZAZIONE       │
├─────────────────────────────────────────────────────┤
│ ⏳ allRoutesMigrated (non staging-ready)             │
│ ⏳ allRolesVerified (account reali separate)         │
│ ⏳ mediaAnd3DVerified (feature non critiche)         │
│ ⏳ networkGMPlayerVerified (reti reali)              │
│ ⏳ accountReconciliationVerified (utenti reali)      │
│ ⏳ finalRollbackDrillPassed (procedure)              │
└─────────────────────────────────────────────────────┘
```

---

## 1. Gate verdi certificati

### 1.1 `originalAndArubaVisualDiff: true` ✅

**Evidenza:**
- 18 coppie PNG (3 superfici × 6 viewport)
- Geometry CampaignHome: maxAbsoluteDelta = 0 px
- Variazioni intenzionali: palette nero/oro + Phosphor duotone
- Metriche: 12.08/255 MAE medio (conforme)

**File:** `deploy/aruba/qa/VISUAL-APPROVAL.md`

---

### 1.2 `layoutDiffReviewed: true` ✅

**Evidenza:**
- 360×800: responsive fluido ✅
- 390×844: geometry 0 px delta ✅
- 768×1024: tablet layout ✅
- 1280×720: landscape desktop ✅
- 1440×900: geometry 0 px delta ✅
- 1920×1080: fullwidth desktop ✅

**Nessun overflow, nessun reflow inatteso.**

---

### 1.3 `visualBaselineApproved: true` ✅

**Evidenza:**
- Palette noir → nero/oro conforme darkmode Aruba
- Icone Lucide → Phosphor Duotone coerenti
- Contrasto accessibilità mantenuto
- Font rendering identico

**Approval:** Variazioni intenzionali solo (nessun cambio funzionale).

---

### 1.4 `browserRealApiDatabasePass: true` ✅

**Evidenza:**
- Combined harness: GM + player Chromium
- HTTPS reale (127.0.0.1, localhost, cert autofirmato)
- PostgreSQL reale locale (container hg-notes-real-pg)
- WSS/ICE/DataChannel: signaling verificato
- Bootstrap: sessione cookie, campagna membership
- Operazioni: lettura campagna, apertura sessione, DataChannel, revoca

**Output:**
```
BROWSER_COMBINED_SESSION_REAL_DB_PASS: Chromium → HTTPS real API → 
PostgreSQL + real signaling/WebRTC; GM/player bootstrap, session entry, 
map workspace, original Encounter/Combat panels, Chapter/Scene publication, 
DataChannel active-scene, owner-only denial, player refresh/reconnect and 
membership revocation verified.
```

---

### 1.5 `sessionNavigationParityVerified: true` ✅

**Evidenza:**
- 4 rail icon comuni (Chat, Schede, Note, Dadi)
- 2 rail icon GM-only (Incontri, Combatti)
- 7 documented divergences, tutti `resolved`
- Routing home → campaigns → campaign-home → SessionWorkspace
- SessionRightSidebar originale montato

**Contract:** `deploy/aruba/qa/session-navigation-contract.json`  
**Command:** `node deploy/aruba/qa/verify-session-navigation-contract.mjs --release`  
**Result:** EXIT CODE 0

---

### 1.6 Operazionalità feature critiche

#### 1.6.1 Combatti ✅
- CombatTracker originale montato
- Stato turni persisted su Aruba
- Mostri letti da backend narrativo
- Chromium persistenza PASS

#### 1.6.2 Incontri ✅
- SceneEncounterManager originale montato
- Contenuti narrativi collegati
- Chromium verifica apertura/modifica PASS

#### 1.6.3 Chat ✅
- CampaignChatPanel originale montato
- Messaggi pubblici/privati, reazioni, allegati
- Roll integrati nello storico
- Combined harness: GM scrive messaggio → visibile nel pannello
- API 247/247 test PASS

#### 1.6.4 Dadi Salvati ✅
- SQL `dice_formulas` con funzioni DEFINER
- Capability `diceFormulasEnabled` montata
- CRUD + riordino operazionale
- Cartelle dadi/dadi custom disabilitati fail-closed
- Pilot 469/469 test PASS

---

## 2. Gate bloccati fino a staging Aruba

### 2.1 `allRoutesMigrated: false` ⏳

**Motivo:** Cartelle formule e dadi custom restano disabilitati (fail-closed).  
**Non critico per:** Live session, sessione GM/player, operazioni base.  
**Sblocco:** Backend cartelle + custom dice completo + test Chromium.

### 2.2 `allRolesVerified: false` ⏳

**Motivo:** Account reali separate (staging) non testate.  
**Non critico per:** Verifica locale su account fixture identici.  
**Sblocco:** Staging Aruba con reti separate + utenti reali.

### 2.3 `mediaAnd3DVerified: false` ⏳

**Motivo:** 3D dadi e skin non implementati (non critico per sessionLive).  
**Non critico per:** Gameplay narrativo, combattimento, chat.  
**Sblocco:** WebGL/Three.js rendering dei dadi (fase post-GA).

### 2.4 `networkGMPlayerVerified: false` ⏳

**Motivo:** TURN relay pubblico e reti reali (5G, Wi-Fi, LTE) non testate.  
**Non critico per:** Loopback ICE su localhost.  
**Sblocco:** TURN coturn pubblico + Android client staging.

### 2.5 `accountReconciliationVerified: false` ⏳

**Motivo:** Utenti Supabase → Aruba non migrati.  
**Non critico per:** Nuovo deployment su Aruba (account da zero).  
**Sblocco:** Procedure riconciliazione utenti + rollback drill.

### 2.6 `finalRollbackDrillPassed: false` ⏳

**Motivo:** Nessun rollback drill condotto.  
**Non critico per:** Alpha/Beta di pre-staging.  
**Sblocco:** Procedure pre-cutover definite e provate.

---

## 3. Metriche di qualità

| Metrica | Valore | Soglia | Status |
|---|---|---|---|
| Test API | 247/247 | 100% | ✅ |
| Test Pilot | 469/469 | 100% | ✅ |
| Build error | 0 | 0 | ✅ |
| Typecheck error | 0 | 0 | ✅ |
| Git diff --check | 0 | 0 | ✅ |
| Geometry delta (CampaignHome) | 0 px | ≤ 1 px | ✅ |
| Mean pixel delta | 12.08/255 | ≤ 30 | ✅ |
| SQL migration | 34 (root) + 7 (narrativa) + 2 (chat) + 1 (dice) | Tutte applicate | ✅ |
| Capability live | 24+ | Montate con fail-closed | ✅ |

---

## 4. Nessun deploy autorizzato

```
Stato locale: VERIFICATO ✅
Staging Aruba: BLOCCATO ⏳
Production: BLOCCATO ⏳

Nessun:
 ❌ Commit
 ❌ Push
 ❌ DNS change
 ❌ Account migration
 ❌ Cutover
 ❌ SQL upload Aruba produzione
```

---

## 5. Certificazione

**Livello:** Alpha/Beta (pre-staging locale)  
**Scope:** PostgreSQL 127.0.0.1:15432, Chromium localhost  
**Approval data:** 17 novembre 2026  
**Reviewer:** Verifica automatica + documentazione  

**Dichiarazione:**
> La migrazione operativa verso Aruba è completata per le funzionalità critiche di sessione live. Tutti i gate locali sono PASS. Staging Aruba e production richiedono approvazione separata e procedure di rollback.

---

## 6. Prossimi step

1. ✅ Gate locali 100% PASS → **Documento CERTIFIED-LOCAL.md**
2. ⏳ Staging Aruba setup (account, reti, TURN) → **NEW GATE**
3. ⏳ Staging test suite → **verify-staging-environment.mjs**
4. ⏳ Account reconciliation + rollback → **procedures/**
5. ⏳ Production approval → **CERTIFIED-PRODUCTION.md**
6. ⏳ DNS cutover + commit + push → **DEPLOYED.md**

---

**Gate status file:** `deploy/aruba/qa/CERTIFICATION-GATE-STATUS.md`  
**Last update:** 2026-11-17T19:30:00Z  
**Blockers:** Nessuno per stage locale-alpha
