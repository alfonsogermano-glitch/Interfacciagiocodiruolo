# Integrazione Aruba del VTT originale — fase campagne

Decisione progetto: Aruba è la destinazione principale. Non è richiesto mantenere Vercel/Supabase disponibili durante la migrazione; non eliminare però repository e dati degli account reali prima di poterli esportare.

Ricognizione: il VTT React esistente in `src/app/App.tsx` utilizza `AuthContext` Supabase e `CampaignContext` che chiama Supabase Edge Functions. La dashboard originale comprende `AppShell`, barra superiore, sidebar, creazione campagne/personaggi, mappe, note, sessioni e dadi. Non è sicuro passarle una sessione Aruba fingendo un JWT Supabase.

Questa fase implementa un database campagne nativo Aruba e riprende la disposizione dashboard originale (sidebar, barra superiore, azioni rapide, schede campagne) nella build isolata, senza importare i servizi Supabase. Ancora da trasferire: UI originale completa, strumenti personaggio, note, dadi 3D, game session, inviti, ruoli GM/giocatore per campagna, sincronizzazione GM-hosted. Non presentare le nuove schede come il VTT completo.

Database: `deploy/aruba/sql/008_vtt_campaigns.sql` crea `hollowgate_vtt.campaigns`, limitata per owner, e due routine SECURITY DEFINER. Il runtime non ha accesso SQL diretto alle tabelle. Il backend espone `GET/POST /vtt/campaigns` SOLO se `AUTH_STAGING_ENABLED=true`, database `hollowgate_auth_test`, ruolo `hollowgate_auth_app`, e `AUTH_VTT_CAMPAIGNS_ENABLED=true`; l'owner è derivato dalla sessione HTTP e mai dal payload.

Le vecchie campagne Supabase non vengono importate e non vengono cancellate. Per ora un nuovo account Aruba può creare e rileggere campagne di prova.

Per attivare: da SSH sul VPS, dopo `git pull --ff-only origin feature/aruba-api-foundation`, eseguire `bash deploy/aruba/scripts/activate-vtt-campaigns.sh`. Lo script convalida i prerequisiti, costruisce la UI dedicata, applica 008 esclusivamente al DB test, abilita la feature privata, verifica 401 senza password e /health 200. In caso di errore tenta di ripristinare il precedente assetto privato. Non cambia `main`, DNS o il sito Vercel.

**Non usare dati reali** nella prima campagna. Per tornare alla modalità precedente: `sudo docker compose -p hollowgate-auth-staging -f deploy/aruba/compose.auth-staging.yaml -f deploy/aruba/compose.auth-trial.yaml up -d --no-deps --force-recreate aruba-auth-staging`. I dati di prova restano nel database.
