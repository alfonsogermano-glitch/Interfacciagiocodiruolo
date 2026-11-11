# Integrazione VTT React → GM Host WebSocket

**Stato:** specifica tecnica, non ancora attivata. Nessuna modifica a `main`, dominio o Supabase.

## Punti d'integrazione verificati nel codice

- `src/services/realtime/campaignChannel.ts`: registro centralizzato degli eventi (inclusi `active_scene_change`, `active_scene_map_patch`, `map_token_action`, `dice_roll`, `chat_message`). Oggi i canali sono collegati a Supabase o alla modalità locale. Aggiungere un terzo adapter **GM Host** mantenendo gli stessi listener ed evitando connessioni multiple.
- `src/app/components/session/useActiveScene.ts`: consumer di `active_scene_change` e delta `active_scene_map_patch`. Conservare `basePublishedAt`, sequenza monotona e procedura di risincronizzazione su perdita di patch.
- `src/app/components/session/SessionWorkspace.tsx`: UI della mappa di sessione, scene, token, disegni e nebbia. Non sostituire con la mappa dimostrativa.
- `src/services/campaign/activeScene.ts`: caricamento/pubblicazione della scena; distinguere stato autorevole GM da cache del giocatore.

## Contratto proposto (da validare con test prima dell'implementazione)

1. Un'istanza desktop **GM Host** possiede la campagna locale, le autorizzazioni e la sequenza dei messaggi. I giocatori visualizzano un client React leggero.
2. Il protocollo trasmette `hello/auth`, `snapshot`, `command`, `patch`, `ack`, `resync`. Eventi tipizzati e validati; nessuna accettazione di `state` arbitrario scritto dal giocatore.
3. Ogni evento contiene `campaignId`, `sequence`, `eventId`, `actorId` e schema versionato. Il GM convalida ownership e permessi prima di mutare il dato.
4. All'ingresso e alla riconnessione il GM invia uno snapshot filtrato per autorizzazioni; seguono solo patch e anteprime transitorie. Niente contenuti GM segreti in snapshot giocatore.
5. Le risorse pesanti (mappe, documenti, immagini, audio) sono servite tramite endpoint autorizzati con caching e limiti per ridurre il traffico realtime; non inserirle indiscriminatamente nei messaggi WebSocket.
6. Salvataggi della campagna con transazioni/backup/versioning e migrazione esplicita degli schemi; non sostituire i salvataggi reali con il `campaign-demo.json` del laboratorio.
7. Per utenti finali: un'icona Windows per il GM e apertura dal browser per gli altri; il produttore gestisce il servizio relay/inviti. Cloudflare Quick Tunnel è soltanto per il test.

## Gate prima del rilascio

- [ ] Autenticazione individuale e ruoli GM/giocatore per campagna
- [ ] Policy autorizzative su note private, nebbia, schede, dadi segreti e allegati
- [ ] Test integrati GM Windows ↔ Android/PC, LAN e 5G
- [ ] Salvataggio locale reale, backup e ripristino dopo crash
- [ ] Protocollo affidabile con riordino e recupero snapshot
- [ ] Endpoint pubblico stabile (non Quick Tunnel) con protezioni e quote
- [ ] Installer Windows firmato, aggiornamenti verificati, arresto pulito del servizio
- [ ] Verifica che il VTT React operi senza Supabase nelle campagne GM Host

La PR sperimentale non deve essere integrata su `main` finché i gate non sono soddisfatti.

## Primo strato di protocollo implementato (11 novembre 2026)

Il laboratorio dispone ora di un protocollo `vtt:*` separato dai messaggi `hello`, `move`, `state`, `roll` della demo già collaudata. Il server lo instrada solo dopo l'autenticazione e determina ruolo e identità dalla connessione WebSocket, non da attributi dichiarati dal client. File:

- `vtt-protocol.mjs`: GM autorevole, pubblicazione della scena, assegnazione/movimento di token, filtro note private, `vtt:ack` con deduplicazione degli `eventId`, `vtt:snapshot` e `vtt:patch` con sequenza crescente, `vtt:resync`.
- `vtt-client.mjs`: adattatore browser che scarta eventi obsoleti, richiede risincronizzazione in presenza di buchi di sequenza e sostituisce lo stato con snapshot autorevole.
- `test/vtt-protocol.test.mjs`, `test/vtt-client.test.mjs`, `test/server.integration.test.mjs`: prove di autorizzazione, privacy, riordino, deduplicazione e collegamento effettivo GM/giocatore su WebSocket.

