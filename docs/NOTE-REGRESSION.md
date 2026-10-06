# Note: regressione di chiusura dell’editor

Controllo eseguito il **5 ottobre 2026**. Esito: **PASS**.

## Comandi ripetibili

```sh
npm run verify:notes-all
npm run check
```

Il primo comando esegue tutti i controlli delle note e le simulazioni nel browser.
Il secondo comprende typecheck, verifiche del sito, matrice delle note e build.

Comandi singoli:

- `npm run verify:notes`: tutte le 29 suite modello/sorgente delle note,
  comprese le verifiche preesistenti di radio, hit area, icone e Annulla.
- `npm run verify:notes-matrix`: matrice combinatoria, già inclusa in `check`.
- `npm run verify:notes-browser`: simulazioni Chrome con le viste reali.

Il browser runner usa Node con WebSocket nativo (verificato su Node 24) e
Chrome/Chromium installato. Non aggiunge dipendenze. Avvia un Vite dedicato su
`127.0.0.1:5187`, se necessario, e chiude i processi che ha avviato. Si può
impostare `CHROME_PATH` per un eseguibile diverso o `NOTE_TEST_URL` per usare
un server già avviato. I test montano fixture locali con i provider reali;
non richiedono una campagna o una sessione Supabase funzionante.

## Catalogo e matrice del documento

18 casi: paragrafo vuoto, testo Unicode, Dado, Modificatore, Punti, Checkbox,
Radio, Icona, testo misto a widget, Box di testo, Collapse aperto, Collapse
chiuso, Tabella, Archivio, lista puntata, lista task, immagine e separatore.

| Verifica | Copertura | Risultato |
| --- | ---: | --- |
| Tutti i singoli, coppie ordinate e terne ordinate | 18 + 324 + 5.832 = **6.174 documenti** | PASS |
| Percorsi del cursore avanti/indietro | **170.716 passi** | PASS |
| Inserimenti laterali in righe di due elementi compatibili | **864 combinazioni** | PASS |
| Serializzazione JSON e riapertura | Tutti i 6.174 documenti | PASS |
| Scrittura finale, Annulla e Ripristina | Tutti i 6.174 documenti | PASS |
| Riga finale unica, ripristino dopo cancellazione e conservazione dei contenuti | Applicati alla matrice | PASS |

La matrice importa e usa le funzioni effettive di navigazione, inserimento
laterale e riparazione della coda. Le verifiche preesistenti completano la
copertura di formule, limiti dei contenitori, tabelle e controlli contestuali.

## Browser e componente della pagina

| Verifica | Copertura | Risultato |
| --- | ---: | --- |
| Singoli, tutte le coppie, righe affiancate e contenitori consentiti | **1.076 layout**, larghezze 1.100/360px | PASS |
| Tutte le quattro frecce attraverso gli handler dell’editor reale | **41.104 passi** | PASS |
| Mouse, quattro frecce native, digitazione e Invio sotto gli elementi | **36 scenari** | PASS |
| JSON, scrittura, Annulla/Ripristina e modalità sola lettura | Tutti i layout della matrice browser | PASS |
| Trasformazioni tra Testo/Dado/Checkbox/Punti/Modificatore nell’Archivio | **20 trasformazioni** | PASS |
| Modifica e riapertura Dado/Modificatore/Checkbox Archivio | **3 pannelli** | PASS |
| Punti con e senza Massimo, anche dopo riapertura | Celle renderizzate a **130/160/360px** | PASS |
| Aggiunta, conversione, duplicazione e cancellazione di righe/colonne/Archivio | **11 operazioni** | PASS |
| `RichTextEditor` della pagina, controllato con `richContent`/`onChangeRich` | **2 larghezze** | PASS |
| Attivazione da sola lettura, riga finale, checkbox/radio, menu `/`, frecce nel menu e pannello Modificatore normale | Nel componente della pagina | PASS |

Archivio e Tabella dentro una cella Tabella sono vietati dalla policy e non
sono inseriti come fixture browser valide; le relative regole sono verificate
dalla suite dei contenitori. Il browser usa i NodeView reali, inclusa la griglia
Archivio, invece di sostituirli con segnaposto.

Il risultato browser viene salvato in `notes-regression-report.json` sotto
la directory temporanea `opencode`. Un errore produce anche uno screenshot
`notes-regression-failure.png` e un exit code non zero.

## Difetto emerso e corretto

Nei Punti Archivio, disabilitando il Massimo, il valore continuava a essere
limitato al massimo nascosto. La correzione rende il clamp condizionale sia
nell’aggiornamento sia nella normalizzazione, preserva il valore dopo riapertura
e copia come testo solo il valore quando il massimo è disabilitato. Riabilitando
il Massimo viene ripristinato il limite. La regressione è nel browser runner.

## Ambito della chiusura

La parte editor delle Note è chiusa con questa baseline verificata. La matrice
è esaustiva per il catalogo e le sequenze fino a tre elementi nel modello;
il browser aggiunge layout e interazioni reali rappresentativi. Il roundtrip
verificato è quello del documento JSON e del componente controllato, non un
test del database/realtime remoto. Questa baseline va rieseguita se cambiano
editor, NodeView, CSS delle note o componenti condivisi interessati.
