# Catalogo nativo senza campagna — backend locale, non rilasciato

**Implementato e testato soltanto il sottoinsieme dei nuovi contenuti senza
campagna. Nessun deploy, backfill o attivazione del catalogo originale.**

Questo incremento segue `GLOBAL-CATALOG-RECOVERY-2026-11-22.md`: risolve la
necessità di una campagna fittizia per creare nuovi PG/PNG/Mostri, le loro
note/sotto-tab e i media. Non risolve ancora la proprietà storica ambigua,
l'assegnazione alle campagne, il ciclo claim/distacco/release completo né il
montaggio dell'interfaccia originale.

## Modello scelto per i nuovi contenuti

`sql/catalog/001_unassigned_catalog.sql` aggiunge, **solo nei database QA**:

- `catalog_entities`: identità `(kind,id)`, proprietario logico esplicito in
  `owner_id`, campagna nullable, nome/ruleset/dati originali separati dai metadati,
  revisione intera e date autorevoli del database. Qui owner è logico, **non**
  la normalizzazione al GM fisico di `character_drafts`.
- `catalog_entity_media`: ritratto, sorgente e cover collegati alla stessa
  identità; nessun campaign ID o URL da riscrivere. Ritratto massimo 512 KiB,
  sorgente/cover massimo 2 MiB; PNG/JPEG/WebP, niente SVG. MIME e intestazioni
  binarie controllati in JS e nelle routine SQL. Non è un decoder di immagini
  né una prova del comportamento crop/resize dell'editor originale.

Le nuove creazioni richiedono il ruleset scelto dall'utente. Il campo della
tabella può rappresentare il ruleset storico null senza inventarne uno;
questa possibilità **non** importa o ripara automaticamente i dati storici.

Le routine di questo incremento accettano soltanto entità con campagna null.
Se un futuro percorso assegna un'entità, questi endpoint non possono essere
usati per aggirare i controlli di campagna: lettura, modifica e media diventano
indisponibili da questo sottoinsieme. Non esiste ancora una routine runtime
che cambi owner/campagna, cancelli o effettui un claim.

Non sono state cambiate le tabelle/routine/trigger campagna o claim esistenti.
Nessun dato precedente è copiato in una seconda sorgente di verità: il nuovo
storage nasce vuoto. L'integrazione futura deve definire locator/provenienza,
collisioni cross-storage e backfill revisionato prima di unificare le liste.
La diagnosi `catalog-provenance-audit.sql` del 22 resta dedicata allo storage
migrato/campagna: **non** è ora un inventario dei nuovi record nativi.

## Assegnamento e copia verso campagne

`sql/catalog/003_catalog_assign_copy.sql` aggiunge, sempre solo nei database QA:

- `copy_unassigned_catalog_to_campaign(p_actor,p_kind,p_id,p_target_campaign,p_revision)`:
  una sola transazione che legge l'entità sorgente (campagna NULL), verifica
  revisione CAS, esistenza della campagna di destinazione e proprietà, crea la
  nuova riga con `campaign_id` impostato, copia media e note (radici e sotto-tab
  con ordini strutturali rimappati tramite nuovi UUID), e restituisce il
  documento dell'entità copia. La sorgente resta intatta (campagna NULL).
  Qualsiasi errore annulla tutto, lasciando la sorgente intatta.
- L'entità copiata non è più raggiungibile dagli endpoint del catalogo
  non assegnato (filtro `campaign_id IS NULL`): lettura, modifica e media
  diventano indisponibili da questo sottoinsieme, come previsto dal modello.
- Non esiste ancora una routine che sposti un'entità esistente (cambio
  `campaign_id` in-place) né che assegni un'entità già in una campagna.

## Note, sotto-tab e duplicazione atomica

`sql/catalog/002_notes_and_duplication.sql` aggiunge, sempre solo nei database
QA:

- `catalog_entity_notes`: massimo due livelli come l'originale (nota radice e
  una sola generazione di sotto-tab), FK composta `(kind,entity_id)` verso
  l'entità catalogo, padre obbligatoriamente nella stessa entità, ordine
  strutturale separato dal testo, tab nascoste/private e stato archiviato.
  Un trigger indipendente rifiuta un terzo livello anche quando si scrive
  direttamente in SQL.
- `catalog_duplicate_requests`: ricevuta idempotente per `(attore,requestId)`.
  Ripetere la stessa richiesta restituisce la copia già creata senza duplicare
  media, note o entità; riusare la chiave per un'altra origine viene respinto.
  La ricevuta non è leggibile dal ruolo runtime e non espone una copia che nel
  frattempo è stata assegnata o trasferita.
