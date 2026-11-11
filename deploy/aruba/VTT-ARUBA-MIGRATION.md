# Integrazione Aruba del VTT originale — fase campagne

Decisione progetto: Aruba è la destinazione principale. Non è richiesto mantenere Vercel/Supabase disponibili durante la migrazione; non eliminare però repository e dati degli account reali prima di poterli esportare.

Ricognizione: il VTT React esistente in `src/app/App.tsx` utilizza `AuthContext` Supabase e `CampaignContext` che chiama Supabase Edge Functions. La dashboard originale comprende `AppShell`, barra superiore, sidebar, creazione campagne/personaggi, mappe, note, sessioni e dadi. Non è sicuro passarle una sessione Aruba fingendo un JWT Supabase.

Questa fase implementa un database campagne nativo Aruba e riprende la disposizione dashboard originale (sidebar, barra superiore, azioni rapide, schede campagne) nella build isolata, senza importare i servizi Supabase. Ancora da trasferire: UI originale completa, strumenti personaggio, note, dadi 3D, game session, inviti, ruoli GM/giocatore per campagna, sincronizzazione GM-hosted. Non presentare le nuove schede come il VTT completo.

Database: `deploy/aruba/sql/008_vtt_campaigns.sql` crea `hollowgate_vtt.campaigns`, limitata per owner, e due routine SECURITY DEFINER. Il runtime non ha accesso SQL diretto alle tabelle. Il backend espone `GET/POST /vtt/campaigns` SOLO se `AUTH_STAGING_ENABLED=true`, database `hollowgate_auth_test`, ruolo `hollowgate_auth_app`, e `AUTH_VTT_CAMPAIGNS_ENABLED=true`; l'owner è derivato dalla sessione HTTP e mai dal payload.

Le vecchie campagne Supabase non vengono importate e non vengono cancellate. Per ora un nuovo account Aruba può creare e rileggere campagne di prova.

Per attivare: da SSH sul VPS, dopo `git pull --ff-only origin feature/aruba-api-foundation`, eseguire `bash deploy/aruba/scripts/activate-vtt-campaigns.sh`. Lo script convalida i prerequisiti, costruisce la UI dedicata, applica 008 esclusivamente al DB test, abilita la feature privata, verifica 401 senza password e /health 200. In caso di errore tenta di ripristinare il precedente assetto privato. Non cambia `main`, DNS o il sito Vercel.

**Non usare dati reali** nella prima campagna. Per tornare alla modalità precedente: `sudo docker compose -p hollowgate-auth-staging -f deploy/aruba/compose.auth-staging.yaml -f deploy/aruba/compose.auth-trial.yaml up -d --no-deps --force-recreate aruba-auth-staging`. I dati di prova restano nel database.

## Campagne Aruba — modifica dei metadati (009)

Aggiunto `PATCH /vtt/campaigns/:id`, per cambiare soltanto **nome** e **descrizione** della campagna selezionata. Richiede cookie di sessione Aruba valido, verifica Origin sul server e autorizza l'update con la proprietà `owner_id` su PostgreSQL. Il regolamento resta intatto e non esiste update diretto delle tabelle per il ruolo runtime.

Lo script di attivazione applica ora 008 e **009**, in ordine, esclusivamente al database `hollowgate_auth_test`, prima di avviare l'API aggiornata. Questo modifica lo staging test: eseguire solo dopo CI positiva e controllo del server. La produzione e gli account reali non vengono toccati.

La dashboard Aruba mantiene 100 px a sinistra, 80 px a destra. Permette la selezione e la modifica dei metadati delle campagne effettivamente restituite dall'API; i componenti PG/PNG, note e sessioni originali devono ancora essere portati.
