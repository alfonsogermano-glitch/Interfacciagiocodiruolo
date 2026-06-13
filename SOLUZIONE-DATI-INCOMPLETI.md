# 🔧 SOLUZIONE DATI INCOMPLETI NEL DATABASE

## 🔴 Il Problema

Hai eseguito la migrazione SQL che ha AGGIUNTO le colonne al database ✅
Ma i **dati già salvati** nel database NON hanno quei valori popolati ❌

**Perché?**

1. Prima della correzione, l'app salvava solo alcuni campi (es. name, description)
2. I campi nuovi (parentLocationId, environmentId, ecc.) venivano IGNORATI
3. Quando ricarichi, l'app legge dal DB dati incompleti
4. Il Bagno non ha `parentLocationId` → diventa luogo padre
5. Il Mostro non ha `attacco`, `difesa`, `customTraits` → stats spariscono

## ✅ Cosa è Stato Corretto (ADESSO)

Ho appena corretto **5 componenti**:

1. ✅ **EnvironmentManager** - ora salva TUTTI i campi (parentLocationId, locationType, iconId, ecc.)
2. ✅ **MonstersManager** - ora salva TUTTI i campi (environmentId, attacco, difesa, customTraits, ecc.)
3. ✅ **NPCManager** - ora salva TUTTI i campi (environmentId, freschezza, attacco, personality, ecc.)
4. ✅ **CluesManager** - ora salva TUTTI i campi (environmentId, location, connectedTo)
5. ✅ **SituationsManager** - ora salva TUTTI i campi (environmentId, adventureId, choices)

**Da ADESSO in poi**, tutti i nuovi dati verranno salvati COMPLETI nel database.

---

## 🚀 SOLUZIONI PER RECUPERARE I DATI ESISTENTI

Hai **3 opzioni**:

### OPZIONE 1: Reimporta da Backup (SE HAI UN EXPORT)

Se hai un file JSON di export recente:

1. Vai su **Impostazioni** → **Importa/Esporta**
2. Clicca **Importa Campagna**
3. Seleziona il file JSON di backup
4. ✅ I dati verranno importati con TUTTI i campi

**Vantaggio:** Recuperi tutto immediatamente
**Svantaggio:** Serve un backup recente

---

### OPZIONE 2: Ricarica da localStorage (SE HAI DATI LOCALI)

Se i dati **buoni** sono ancora in localStorage (non sono stati sovrascritti):

1. Apri **DevTools** (F12)
2. Tab **Console**
3. Esegui questo script per vedere cosa c'è in localStorage:

```javascript
// Verifica environments in localStorage
const envs = JSON.parse(localStorage.getItem('hsc_environments_v2') || '[]');
console.log('Environments in localStorage:', envs);

// Verifica monsters
const monsters = JSON.parse(localStorage.getItem('hsc_monsters_v2') || '[]');
console.log('Monsters in localStorage:', monsters);

// Verifica NPCs
const npcs = JSON.parse(localStorage.getItem('hsc_npcs_v2') || '[]');
console.log('NPCs in localStorage:', npcs);
```

4. Se vedi i dati completi (con parentLocationId, environmentId, stats, ecc.), fai:
   - **Esporta Campagna** → Salva il JSON
   - **Cancella i dati del database** (vedi sotto)
   - **Importa Campagna** → Seleziona il JSON appena esportato

**Vantaggio:** Recuperi i dati completi se sono ancora in localStorage
**Svantaggio:** Se localStorage è stato sovrascritto, hai perso i dati

---

### OPZIONE 3: Cancella Database e Ricrea (FRESH START)

Se NON hai backup e NON hai dati in localStorage, devi ricominciare:

**Step 1 - Cancella dati incompleti dal database**

Vai su **Supabase Dashboard** → **SQL Editor** ed esegui:

