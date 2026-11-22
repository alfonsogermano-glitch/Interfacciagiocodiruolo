# ARUBA DEPLOYMENT STATUS

**Data:** 17 novembre 2026 ore 23:00 UTC  
**Stato:** ✅ Dati migrati 100%, pronto per deployment locale

---

## ✅ COMPLETATO

### 1. Database Migration (Supabase → Aruba PostgreSQL)

```
✅ 339 / 339 record migrati (100%)
✅ Container: hg-notes-real-pg (127.0.0.1:15432)
✅ Database: hollowgate_test
✅ Credenziali: postgres / ci-only-password
```

**Tabelle migrate:**
| Tabella | Record |
|---|---|
| campaigns | 48 |
| profiles | 56 |
| characters | 17 |
| npcs | 10 |
| monsters | 30 |
| environments | 5 |
| chapters | 17 |
| scenes | 3 |
| chat_messages | 67 |
| entity_notes | 52 |
| equipment_catalog | 3 |
| visual_assets | 9 |
| folders | 2 |
| clues | 1 |
| situations | 1 |
| campaign_members | 18 |
| **TOTALE** | **339** |

### 2. Aruba Infrastructure

```
✅ apps/aruba-api         - Backend API Node.js (40+ servizi)
✅ apps/aruba-vtt-pilot   - Frontend React (138 componenti)
✅ apps/aruba-auth-web    - Auth web
```

---

## ⏳ PROSSIMI PASSI

### Step 1: Schema Aruba API (richiesto)

L'API Aruba si aspetta uno schema specifico diverso da Supabase.
Verificare le migrations SQL in `apps/aruba-api` e applicarle.

```bash
# Controllare SQL migrations
ls apps/aruba-api/migrations/
# O cercare in deploy/aruba/sql/
```

### Step 2: Configurare API per database locale

Creare file `.env` per l'API:

```env
PGHOST=127.0.0.1
PGPORT=15432
PGUSER=postgres
PGDATABASE=hollowgate_test
POSTGRES_PASSWORD_FILE=./password.txt  # contiene: ci-only-password

AUTH_STAGING_ENABLED=true
AUTH_ORIGIN=http://localhost:5173
AUTH_RATE_LIMIT_KEY_FILE=./hmac.key

# Abilitare tutte le funzionalità
AUTH_VTT_CAMPAIGNS_ENABLED=true
AUTH_VTT_CHARACTERS_ENABLED=true
AUTH_VTT_CHAPTERS_ENABLED=true
AUTH_VTT_SCENES_ENABLED=true
AUTH_VTT_NARRATIVE_CONTENT_ENABLED=true
AUTH_VTT_EQUIPMENT_CATALOG_ENABLED=true
AUTH_VTT_CAMPAIGN_CHAT_ENABLED=true
AUTH_VTT_VISUAL_ASSETS_ENABLED=true
# ... etc.
```

### Step 3: Avviare API

```bash
cd apps/aruba-api
npm install
npm start
```

### Step 4: Build e servire Frontend

```bash
cd apps/aruba-vtt-pilot
npm install
npm run build
# Poi serve la dist con Caddy o altro
```

---

## 🔧 OPZIONI DI DEPLOYMENT

### A) Development locale (testing)

1. API su `localhost:3000`
2. Frontend con Vite dev server `localhost:5173`
3. Caddy reverse proxy davanti

### B) Docker Compose (staging)

Usare i file in `deploy/aruba/`:
- `compose.api.yaml`
- `compose.auth-staging.yaml`
- `Caddyfile.staging`

### C) Produzione Aruba

Seguire `deploy/aruba/MIGRATION-PROCEDURE-STEP-BY-STEP.md`

---

## ❓ DOMANDE APERTE

1. **Schema API**: L'API Aruba si aspetta tabelle specifiche (`character_drafts`, `campaign_documents`, etc.) che potrebbero essere diverse da Supabase. Verificare mappatura.

2. **Auth**: L'API richiede `hollowgate_auth_test` database con user `hollowgate_auth_app`. Il database `hollowgate_test` potrebbe non avere le tabelle auth.

3. **Utenti**: I `profiles` di Supabase devono essere mappati al sistema auth di Aruba.

---

## 📂 FILE CHIAVE

```
deploy/aruba/data/supabase-export.json    - Backup completo Supabase
deploy/aruba/sql/create-schema.sql        - Schema DDL Aruba
deploy/aruba/scripts/migrate-real-data-v2.mjs - Script ETL
apps/aruba-api/src/index.mjs              - Entry point API
apps/aruba-vtt-pilot/src/client.mjs       - Client API
```

---

**Vuoi procedere con Step 1 (verifica schema API) o preferisci un approccio diverso?**
