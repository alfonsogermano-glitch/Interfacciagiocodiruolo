# Confronto live acquisito: staging arretrato, produzione non da rimigrare

## Provenienza verificata

Tre file della raccolta read-only già eseguita sul VPS sono stati recuperati
via SSH e verificati **byte per byte contro gli SHA-256 riportati dall'utente**:

| File | SHA-256 |
|---|---|
| `production.json` | `db5b528e964527503dc35941774778cfd0bf698e1bdc19ec3cef28c08abd3ab5` |
| `staging.json` | `eaf7baef48fb1f7b7e92d0eecf5011bbf27e0548cb7ef7689ee74e3ea23df85c` |
| `comparison.json` | `d94a8c79206323ec9b8c7cf70f47bb0e6ce2fe05321f969202e10beb808080b7` |

Copie complete nei risultati privati dell'operatore (cartella temp OpenCode
`hg-recovery-results-20261121`), non aggiunte in Git. La comparazione offline
è stata ripetuta con `compare-recovery-environments.mjs`: stesso esito,
exit 1 previsto per i blocker staging, non errore dello strumento.

I normali trasferimenti SSH/SFTP andavano in timeout dopo l'autenticazione;
la lettura compressa (`ssh -C`, gzip/base64) è riuscita senza alcuna modifica
al server. **Non è una diagnosi definitiva né una correzione dell'SSH**.
Non sono stati modificati sshd, shell, firewall, rete o chiavi. La raccolta
non è stata rieseguita. Nessun deploy, SQL applicativo o restart.

## Risultato

| Misura sull'inventario sorgente attuale | Staging | Produzione |
|---|---|---|
| Tabelle attese presenti | **11/33** | **33/33** |
| Routine attese presenti per nome | **12/129** | **129/129** |
| Flusso campagna/invito/player: catalogo, firme, grant e flag | **bloccato** | **controlli passati; browser QA ancora necessario** |
| Evidenza flag di compilazione frontend | sconosciuta | sconosciuta |

Questi conteggi sono relativi all'inventario corrente e al momento della
raccolta: non sono una percentuale di funzionalità, una verifica contenuti
utente, dei corpi funzione o della parità dell'intero sito.

**Il fatto nuovo decisivo:** non occorre ricostruire lo schema inviti di
produzione per poter completare il recupero. Il precedente test umano
falliva sullo staging auth, che non rappresenta il VTT di produzione.

### Staging: prerequisiti mancanti del primo flusso gioco

- Flag unset: `AUTH_VTT_CAMPAIGN_INVITES_ENABLED`,
  `AUTH_VTT_CAMPAIGN_ROSTER_ENABLED`, `AUTH_VTT_CHARACTER_AVAILABILITY_ENABLED`,
  `AUTH_VTT_CHARACTER_ASSIGNMENTS_ENABLED`, `AUTH_VTT_PLAYER_CHARACTERS_ENABLED`.
- Assenti `campaign_members`, `campaign_invites`,
  `character_player_assignments` e la colonna
  `character_drafts.available_for_players`.
- Mancano le routine di membership, roster, disponibilità, assegnazioni,
  lettura schede/campagne del giocatore e inviti, con le firme previste.
- Anche molti altri sottosistemi VTT sono assenti/spenti: questo confronto
  **non** giustifica l'applicazione in massa delle 22 tabelle mancanti.

### Produzione: nessun blocker del catalogo per il flusso selezionato

Tutti i prerequisiti verificati di campagna/invito/player risultano presenti
con le firme/grant e i flag richiesti. L'assenza di grant diretti impropri
alle tabelle membership/inviti è parte di quel controllo.

Resta vietato tradurre questo esito in «inviti verificati nel browser»:
il controllo non ha generato un invito né letto campagne con cookie reali.
Signaling, game session e TURN risultano **false** in produzione: nessuna
prova della disponibilità multiplayer realtime deriva dal catalogo inviti.

### Drift della funzione di elenco

`hollowgate_vtt.list_owned_campaigns(uuid)` ha hash di definizione diverso
fra i due ambienti. La sua presenza/firma non dimostra identico comportamento
o shape dei dati restituiti. Non sostituire la routine produzione con quella
staging e non dedurre un difetto dal solo hash: il corpo SQL non è stato
esportato dal collector. La riconciliazione del flusso staging deve verificare
anche la risposta consumata dal client e i campi branding opzionali.

## Piano minimo candidato: staging soltanto, non eseguito

Per il prossimo flusso campagna → invito → elenco joined, la selezione
esplicita derivata dalle assenze osservate è:

