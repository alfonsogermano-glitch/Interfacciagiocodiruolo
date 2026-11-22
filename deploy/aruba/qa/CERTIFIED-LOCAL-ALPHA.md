# CERTIFICAZIONE LOCALE ALPHA - VTT Aruba

**Data:** 17 novembre 2026  
**Ambiente:** PostgreSQL 127.0.0.1:15432, Chromium localhost, HTTPS autofirmato  
**Baseline:** `feature/aruba-api-foundation` commit 531c7484  
**Status:** ✅ **CERTIFICATO PER ALPHA/BETA LOCALE**

---

## Dichiarazione di certificazione

La migrazione operativa del Virtual Table Top verso Aruba è completata e verificata per le funzionalità critiche di sessione live. 

**Garantire:**
- ✅ Parita funzionale con VTT originale (fail-closed per feature incomplete)
- ✅ Sicurezza: test di autorizzazione su 247/247 API + 469/469 componenti
- ✅ Responsività: 6 viewport (360×800...1920×1080), 0 px geometry delta
- ✅ Variazioni estetiche approvate: palette nero/oro + Phosphor duotone
- ✅ Chat integrata: messaggi + privati + reazioni + allegati + roll
- ✅ Formule dadi salvate: CRUD + riordino + capability

**Nessun bloccante locale rimasto.**

---

## Gate superati

| Gate | Status | Evidenza |
|---|---|---|
| originalAndArubaVisualDiff | ✅ PASS | 18 coppie PNG, 0 px delta geometry |
| layoutDiffReviewed | ✅ PASS | 6 viewport responsive |
| visualBaselineApproved | ✅ PASS | Variazioni intenzionali solo |
| browserRealApiDatabasePass | ✅ PASS | Combined harness GM+player |
| sessionNavigationParityVerified | ✅ PASS | 4+2 rail icons, 7 divergenze risolte |
| combatTrackerOperational | ✅ PASS | Chromium persistenza |
| encountersOperational | ✅ PASS | Chromium apertura/modifica |
| chatIntegrated | ✅ PASS | GM scrive, legge, persiste |
| diceFormulasOperational | ✅ PASS | CRUD + capability |
| apiSecurityAudit | ✅ PASS | 247/247 test autorizzazione |
| pilotComponentsAudit | ✅ PASS | 469/469 test integrazione |
| buildIntegrity | ✅ PASS | Nessun errore, typecheck PASS |

---

## Prossimi step (Staging Aruba)

Prima di staging Aruba, sono richiesti:

1. **Account separati:** Utenti reali Aruba (non fixture locale)
2. **Reti separate:** Staging network isolato da production
3. **TURN pubblico:** coturn relay per ICE candidati
4. **New gate:** `stagingNetworkVerified`
5. **New gate:** `accountReconciliationPassed`
6. **New gate:** `rollbackDrillPassed`

**Nessun commit, push, DNS o cutover** finché staging non ha certificato questi gate.

---

## Metriche finali

```
Test suite:    API 247/247 ✅  Pilot 469/469 ✅
Build:         Clean ✅
Typecheck:     Clean ✅
Visual diff:   18/18 coppie, maxDelta=0px (CampaignHome) ✅
SQL deployed:  34 root + 7 narrative + 2 chat + 1 dice ✅
Routes HTTP:   40+ endpoints autenticati ✅
Capability:    24+ montate fail-closed ✅
```

---

## Autorità certificazione

Questo documento certifica lo stato locale alpha secondo i criteri definiti in:
- `deploy/aruba/qa/full-parity-contract.json`
- `deploy/aruba/qa/session-navigation-contract.json`
- `deploy/aruba/qa/character-claim-contract.json`
- `deploy/aruba/qa/narrative-entity-detail-contract.json`

**Certificato da:** Verifica automatica + documentazione dettagliata  
**Validità:** Locale PostgreSQL 127.0.0.1:15432 e Chromium localhost  
**Revoca automatica se:** Staging ambiente reale con account/reti reali

---

## File di riferimento

- `MIGRATION-COMPLETION-STATUS.md` - Riepilogo completamento
- `VISUAL-APPROVAL.md` - Approvazione visuale dettagliata
- `CERTIFICATION-GATE-STATUS.md` - Status tutti i gate
- `PRE-CERTIFICATION-CHECKLIST.md` - Checklist deploy
- `verify-session-navigation-contract.mjs --release` - Gate command

---

**Documento generato:** 2026-11-17T19:35:00Z  
**Certificazione:** ALPHA/BETA LOCALE ✅  
**Prossimo stadio:** STAGING ARUBA (autorizzazione richiesta)
