# ARUBA VTT - AMBIENTE LOCALE ATTIVO

**Data:** 17 novembre 2026 ore 23:30 UTC  
**Status:** ✅ FUNZIONANTE

---

## 🌐 URL DI ACCESSO

| Servizio | URL |
|---|---|
| **Frontend** | https://localhost:5173/vtt/ |
| **API Health** | http://localhost:3000/health |
| **API Ready** | http://localhost:3000/ready |

**Nota:** Il browser mostrerà un avviso per il certificato self-signed. Clicca "Avanzate" → "Procedi comunque".

---

## 📊 DATABASE

```
Container: hg-notes-real-pg
Host:      127.0.0.1:15432
Database:  hollowgate_auth_test
User:      hollowgate_auth_app
Password:  ci-only-password
```

### Dati migrati da Supabase:

| Tabella | Record |
|---|---|
| users | 56 |
| campaigns | 48 |
| campaign_members | 18 |
| character_drafts | 12 |
| chapter_documents | 17 |
| scene_documents | 3 |
| chat_messages | 67 |
| entity_notes | 37 |
| folders | 2 |

---

## 🚀 COME AVVIARE

### Opzione 1: Script automatico
```powershell
cd C:\Users\Alfonso\Interfacciagiocodiruolo
.\start-aruba-local.ps1
```

### Opzione 2: Manuale

**Terminal 1 - API:**
```powershell
cd apps/aruba-api
$env:PGHOST="127.0.0.1"
$env:PGPORT="15432"
$env:PGUSER="hollowgate_auth_app"
$env:PGDATABASE="hollowgate_auth_test"
$env:POSTGRES_PASSWORD_FILE="./password.txt"
$env:PORT="3000"
$env:AUTH_STAGING_ENABLED="true"
$env:AUTH_ORIGIN="https://localhost:5173"
$env:AUTH_RATE_LIMIT_KEY_FILE="./hmac.key"
$env:RESEND_API_KEY_FILE="./resend.key"
$env:AUTH_VTT_CAMPAIGNS_ENABLED="true"
# ... altre variabili AUTH_VTT_*
node src/index.mjs
```

**Terminal 2 - Frontend:**
```powershell
cd apps/aruba-vtt-pilot
npm run dev
```

---

## 📂 FILE CHIAVE

```
start-aruba-local.ps1                    # Script avvio
apps/aruba-api/                          # Backend API
apps/aruba-vtt-pilot/                    # Frontend React
deploy/aruba/data/supabase-export.json   # Backup dati Supabase
deploy/aruba/sql/                        # Schema SQL
```

---

## ✅ CHECKLIST COMPLETATA

- [x] Database PostgreSQL locale attivo
- [x] Schema Aruba (34+ migrations) applicato
- [x] Dati migrati da Supabase (339 record)
- [x] API Aruba funzionante
- [x] Frontend Aruba compilato
- [x] Proxy API configurato
- [x] HTTPS abilitato

---

## ⚠️ NOTE IMPORTANTI

1. **Certificato self-signed**: Il browser mostrerà un avviso. È normale per sviluppo locale.

2. **Login**: Il sistema richiede autenticazione. Gli utenti migrati da Supabase sono presenti ma potrebbero aver bisogno di password reset.

3. **Visual Assets**: Le immagini (visual_assets) non sono state migrate perché richiedono download binario separato.

4. **Supabase**: Il sistema ora è **completamente indipendente** da Supabase/Vercel.

---

## 🔧 TROUBLESHOOTING

### API non risponde
```powershell
# Verifica PostgreSQL
docker ps --filter "name=hg-notes-real-pg"

# Se non attivo:
docker start hg-notes-real-pg
```

### Frontend non carica
```powershell
# Pulisci cache
Remove-Item -Recurse apps/aruba-vtt-pilot/node_modules/.vite
npm run dev
```

### Errori database
```powershell
# Verifica connessione
docker exec hg-notes-real-pg psql -U postgres -d hollowgate_auth_test -c "SELECT 1"
```

---

**Ambiente pronto per sviluppo e test!** 🚀