1. `015_vtt_campaign_notes.sql`: base richiesta dalla routine SQL di 016;
   **non** attivare la UI Note per il solo fatto di creare questa base.
2. `016_vtt_campaign_members.sql`: membership e controllo del ruolo.
3. `026_vtt_campaign_roster.sql`.
4. `027_vtt_character_availability.sql`.
5. `028_vtt_character_player_assignments.sql`.
6. `029_vtt_player_character_read.sql`.
7. `030_vtt_joined_player_campaigns.sql`.
8. `033_vtt_campaign_invites.sql`.
9. Riallineare i grant del solo ruolo staging con `037_staging_database_role.sql`
   **nel DB staging previsto**, senza ereditare il gruppo runtime produzione.

La catena è stata già provata da zero in PostgreSQL embedded con i servizi
API reali. **Non è ancora stata applicata a un clone fresco dello staging
raccolto**, quindi non è un bundle di deploy pronto. Le migration sono in
parte non idempotenti: non rilanciare gli script vecchi né scegliere i file
con un glob generico. Occorre una guardia che fallisca se gli snapshot non
rappresentano più lo stato corrente.

Il prossimo bundle staging deve:

- salvare e provare il restore del **DB staging corrente**, che contiene le
  nuove identità social QA; mai rimpiazzarlo con produzione;
- eseguire prima piano e regressioni su clone nuovo, senza cancellare i clone
  di precedenti incidenti; verificare ruoli e drift prima/dopo;
- non toccare l'API pubblica né il gateway condiviso;
- mantenere client/segreti OAuth staging, rete e immagine API già verificati;
- attivare soltanto i cinque flag sopra dopo i test SQL e i grant;
- disporre di ripristino API staging/flag, senza ripristino distruttivo dei
  dati sopra nuovi account o campagne; documentare eventuale DDL mantenuto;
- dimostrare via browser invito owner, join player, visibilità corretta e
  perdita di accesso dopo revoca, senza dichiarare una UI revoca non implementata.

**Nessuna modifica a produzione è richiesta da questo piano.**
Un'eventuale applicazione richiede un bundle preciso collaudato e il relativo
via libera; questa analisi non concede permessi amministrativi aggiuntivi.

## Pacchetto di rehearsal preparato dopo il confronto (non ancora eseguito)

`rehearse-staging-campaign-recovery.sh` è stato caricato in
`/home/hgadmin/hg-campaign-clone-recovery-20261121`, verificato per hash e
con `bash -n`; anche l'assemblatore Python ha accettato gli otto file reali
sul VPS. Manifest SHA-256:
`dbfdfd4ea91ca7a97d436cf9dd38c75d0414f6cedfbdea3e502bdab9b0d694f0`.
Runner SHA-256:
`861fd1459fd77da7bf29d35d1cbc2f1b49130bdd89a452eb1d8bdf6beda130c6`.

Lo script richiede un'unica sessione sudo dell'operatore (non disponibile
all'agente). Verifica un nuovo snapshot staging contro l'hash già acquisito,
salva un dump root-only e lo ripristina nel nuovo DB
`hollowgate_stage_campaign_verify_20261121`. Applica le otto migration **solo
nel clone**, in una singola transazione insieme ai grant schema/routine
limitati a quel clone, senza eseguire/modificare la 037. Il ruolo già esistente
non viene creato/alterato e non riceve membership di gruppo.

Esegue quattro regressioni SQL, inclusa una con `SET LOCAL ROLE` sul login
staging ristretto e utenti sintetici che vengono annullati con ROLLBACK;
controlla conteggi di utenti/campagne/PG/identità social invariati nel clone,
snapshot staging attivo identico e salute HTTP pubblica 200. I dati del
clone/dump restano privati per analisi; nessun restore sui DB attivi e nessuna
ricreazione container o attivazione flag. Non rilanciare se un passo fallisce.

Test aggiuntivi locali passati: quattro per l'assemblatore (incluso il caso
commenti prima di BEGIN che aveva bloccato il vecchio script), più una
rehearsal PGlite dell'esatto piano/grant e dei quattro test SQL, con un utente
social preesistente lasciato intatto. Nei soli test embedded il nome DB della
guardia è adattato a `postgres`; i file distribuiti mantengono il vincolo al
nome clone esatto. Questo non sostituisce ancora la rehearsal sul server VPS.

### Esito successivo: rehearsal sul VPS passata

L'utente ha riportato, nell'ordine:

