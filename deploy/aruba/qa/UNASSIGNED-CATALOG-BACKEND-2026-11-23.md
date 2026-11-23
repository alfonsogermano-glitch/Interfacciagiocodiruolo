# Catalogo nativo senza campagna — backend locale, non rilasciato

**Implementato e testato soltanto il sottoinsieme dei nuovi contenuti senza
campagna. Nessun deploy, backfill o attivazione del catalogo originale.**

Questo incremento segue `GLOBAL-CATALOG-RECOVERY-2026-11-22.md`: risolve la
necessità di una campagna fittizia per creare nuovi PG/PNG/Mostri e i loro
media. Non risolve ancora la proprietà storica ambigua, l'assegnazione alle
campagne, la duplicazione, le note o il ciclo claim/distacco/release completo.

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
che cambi owner/campagna, cancelli, duplichi o effettui un claim.

Non sono state cambiate le tabelle/routine/trigger campagna o claim esistenti.
Nessun dato precedente è copiato in una seconda sorgente di verità: il nuovo
storage nasce vuoto. L'integrazione futura deve definire locator/provenienza,
collisioni cross-storage e backfill revisionato prima di unificare le liste.
La diagnosi `catalog-provenance-audit.sql` del 22 resta dedicata allo storage
migrato/campagna: **non** è ora un inventario dei nuovi record nativi.

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

`apps/aruba-api/src/unassigned-catalog-{contract,service}.mjs` e boundary
opzionale in `auth-http.mjs`:

| Metodo/percorso | Contratto |
|---|---|
| GET `/vtt/catalog/unassigned/{kind}` | `{items,nextCursor}`, opzionale `?after=UUID` |
| POST stesso percorso | `{name,ruleset,data}` → `{item}` |
| GET `/vtt/catalog/unassigned/{kind}/{id}` | `{item}` |
| PUT stesso percorso | `{name,ruleset,data,revision}` → `{item}` |
| GET `…/{id}/media/{role}` | `{mimeType,dataBase64,revision}` |
| PUT stesso percorso media | `{mimeType,dataBase64,revision}` → `{item}` |

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
o inietta il servizio. Non è aggiunta alcuna capability globale/unassigned
al bootstrap. Senza iniezione esplicita nei test, le route restano 404.
Nessun Caddy, flag, installer, database attivo o componente originale è cambiato.
Il componente originale non deve essere montato sul solo sottoinsieme nativo:
nasconderebbe i dati storici e proporrebbe azioni ancora non implementate.

## Evidenze automatiche

- **8/8** test PostgreSQL incorporato PGlite: applicano le SQL reali root
  001–034 e la nuova migrazione in memoria, poi usano il vero servizio sotto
  ruolo runtime. Creazione/lettura/modifica dei tre tipi senza campagne create; isolamento tra
  proprietari; revoca/utente non verificato; accesso tabelle/helper vietato;
  autorità nel JSON rifiutata anche bypassando JS; pagine 100/100/5 su 205 righe;
  media senza campagna e rollback; barriera futura assegnazione.
- Incluso percorso **HTTP reale → sessione → servizio → PostgreSQL ristretto**
  su loopback, con creazione, save, 409 obsoleto, upload/read media e CSRF.
- Eseguiti anche i test SQL preesistenti di assignment e claim/release/revoca
  accanto al nuovo schema: passano e non cambiano il record catalogo nativo.
- **10** nuovi test contract/HTTP ordinari: campi originali, input e UTF-8
  limitati, media, contesti risposta sbagliati, errori sanitizzati, opt-in off,
  nessuna capability/startup wiring.
- Suite API completa **274/274**, VTT **490/490**; precedente diagnosi di
  provenienza **7/7** ancora passata. Nessun test manuale richiesto all'utente.

Limiti delle prove: PGlite serializza gli statement; il test di due save con
stessa revisione dimostra il rifiuto CAS, **non** contesa multi-connessione su
un server PostgreSQL indipendente. Non provati ancora browser originale,
layout, crop/cornici, TURN/realtime, storico pubblico o parità completa.

## Passo successivo

Integrare note/sotto-tab e duplicazione transazionale di entità+media+note;
poi definire ownership/provenienza revisionate e lifecycle di assegnazione,
claim, distacco e rilascio senza riattivare vecchi diritti. L'abilitazione
pubblica resta un rilascio successivo, esplicitamente autorizzato con backup,
preflight e rollback. Non eseguire questa nuova SQL sul VPS come prova manuale.