**Limiti attuali:** campagna di laboratorio fissa `demo`, archivio VTT di laboratorio in memoria, comandi limitati a scene e token semplificati; nessuna persistenza delle scene VTT reali, nessuna autorizzazione individuale verificata dall'account Hollowgate, e nessuna integrazione attiva con i componenti React. Il protocollo è una base testata, non il rilascio del VTT completo.

Prossima implementazione: schema condiviso con `activeScene` e adapter `campaignChannel` in modalità GM Host, mantenendo il comportamento Supabase/locale finché non è dimostrata equivalenza mediante test.

## Adattatore React isolato implementato

- `src/services/realtime/gmHostReactBridge.ts`: client TypeScript opt-in che si autentica con l'host WebSocket, applica le patch in sequenza, scarta gli snapshot obsoleti e richiede un nuovo snapshot se rileva un salto di sequenza. Permette i comandi `publishScene`, `assignToken` e `moveToken` soltanto dopo l'autenticazione.
- `src/services/realtime/useGmHostSession.ts`: hook React opt-in che espone stato, scena e token semplificati e pulisce le connessioni allo smontaggio.
- `scripts/verify-gm-host-react-bridge.mts`: test del client usando WebSocket simulati e verifica degli eventi fuori ordine.

**Importante:** questo hook non sostituisce ancora `campaignChannel.ts`, non supporta ancora `ActiveScenePublication` completo, e non viene montato automaticamente nelle schermate della produzione. È una base di compatibilità con React, mantenuta fuori dalla normale gestione delle campagne per evitare perdite di dati e permessi. Il prossimo passo è estendere il protocollo a scene complete con autorizzazioni per campagna e testarne la conversione in un'adattatore degli eventi `active_scene_change` e `active_scene_map_patch`.

## Pubblicazione completa scene e topologie (novembre 2026)

- `active-scene-wire.mjs` proietta la struttura `ActiveScenePublication` usata da Hollowgate verso il giocatore, includendo URL mappa, griglia, regioni, pedine, disegni, PDI, nebbia e ordine degli oggetti.
- Gli oggetti `hiddenFromPlayers`, le pedine con `visible: false`, i PDI `visibleToPlayers: false`, i disegni invisibili e i rispettivi riferimenti nell'ordine oggetti non vengono inviati ai giocatori. I riferimenti alle note dei PDI restano riservati quando `noteVisibleToPlayers` non è true. Gli oggetti visibili e i metadati vengono limitati ai campi dello schema pubblico.
- Il comando GM `publishActiveScene` pubblica la scena completa usando il protocollo versionato `vtt:*`; i nuovi giocatori ricevono lo snapshot corrente. Il limite del payload WebSocket per questo laboratorio è stato portato a 2 MB e il documento scena accettato è limitato a 1 MB.
- `gmHostReactBridge.ts` espone `activeScene` nel suo stato; `GmHostScenePreview.tsx` è una vista **opt-in** che riusa il renderer reale `ActiveSceneMap` di Hollowgate, ma non è ancora collegata al routing normale.
- I test `active-scene-wire.test.mjs` e `multi-browser.test.mjs` verificano il filtro degli oggetti nascosti, la pubblicazione multiutente e il recupero dello stato dopo una riconnessione simulata.

**PC↔PC stessa Wi-Fi, PC↔PC reti differenti, PC↔Android:** il protocollo è identico, perché tutti i browser giocatore comunicano con il server del GM attraverso un link HTTPS/WebSocket del tunnel; non dipende dal tipo di dispositivo o dalla Wi-Fi. La topologia e le autorizzazioni sono testate in laboratorio con più client WebSocket. Le prestazioni reali LAN e WAN, il failover e il funzionamento sul campo di ogni combinazione restano da collaudare. Nella versione attuale anche i PC nella stessa Wi-Fi usano il tunnel: non è stato introdotto un percorso LAN diretto.

**Limitazioni fondamentali:** le immagini `mapUrl` che dipendono da URL autenticati non sono ancora distribuite dall'host locale. Non è ancora disponibile un'API asset autorizzata per immagini e media. L'intera `SessionWorkspace` con illuminazione, nebbia dinamica, strumenti e comandi giocatore non è ancora integrata. Il prototipo non deve ricevere campagne reali o contenuti segreti nei metadati non esplicitamente sottoposti a filtro.
