# Hollowgate — collaudo pre-lancio e criteri GO/NO-GO

Issue #46 · PR #47 · Preparazione indipendente dalla disponibilità VPS OVHcloud.

## Preflight: prima di qualunque migrazione
- [ ] Salvare snapshot verificabile delle versioni distribuite delle Edge Functions `make-server-771c5bfd` e `dice-secret-roll`, senza segreti.
- [ ] Inventariare schema DB e policy RLS, utenti Auth, bucket Storage, dimensioni e policy, canali Realtime.
- [ ] Esportare DB e Storage con procedura di ripristino su ambiente isolato; confrontare conteggi per tabella/bucket, hash degli asset e login degli utenti di prova.
- [ ] Verificare DNS, TTL, certificati, email di recupero password, callback OAuth e chiavi delle integrazioni Gemini/Resend.
- [ ] Misurare origine Cached Egress per endpoint e tipo di file; non attribuirla a una causa senza log.
- [ ] Non condividere credenziali, token o backup con dati personali su GitHub.

## Matrice funzionale (eseguire su staging con GM A, giocatore B, estraneo C)
| Area | Prova | Criterio di superamento |
| --- | --- | --- |
| Auth | Registrazione, login, logout, reset password | Sessione valida e revocabile; nessun accesso dopo logout |
| Autorizzazioni | C tenta di aprire campagna privata di A | Accesso negato; nessuna perdita di dati |
| Campagne | A crea/modifica, invita B; B accetta | Dati persistono dopo refresh e riconnessione |
| Personaggi | B crea/assegna, A verifica | Proprietà e visibilità corrette |
| Mappe | A carica mappa e muove token; B osserva | Coordinate coerenti tra client |
| Fog-of-war | A copre, rivela, sottrae area | Nessun disallineamento o fog aggiunto erroneamente |
| Realtime | A e B aggiornano mappe/chat contemporaneamente | Eventi ordinati, nessuna duplicazione, riconnessione |
| Dadi | Tiro pubblico e segreto | Risultati corretti, tiro segreto non visibile a non autorizzati |
| Note | Creazione, modifica, eliminazione, ripristino | Nessuna perdita e permessi corretti |
| Storage | Upload/lettura/eliminazione immagini e allegati | Permessi, URL e cache coerenti |
| Email | Invito e reset password | Consegna e link funzionanti |
| Backup | Ripristino staging da backup | Conteggi e contenuti coerenti, login verificato |

## Test di carico — misurazioni obbligatorie
Eseguire su dati di test, con 30, 100 e 180 utenti virtuali distribuiti su più campagne. Ogni scenario deve includere:
- login, lettura campagne, caricamento mappe/immagini, chat, spostamento token, aggiornamenti Realtime, dadi;
- sessioni di almeno 30 minuti e prova prolungata di almeno 2 ore al carico scelto;
- misure: HTTP 5xx, p95 latenza API, throughput, memoria/CPU, traffico e connessioni Realtime, disconnessioni, ritardi di sincronizzazione;
- confronto con soglie concordate *prima* del test; nessuna dichiarazione di capacità senza risultati.

## Criteri di rilascio
**NO-GO automatico** se: perdita di dati, accesso cross-campaign non autorizzato, backup non ripristinabile, autenticazione non funzionante, tiri segreti visibili a utenti non autorizzati, disallineamento critico delle mappe, instabilità riproducibile sotto carico previsto, monitoraggio assente.

**GO** solo dopo: test superati, backup offsite verificato, monitoraggio e allarmi attivi, runbook di rollback, finestra di manutenzione comunicata, approvazione esplicita del proprietario.

## Rollback
1. Bloccare nuove scritture durante il cutover e definire un punto consistente di esportazione.
2. Conservare il vecchio ambiente per la finestra di rollback concordata.
3. Se la verifica post-cutover fallisce, riportare il traffico al vecchio endpoint solo dopo aver gestito le eventuali nuove scritture; un semplice cambio DNS non recupera i dati.
4. Registrare orario, operatore, versione, stato backup e test di verifica.

## Preparazione senza server
- [x] Identificato backend distribuito: 2 Edge Functions, Hono/Deno e integrazioni esterne.
- [x] Documentata matrice funzionale e criteri di sicurezza.
- [ ] Preparare ambiente locale di test con variabili fittizie e fixture sanificate.
- [ ] Definire script di backup e validazione ripristino, da testare solo su staging.
- [ ] Pianificare correzione fog-of-war in PR separata con test dedicati.
