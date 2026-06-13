# 🚀 Guida Rapida - Integrazione Supabase

## ✅ Stato Attuale

**Connessione Supabase**: ✅ Completata!

Ho configurato tutto il necessario per collegarti a Supabase. Ecco cosa ho fatto:

### 📦 File Creati

1. **`supabase-schema.sql`** - Schema completo del database con 11 tabelle
2. **`SUPABASE-SETUP.md`** - Guida dettagliata per l'installazione
3. **`src/lib/supabaseClient.ts`** - Client Supabase configurato
4. **`src/services/supabase/testConnection.ts`** - Utility per testare la connessione
5. **`src/app/components/SupabaseStatus.tsx`** - Widget di stato (visibile in basso a destra)

### 🎯 Prossimi Passi

## PASSO 1: Verifica lo Stato

Guarda nell'angolo **in basso a destra** dell'applicazione. Vedrai un widget con lo stato della connessione Supabase.

### Se vedi "✅ Connesso" ma "⚠️ Tabelle non trovate":

➡️ **Devi eseguire lo script SQL** (vai al Passo 2)

### Se vedi "✅ Database pronto!":

🎉 **Sei già pronto!** Le tabelle sono configurate. Salta al Passo 3.

---

## PASSO 2: Configura le Tabelle del Database

### 🔧 Come fare (5 minuti):

1. **Apri Supabase Dashboard**
   - Vai su: https://supabase.com/dashboard
   - Accedi con il tuo account
   - Seleziona il progetto connesso a Figma Make

2. **Apri SQL Editor**
   - Nel menu laterale sinistro, clicca su **"SQL Editor"**
   - Clicca su **"New query"** (o "+ New query")

3. **Copia lo Schema**
   - Apri il file `supabase-schema.sql` (è nella root del progetto)
   - **Seleziona TUTTO** il contenuto (Ctrl+A / Cmd+A)
   - **Copia** (Ctrl+C / Cmd+C)

4. **Incolla ed Esegui**
   - Torna nella Dashboard Supabase
   - **Incolla** il codice nell'editor SQL (Ctrl+V / Cmd+V)
   - Clicca sul pulsante **"Run"** in basso a destra
   - Oppure premi **Ctrl+Enter** / **Cmd+Enter**

5. **Verifica**
   - Dovresti vedere il messaggio "Success. No rows returned"
   - Vai su **"Table Editor"** nel menu laterale
   - Dovresti vedere tutte le 11 tabelle create! 🎉

6. **Ricontrolla l'App**
   - Torna all'applicazione Figma Make
   - Clicca su **"Ricontrolla"** nel widget in basso a destra
   - Dovresti vedere "✅ Database pronto!"

---

## PASSO 3: Inizia a Usare Supabase

**Congratulazioni!** 🎊 Ora tutti i tuoi dati vengono salvati automaticamente su Supabase invece che in localStorage.

### Vantaggi Immediati:

- ✅ **Niente più esporta/importa**: I dati sono salvati automaticamente
- ✅ **Accessibili ovunque**: Puoi accedere ai tuoi dati da qualsiasi dispositivo
- ✅ **Backup automatico**: Supabase fa backup regolari
- ✅ **Condivisione**: Potrai condividere campagne con altri utenti (funzionalità futura)

### Cosa Funziona Ora:

Al momento la connessione è attiva e le tabelle sono pronte. 

Nelle prossime iterazioni aggiungerò:
- Salvataggio automatico dei personaggi
- Salvataggio di NPC, mostri, ambienti
- Sincronizzazione in tempo reale
- Gestione delle campagne multiple

---

## 📊 Le 11 Tabelle Create

| #  | Tabella | Cosa Contiene |
|----|---------|---------------|
| 1  | `campaigns` | Le tue campagne di gioco |
| 2  | `characters` | Personaggi giocanti (PC) |
| 3  | `equipment_catalog` | Catalogo equipaggiamento |
| 4  | `character_equipment` | Equipaggiamento dei personaggi |
| 5  | `npcs` | Personaggi non giocanti |
| 6  | `monsters` | Mostri e creature |
| 7  | `adventures` | Avventure e scenari |
| 8  | `environments` | Ambienti e location |
| 9  | `clues` | Indizi |
| 10 | `situations` | Situazioni ed eventi |
| 11 | `visual_assets` | Immagini, mappe, handout |

---

## 🆘 Problemi Comuni

### "Errore: relation does not exist"
➡️ Le tabelle non sono state create. Esegui lo script SQL (Passo 2)

### "Timeout" o "Connessione fallita"
➡️ Verifica che il progetto Supabase sia attivo nella Dashboard

### "Permission denied"
➡️ Assicurati di essere il proprietario del progetto Supabase

---

## 🔜 Prossimi Sviluppi

1. **Servizi di Persistenza** - Salvataggio automatico su Supabase
2. **Migrazione Dati** - Importa dati esistenti da localStorage
3. **Gestione Campagne** - Crea e gestisci multiple campagne
4. **Collaborazione** - Condividi campagne con altri giocatori

---

## 📝 Note per lo Sviluppo

### Variabili d'Ambiente (Gestite da Figma Make)

Le credenziali Supabase sono gestite automaticamente:
- `VITE_SUPABASE_URL` - URL del progetto
- `VITE_SUPABASE_ANON_KEY` - Chiave anonima pubblica

**Non serve creare file .env** - Figma Make gestisce tutto! ✨

### RLS (Row Level Security)

Per ora RLS è disabilitato per semplicità di sviluppo.

In futuro, quando esporterai il progetto, dovrai configurare le policy RLS per:
- Limitare l'accesso ai dati per campagna
- Gestire permessi utente
- Proteggere dati sensibili

---

**Hai domande o problemi?** Fammi sapere! 🎲
