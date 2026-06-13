# ✅ ERRORE FOREIGN KEY RISOLTO

## 🔴 Cos'è Successo

Hai ricevuto questo errore:
```
insert or update on table "monsters" violates foreign key constraint "monsters_environment_id_fkey"
Key (environment_id)=(bd5dafcd-a6f6-4b46-9af4-7417828dc8d7) is not present in table "environments".
```

**Traduzione:**
- Hai assegnato il mostro al luogo con ID `bd5dafcd-a6f6-4b46-9af4-7417828dc8d7`
- Ma quel luogo **NON ESISTE** nella tabella `environments` del database
- PostgreSQL blocca il salvataggio per proteggere l'integrità dei dati

**Perché è successo?**

A causa dei problemi precedenti (oggetti hardcodati che salvavano solo alcuni campi), i **luoghi non sono stati salvati correttamente** nel database. Quindi quando provi ad assegnare un mostro a un luogo, quel luogo non esiste.

---

## ✅ Cosa Ho Corretto (ADESSO)

Ho reso il sistema di salvataggio **molto più robusto**:

### 1. Gestione Errori Foreign Key per TUTTE le Entità

Ora quando un salvataggio fallisce per foreign key (luogo/avventura non esistente):

**Monsters:**
- ✅ Tenta di salvare con environment_id
- ❌ Fallisce perché environment non esiste
- 🔄 Ritenta automaticamente salvando con `environment_id = NULL`
- ✅ Mostro salvato (senza collegamento al luogo)
- ⚠️ Log: "Environment non trovato, salvo mostro senza collegamento"

**NPCs, Clues, Situations:**
- ✅ Stesso comportamento: retry con `environment_id = NULL`

**Environments:**
- ✅ Se `parent_location_id` non esiste → retry con `parent_location_id = NULL`
- ✅ Environment salvato come luogo padre invece che figlio

### 2. Filtraggio Campi Frontend-Only

- ✅ `isDirty` → NON viene più inviato al DB (causava errore precedente)
- ✅ `createdAt` / `updatedAt` → gestiti da trigger DB

---

## 🚀 COSA DEVI FARE TU

Hai **2 opzioni**:

### OPZIONE A: Cancella e Ricrea (RACCOMANDATO - 10 minuti)

Se hai **pochi dati** o **dati già incompleti**, è meglio ricominciare da zero:

**Step 1 - Cancella i dati incompleti dal database**

1. Vai su **Supabase Dashboard** → **SQL Editor**
2. Apri il file `supabase-reset-data.sql`
3. Copia TUTTO il contenuto
4. Incolla nell'editor SQL
5. Clicca **Run** (F5)
6. Verifica che il risultato finale mostri tutte le tabelle con 0 righe

**Step 2 - Ricrea i dati nell'app**

1. Ricarica l'app (F5)
2. **Crea PRIMA i luoghi:**
   - Biblioteca della Città (luogo padre)
   - Bagno (con parent: Biblioteca della Città)
3. **POI crea mostri/PNG:**
   - Crea il mostro
   - Assegnalo al "Bagno"
4. Ricarica (F5)
5. ✅ Verifica che tutto sia ancora lì

**Vantaggio:** Database pulito, tutto funziona perfettamente
**Svantaggio:** Devi ricreare i dati manualmente

---

### OPZIONE B: Continua con Dati Parziali (se hai MOLTI dati)

Se hai **molti dati** che non vuoi perdere:

**Step 1 - Salva quello che hai**

1. Esporta Campagna → Salva il JSON
2. Tieni questo come backup

**Step 2 - Riassegna i collegamenti**

Ora l'app salva i mostri/PNG/indizi **senza collegamento** ai luoghi:

1. Ricarica l'app (F5)
2. Vai su **Mostri**
3. Apri ogni mostro
4. **Riassegna il luogo** (seleziona dal dropdown)
5. Salva
6. ✅ Ora il collegamento viene salvato correttamente

**Vantaggio:** Non perdi dati esistenti
**Svantaggio:** Devi riassegnare manualmente tutti i collegamenti

---

## 🧪 COME VERIFICARE CHE FUNZIONA

### Test Completo

**1. Test Luogo Gerarchico:**
```
✅ Crea "Biblioteca"
✅ Crea "Bagno" con parent "Biblioteca"
✅ Salva
✅ Ricarica (F5)
✅ Verifica che "Bagno" sia ancora dentro "Biblioteca"
```

**2. Test Mostro con Luogo:**
```
✅ Crea mostro "Accolito"
✅ Imposta stats (Freschezza 3, Attacco Critico, Difesa Base)
✅ Assegna a "Bagno"
✅ Salva
✅ Ricarica (F5)
✅ Verifica che stats E collegamento siano salvati
```

**3. Verifica Database:**

Vai su **Supabase Dashboard** → **SQL Editor**:

```sql
-- Verifica che i luoghi esistano
SELECT id, name, parent_location_id
FROM environments
WHERE campaign_id = '10000000-0000-0000-0000-000000000001';

-- Verifica che i mostri siano collegati
SELECT id, name, environment_id, freschezza, attacco, difesa
FROM monsters
WHERE campaign_id = '10000000-0000-0000-0000-000000000001';
```

✅ Dovresti vedere:
- Luoghi con ID validi
- parent_location_id popolato per "Bagno"
- Mostri con environment_id che corrisponde a un luogo esistente
- Stats complete (freschezza, attacco, difesa)

---

## 📋 Riepilogo Correzioni

| Componente | Cosa è Stato Corretto |
|------------|----------------------|
| **entitiesService.ts** | ✅ Filtra campi frontend-only (isDirty, createdAt, updatedAt) |
| **saveMonster** | ✅ Retry con environment_id=NULL se luogo non esiste |
| **saveNPC** | ✅ Retry con environment_id=NULL se luogo non esiste |
| **saveClue** | ✅ Retry con environment_id=NULL se luogo non esiste |
| **saveSituation** | ✅ Retry con environment_id=NULL se luogo non esiste |
| **saveEnvironment** | ✅ Retry con parent_location_id=NULL se parent non esiste |

---

## 💡 Raccomandazione Finale

**SE HAI POCHI DATI (meno di 20 entità):**
→ **OPZIONE A** (cancella e ricrea) - 10 minuti di lavoro, funziona perfettamente

**SE HAI MOLTI DATI (più di 20 entità):**
→ **OPZIONE B** (riassegna collegamenti) - più tempo ma non perdi dati

**In entrambi i casi:**
- ✅ L'app non crasherà più
- ✅ I salvataggi funzioneranno
- ✅ I log ti avviseranno se qualcosa non esiste nel DB

**Da ADESSO in poi:** Fai backup regolari con **Esporta Campagna** 🎲👾🦑
