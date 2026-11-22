# Confronto visuale originale / Aruba

Il runner `apps/aruba-vtt-pilot/test/capture-visual-baseline.mjs` acquisisce coppie di screenshot ai sei viewport contrattuali. Non crea fixture, non effettua login remoto e non approva automaticamente le differenze.

## Prerequisiti obbligatori

- due origin distinti;
- baseline servita dal vero `src/main.tsx` originale;
- stesso account fixture, campagna, dati, vista, tema e stato UI su entrambi;
- selettore visibile che dimostri il raggiungimento della stessa superficie;
- nessun accesso a produzione o account utente.

## Esecuzione

Da `apps/aruba-vtt-pilot`:

```powershell
$env:HG_VISUAL_BASELINE_URL='http://127.0.0.1:4174/?online=1'
$env:HG_VISUAL_ARUBA_URL='http://127.0.0.1:4173/vtt/'
$env:HG_VISUAL_READY_SELECTOR='text=Campagna browser'
$env:HG_VISUAL_BASELINE_CONFIRMED='TRUE_ORIGINAL_ENTRYPOINT'
$env:HG_VISUAL_CONTROLLED_FIXTURES='true'
$env:HG_BROWSER_EXECUTABLE='C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
node test/capture-visual-baseline.mjs
```

Per le altre superfici aggiungere `HG_VISUAL_SURFACE` (`campaigns` o `campaignhome`) prima dell'esecuzione. L'output contiene dodici PNG, un manifest con dimensione e SHA-256, e un report con coppie affiancate e overlay CSS in modalità differenza; per `campaignhome` i file sono `campaignhome-*.png`, `manifest-campaignhome.json` e `report-campaignhome.html`. `approved` e `layoutDiffReviewed` nascono sempre `false` e richiedono revisione manuale.

## Baseline controllata

`vite.visual-baseline.config.ts` esegue il vero `src/main.tsx`, `App.tsx`, AppShell e componenti originali sostituendo soltanto `AuthContext` e `CampaignContext` con fixture deterministiche locali. Il smoke test blocca ogni richiesta esterna e fallisce se la pagina tenta di contattare Supabase o altri host.

La fixture rende acquisibile la home autenticata originale e CampaignHome con la stessa campagna controllata su entrambi gli origin. Il selettore condiviso usato dalle acquisizioni correnti è `text=Campagna browser`; nessuna baseline è ancora approvata.

## Diff oggettivo

Il runner `apps/aruba-vtt-pilot/test/compare-visual-baseline.mjs` calcola il diff pixel-level e geometrico delle coppie controllate tramite il decoder canvas di Chromium (nessuna dipendenza immagine aggiuntiva). Ogni run:

- verifica gli SHA-256 dei PNG salvati nei manifests;
- calcola MAE/RMSE sul canale RGB, pixel percepibili oltre soglia e bounding box;
- confronta la geometria dichiarata nei file JSON di geometria;
- scrive heatmap in `deploy/aruba/qa/visual-comparison/diffs/` e report in `visual-diff.json` / `visual-diff.md`.

**Risultato dell'ultima run controllata:** 18 coppie, 3 superfici, MAE massimo 26.43/255. La fixture Aruba ora espone le capability reali già verificate per Sessione, Inviti, Incontri, Combatti e Chat; i relativi pulsanti non risultano più falsamente disabilitati. La CampaignHome ha delta geometrico massimo 0 px sui probe dichiarati in tutti e sei i viewport, inclusi 360×800 e 390×844. Il pannello diagnostico multiplayer è stato rimosso dallo stato inattivo e l'etichetta rail è riallineata a `Combatti`.

**Stato Chat:** il backend PostgreSQL è completo (tabelle `hollowgate_vtt.campaign_chat`, `hollowgate_vtt.chat_attachments` con funzioni autenticate), API route autenticate attive, capability `campaignChatEnabled` montata nel bootstrap e client pilot; i quattro adapter Aruba (`ArubaChatService`, `ArubaPrivateChatService`, `ArubaChatAttachments`, `ArubaChatDiceSession`) collegano il pannello originale `CampaignChatPanel` senza stato dadi duplicato. Il combined harness conferma: GM apre Chat, scrive messaggio reale nel PostgreSQL locale, verifica persistenza visuale e chiude pannello senza interrompere DataChannel.

Le sole variazioni grafiche ammesse rispetto all'originale sono la palette noir trasformata in nero/oro e il nuovo set di icone Phosphor Duotone. Struttura, geometria, testi, stati dei controlli e comportamento non sono variazioni approvabili.

Le metriche non equivalgono ad approvazione: `approved` e `layoutDiffReviewed` restano `false` finché human review non li promuove. Il gate `originalAndArubaVisualDiff` non è stato promosso.

## Prima acquisizione

La home autenticata è stata acquisita ai sei viewport in `visual-comparison/`. Il report mostra differenze strutturali nella chrome UI, nella rail destra, nell'header, nelle azioni rapide e nella card campagna. Il risultato è evidenza di non-parità e non un'approvazione: il manifest mantiene entrambi i gate a `false`.
