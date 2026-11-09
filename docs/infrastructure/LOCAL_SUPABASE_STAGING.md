# Hollowgate — piano di avvio backend locale completo

## Stato effettivo
Aggiunto un launcher protetto per la **Supabase CLI locale**. Non è stato ancora avviato, non è un deployment OVHcloud e non contiene il backend Hollowgate completo. Al momento il repository non ha `supabase/config.toml`.

## Preparazione (solo computer di sviluppo)
1. Installare Docker Desktop / Docker Engine, Node.js e Supabase CLI; verificare le versioni correnti sulla documentazione ufficiale.
2. Da root repository eseguire `npx supabase init`, poi esaminare `supabase/config.toml` prima di committarlo. Non collegare il progetto remoto con `supabase link`.
3. Assicurarsi che `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD` non siano presenti nell'ambiente di test.
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
