# ✅ ERRORE UUID STRINGHE RISOLTO

## 🔴 Cos'è Successo

Hai ricevuto questo errore:
```
invalid input syntax for type uuid: "adv-intro-default"
invalid input syntax for type uuid: "env-library-default"
```

**Traduzione:**
- Il database PostgreSQL si aspetta UUID nel formato: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- Ma i dati in localStorage usano ID stringa: `"adv-intro-default"`, `"env-library-default"`
- Quando provi a salvare, PostgreSQL rifiuta perché non sono UUID validi

**Perché è successo?**

I dati più vecchi nell'app usavano ID stringa generati manualmente (es. `"env-library-default"`). Dopo la migrazione a UUID, alcuni dati vecchi in localStorage hanno ancora questi ID stringa.

---

## ✅ Cosa Ho Corretto (ADESSO)

Ho aggiunto un **sistema di validazione e sanitizzazione** automatica degli UUID:

### 1. Funzione di Validazione UUID

```typescript
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}
```

### 2. Funzione di Sanitizzazione

```typescript
function sanitizeUUIDs(obj: any): any {
  // Per ogni campo UUID (adventureId, environmentId, parentLocationId, ecc.)
  // Se non è un UUID valido → converti in NULL
  // Altrimenti → mantieni il valore
}
```

### 3. Applicato a TUTTE le Funzioni di Salvataggio

**Prima:**
```typescript
const dbData = toSnakeCase({
  ...environment,
  campaignId
});
```

**Dopo:**
```typescript
const dbData = toSnakeCase(sanitizeUUIDs({
  ...environment,
  campaignId
}));
```

**Funzioni aggiornate:**
- ✅ `saveEnvironment` - valida `adventureId`, `parentLocationId`
- ✅ `saveMonster` - valida `adventureId`, `environmentId`
- ✅ `saveNPC` - valida `adventureId`, `environmentId`
- ✅ `saveClue` - valida `adventureId`, `environmentId`
- ✅ `saveSituation` - valida `adventureId`, `environmentId`

---

## 🔄 Come Funziona Ora

### Scenario 1: UUID Valido ✅

```javascript
// Dati in input
{
  id: "ff73584f-821a-42fe-921c-b8ce0a017426",
  environmentId: "bd5dafcd-a6f6-4b46-9af4-7417828dc8d7"
}

// Dopo sanitizeUUIDs
{
  id: "ff73584f-821a-42fe-921c-b8ce0a017426", // ✅ Valido, mantenuto
  environmentId: "bd5dafcd-a6f6-4b46-9af4-7417828dc8d7" // ✅ Valido, mantenuto
}

// Salvato nel DB con successo ✅
```

### Scenario 2: Stringa Non-UUID ⚠️

```javascript
// Dati in input (vecchi da localStorage)
{
  id: "ff73584f-821a-42fe-921c-b8ce0a017426",
  adventureId: "adv-intro-default",  // ❌ Non è un UUID!
  parentLocationId: "env-library-default"  // ❌ Non è un UUID!
}

// Dopo sanitizeUUIDs
{
  id: "ff73584f-821a-42fe-921c-b8ce0a017426", // ✅ Valido, mantenuto
  adventureId: null,  // ⚠️ Convertito in null (con warning nel log)
  parentLocationId: null  // ⚠️ Convertito in null (con warning nel log)
}

// Salvato nel DB con successo ✅
// Ma: senza collegamenti ad avventura/parent location
```

### Log di Warning

Quando un ID stringa viene convertito in null, vedrai nel log:

```
⚠️ Campo adventureId contiene ID non-UUID: "adv-intro-default" → convertito in null
⚠️ Campo parentLocationId contiene ID non-UUID: "env-library-default" → convertito in null
```

---

## 🚀 COSA FARE ADESSO

L'errore è risolto! L'app non crasherà più. MA:

### ⚠️ ATTENZIONE: Collegamenti Persi

Se avevi dati con ID stringa:
- ❌ Il "Bagno" NON sarà più figlio di "Biblioteca" (parentLocationId → null)
- ❌ I mostri NON saranno più collegati ai luoghi (environmentId → null)
- ❌ Le entità NON saranno più collegate ad avventure (adventureId → null)

### Hai 2 Opzioni:

#### OPZIONE A: Continua (Collegamenti Persi) ⚠️

