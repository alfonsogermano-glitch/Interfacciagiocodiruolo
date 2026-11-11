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
