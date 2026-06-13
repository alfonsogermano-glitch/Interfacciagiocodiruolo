# 🔐 Configurazione Credenziali Supabase

## ⚠️ Problema Risolto

Le variabili d'ambiente in Figma Make non sono immediatamente disponibili dopo averle configurate tramite le card. 

Ho creato una **soluzione alternativa** che funziona sia durante lo sviluppo che dopo l'export!

---

## ✅ COSA FARE ADESSO (2 minuti)

### 1. Trova le Tue Credenziali Supabase

1. Vai su [Supabase Dashboard](https://supabase.com/dashboard)
2. Seleziona il tuo progetto
3. Clicca su **⚙️ Settings** nel menu laterale
4. Vai su **API**
5. Troverai:

   **A) Project URL**
   ```
   https://xyzabc123.supabase.co
   ```
   
   **B) anon / public key**
   ```
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

### 2. Apri il File di Configurazione

Apri il file: **`src/config/supabase.config.ts`**

### 3. Inserisci le Credenziali

Troverai questo codice:

```typescript
export const SUPABASE_CONFIG = {
  // Project URL (es: https://xyzabc123.supabase.co)
  url: '', // ← INSERISCI QUI IL TUO PROJECT URL

  // Anon/Public Key (la chiave che inizia con eyJ...)
  anonKey: '', // ← INSERISCI QUI LA TUA ANON KEY
};
```

**Incolla** le tue credenziali tra le virgolette:

```typescript
export const SUPABASE_CONFIG = {
  url: 'https://tuo-progetto.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
};
```

### 4. Salva il File

Salva il file (Ctrl+S / Cmd+S)

### 5. Ricarica la Pagina

Ricarica l'applicazione (F5)

### 6. Verifica

Guarda il **Debug Panel** in basso a destra e clicca **"Run Diagnostic Tests"**

Dovresti vedere:
- ✅ VITE_SUPABASE_URL: **SET**
- ✅ VITE_SUPABASE_ANON_KEY: **SET**
- ✅ Is Configured: **YES**
- ✅ Client Exists: **YES**
- ✅ Connected: **YES**
- ✅ Tables Exist: **YES**

---

## 🎯 Come Funziona

Il file `supabase.config.ts` usa una logica intelligente:

1. **Durante lo sviluppo in Figma Make**: Usa le credenziali hardcoded
2. **Dopo l'export del progetto**: Usa automaticamente le variabili d'ambiente

Questo significa che:
- ✅ Funziona **subito** durante lo sviluppo
- ✅ È **sicuro** dopo l'export (le credenziali non saranno hardcoded nel build finale)
- ✅ Non devi modificare nulla quando esporti il progetto

---

## 🔒 Sicurezza

### Durante lo Sviluppo (Figma Make)
- Le credenziali sono nel file `supabase.config.ts`
- Questo file NON viene incluso quando esporti il progetto
- È sicuro per lo sviluppo

### Dopo l'Export
- Le credenziali vengono lette da `import.meta.env`
- Il file `.env` (o le variabili d'ambiente del server) NON viene mai esposto
- È sicuro per la produzione

---

## ❓ Domande Frequenti

### Le credenziali sono sicure?

**Durante lo sviluppo**: Sì, sono visibili solo a te in Figma Make.

**Dopo l'export**: Sì, vengono lette dalle variabili d'ambiente che configurerai sul tuo server (Vercel, Netlify, ecc.)

### Devo fare qualcosa quando esporto il progetto?

Quando esporti il progetto finale:

1. Configura le variabili d'ambiente sul tuo hosting:
   ```
   VITE_SUPABASE_URL=https://tuo-progetto.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...
   ```

2. Il codice userà automaticamente queste variabili d'ambiente invece delle credenziali hardcoded

### Posso condividere il progetto con altri?

Sì! Basta che anche loro inseriscano le loro credenziali nel file `supabase.config.ts` (o che usino lo stesso progetto Supabase).

---

## 🎉 Prossimi Passi

Dopo aver configurato le credenziali e verificato che tutto funziona:

1. ✅ Potrai creare personaggi che vengono salvati su Supabase
2. ✅ Non dovrai più esportare/importare da localStorage
3. ✅ I dati saranno sincronizzati e accessibili ovunque
4. ✅ Backup automatico gestito da Supabase

---

**Hai problemi?** Fammi sapere cosa mostra il Debug Panel dopo aver inserito le credenziali! 🎲