1. Ricarica l'app (F5)
2. L'app funzionerà, ma senza collegamenti
3. **Manualmente riassegna** i luoghi ai mostri/PNG/indizi
4. **Ricrea la gerarchia** dei luoghi (seleziona parent)

**Vantaggio:** Nessuna perdita di dati principali (nomi, descrizioni, stats)
**Svantaggio:** Devi riassegnare manualmente tutti i collegamenti

---

#### OPZIONE B: Reset Completo (RACCOMANDATO) ✅

Se hai **pochi dati** o **dati incompleti**, ricomincia da zero:

**Step 1 - Cancella dati dal database**

1. Dashboard Supabase → SQL Editor
2. Esegui `supabase-reset-data.sql`
3. Verifica: tutte le tabelle a 0 righe

**Step 2 - Cancella localStorage**

1. Apri DevTools (F12) → Tab **Application** (o **Storage**)
2. Sidebar sinistra → **Local Storage** → seleziona il dominio
3. Trova e cancella tutte le chiavi che iniziano con `hsc_`
4. Ricarica la pagina (F5)

**Step 3 - Ricrea i dati**

1. **Crea luoghi PRIMA:**
   - Biblioteca della Città (luogo padre)
   - Bagno (seleziona parent: Biblioteca)
2. **POI crea mostri/PNG:**
   - Crea il mostro
   - Assegnalo al luogo
3. Ricarica (F5)
4. ✅ Verifica che tutto sia ancora lì

**Vantaggio:** Database e localStorage puliti, tutto funziona al 100%
**Svantaggio:** Devi ricreare i dati manualmente

---

## 🧪 COME VERIFICARE CHE FUNZIONA

### Test 1: Crea Luogo con Parent

```
1. Crea "Biblioteca della Città"
2. Crea "Bagno"
3. Seleziona parent: "Biblioteca della Città"
4. Salva
5. Ricarica (F5)
6. ✅ Verifica che "Bagno" sia ancora dentro "Biblioteca"
```

### Test 2: Assegna Mostro a Luogo

```
1. Crea mostro "Accolito"
2. Assegna al luogo "Bagno"
3. Salva
4. Ricarica (F5)
5. ✅ Verifica che il mostro sia ancora nel "Bagno"
```

### Test 3: Verifica Database

Dashboard Supabase → SQL Editor:

```sql
-- Verifica che gli UUID siano validi
SELECT
  id,
  name,
  adventure_id,
  parent_location_id
FROM environments
WHERE campaign_id = '10000000-0000-0000-0000-000000000001';

-- Tutti gli ID devono essere in formato UUID o NULL
-- NON devono esserci stringhe come "adv-intro-default"
```

✅ Risultato atteso:
- `id`: UUID valido
- `adventure_id`: UUID valido o NULL
- `parent_location_id`: UUID valido o NULL
- **MAI** stringhe come "adv-intro-default"

---

## 📋 Riepilogo Correzioni

| Componente | Cosa è Stato Corretto |
|------------|----------------------|
| **entitiesService.ts** | ✅ Aggiunta funzione `isValidUUID()` |
| **entitiesService.ts** | ✅ Aggiunta funzione `sanitizeUUIDs()` |
| **saveEnvironment** | ✅ Sanitizza UUID prima di salvare |
| **saveMonster** | ✅ Sanitizza UUID prima di salvare |
| **saveNPC** | ✅ Sanitizza UUID prima di salvare |
| **saveClue** | ✅ Sanitizza UUID prima di salvare |
| **saveSituation** | ✅ Sanitizza UUID prima di salvare |

---

## 💡 Raccomandazione Finale

**SE HAI POCHI DATI (< 10 entità):**
→ **OPZIONE B** (reset completo) - 15 minuti, funziona perfettamente

**SE HAI MOLTI DATI (> 10 entità):**
→ **OPZIONE A** (riassegna collegamenti) - più tempo ma mantieni i dati

**In entrambi i casi:**
- ✅ L'app non crasherà più
- ✅ I salvataggi funzioneranno
- ✅ Gli UUID invalidi verranno automaticamente convertiti in NULL
- ✅ Vedrai warning nel log quando succede

**Da ADESSO in poi:**
- ✅ Tutti i nuovi dati useranno UUID validi
- ✅ Nessun errore di tipo UUID
- ✅ Compatibilità 100% con PostgreSQL

🎲👾🦑
