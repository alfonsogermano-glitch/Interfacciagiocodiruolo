# Hollowgate — piano di avvio backend locale completo

## Stato effettivo
Aggiunto un launcher protetto per la **Supabase CLI locale**. Non è stato ancora avviato, non è un deployment OVHcloud e non contiene il backend Hollowgate completo. Ora il repository include un `supabase/config.toml` sintetico che abilita localmente Auth, PostgreSQL 17, Realtime, Storage e API; questo **non** equivale al backend Hollowgate completo.

## Preparazione (solo computer di sviluppo)
1. Installare Docker Desktop / Docker Engine, Node.js e Supabase CLI; verificare le versioni correnti sulla documentazione ufficiale.
2. Installare **una versione fissata** di Supabase CLI come dipendenza di sviluppo e conservare il lockfile (non usare `npx --yes` o installazioni implicite). Non eseguire più `supabase init`: `supabase/config.toml` è già versionato; verificarlo prima dell'avvio. Non collegare il progetto remoto con `supabase link`.
3. Assicurarsi che non siano presenti credenziali, URL o identificativi Supabase remoti nelle variabili d'ambiente; il launcher verifica un insieme esplicito di variabili e rifiuta un eventuale link `supabase/.temp/project-ref` e URL remoti evidenti in `config.toml`. I file `.env` nella root e nella directory `supabase/`, `supabase/config.json` e gli override CLI sperimentali vengono rifiutati. La revisione manuale rimane necessaria per ogni cambiamento futuro.
4. Avviare `STAGING_CONFIRM=LOCAL_ONLY bash infra/staging/local-supabase.sh start`. Per vedere stato o fermare: sostituire `start` con `status` o `stop`.
5. Usare soltanto utenti, campagne e immagini **sintetici**. Non usare service role key, dump o JWT secret di produzione.

## Integrazione Hollowgate ancora necessaria
- **DB e RLS**: estrarre e revisionare lo schema applicativo e le policy, trasformarlo in migrazioni riproducibili, testare accesso fra campagne e ruoli.
- **Auth**: testare signup/login/logout/refresh/reset con email di prova e redirect locali.
- **Storage**: creare bucket locali con policy equivalenti e verificare upload/download di file sintetici.
- **Realtime**: verificare publication, channel subscriptions, autorizzazioni e reconnect.
- **Funzioni**: portare `make-server-771c5bfd` (import `functions/server/index.tsx` e `kv_store.tsx`) e `dice-secret-roll` dal codice effettivamente distribuito, preservando la struttura dei moduli e senza includere segreti. Verificare route, JWT e dipendenze Deno.
- **Integrazioni**: usare credenziali e ambienti di test per Gemini e Resend; non chiamare servizi esterni durante test di base.
- **Client**: puntare una build di staging verso endpoint locali, senza modificare variabili di produzione.

## Criteri di verifica
Non dichiarare completato il backend finché login, permessi RLS, mappe, dadi segreti, immagini, realtime, backup/ripristino e integrazioni non superano test ripetibili. Il solo comando `supabase start` non garantisce compatibilità con il backend attualmente distribuito.

## Rischi operativi
Non eseguire `supabase db reset`, `supabase db push`, `supabase link`, `supabase functions deploy` o comandi distruttivi sul progetto reale. Il launcher si rifiuta di avviarsi se rileva un link locale o variabili di credenziali remote; questa è una protezione aggiuntiva, non una garanzia assoluta di isolamento.

## Test automatici della protezione locale
```bash
bash tests/infrastructure/test-local-supabase.sh
```
Il test usa eseguibili simulati: non avvia Docker, non si collega a Supabase e non consuma credenziali. GitHub Actions lo esegue sulle modifiche allo staging. La versione CLI non è ancora fissata nel repository: fino all'installazione esplicita e alla configurazione locale il launcher si rifiuterà correttamente di partire.

## Configurazione presente nella PR #47
- `supabase/config.toml`: definisce uno stack **locale sintetico** con API, PostgreSQL 17, Auth, Realtime e Storage; email di test tramite Inbucket.
- `python3 tests/infrastructure/verify-local-config.py`: verifica TOML e assenza di riferimenti noti alla produzione.
- Prima di avviare la CLI, creare un network Docker con bind localhost seguendo la documentazione ufficiale: https://supabase.com/docs/guides/local-development . Non esporre le porte a Internet.
- Non sono ancora state importate le migrazioni applicative, i bucket originali né le due Edge Functions. Nessun test d'integrazione con servizi reali è stato eseguito.
