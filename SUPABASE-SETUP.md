# 🎲 Configurazione Database Supabase - High School Cthulhu

## ✅ Passo 1: Connessione Completata
La connessione tra Figma Make e Supabase è stata completata con successo!

## 📋 Passo 2: Applicare lo Schema al Database

Per configurare tutte le tabelle necessarie nel tuo database Supabase, segui questi passi:

### Opzione A: Tramite Supabase Dashboard (Consigliato)

1. **Accedi alla Dashboard Supabase**
   - Vai su [https://supabase.com/dashboard](https://supabase.com/dashboard)
   - Accedi con il tuo account
   - Seleziona il progetto che hai connesso a Figma Make

2. **Apri SQL Editor**
   - Nel menu laterale, clicca su "SQL Editor"
   - Clicca su "New query"

3. **Copia e Incolla lo Schema**
   - Apri il file `supabase-schema.sql` nella root del progetto
   - Copia **tutto** il contenuto
   - Incolla nell'editor SQL di Supabase

4. **Esegui lo Script**
   - Clicca sul pulsante "Run" (o premi Ctrl/Cmd + Enter)
   - Attendi il completamento (dovrebbe richiedere pochi secondi)
   - Verifica che non ci siano errori

### Opzione B: Tramite Supabase CLI (Avanzato)

Se hai installato [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase db push supabase-schema.sql
```

## 🗂️ Tabelle Create

Lo schema crea le seguenti tabelle:

| Tabella | Descrizione |
|---------|-------------|
| `campaigns` | Campagne/Sessioni di gioco |
| `characters` | Personaggi giocanti (PC) |
| `equipment_catalog` | Catalogo equipaggiamento disponibile |
| `character_equipment` | Equipaggiamento assegnato ai personaggi |
| `npcs` | Personaggi non giocanti |
| `monsters` | Mostri e creature |
| `adventures` | Avventure e scenari |
| `environments` | Ambienti e location |
| `clues` | Indizi |
| `situations` | Situazioni ed eventi |
| `visual_assets` | Asset visuali (immagini, mappe, ecc.) |

## 🔐 Passo 3: Configurare le Policy RLS (Opzionale ma Consigliato)

Le Row Level Security (RLS) policies permettono di controllare chi può accedere ai dati.

**Per ora puoi saltare questo passo** - le tabelle sono accessibili con la chiave anonima.

Se vuoi configurare RLS in futuro:
1. Vai su "Authentication" → "Policies" nella Dashboard Supabase
2. Abilita RLS per ogni tabella
3. Crea policy personalizzate basate su `campaign_id` e `owner_profile_id`

## 🚀 Passo 4: Verifica

Dopo aver eseguito lo script SQL, verifica che tutto sia andato a buon fine:

1. Nella Dashboard Supabase, vai su "Table Editor"
2. Dovresti vedere tutte le 11 tabelle elencate
3. Clicca su una tabella (es. `campaigns`) per vedere la struttura

## ✨ Prossimi Passi

Ora che il database è configurato, posso:
1. ✅ Creare i servizi per salvare/caricare dati da Supabase
2. ✅ Migrare i dati esistenti da localStorage a Supabase
3. ✅ Testare il salvataggio dei personaggi
4. ✅ Configurare il backup automatico

## ⚠️ Note Importanti

- **Backup**: Lo schema include trigger automatici per aggiornare i timestamp
- **JSONB**: I campi complessi (es. `sheet_data`, `traits`) usano JSONB per flessibilità
- **Cascade Delete**: Eliminando una campagna si eliminano automaticamente tutti i dati collegati
- **Indici**: Sono stati creati indici per ottimizzare le query più comuni

## 🆘 Problemi?

Se riscontri errori durante l'esecuzione dello script:
1. Verifica di aver copiato **tutto** il contenuto del file `supabase-schema.sql`
2. Assicurati di avere i permessi di amministratore sul progetto Supabase
3. Controlla i messaggi di errore nell'editor SQL

---

**Fatto?** Fammi sapere quando hai completato questo passo, così posso procedere con l'integrazione dei servizi! 🎮
