# Dice System Design

**Date:** 2026-08-28  
**Scope:** nuova schermata/session panel **Dadi**, builder di formule, formule salvate per campagna, motore di tiro, storico volatile, Realtime multiplayer, tiri segreti e animazione 3D opzionale.

## 1. Obiettivo

Creare in Hollowgate un sistema di dadi da VTT che permetta di:

- costruire formule ordinate visualmente;
- eseguire tiri di prova dal builder;
- salvare formule personali e specifiche della campagna;
- lanciare una formula salvata premendo la relativa card;
- scegliere per ogni formula salvata se il tiro e' pubblico o segreto;
- mostrare i tiri a tutti i client autorizzati in tempo reale;
- mostrare un registro volatile dei tiri della sessione;
- aggiungere una animazione fisica 3D che non sia mai fonte autoritativa del risultato.

La fonte autoritativa e' sempre il **RollResult** generato dal motore Hollowgate. Il renderer 3D e' solo presentazione.

## 2. Integrazione con la UI esistente

La rail destra di sessione possiede gia' l'ID `dice`, oggi disabilitato. Il nuovo sistema abilita quella voce e apre il pannello Dadi nello stesso `SlideOverPanel` usato dalle altre sezioni di sessione.

Il pannello Dadi usa le variabili palette esistenti (`--dash-*`) e non introduce colori hardcoded per la UI applicativa.

La vecchia `src/app/components/DiceRoller.tsx` e' un prototipo indipendente e non deve diventare il centro del nuovo sistema. Il nuovo sottosistema vive sotto `src/app/components/session/dice/` e usa servizi separati per formula engine, persistence, Realtime e animazione.

## 3. Toolbar dadi rapidi

Ordine fisso dal piu' piccolo al piu' grande:

`d4 -> d6 -> d8 -> d10 -> d12 -> d20 -> d100`

Ogni pulsante mostra l'icona del dado. Se quel tipo e' presente nella formula, compare un badge con la quantita' complessiva.

Comportamento al click:

- se non esiste una riga Dice di quel tipo, viene aggiunta una nuova riga in fondo alla lista;
- se esiste una sola riga di quel tipo, ne aumenta la quantita';
- se esistono piu' righe dello stesso tipo, viene incrementata la prima in ordine visuale;
- il badge mostra la somma delle quantita' di tutte le righe con quelle facce.

Il pulsante `+` centrale del builder **non aggiunge un dado standard**: apre l'inserimento di un nuovo elemento di formula/modificatore.

## 4. Modello della formula

La formula e' una lista ordinata di elementi. L'ordine visuale e' l'ordine di esecuzione. Hollowgate non riordina automaticamente gli elementi.

```ts
type DiceFormulaItem =
  | DiceItem
  | KeepItem
  | DropItem
  | ExplodingItem
  | CompareItem
  | ArithmeticModifierItem;
```

Ogni elemento ha un `id` stabile per drag and drop, modifica e rimozione.

Le righe possono essere:

### 4.1 Dice

Campi:

- `sides`: numero facce, minimo 2;
- `quantity`: intero >= 1.

La voce `Dice` del menu `+` permette dadi personalizzati, per esempio d3 o d30.

Sintassi compatta: `NdS`, per esempio `2d20`, `1d3`.

### 4.2 Keep

Sottotipi:

- `Highest`
- `Lowest`

Valore: numero risultati da mantenere, intero >= 1.

Sintassi:

- Highest -> `khN`
- Lowest -> `klN`

Agisce sul gruppo di dadi attivo piu' recente.

### 4.3 Drop

Sottotipi:

- `Highest`
- `Lowest`

Valore: numero risultati da scartare, intero >= 1.

Sintassi:

- Highest -> `dhN`
- Lowest -> `dlN`

Agisce sul gruppo di dadi attivo piu' recente.

### 4.4 Exploding

Modalita':

- **Explode highest value** -> `!`
- **Compound additional rolls** -> `!!`
- **Penetrate additional rolls** -> `!p`

