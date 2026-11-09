# Hollowgate — piano staging OVHcloud (novembre 2026)

> Documento di progettazione. **Non è un deployment**. Nessun cambiamento a produzione, DNS, database o credenziali. Issue di riferimento: #46.

## Decisione preliminare
Provider candidato: **OVHcloud Italia**, regione UE in datacenter principale (evitare Local Zone finché non si verificano supporto Docker e opzioni di backup).
Punto di partenza per **staging**: VPS-2 (4 vCore, 8 GB RAM, 75 GB NVMe), Ubuntu LTS. Non considerarlo dimensionamento definitivo per 180 utenti simultanei. VPS-3 (6 vCore, 12 GB RAM, 100 GB NVMe) è alternativa se il test RAM/CPU del backend integrato lo richiede.

Listino di riferimento consultato 10/11/2026: VPS-2 da 7,21 EUR + IVA/mese; VPS-3 da 10,40 EUR + IVA/mese. Prezzi da riconfermare al checkout, senza obbligo di acquisto. Traffico incluso dichiarato illimitato (fair use/condizioni e banda effettiva da verificare); anti-DDoS e backup giornaliero inclusi. Non equivalgono ad alta disponibilità.
Fonte: https://www.ovhcloud.com/it/vps/

## Inventario dipendenze — verificato
- Frontend React/TypeScript/Vite; rewrite SPA attuale su Vercel.
- Supabase PostgreSQL con RLS e tabelle applicative; Auth e Realtime.
- Storage bucket: visual-assets, character-portraits, note-images, campaign-logos, monster-images, dice-face-assets, chat-attachments, npc-images, news-images, avatars.
- Edge Functions **entrambe obbligatorie**: `make-server-771c5bfd` (Deno + Hono, 3 file, route campagne/personaggi/inviti/note/sessioni) e `dice-secret-roll` (Deno, tiri segreti).
- Integrazioni backend esterne: Gemini e Resend. Segreti **mai** nel repository o nei log.
- Incidenti noti: Cached Egress Supabase Free oltre quota; fog-of-war non ancora corretto e collaudato. Tenere distinti i due problemi.

## Architettura candidata (non definitiva)
1. Reverse proxy Caddy/Nginx con HTTPS e security headers.
2. Frontend statico Vite servito da proxy; asset grandi con caching, hash e compressione, CDN valutata separatamente.
3. API Deno/Hono in container non privilegiato; servizio tiri segreti isolato; verifica JWT e autorizzazioni identiche all'attuale.
4. **Per staging iniziale**, mantenere Supabase Auth/DB/Realtime/Storage su progetto di prova separato oppure deploy di stack Supabase self-hosted compatibile. Non assumere che PostgreSQL + Hono sostituiscano Auth, Realtime, Storage, PostgREST e policy RLS.
5. Backup applicativo consistente PostgreSQL (inclusi auth e schemi di servizio dove applicabile), file Storage, configurazione e secrets gestiti fuori dal repository; copia cifrata offsite, restore testato.
6. Monitoraggio: uptime API/SPA, errori 4xx/5xx, CPU/RAM/disco, traffico, WebSocket, code e spazio; allarmi prima della saturazione.

## Ordine di esecuzione e gate
### Gate A — prima di ordinare
- [ ] Confermare piano, datacenter UE, prezzo totale IVA/opzioni, limiti traffico, policy di assistenza.
- [ ] Verificare backup esportabili, accesso SSH, firewall, protezione DDoS, upgrade verticale e eventuali tempi di fermo.
- [ ] Definire chi amministra aggiornamenti di sicurezza e incidenti.
- [ ] Scegliere modalità di staging isolato e dominio di prova (senza cambiare `www.hollowgate.quest`).

### Gate B — provisioning dopo approvazione acquisto
- [ ] Creare account/risorsa OVHcloud nel nome del proprietario; accesso SSH a chiave, MFA, firewall deny-by-default, niente password SSH root.
- [ ] Provisioning automatizzato e riproducibile, nessun segreto committato.
- [ ] HTTPS staging, log strutturati, health checks, backup e ripristino documentato.
- [ ] Nessuna copia di dati reali finché l'ambiente non è protetto.

### Gate C — migrazione e test
- [ ] Inventario API e permessi; recuperare sorgenti delle funzioni distribuite e sincronizzarli con repository privato/protetto se necessario.
- [ ] Copia di prova dati e storage, sanificata quando possibile, con verifica conteggi e permessi.
- [ ] Test Auth: login, registrazione, sessione, logout, recupero password; inviti GM/giocatore.
- [ ] Test Realtime: presenza, eventi e riconnessioni con più campagne simultanee.
- [ ] Test VTT: mappe, nebbia, token, dadi segreti, note, immagini, allegati, chat.
- [ ] Test carico a 30/100/180 utenti simultanei e soak test: p95 API, error rate, banda, memoria e latenze Realtime.
- [ ] Test ripristino e rollback, poi prova generale prima del cambio DNS.

## Regole di rilascio
**Non modificare `main`, DNS o database di produzione senza backup verificato, collaudo e approvazione.** Il lancio entro il 24/12/2026 è un obiettivo, non una ragione per saltare i gate.

## Rischi espliciti
- Un solo VPS è un single point of failure: per una reale alta disponibilità servono ridondanza e budget superiore.
- Backup giornaliero VPS non sostituisce backup applicativi consistenti e offsite.
- L'infrastruttura autogestita richiede manutenzione, patch, monitoraggio e gestione incidenti.
- Il blocco Supabase da quota non si risolve finché i servizi attuali restano sul progetto bloccato.
