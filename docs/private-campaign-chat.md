# Chat privata e partecipanti online

## Attivazione Supabase

Eseguire nel **SQL Editor del progetto Supabase** il contenuto di:

`supabase/migrations/20261010100000_private_campaign_chat.sql`

La migration è transazionale e rieseguibile. Crea:

- `private_chat_messages`, separata dalla timeline pubblica.
- Le policy RLS per mittente e destinatario, senza privilegi speciali per il GM.
- Il bucket **non pubblico** `private-chat-attachments`, limite 50 MB.
- Le policy Storage per la coppia di utenti e guardie restrittive che impediscono alle policy generiche degli altri bucket di esporre questi file.
- La funzione `private_chat_participants`, che restituisce nomi e portrait dei membri della campagna solo a un altro membro.
- Trigger di validazione di mittente, destinatario e allegato; i nomi vengono letti dai profili, non accettati dal client.
- L'iscrizione della tabella alla publication `supabase_realtime` esistente.

Non serve ridistribuire un'Edge Function. Dopo l'esecuzione, ricaricare l'app anche sugli altri dispositivi: la presenza della campagna ora include l'id del profilo.

## Uso

1. Aprire una campagna Cloud e poi **Chat** nella barra destra.
2. In alto compaiono i portrait dei membri con **quella campagna aperta**, GM incluso. Lo stesso utente in più schede compare una sola volta. Chi è offline non compare nella fila.
3. Cliccare il portrait di un altro utente per aprire una conversazione **Privato · Nome**.
4. Invio testo con Invio o pulsante; file e immagini dai pulsanti dedicati. Ctrl+V nel composer invia un'immagine presente negli appunti. Le immagini si adattano proporzionalmente alla larghezza del pannello.
5. Il pulsante **Campagna** e la X del privato tornano alla timeline pubblica.
6. Le conversazioni già iniziate restano nella fila dei contatti privati anche quando il destinatario è offline. È possibile continuare a scrivergli finché è membro della campagna.
7. Badge sui contatti e pallino Chat segnalano i messaggi privati non letti. Una conversazione viene segnata letta quando è visibile e scorsa fino in fondo. I marcatori di lettura sono separati per account, campagna e interlocutore e restano sul dispositivo.
8. Solo il mittente può cancellare un messaggio privato per entrambi. La cancellazione produce un aggiornamento autorizzato dalla RLS, cancella il contenuto della riga e rimuove il file dello Storage quando possibile.

Le campagne Locale non hanno comunicazione tra dispositivi: presenza e chat privata sono disponibili solo in Cloud. Non viene eseguito un ripiego sulla chat pubblica o sul bucket pubblico se un invio privato fallisce.

## Accesso e confini

- Testo e file sono leggibili soltanto da mittente e destinatario ancora membri della campagna. La rimozione dalla campagna revoca l'accesso server dell'utente rimosso; il mittente rimasto può leggere la propria cronologia.
- Il GM può ricevere e inviare privati come tutti, ma non leggere quelli tra altri due utenti.
- Gli eventi privati usano **Postgres Changes con RLS**. Nessun contenuto privato viene trasmesso tramite il broadcast condiviso `campaign:{id}`.
- Immagini/download usano richieste Storage autenticate e URL Blob temporanei. Non si genera un `publicUrl` per questi file.
- Non si tratta di cifratura end-to-end: l'amministrazione tecnica del database mantiene i normali privilegi amministrativi di Supabase.

## Verifiche automatiche

```sh
npm run verify:private-chat
npm run verify:private-chat-browser
npm run check
```

La verifica `private-chat` esegue la migration su PostgreSQL embedded (PGlite) con ruoli e JWT simulati, provando davvero RLS/trigger/privilegi: coppia autorizzata, GM/terzo/anon esclusi, mittente contraffatto, bucket pubblico vietato, file di altra conversazione, policy Storage generiche, cancellazione e revoca membership. Controlla inoltre presenza, non letti, deduplicazione, risposte obsolete e blocco in Locale. È inclusa automaticamente in `npm run check`.

La verifica browser usa Chromium, Vite e un trasporto isolato: portrait online, passaggio pubblico/privato, destinatario corretto, notifiche, utenti offline, file/immagini privati e proporzioni a pannello stretto. Non accede al database di produzione.

## Prova dopo l'attivazione

Con due giocatori A/B e il GM nella stessa campagna Cloud:

- Verificare i portrait mentre si apre/chiude la campagna, anche con due schede dello stesso account.
- A invia a B testo, immagine e file. B li riceve e può scaricarli; il GM non li vede nella propria chat né nella timeline pubblica.
- Verificare A ↔ GM e B ↔ GM come conversazioni separate.
- B chiude la campagna: sparisce dai portrait, ma la conversazione resta recuperabile da A. Al ritorno B trova i messaggi inviati mentre era offline.
- Cancellare un messaggio di A: deve scomparire per entrambi. B e il GM non devono avere il comando per cancellare quel messaggio.

Le verifiche locali non sostituiscono questa prova multi-account sul progetto Supabase dopo l'applicazione della migration.