- `duplicate_unassigned_catalog_entry`: una sola transazione che copia scheda,
  tutti i media, tutte le note attive (radici e sotto-tab), i relativi ordini e
  nuovi identificativi. I riferimenti strutturali (`tabOrder`, ordine delle
  sotto-tab) vengono rimappati solo verso la stessa radice o gli stessi figli;
  UUID obsoleti vengono rimossi come nella riconciliazione originale. Il testo
  delle note e i documenti ricchi non vengono mai modificati con sostituzioni
  testuali. Un errore in qualsiasi punto annulla entità, media già inseriti e
  ricevuta, lasciando la sorgente intatta.
- Le note non accettano owner/campagna/autore/date nel body; il nome resta
  limitato a 120 caratteri, il testo a 32 KiB UTF-8 e il documento ricco a
  1 MiB con profondità/numero di nodi limitati. Niente URL Supabase o immagini
  data-URI. Revisione, posizione, tipo e ordine sono verificati dal contratto.
- Archiviare una nota radice archivia anche i figli; il contenuto resta
  recuperabile in SQL ma sparisce dalle liste e dalle duplicazioni. Archiviare
  un figlio aggiorna l'ordine del padre. Le operazioni note incrementano la
  stessa revisione della scheda e dei media: un salvataggio concorrente
  obsoleto riceve 409, non una scrittura parziale.
- Il prefisso «Copia di » è applicato come nell'originale. Il limite del nome
  del catalogo è un controllo infrastrutturale di 500 caratteri (l'originale
  non ne dichiarava uno): nomi realistici restano integrali, inclusa una copia
  di un nome di 120 caratteri; solo entro 9 caratteri dal limite il nome viene
  troncato in modo deterministico, senza fallire l'intera operazione.

## Autorizzazioni e salvataggi

- Il ruolo `hollowgate_api_runtime` non ha SELECT/INSERT/UPDATE/DELETE sulle
  nuove tabelle e non può invocare i due helper interni. Solo routine mirate
  SECURITY DEFINER, search_path fissato a pg_catalog/pg_temp.
- Actor ottenuto esclusivamente dalla sessione cookie nel boundary HTTP.
  Il DB richiede utente attivo e verificato, proprietà esatta e campagna null.
  Come le routine Aruba esistenti, l'actor passato dal server è un parametro
  fidato: il ruolo SQL applicativo non è un'identità browser separata per utente.
- Identità, ownership, collocazione, date, revisioni, provenienza e URL/media
  non sono accettati dentro i dati dell'entità. Metadati autorevoli separati
  impediscono che uno spread JSON conferisca diritti. Il futuro adapter UI
  dovrà proiettare i metadati server dopo i dati, non invertire la precedenza.
- Save e upload media richiedono la revisione osservata: lock della riga,
  controllo compare-and-swap, incremento e risposta autorevole in **una sola
  chiamata SQL**, senza rileggerla tramite una lista eventualmente troncata.
- Una scrittura obsoleta restituisce 409; un'altra identità/non autorizzata
  resta 404, senza rivelare revisione o contenuti del proprietario.
- Media e incremento revisione sono atomici: testato anche un errore successivo
  all'upsert binario, che deve ripristinare il media precedente e la revisione.
- Lista ordinata per ID, 100 record per pagina e `nextCursor` esplicito; SQL
  legge 101 per rilevare la continuazione. Non si spaccia il primo blocco di
  100 per elenco completo. Le pagine non costituiscono uno snapshot congelato:
  inserimenti concorrenti prima del cursore richiedono un successivo refresh.

## Servizio e trasporto HTTP

`apps/aruba-api/src/unassigned-catalog-{contract,service,notes-contract,notes-service}.mjs`
e boundary opzionale in `auth-http.mjs`:

| Metodo/percorso | Contratto |
|---|---|
| GET `/vtt/catalog/unassigned/{kind}` | `{items,nextCursor}`, opzionale `?after=UUID` |
| POST stesso percorso | `{name,ruleset,data}` → `{item}` |
| GET `/vtt/catalog/unassigned/{kind}/{id}` | `{item}` |
| PUT stesso percorso | `{name,ruleset,data,revision}` → `{item}` |
| GET `…/{id}/media/{role}` | `{mimeType,dataBase64,revision}` |
| PUT stesso percorso media | `{mimeType,dataBase64,revision}` → `{item}` |
| GET `…/{id}/notes`, `?parentId=UUID` | `{item,notes}` |
| POST `…/{id}/notes` | `{tabName,revision,parentId?}` → `{item,note}` |
| PUT `…/{id}/notes/{noteId}` | `{tabName,content,contentRich,position,hidden,visibility,revision}` → `{item,note}` |
| PUT `…/{id}/notes/{noteId}/order` | `{tabOrder,revision}` → `{item,note}` |
| DELETE `…/{id}/notes/{noteId}` | `{revision}` → `{item,archivedId}` |
| POST `…/{id}/duplicate` | `{requestId,revision}` → `{item}` |