Semantica:

- `!`: se un dado ottiene il proprio massimo naturale, viene lanciato un ulteriore dado dello stesso tipo; la catena continua finche' il nuovo dado non ottiene il massimo. I risultati aggiuntivi restano risultati individuali.
- `!!`: stessa catena, ma i risultati della catena vengono sommati al risultato originario e trattati come un unico risultato composto.
- `!p`: il massimo naturale genera un ulteriore tiro; ogni tiro aggiuntivo riceve `-1` al valore che contribuisce al risultato. La decisione di esplodere di nuovo usa il valore naturale prima della penalita'.

Per sicurezza il motore impone un limite massimo di 100 esplosioni per catena e 1000 dadi generati per singolo RollResult. Il superamento produce un errore di formula/roll invece di un loop infinito.

E' consentito al massimo un `Exploding` per singolo gruppo Dice.

### 4.5 Compare

Operatori:

- Greater than or equal to -> `>=N`
- Less than or equal to -> `<=N`
- Equals -> `=N`

Campi:

- operatore;
- soglia numerica;
- checkbox `Totale`.

#### Compare senza `Totale`

Confronta **ogni singolo risultato attivo** del gruppo Dice piu' recente dopo gli eventuali Keep/Drop/Exploding precedenti.

Output:

- se viene confrontato un solo risultato: `Successo` verde oppure `Fallimento` rosso;
- se vengono confrontati piu' risultati: conteggio `N Successi` verde e `M Fallimenti` rosso; un conteggio pari a zero puo' essere omesso dalla card.

Il Compare non modifica il valore numerico della formula: aggiunge soltanto un esito.

#### Compare con `Totale`

Confronta il totale numerico accumulato fino a quel punto della sequenza, inclusi i modificatori matematici gia' applicati.

Sintassi visuale Hollowgate: prefisso `T`, per esempio `T>=15`.

Output: `Successo` verde oppure `Fallimento` rosso.

### 4.6 Modifier matematico

Operazioni:

- Add -> `+N`
- Subtract -> `-N`
- Multiply -> `*N`
- Divide -> `/N`
- Exponent -> `^N`

Agisce sul totale accumulato fino a quel punto. Una divisione per zero rende la formula non valida e impedisce il Roll.

## 5. Scope e validazione della sequenza

Ogni `Dice` apre un gruppo Dice attivo.

`Exploding`, `Keep`, `Drop` e `Compare` senza `Totale` agiscono sul gruppo Dice attivo piu' recente.

Un nuovo `Dice` apre un nuovo gruppo. Un `Modifier` matematico chiude lo scope dei modificatori di gruppo precedenti; dopo un Modifier, un Keep/Drop/Exploding/Compare-per-dado e' invalido finche' non compare un nuovo Dice.

`Compare Totale` puo' comparire ogni volta che esiste un totale numerico accumulato.

La UI puo' permettere il riordinamento libero, ma mostra chiaramente le righe invalide e disabilita `Roll`/`Save formula` finche' la sequenza non e' valida.

Il riordinamento deve essere disponibile con drag and drop e con controlli accessibili `Sposta su` / `Sposta giu` nel menu della riga.

## 6. Formula compatta visualizzata

La stringa sotto il nome della formula viene rigenerata in tempo reale dalla lista ordinata.

Esempio equivalente al riferimento:

`2d20+2d12!p>=3+1d3dh1!kh1+3`

Non e' necessario fare round-trip parsing della stringa per ricostruire la formula: il dato persistente resta la lista strutturata JSON. La stringa e' una rappresentazione leggibile e compatta.

## 7. Builder e azioni

Intestazione:

- icona formula;
- nome modificabile, default `Untitled dice formula`;
- formula compatta live.

Azioni:

- `Roll`: esegue sempre un **tiro pubblico di prova** del builder corrente;
- `Save formula`: crea o aggiorna la formula salvata corrente;
- `Clear`: svuota soltanto il builder corrente, non lo storico dei tiri.

