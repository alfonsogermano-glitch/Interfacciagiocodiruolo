# Hollowgate — tiri segreti, reazioni e Realtime: gate di sicurezza

## Prove aggiunte su PR #47
Il test PostgreSQL 17 isolato `infra/staging/roll-reaction-smoke-test.sh` viene eseguito *dopo* il test sulle policy reali proposte per la chat, che crea le fixture con GM, giocatori e un estraneo. Verifica:
- Il giocatore può inserire un tiro pubblico con il **proprio** `sender_id`.
- Un altro giocatore non può inserire un tiro attribuendolo a chi ha tirato, neppure se riceve l'evento Realtime.
- Gli UPDATE di `reactions` e `content` sono negati dalla proposta attuale. Non reintrodurre `USING(true)` per aggirare il blocco.

Il test statico `tests/infrastructure/test-roll-reaction-contract.py` verifica nel codice distribuito nel repository che il relay dei tiri segreti autentichi l'utente, controlli `campaignId`, `rollerId`, stato campagna, membership e invii soltanto al canale privato del GM. Verifica che i tiri segreti non siano persistiti da `saveRollEntry`.

## Blocchi prima del GO
1. **Reazioni**: il client usa `.update({ reactions: next })`; senza una policy UPDATE non può salvare reazioni. La vecchia policy UPDATE generica è insicura: definire RPC transazionale o endpoint autorizzato che modifichi **solo** le reazioni e verifichi l'identità. Testare concorrenza, doppio click, dati spoofed e accessi cross-campaign.
2. **Tiri pubblici delegati**: `saveRollEntry` tenta l'upsert del tiro anche da client che lo ricevono. Con `sender_id = auth.uid()` questi tentativi sono correttamente respinti. Verificare che il primo inserimento avvenga sempre dal giocatore autore e che il fallimento secondario non produca errori visibili o duplicati; non indebolire l'autorizzazione per far funzionare i peer.
3. **Tiri segreti**: la Edge Function usa il service role per inoltrare via `profile:<gmId>`, canale privato. Occorre collaudo end-to-end di autenticazione, policy `realtime.messages`, autorizzazione dei canali, riconnessione e ricezione effettiva solo dal GM. I test statici non equivalgono a una prova WebSocket.
4. **Realtime**: per canali privati la policy su `realtime.messages` governa accessi broadcast/presence. Testare con JWT sintetici reali prima del deploy. Documentazione ufficiale: https://supabase.com/docs/guides/realtime/authorization

Questi test non avviano Supabase Auth/Realt​ime né eseguono una Edge Function. Nessun endpoint/utente/chiave di produzione viene usato. **NO-GO** fino ai test live multiutente sullo staging completo.
