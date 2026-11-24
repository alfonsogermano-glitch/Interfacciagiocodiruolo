# Aggiornamenti: contratto operativo

Stato: procedura in costruzione, NON pronta per il deploy. Questo documento
sostituisce le istruzioni di usare `install-private.sh` per aggiornare il sito.

## Una sola responsabilità per fase

1. **Agente, locale:** verifica commit, test, build con codice di uscita zero,
   manifest e assenza di dati/segreti nel bundle. Nessun export storico, ETL o
   installatore iniziale nel pacchetto di aggiornamento.
2. **Agente, preparazione:** carica in directory nuova e univoca, mai nella
   directory attiva. Non cancella percorsi attivi. Controlla hash prima di
   estrarre; nessuna sovrascrittura di file esistenti.
3. **Preflight VPS:** verifica configurazione effettiva, presenza dei bind
   sorgente, immagine precedente conservata, spazio e backup PostgreSQL con
   restore provato in isolamento. La validazione Compose da sola non basta.
4. **Accettazione privata:** candidato su database clonato, rete/alias/porta
   separati, test delle funzioni reali. Nessuna prova sul database operativo.
5. **Operatore:** un solo comando breve avvia il runner root-owned revisionato
   con ID/hash fissati. Il runner prende un lock, scrive log protetto e mostra
   fase, risultato e codice di uscita. I privilegi non dipendono da variabili
   esportate prima di sudo. Non usare pipe verso tail per decidere il successo.
6. **Promozione:** solo dopo tutti i gate; preserva secret, reti e OAuth,
   aggiorna API/frontend come coppia verificata e controlla la versione servita,
   non soltanto HTTP 200. Nessuna migrazione implicita o ETL.
7. **Errore:** rollback applicativo verificato a immagine e frontend precedenti.
   Mai ripristinare automaticamente un dump sopra dati operativi. Migrazioni
   richiedono piano separato esplicito e compatibile col rollback.

## Situazione attuale

- Segreti recuperati e ripristinati; Compose candidato sintatticamente valido.
- Mancano ancora prova di equivalenza del Compose, restore PostgreSQL isolato,
  accettazione browser pulita e audit delle tranche catalogo recenti.
- Storico non verificato e nuovo editor globale sono disattivati nel runtime.
  Il codice sperimentale resta conservato, non dichiarato completo.
- Non applicare SQL catalog/007: la sua API helper pubblicata al runtime permette
  revisioni NULL e non replica i controlli di contesto del catalogo 005.
- Il runner di promozione non è ancora implementato/provato: non fornire un
  comando di installazione per aggirare questi blocchi.

Controlli locali ripetibili:

```powershell
node deploy/aruba/production/verify-update.mjs
```

Questo comando produce log e rapporto, non un rilascio e non modifica il VPS.
