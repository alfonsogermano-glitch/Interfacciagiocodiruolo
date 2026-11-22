# Gate umano per registrazioni social nuove (solo staging)

Non applicare SQL né configurare client produzione per eseguire questo test.
L'origine è `https://staging.hollowgate.quest`, **mai** `www`. Staging è
protetto da un gate HTTP: 401 senza accesso al gate è atteso. Condividere
le credenziali del gate con il tester **fuori dalla chat**; non includerle in
screen recording o screenshot. Inserire OAuth password/codici soltanto nel
browser del provider. Non inoltrare callback URL, token, cookie o link.

Preparazione:

1. Tester con account Google e Discord controllati da lui, con email
   verificate. Per registrazioni **entrambe nuove** le due email devono essere
   differenti e non già usate su Hollowgate staging. Se sono uguali, testare
   una nuova registrazione e poi un **link esplicito**, non fingere due nuove.
2. Inserire privatamente l'email Google del tester nell'allowlist della
   consent screen **staging** se è ancora in modalità Testing. Non usare i
   client produzione su staging. Confermare HTTPS valido e che il gate
   permette `/login`, `/vtt/` e i callback senza catturare codici/token.
3. Usare due profili browser separati o una sessione privata pulita per ogni
   prima registrazione; non partire da una sessione Hollowgate già autenticata.
   Il logout Hollowgate **non** chiude la sessione Google/Discord: rientrare
   con lo stesso account del provider prova solo il login ripetuto, non una
   registrazione nuova. Il tab “Registrati” usa la stessa identità OAuth del
   tab “Accedi”. Per la prova nuova usare un profilo ospite/privato distinto
   e selezionare nel provider un account realmente diverso, non già usato su
   staging; non è necessario uscire dal Google personale nel browser abituale.

Per **ogni provider**:

1. Aprire `/login` su staging, superare il gate, selezionare Google/Discord.
2. Accettare il consenso presso il provider. Atteso: ritorno diretto a
   `/vtt/`, **senza passare visibilmente dal login Hollowgate** e senza dati
   di un altro account. Nessun provider token nell'URL finale.
   **Nessuna email di attivazione Hollowgate è attesa per OAuth**: Google
   richiede `email_verified=true` nell'identità firmata; Discord richiede
   email verificata nel profilo del provider. La conferma via email di
   Hollowgate riguarda solo la registrazione con email e password.
3. Controllare che l'account e le campagne proprie siano coerenti; uscire.
4. Ripetere l'accesso con la stessa identità. Atteso: **stesso account**, non
   una seconda registrazione; ritorno al VTT. Uscire di nuovo.
5. Con proprietario e tester in due browser distinti, provare un invito e la
   visibilità delle campagne nei rispettivi ruoli. Nessun utente deve vedere
   campagne non autorizzate.

Separatamente, con **un account proprio** già esistente sullo staging:
tentare accesso social con la stessa email ma provider non collegato. Atteso:
**nessun collegamento automatico**; solo dopo login Hollowgate valido e
richiesta esplicita di link si può associare l'identità. Se il tester annulla
il consenso, il login non deve creare un account o una sessione.

Il report da inviare in chat contiene **solo**: per ciascun provider
`nuovo: OK/KO`, `ripetizione: OK/KO`, `ritorno VTT: OK/KO`,
`invito/multiutente: OK/KO`, e `collisione/link esplicito: OK/KO`.
Nessuna email, nome reale, password, codice, URL di callback, reset link,
cookie o screenshot con dati personali. In caso di KO fermarsi e indicare
soltanto la fase e un errore privo di dati sensibili. Nessuna modifica a
produzione deriva automaticamente da questi risultati.

**Esito 21 novembre:** l'utente ha confermato Google e Discord con email
distinte, identità nuove, ritorno VTT e accesso ripetuto. La prova invito
multiutente è **bloccata dall'ambiente staging**, non superata: il flag inviti
è `unset` e la migration 033 non può funzionare sul clone senza la base
`campaign_members` definita in 016. Il tentativo automatico si è fermato
prima di applicare SQL a `hollowgate_auth_test` o ricreare l'API staging;
il clone conserva la rehearsal fallita per diagnosi. Inoltre la visibilità
di campagne raggiunte come giocatore usa la capability `playerCharacters`,
da verificare separatamente prima di promettere un test UI completo. Non
rilanciare lo script inviti né accendere il flag isolatamente.