Il test Roll resta pubblico anche se si sta modificando una formula salvata configurata come segreta.

## 8. Formule salvate

Ogni formula salvata e':

- personale (`owner_profile_id`);
- specifica della campagna (`campaign_id`);
- persistente tra sessioni;
- non visibile nelle altre campagne.

Card formula:

- icona;
- nome;
- formula compatta;
- toggle occhio / occhio sbarrato;
- menu `...`.

Click sulla parte principale della card = esegue il tiro.

Il controllo occhio non deve far scattare il tiro.

Menu `...`:

- `Edit formula`;
- `Duplicate formula`;
- `Delete formula`.

La duplicazione copia contenuto e stato pubblico/segreto; il nome della copia viene prefissato con `Copia di ` salvo successiva modifica dell'utente.

## 9. Persistenza formule

Nuova tabella Supabase proposta:

```sql
dice_formulas (
  id uuid primary key,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  owner_profile_id text not null references profiles(id) on delete cascade,
  name text not null,
  items jsonb not null,
  is_secret boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

RLS:

- SELECT: solo `owner_profile_id = auth.uid()` e campagna ancora accessibile;
- INSERT: owner corrente, campagna di cui l'utente e' owner o membro;
- UPDATE/DELETE: solo proprietario della formula.

Indice almeno su `(campaign_id, owner_profile_id, updated_at)`.

I risultati dei tiri **non** vengono salvati in questa tabella o in altre tabelle persistenti.

## 10. Motore di tiro

Il motore e' una funzione pura/testabile separata dalla UI.

Input:

- lista ordinata `DiceFormulaItem[]`;
- identita' dell'utente;
- metadati formula/visibilita'.

Output canonico:

```ts
interface RollResult {
  id: string;
  campaignId: string;
  rollerId: string;
  rollerName: string;
  rollerAvatarUrl?: string;
  formulaId?: string;
  formulaName: string;
  formulaText: string;
  visibility: 'public' | 'secret';
  diceGroups: RollDiceGroup[];
  arithmeticSteps: RollArithmeticStep[];
  comparisons: RollComparisonResult[];
  total: number;
  createdAt: number;
}
```

Il RNG usa `crypto.getRandomValues` con rejection sampling per evitare bias da modulo. Non viene usato `Math.random()` come sorgente primaria.

Il motore calcola il risultato **una sola volta**. Registro, Realtime e 3D consumano lo stesso `RollResult`.

## 11. Realtime pubblico

Il progetto possiede gia' il topic privato `campaign:{campaignId}` con un registry condiviso e controllo RLS owner/member.

Si aggiunge un nuovo BroadcastEvent `dice_roll` al registry esistente.

Un tiro pubblico viene inviato sul canale campagna e ricevuto da tutti i partecipanti attualmente connessi e autorizzati.

Chi entra dopo non riceve lo storico precedente.

## 12. Realtime segreto

Un tiro segreto non deve mai passare sul canale pubblico di campagna.

Nuovo topic privato:

`dice-gm:{campaignId}`

Nuove policy `realtime.messages` dedicate:

- SELECT: solo il proprietario/GM della campagna;
- INSERT: proprietario della campagna oppure membro della stessa campagna;
- topic validato con lo stesso guard UUID sicuro gia' usato per `campaign:{uuid}`.

Comportamento:

- **giocatore, tiro pubblico** -> canale campagna; visibile a tutti;
- **giocatore, tiro segreto** -> il giocatore gestisce localmente il proprio RollResult e invia lo stesso risultato a `dice-gm:{campaignId}`; lo vedono soltanto giocatore + GM;
- **GM, tiro pubblico** -> canale campagna; visibile a tutti;
- **GM, tiro segreto** -> solo locale al GM; nessun Broadcast necessario.

Gli altri giocatori non sono autorizzati a sottoscrivere `dice-gm:{campaignId}`, quindi non ricevono il payload dei tiri segreti altrui.

## 13. Registro volatile dei tiri

Il registro vive soltanto in memoria React a livello di sessione/campagna.

Non usa:

- database;
- localStorage;
- sessionStorage;
- recupero retroattivo Realtime.

Conseguenze intenzionali:

- chi entra a sessione gia' iniziata vede solo i tiri ricevuti da quel momento;
- refresh/uscita dalla sessione azzera il registro locale;
- fine sessione non conserva nulla.

Il drawer del registro e' un pannello overlay a scomparsa, ancorato nella parte bassa/sinistra dell'area di sessione e indipendente dal pannello Dadi a destra.

Ordine: tiro piu' recente in basso; la lista cresce verso l'alto.

Ogni card mostra:

- nome e avatar di chi ha tirato;
- nome formula;
- formula compatta;
- totale finale;
- risultati raggruppati per tipo/gruppo di dado;
- esiti Compare;
- `Reroll`.

`Reroll` crea un nuovo RollResult e una nuova card; mantiene la visibilita' originale del tiro/formula.

Pulsanti del drawer:

- icona dado: mostra/nasconde senza cancellare;
- `Clear`: cancella **solo il registro locale dell'utente che lo preme** e non invia eventi agli altri client.

## 14. Reveal e animazione 3D

Il risultato e' calcolato e distribuito prima dell'animazione, ma la card rimane nascosta finche' non deve essere rivelata.

Stati locali:

`pending -> animating -> revealed`

Flusso normale:

1. ricezione/generazione RollResult;
2. conservazione interna immediata;
3. avvio animazione 3D predeterminata;
4. dadi si fermano sul risultato gia' noto;
5. pausa di circa 1 secondo;
6. reveal della card;
7. dissolvenza e rimozione dell'overlay 3D.

Se le animazioni sono disabilitate o il renderer fallisce, la card viene rivelata immediatamente.

### 14.1 Interruzione da un nuovo tiro

Non esiste una coda di animazioni.

Se arriva un nuovo RollResult mentre A e' in animazione:

1. A viene rivelato immediatamente nel registro;
2. animazione A viene cancellata/sgomberata;
3. parte l'animazione del nuovo tiro B;
4. B resta nascosto fino alla propria fine o fino a un'eventuale nuova interruzione.

I risultati non vengono mai persi perche' l'animazione e' separata dallo storico.

## 15. Renderer 3D

L'implementazione usa un adapter `Dice3DRenderer` per evitare dipendenza diretta del resto dell'app da una libreria specifica.

Prima implementazione: `@3d-dice/dice-box-threejs@0.0.12`, pin esatto, perche' espone risultati predeterminati tramite sintassi tipo `6d6@4,4,4,4,4,4`.

L'adapter deve offrire almeno:

```ts
interface Dice3DRenderer {
  init(): Promise<void>;
  play(result: RollResult, signal: AbortSignal): Promise<void>;
  clear(): void;
  dispose(): void;
}
```

Il renderer non calcola il tiro.

Solo i dadi/forme supportati dal renderer vengono animati. Un dado personalizzato non supportato (per esempio una geometria arbitraria d3/d30) resta pienamente valido nel motore e nello storico ma viene omesso dall'animazione fisica, senza falsificarlo usando un altro dado.

Il canvas 3D e' full-screen, trasparente, `pointer-events: none`, sopra il VTT ma sotto eventuali dialog critici.

Il sistema prevede un toggle locale `Animazione dadi 3D` ON/OFF; OFF non modifica i risultati o il Realtime.

Il package 3D e' isolato e lazy-loaded quando serve. Se `npm audit`, build Vite o runtime WebGL falliscono, il sistema di dadi resta funzionante con reveal immediato e l'animazione viene considerata un enhancement non bloccante.

## 16. Identita' e autorizzazione

`rollerId`, nome e avatar vengono costruiti dal client autenticato (`useAuth`) al momento del tiro.

Il ruolo GM deriva da `activeCampaign.ownerId === user.id`.

La visibilita' viene determinata prima del Broadcast e non puo' essere modificata dal drawer dei risultati.

La prima versione non introduce un sistema anti-cheat server-authoritative: il tiro e' client-generated come nel prototipo attuale, ma usa un RNG migliore e canali RLS corretti per la riservatezza. Un eventuale motore server-authoritative e' fuori scope di questa feature.

## 17. Componenti previsti

Struttura indicativa:

```text
src/app/components/session/dice/
  SessionDicePanel.tsx
  DiceToolbar.tsx
  DiceFormulaBuilder.tsx
  DiceFormulaRow.tsx
  SavedDiceFormulaCard.tsx
  DiceRollHistoryDrawer.tsx
  DiceRollHistoryCard.tsx
  Dice3DOverlay.tsx
  diceTypes.ts
  diceFormulaText.ts
  diceFormulaValidation.ts
  diceEngine.ts
  diceHistoryContext.tsx
  dice3dRenderer.ts

