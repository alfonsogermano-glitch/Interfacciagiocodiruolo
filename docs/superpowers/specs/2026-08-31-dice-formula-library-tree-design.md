# Design: libreria gerarchica delle formule dadi

Data: 2026-08-31

## Obiettivo

Trasformare la sezione **Formule salvate** del pannello dadi in una libreria organizzabile come un piccolo file manager, senza alterare il comportamento del builder, del tiro, della chat dei tiri o delle formule già esistenti.

L'utente deve poter:

- creare cartelle e sottocartelle;
- espandere e richiudere le cartelle inline;
- annidare cartelle fino a un massimo di **5 livelli** (la root non conta come livello);
- trascinare formule e cartelle per riordinarle allo stesso livello;
- trascinare formule e cartelle dentro e fuori da altre cartelle;
- rinominare le cartelle;
- assegnare alle cartelle un'icona usando lo stesso catalogo Lucide già usato per le formule;
- cancellare cartelle vuote normalmente;
- cancellare cartelle non vuote scegliendo se promuovere il contenuto al livello superiore oppure eliminare ricorsivamente tutto il contenuto.

Le formule già presenti in produzione devono comparire automaticamente nella root e continuare a funzionare senza migrazioni distruttive.

## UX dell'albero

La libreria è un **albero inline richiudibile**. Cartelle e formule convivono nello stesso elenco e nello stesso ordine visivo.

Ogni cartella mostra:

- chevron per aprire/chiudere;
- icona di cartella, sostituibile con un'icona personalizzata;
- nome;
- menu `⋮` con `Nuova sottocartella`, `Rinomina`, `Icona`, `Elimina`.

Il pulsante **Nuova cartella** è disponibile accanto al titolo `Formule salvate` e crea una cartella nella root. Dal menu di una cartella, `Nuova sottocartella` crea invece un figlio di quella cartella, purché il risultato non superi il quinto livello.

Le formule mantengono le azioni attuali: tiro, segretezza, modifica, duplicazione, icona ed eliminazione.

### Stato aperto/chiuso

Gli ID delle cartelle aperte sono salvati localmente nel browser, con una chiave distinta per campagna e utente. Aprire o chiudere una cartella non produce scritture Supabase.

## Drag & drop

Si usa il drag & drop nativo già adottato nell'interfaccia dadi, senza introdurre una nuova dipendenza.

Durante il drag vengono rappresentate tre destinazioni distinte:

1. **prima** di un elemento allo stesso livello;
2. **dopo** un elemento allo stesso livello;
3. **dentro** una cartella.

La root è sempre una destinazione valida per formule e cartelle. Una cartella chiusa si apre automaticamente dopo un breve hover durante il trascinamento.

Una cartella non può essere spostata dentro se stessa, dentro una propria discendente o in una posizione che porterebbe una parte del suo sottoalbero oltre il quinto livello. Il controllo viene eseguito sia nel client sia nel database.

## Modello dati Supabase

Nuova tabella `dice_formula_folders` con `id`, `campaign_id`, `owner_profile_id`, `name`, `icon_name`, `parent_folder_id`, `sort_order`, `created_at`, `updated_at`.

`dice_formulas` riceve `folder_id` e `sort_order`. `folder_id = null` identifica una formula nella root; le formule esistenti vengono mantenute nella root e ordinate secondo il precedente `updated_at desc`.

Cartelle e formule condividono lo stesso spazio logico di ordinamento a ogni livello.

## Integrità della gerarchia

Il database verifica ownership/campagna del parent, assenza di cicli e profondità massima 5. Anche l'assegnazione formula-cartella deve rimanere nella stessa libreria.

## Operazioni atomiche lato database

Le operazioni strutturali usano RPC PostgreSQL transazionali:

- `create_dice_formula_folder` crea in coda al livello;
- `move_dice_library_node` sposta/riordina formule e cartelle e normalizza i livelli coinvolti;
- `delete_dice_formula_folder(folder_id, delete_contents)` gestisce cancellazione sicura o ricorsiva.

Se `delete_contents = false`, formule e sottocartelle dirette vengono promosse al parent della cartella eliminata, o alla root, conservando ordine e sottoalberi. Se `true`, l'intero sottoalbero e le formule contenute vengono eliminati atomically.

## Dialog di eliminazione

Per cartella piena compare una checkbox **Elimina anche tutto il contenuto della cartella**, deselezionata di default. Senza spunta il contenuto risale di un livello; con spunta viene eliminato definitivamente.

## Componenti frontend

- `DiceFormulaLibraryTree`: rendering ricorsivo e drop target;
- `DiceFormulaFolderRow`: singola cartella;
- `DeleteDiceFormulaFolderDialog`: cancellazione protetta;
- `DiceLibraryIconPicker`: picker condiviso palette-aware;
- `SavedDiceFormulaCard`: formula compatibile con albero e drag.

`SessionDicePanel` coordina caricamento, CRUD, move ottimistico e rollback.

## Errori e compatibilità

Le operazioni strutturali fallite ripristinano lo snapshot precedente e mostrano toast in italiano. Nessuna modifica ai dati dei tiri o alla chat. Le formule storiche restano utilizzabili dalla root.

## Test e criteri di accettazione

Le verifiche coprono massimo 5 livelli, cicli, spostamenti root/cartella, riordino misto, auto-open, icone, stato locale, cancellazione sicura/ricorsiva, rollback e tutte le funzioni formula esistenti. Prima della consegna deve passare `npm run check`, quindi CI e Vercel Production devono risultare verdi sullo stesso SHA finale.
