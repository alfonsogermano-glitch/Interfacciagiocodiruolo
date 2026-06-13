# 🗑️ COME CANCELLARE LOCALSTORAGE - GUIDA COMPLETA

## 📋 Hai 3 Metodi Disponibili

Scegli il metodo che preferisci (dal più semplice al più tecnico):

---

## METODO 1: Pulsante nell'App (PIÙ SEMPLICE) ✅

Ho creato un componente React che puoi aggiungere temporaneamente all'app.

### Step 1: Aggiungi il componente alla pagina Impostazioni

**File:** `src/app/App.tsx`

Trova la sezione delle impostazioni e aggiungi questo import in alto:

```typescript
import { ClearLocalStorageButton } from './components/ClearLocalStorageButton';
```

Poi, nella sezione impostazioni (dove c'è `<SupabaseDebug />`), aggiungi:

```typescript
<div className="mt-6">
  <ClearLocalStorageButton />
</div>
```

### Step 2: Usa il pulsante

1. Vai su **Impostazioni** nell'app
2. Scorri fino a trovare il pulsante **"Cancella localStorage (Reset Dati Locali)"**
3. Clicca sul pulsante
4. Conferma l'azione
5. ✅ L'app ricaricherà automaticamente con localStorage pulito

**Vantaggio:** Nessuna console, tutto nell'interfaccia
**Svantaggio:** Devi modificare un file

---

## METODO 2: Script nella Console del Browser ⌨️

### Step 1: Apri la Console del Browser

**Metodi per aprire la Console:**

#### Su Chrome/Edge:
1. Clicca sul menu (⋮) in alto a destra
2. Vai su **Altri strumenti** → **Strumenti per sviluppatori**
3. Clicca sulla tab **Console**

**Oppure:** Premi `Ctrl+Shift+I` (Windows/Linux) o `Cmd+Option+I` (Mac)

#### Su Firefox:
1. Clicca sul menu (≡) in alto a destra
2. Vai su **Altri strumenti** → **Strumenti per sviluppatori web**
3. Clicca sulla tab **Console**

**Oppure:** Premi `Ctrl+Shift+K` (Windows/Linux) o `Cmd+Option+K` (Mac)

#### Su Safari:
1. Abilita il menu Sviluppo: **Safari** → **Preferenze** → **Avanzate** → spunta "Mostra menu Sviluppo nella barra dei menu"
2. Clicca su **Sviluppo** → **Mostra Console JavaScript**

**Oppure:** Premi `Cmd+Option+C` (Mac)

### Step 2: Copia e Incolla lo Script

Apri il file `clear-localStorage.txt` e copia TUTTO il contenuto.

Oppure copia direttamente questo codice:

```javascript
// Trova tutte le chiavi localStorage che iniziano con 'hsc_'
const keys = Object.keys(localStorage).filter(key => key.startsWith('hsc_'));

console.log(`Trovate ${keys.length} chiavi da cancellare:`, keys);

// Cancella ogni chiave
keys.forEach(key => {
  localStorage.removeItem(key);
  console.log(`✅ Cancellata: ${key}`);
});

console.log('✅ localStorage cancellato! Ricarica la pagina (F5)');
```

### Step 3: Esegui lo Script

1. Incolla il codice nella Console
2. Premi **Invio**
3. Vedrai messaggi di conferma per ogni chiave cancellata
4. Ricarica la pagina (F5)

**Vantaggio:** Veloce e non richiede modifiche al codice
**Svantaggio:** Devi aprire la Console

---

## METODO 3: Manualmente dalle Impostazioni del Browser 🔧

### Su Chrome/Edge:

1. Apri le **Impostazioni** del browser
2. Vai su **Privacy e sicurezza**
3. Clicca su **Cancella dati di navigazione**
4. Seleziona **Avanzate**
5. **IMPORTANTE:** Seleziona SOLO:
   - ✅ **Cookie e altri dati dei siti**
   - ❌ Deseleziona tutto il resto (cronologia, cache, password, ecc.)
6. Imposta intervallo di tempo: **Tutto**
7. Clicca **Cancella dati**

**⚠️ ATTENZIONE:** Questo cancellerà localStorage per TUTTI i siti, non solo per questa app!

### Su Firefox:

1. Apri le **Preferenze**
2. Vai su **Privacy e sicurezza**
3. Scorri fino a **Cookie e dati dei siti web**
4. Clicca su **Elimina dati...**
5. Seleziona **Cookie e dati dei siti web**
6. Clicca **Elimina**

**⚠️ ATTENZIONE:** Questo cancellerà localStorage per TUTTI i siti!

### Su Safari:

1. Apri le **Preferenze**
2. Vai su **Privacy**
3. Clicca su **Gestisci dati dei siti web...**
4. Cerca il sito dell'app
5. Selezionalo e clicca **Rimuovi**

**Vantaggio:** Non richiede console o modifiche al codice
**Svantaggio:** Più macchinoso, può cancellare dati di altri siti

---

## ✅ Verifica che localStorage Sia Stato Cancellato

Dopo aver usato uno dei metodi, verifica:

### Verifica Rapida (Console):

```javascript
// Copia e incolla nella Console
const hscKeys = Object.keys(localStorage).filter(key => key.startsWith('hsc_'));
console.log(`Chiavi hsc_ rimanenti: ${hscKeys.length}`);
console.log(hscKeys);
```

**Risultato atteso:** `Chiavi hsc_ rimanenti: 0` e array vuoto `[]`

### Verifica nell'App:

1. Ricarica la pagina (F5)
2. Vai su **Personaggi**
3. ✅ Non dovrebbero esserci personaggi (se prima c'erano dati vecchi)
4. Vai su **Luoghi**
5. ✅ Non dovrebbero esserci luoghi (tranne eventuali dati di default)

---

## 🎯 Dopo Aver Cancellato localStorage

### Se Hai GIÀ Cancellato il Database:

1. ✅ localStorage cancellato
2. ✅ Database cancellato
3. **Ora puoi ricreare i dati da zero:**
   - Crea luoghi
   - Crea personaggi
   - Crea mostri
   - Tutto verrà salvato correttamente su Supabase!

### Se NON Hai Ancora Cancellato il Database:

1. ✅ localStorage cancellato
2. ⏳ Database ancora con dati vecchi (potenzialmente incompleti)
3. **Prossimo step:** Cancella anche il database:
   - Vai su **Supabase Dashboard** → **SQL Editor**
   - Esegui `supabase-reset-data.sql`
   - Ricarica l'app (F5)

---

## 💡 Raccomandazione

**METODO PIÙ SEMPLICE:**

Se non riesci ad aprire la Console, usa **METODO 1** (Pulsante nell'App):

1. Aggiungi `<ClearLocalStorageButton />` in `App.tsx`
2. Clicca sul pulsante nelle Impostazioni
3. ✅ Fatto!

**METODO PIÙ VELOCE:**

Se riesci ad aprire la Console (anche con `Ctrl+Shift+I`), usa **METODO 2** (Script):

1. Apri Console
2. Incolla lo script
3. Premi Invio
4. ✅ Fatto!

---

## 🆘 Se Hai Ancora Problemi

Se nessuno dei metodi funziona:

1. **Dimmi quale browser stai usando** (Chrome, Firefox, Safari, Edge, altro?)
2. **Dimmi quale sistema operativo** (Windows, Mac, Linux?)
3. **Dimmi se sei in Figma Make** (web app) o **hai esportato l'app localmente**

Ti fornirò istruzioni specifiche per il tuo caso! 🎲👾🦑