src/services/supabase/
  diceFormulasService.ts

src/services/realtime/
  campaignChannel.ts
  diceRealtime.ts
```

La struttura puo' essere affinata durante il piano, ma i confini restano: UI, engine, persistence, Realtime e 3D separati.

## 18. Test e verifiche obbligatorie

### Motore

Test deterministici con RNG iniettato per:

- dadi standard e personalizzati;
- ordine sequenziale;
- Keep Highest/Lowest;
- Drop Highest/Lowest;
- Explode, Compound, Penetrate;
- Compare per-dado e Totale;
- Add/Subtract/Multiply/Divide/Exponent;
- invalidita' di scope e divisione per zero;
- limiti di esplosione.

### Persistenza

Verificare:

- formula visibile solo al proprietario nella campagna corretta;
- CRUD personale;
- cancellazione a cascata con campagna;
- formula non compare nelle altre campagne.

### Realtime

Matrix minima con GM + due giocatori:

- pubblico giocatore -> tutti;
- segreto giocatore A -> A + GM, non B;
- segreto GM -> solo GM;
- pubblico GM -> tutti;
- late join -> nessun recupero storico;
- Clear locale -> nessun effetto sugli altri.

### Reveal/3D

- card nascosta durante animazione;
- card rivelata al completamento;
- nuovo tiro interrompe il precedente e rivela il precedente;
- renderer disabilitato/fallito -> reveal immediato;
- nessuna divergenza tra facce 3D predeterminate e RollResult.

### Repository gates

- `npm ci`;
- `npm audit --audit-level=high`;
- `npm run check`;
- build Vite;
- CI GitHub;
- Vercel;
- smoke test manuale multi-client prima di considerare completa la funzione.

## 19. Non-obiettivi della prima versione

- storico persistente dei tiri;
- recupero dei tiri precedenti al join;
- condivisione delle formule salvate tra utenti;
- formule globali cross-campagna;
- anti-cheat/server-authoritative RNG;
- personalizzazione estetica avanzata dei dadi 3D;
- animazione garantita per ogni possibile dado personalizzato.

## 20. Criteri di accettazione

La feature e' accettata quando:

1. la voce Dadi della rail e' attiva e apre il builder;
2. l'utente puo' costruire e riordinare formule con tutte le opzioni definite;
3. formula compatta e validazione reagiscono in tempo reale;
4. Roll del builder e' sempre pubblico;
5. formule salvate sono personali e specifiche della campagna;
6. occhio/occhio sbarrato determina il comportamento pubblico/segreto delle formule salvate;
7. visibilita' multiplayer rispetta esattamente la matrice definita;
8. registro volatile mostra solo i tiri ricevuti da quando il client e' entrato;
9. Clear e' locale;
10. l'animazione 3D non precede la rivelazione della card e puo' essere interrotta senza perdita del risultato;
11. un nuovo tiro interrompe l'animazione precedente ma non elimina alcuna card;
12. CI, audit, build e smoke test multi-client sono verdi.