```text
CAMPAIGN_CLONE_BACKUP_RESTORE_OK
CAMPAIGN_CLONE_EIGHT_MIGRATIONS_OK
CAMPAIGN_CLONE_INVITE_PLAYER_AND_RUNTIME_OK
CAMPAIGN_CLONE_REHEARSAL_OK — active staging/production untouched; no flags or APIs changed
```

Questo supera il checkpoint precedente «non ancora eseguito»: backup staging
fresco ripristinato, otto migration e grant clone-only applicati in una
transazione, quattro regressioni SQL passate (incluso ruolo runtime ristretto),
conteggi clone preservati, catalogo/flag staging attivo invariati e HTTP
readiness pubblico 200. La 037 non è stata eseguita o modificata nel clone.

**Staging attivo ancora da aggiornare; browser multiutente non ancora provato.**
Il successivo perimetro da autorizzare è applicare quelle sole otto migration
e la 037 originale al DB `hollowgate_auth_test`, dopo backup fresco e controllo
che il catalogo non sia cambiato, poi attivare i cinque flag inviti/roster/
disponibilità/assegnazioni/lettura player ricreando soltanto l'API staging,
senza build, cambio immagine/client OAuth, modifica gateway/Caddy, SQL su
produzione o alterazione dei dati utente esistenti. Un fallimento SQL deve
annullare la transazione; se fallisce l'avvio API, ripristinare i flag staging
precedenti senza restaurare un dump distruttivo né eliminare gli account QA.

### Aggiornamento staging autorizzato, pacchetto pronto (esito da acquisire)

L'utente ha autorizzato il perimetro sopra. Il bundle
`/home/hgadmin/hg-staging-campaign-apply-20261121` è caricato e verificato;
manifest `4d0dffd53c639ab406b7ddd94e8a8357c2bcd4625cdc2312c9409572dd82e15d`,
runner `aaa2dc8ebc4d75ddb6e971c16f0516022e2e751ed47982dc88baaf36829f23e3`.
Non è ancora stato eseguito dall'agente: richiede il sudo dell'operatore.

Prima di DDL, il runner valida in privato il Compose on/off contro ambiente,
immagine, UID, reti e mount secret del container staging corrente: differenze
diverse dai cinque flag autorizzati bloccano l'operazione. I due client ID
staging vengono recuperati internamente dal container, senza stamparli.
L'immagine corrente viene pinnata sotto un nuovo tag locale e usata sia
per aggiornamento che per ripristino; nessuna build o upgrade immagine.
Il ripristino conserva anche i flag precedentemente unset come unset.
SQL con lock timeout 5s e statement timeout 30s in transazione unica; backup
staging fresco con archivio verificato leggibile, dopo la rehearsal di restore
già passata. La ricreazione riguarda soltanto `aruba-auth-staging` nel progetto
`hollowgate-auth-staging`; post-check catalogo/firme/grant/flag, Caddy→staging,
readiness pubblica e immagine produzione invariata. Se la ricreazione fallisce,
si tenta il ripristino Compose off, senza annullare DDL già committato né
restaurare dati sopra utenti nuovi.

Sei test Python del confronto Compose e la prova locale con 037 (guardia
originale verificata come bloccante sul DB sbagliato, solo una copia adattata
nel test embedded) passano; gli utenti social della fixture restano invariati.
Nessuna prova browser è promossa da questi controlli automatici.

### Esito successivo: aggiornamento staging completato

L'utente ha eseguito il bundle autorizzato e riportato:

```text
STAGING_RECOVERY_PREFLIGHT_AND_BACKUP_OK
STAGING_RECOVERY_SQL_AND_037_OK
STAGING_CAMPAIGN_RECOVERY_OK — same image/OAuth; five flags enabled; production unchanged; browser QA required
```

Lo staging attivo ha quindi passato le guardie del runner prima/dopo la
transazione e la ricreazione API: otto migration e 037 originale eseguite,
catalogo/firme/grant e cinque flag verificati, immagine e configurazione OAuth
conservate, gateway verso API staging raggiungibile, produzione non ricreata.
Superato il vecchio stato «staging bloccato per schema/flag mancanti» per il
solo flusso selezionato; non significa che tutte le 33 tabelle o tutte le
funzioni del sito siano ora migrate nello staging.

**Restano da provare nel browser**: dopo refresh del VTT staging, proprietario
→ Invita giocatori → Genera codice invito; altro account staging → Panoramica
→ Unisciti a sessione → Continua → anteprima campagna → Unisciti; dopo refresh
la campagna deve restare visibile soltanto al membro autorizzato. Non passare
codici in chat. Questa è adesione a campagna, NON avvio multiplayer realtime.
