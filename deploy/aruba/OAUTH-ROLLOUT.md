# Login Google e Discord: attivazione controllata

Stato: **ATTIVO SOLO NELLO STAGING**, disabilitato per impostazione predefinita
negli altri ambienti. La migration 036 e il ruolo 037 sono stati applicati
soltanto allo staging dopo backup e ripristino di prova. I client Google e
Discord staging sono separati; collegamento esplicito, accesso ripetuto e
ritorno diretto al VTT sono stati provati con account già esistenti. Mancano
registrazione social di utenti realmente nuovi, prove multiutente e casi di
errore end-to-end. La produzione non è stata migrata per OAuth, non ha client
OAuth dedicati e non deve ricevere automaticamente i segreti staging.

**Vincolo VPS verificato (20 novembre):** il Caddyfile attualmente montato
include anche `www.hollowgate.quest` e `hollowgate.quest`, e la directory web
montata dal gateway è condivisa con produzione. Non sostituire il Caddyfile
remoto con quello locale (contiene soltanto lo staging), non sovrascrivere
`apps/aruba-auth-web` sul VPS e non ricreare il gateway condiviso per una
prova staging. L'API staging può invece essere ricostruita da un bundle sorgente
separato tramite `compose.staging-api-source.yaml`; il varco web staging usa
`compose.staging-edge-isolated.yaml`, statici separati e un bind soltanto su
`127.0.0.1:8443`. Il DNS staging punta ora al Tunnel: non a un record A del VPS.
Il gateway staging serve gli asset auth da `/opt/hollowgate-staging-auth-web`,
directory root-owned separata dal Caddy pubblico; il deploy passwordless è
limitato all'helper root-owned che aggiorna solo i quattro asset consentiti.
TLS origin è verificato senza `noTLSVerify`; il certificato Let's Encrypt è
montato in sola lettura dal vecchio volume Caddy. Scade il 9 febbraio 2027:
il vecchio gateway potrebbe non poterlo rinnovare via challenge HTTP dopo il
passaggio al Tunnel. Pianificare DNS-01 o un certificato Origin CA separato
**prima** di tale data.

## Origini e callback da registrare presso i provider

Per produzione, una volta implementati e verificati gli endpoint:

- Google: `https://www.hollowgate.quest/auth/oauth/google/callback`
- Discord: `https://www.hollowgate.quest/auth/oauth/discord/callback`

Per il test con altre persone occorrono **client OAuth distinti** e un'origine
HTTPS staging davvero funzionante, con database separato; i suoi callback
useranno quella origine, mai il dominio pubblico.

Client di staging dedicati (non usare quelli della vecchia applicazione):

- Google Web application: `https://staging.hollowgate.quest/auth/oauth/google/callback`
- Discord OAuth2 Redirect: `https://staging.hollowgate.quest/auth/oauth/discord/callback`

Google Cloud: usare una consent screen External in modalità Testing e aggiungere
solo le email dei tester. Il server scambia il codice, quindi non sono necessarie
origini JavaScript autorizzate. Discord: creare una nuova application e aggiungere
il redirect nella sezione OAuth2, senza installazione bot. Conservare ID e
segreti privatamente e non inviarli tramite chat o screenshot. Non impostare
`AUTH_OAUTH_ENABLED=true` finché staging HTTPS, migrazione DB e callback
non sono stati verificati insieme.

## Requisiti prima dell'attivazione

1. Nelle dashboard Google Cloud e Discord Developer Portal creare **nuovi**
   client/applicazioni Web Aruba separati dagli accessi Supabase precedenti.
   Registrare soltanto i redirect URI approvati. Client secret solo in file protetti sul VPS,
   mai in Git, in chat, nel browser o nei pacchetti pubblici.
2. Applicare la migration `036_auth_oauth_identities.sql` **prima** di porre
   `AUTH_OAUTH_ENABLED=true`. La migration è stata provata su un database
   temporaneo locale, non su produzione.
3. Configurare su staging/produzione `GOOGLE_OAUTH_CLIENT_ID`,
   `DISCORD_OAUTH_CLIENT_ID` e i rispettivi `*_OAUTH_CLIENT_SECRET_FILE` come
   file protetti. Non copiare i client secret nella configurazione Vite.
   Per staging usare l'overlay opt-in `compose.oauth-trial.yaml`, unicamente
   con `compose.auth-staging.yaml`, `compose.auth-trial.yaml` e
   `compose.staging-db-role.yaml`. Applicare prima `037_staging_database_role.sql`
   SOLO al DB di test con `psql --single-transaction -v ON_ERROR_STOP=1`, poi
   assegnare privatamente una password unica al nuovo login PostgreSQL:
   NON copiare la password usata dal ruolo condiviso con produzione.
   Il nuovo login non appartiene al gruppo runtime globale e riceve solo
   grant espliciti nel DB di test. Riapplicare 037 dopo eventuali nuove
   migration di staging per sincronizzare i grant consentiti. I client ID
   arrivano da variabili private del terminale sul VPS e i secret da file
   distinti in `/opt/hollowgate/config/`; non inserire valori in Git o chat.
4. L'API usa authorization code + PKCE, state casuale monouso associato al
   browser, issuer/provider, scadenza, callback senza token nell'URL finale.
   Google richiede ID token firmato, audience, nonce ed email verificata;
   Discord richiede profilo con email verificata e scope `identify email`.
5. Legare account già presenti **solo dopo login Hollowgate valido e richiesta
   esplicita** (`?link=1`), verificando una sessione ancora attiva nel DB:
   la sola corrispondenza dell'email non basta. Nessun refresh/access token
   provider persistito.
6. Testare prima database locale usa-e-getta e staging Aruba: utenti nuovi,
   esistenti, errori, diniego consenso, callback manomesso, concorrenza e
   sessione revocata. Solo dopo abilitare i pulsanti e il routing in produzione.

La registrazione via email è separata: il link di verifica deve sempre usare
`AUTH_ORIGIN` esatto (non un indirizzo staging scritto nel codice).