`kind` = characters/npcs/monsters; `role` = portrait/source/cover. Per PG,
`data` contiene i campi scheda originali (style/viaggio/ambiti/abilita/tratti/
equipment ecc.), non un secondo owner/campaign. Per PNG/Mostri riutilizza la
validazione dei campi originali dell'API narrativa esistente senza simulare
una campagna con un UUID finto. Aggiunta solo l'esportazione del validatore;
il comportamento dei consumer narrativi esistenti resta invariato.

Tutti gli endpoint richiedono cookie valido; scritture con Origin esatta e
JSON limitato. Query arbitrarie/duplicate, cookie duplicati, owner nel body,
ID/regole/revisioni invalidi e immagini non coerenti sono respinti. Tutte le
risposte, compresi i media base64, hanno `Cache-Control: no-store`; nessun
URL pubblico o cache condivisa che sopravviva alla revoca. Errori SQL inattesi
non vengono inviati al browser.

**Disattivato per impostazione predefinita.** `index.mjs` non importa, costruisce
o inietta i servizi catalogo o note. Non è aggiunta alcuna capability
globale/unassigned al bootstrap. Senza iniezione esplicita nei test, le route
restano 404. Nessun Caddy, flag, installer, database attivo o componente
originale è cambiato.
Il componente originale non deve essere montato sul solo sottoinsieme nativo:
nasconderebbe i dati storici e proporrebbe azioni ancora non implementate.

## Evidenze automatiche

- **8/8** test PostgreSQL incorporato PGlite: applicano le SQL reali root
  001–034 e la nuova migrazione in memoria, poi usano il vero servizio sotto
  ruolo runtime. Creazione/lettura/modifica dei tre tipi senza campagne create; isolamento tra
  proprietari; revoca/utente non verificato; accesso tabelle/helper vietato;
  autorità nel JSON rifiutata anche bypassando JS; pagine 100/100/5 su 205 righe;
  media senza campagna e rollback; barriera futura assegnazione.
- **12/12** test PostgreSQL incorporato per note e duplicazione: cascata
  media/note/sotto-tab sui tre tipi, nuovi ID e ordini rimappati, tab
  nascoste/private e documenti ricchi preservati; rifiuto di genitori esterni,
  terzo livello, ordine incompleto/duplicato e accessi di altri utenti; archivi
  e potatura ordini; revisione condivisa; idempotenza anche dopo modifiche
  della sorgente; rollback di un errore simulato a metà copia; ricevute non
  riutilizzabili; limite nomi; HTTP reale con cookie/Origin/409.
- Incluso percorso **HTTP reale → sessione → servizi → PostgreSQL ristretto**
  su loopback, con creazione, save, 409 obsoleto, upload/read media, note,
  duplicazione e CSRF.
- Eseguiti anche i test SQL preesistenti di assignment e claim/release/revoca
  accanto al nuovo schema: passano e non cambiano il record catalogo nativo.
- **18** nuovi test contract/HTTP ordinari: campi originali, input e UTF-8
  limitati, media, note/ordini, contesti risposta sbagliati, errori sanitizzati,
  opt-in off, nessuna capability/startup wiring.
- Suite API completa **282/282**, VTT **490/490**; precedente diagnosi di
  provenienza **7/7** ancora passata. Nessun test manuale richiesto all'utente.

Limiti delle prove: PGlite serializza gli statement; il test di due save con
stessa revisione dimostra il rifiuto CAS, **non** contesa multi-connessione su
un server PostgreSQL indipendente. Non provati ancora browser originale,
layout, crop/cornici, TURN/realtime, storico pubblico o parità completa.

## Passo successivo

Stato al 23 novembre (fine checkpoint): il modello di proprietà logica e il
lifecycle claim/distacco/rilascio sono **implementati in QA** come
`sql/038_vtt_character_lifecycle.sql` (non ancora eseguita sul VPS, non ancora
rilasciata): aggiunta di `logical_owner_id`, `original_owner_id`,
`claimable_origin` e `ruleset` a `character_drafts`; backfill dal claim
corrente; routine di assign/release/claim riscritte; disponibilità GM e
assign rifiutano ora i PG già claimati. I test incorporati
`deploy/aruba/qa/character-lifecycle-db.test.mjs` (3/3), la suite API
completa e il regression SQL `test_vtt_character_claims.sql` sono verde.

Definire il modello di proprietà logica e il lifecycle di assegnazione,
claim, distacco e rilascio senza riattivare vecchi diritti; poi proiettare in
transazione i contenuti nativi verso le campagne (media, note e riferimenti),
provare la concorrenza su PostgreSQL indipendente e solo allora collegare
servizi, capability e componente originale. L'abilitazione pubblica resta un
rilascio successivo, esplicitamente autorizzato con backup, preflight e
rollback. Non eseguire questa SQL sul VPS come prova manuale.