```sql
-- ATTENZIONE: Questo cancella TUTTI i dati!
-- Fallo SOLO se hai deciso di ricominciare da zero

DELETE FROM environments WHERE campaign_id = '10000000-0000-0000-0000-000000000001';
DELETE FROM monsters WHERE campaign_id = '10000000-0000-0000-0000-000000000001';
DELETE FROM npcs WHERE campaign_id = '10000000-0000-0000-0000-000000000001';
DELETE FROM clues WHERE campaign_id = '10000000-0000-0000-0000-000000000001';
DELETE FROM situations WHERE campaign_id = '10000000-0000-0000-0000-000000000001';
DELETE FROM characters WHERE campaign_id = '10000000-0000-0000-0000-000000000001';

-- Verifica che sia tutto vuoto
SELECT 'environments' as table_name, COUNT(*) as count FROM environments
UNION ALL SELECT 'monsters', COUNT(*) FROM monsters
UNION ALL SELECT 'npcs', COUNT(*) FROM npcs
UNION ALL SELECT 'clues', COUNT(*) FROM clues
UNION ALL SELECT 'situations', COUNT(*) FROM situations
UNION ALL SELECT 'characters', COUNT(*) FROM characters;
```

**Step 2 - Ricrea i dati nell'app**

1. Ricarica l'app (F5)
2. Crea di nuovo i luoghi con le gerarchie corrette
3. Crea di nuovo i mostri con stats complete
4. Assegna i mostri ai luoghi
5. ✅ ADESSO tutto verrà salvato COMPLETO nel database!

**Vantaggio:** Database pulito e funzionante al 100%
**Svantaggio:** Devi ricreare tutto manualmente

---

## 🧪 COME VERIFICARE CHE FUNZIONA

Dopo aver reimportato/ricreato i dati:

### Test 1: Gerarchia Luoghi

1. Crea "Biblioteca della Città"
2. Crea "Bagno" e seleziona "Biblioteca della Città" come **Luogo Padre**
3. Salva
4. **Ricarica la pagina** (F5)
5. ✅ Verifica che "Bagno" sia ancora DENTRO "Biblioteca della Città"

### Test 2: Mostro con Stats

1. Crea un mostro custom
2. Imposta Freschezza, Attacco, Difesa
3. Aggiungi tratti personalizzati
4. Assegna a un luogo
5. Salva
6. **Ricarica la pagina** (F5)
7. Apri il mostro
8. ✅ Verifica che TUTTE le stats siano ancora lì

### Test 3: Verifica Database

Vai su **Supabase Dashboard** → **SQL Editor**:

```sql
-- Verifica environment con parent
SELECT
  id,
  name,
  parent_location_id,
  location_type,
  icon_id
FROM environments
WHERE campaign_id = '10000000-0000-0000-0000-000000000001';

-- Verifica monster con stats
SELECT
  id,
  name,
  environment_id,
  freschezza,
  max_freschezza,
  attacco,
  difesa,
  custom_traits
FROM monsters
WHERE campaign_id = '10000000-0000-0000-0000-000000000001';
```

✅ Dovresti vedere i campi POPOLATI (non NULL)

---

## 📋 Riepilogo

**Problema:**
- ❌ Dati vecchi nel DB hanno campi NULL/mancanti
- ❌ App caricava dati incompleti e li risalvava incompleti

**Corretto:**
- ✅ 5 componenti ora salvano TUTTI i campi
- ✅ Nuovi dati verranno salvati completi

**Da fare TU:**
- ⏳ Scegli un'opzione per recuperare/ricreare i dati
- ⏳ Testa che la gerarchia funzioni
- ⏳ Verifica che le stats vengano salvate

---

## 💡 Raccomandazione

**Se hai POCHI dati:** OPZIONE 3 (cancella e ricrea) - 15 minuti di lavoro
**Se hai MOLTI dati:** OPZIONE 1 o 2 (usa backup o localStorage) - 5 minuti

**Da ADESSO in poi:** Fai backup regolari con **Esporta Campagna** 🎲👾🦑
