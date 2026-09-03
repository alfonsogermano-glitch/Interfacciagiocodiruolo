# HOLLOWGATE — Personalizzazione dadi standard e skin

Data: 2026-09-03
Stato: pronto per revisione utente

## 1. Obiettivo

Aggiungere alla barra dei tiri veloci, subito dopo il pulsante del Dado Custom, un comando **Personalizza** che permetta a ogni utente di definire l'aspetto dei dadi standard della campagna corrente. La personalizzazione deve essere indipendente per d4, d6, d8, d10, d12, d20 e d100, con comando **Applica a tutti**.

La stessa infrastruttura di skin deve essere disponibile anche nei Dadi Custom, direttamente nell'attuale schermata di modifica del Dado Custom.

La personalizzazione comprende:

- colore del corpo del dado;
- colore dei numeri/simboli;
- skin;
- interruttore **Effetti animati** separato dalla skin;
- rappresentazione coerente in anteprima, barra dei tiri veloci, chat tiri e renderer 3D.

Le impostazioni dei dadi standard sono salvate **per utente e per campagna**.

## 2. Decisioni approvate

- Personalizzazione standard: per utente + campagna.
- Granularità: un profilo distinto per d4, d6, d8, d10, d12, d20 e d100.
- Comando **Applica a tutti** per copiare lo stile del dado selezionato sugli altri dadi standard.
- Lo stile è visibile in anteprima, barra tiri veloci, chat tiri e dado 3D.
- Skin e colori sono combinabili: la skin non impone una palette fissa.
- Ogni dado ha un toggle separato **Effetti animati**.
- I Dadi Custom ricevono skin + toggle animazioni dentro `CustomDieConfigurator`.
- Catalogo iniziale: `none`, `fire`, `ice`, `lightning`, `poison`, `stone`, `metal`, `obsidian`, `arcane`.

## 3. Stato attuale rilevante

Il renderer standard inizializza oggi `dice-box-threejs` con `theme_colorset: 'white'` e `theme_material: 'plastic'`. I Dadi Custom hanno già `bodyColor` e `symbolColor`, salvati in `dice_custom_dice`, e il renderer Custom intercetta `DiceFactory.create()` / `createTextMaterial()` per sostituire colori, texture e facce.

`RollResult` viene trasmesso via realtime agli altri partecipanti e costituisce già l'oggetto canonico usato sia dalla chat sia dall'animazione. Questa caratteristica va mantenuta: lo stile visivo del tiro deve viaggiare con il risultato, invece di essere ricostruito leggendo le preferenze locali del destinatario.

## 4. Modello di dominio

Introdurre in `diceTypes.ts`:

```ts
export type DiceSkinId =
  | 'none'
  | 'fire'
  | 'ice'
  | 'lightning'
  | 'poison'
  | 'stone'
  | 'metal'
  | 'obsidian'
  | 'arcane';

export interface DiceAppearance {
  bodyColor: string;
  symbolColor: string;
  skinId: DiceSkinId;
  effectsEnabled: boolean;
}

export interface StandardDieAppearance extends DiceAppearance {
  sides: 4 | 6 | 8 | 10 | 12 | 20 | 100;
}
```

`SavedCustomDie` e `CustomDieRollSnapshot` vengono estesi con:

```ts
skinId: DiceSkinId;
effectsEnabled: boolean;
```

Gli oggetti esistenti ricevono `skinId='none'` ed `effectsEnabled=false`, quindi il comportamento grafico attuale non cambia dopo la migrazione.

### Snapshot nei risultati

`RollDiceGroup` riceve un campo opzionale:

```ts
appearance?: DiceAppearance;
```

Per un gruppo standard contiene lo stile del giocatore al momento del tiro. Per un gruppo Custom l'aspetto continua a essere disponibile nel `customDieSnapshot`, che viene esteso con skin ed effetti.

Conseguenze desiderate:

- la chat storica continua a mostrare lo stile con cui il tiro è stato effettuato;
- gli altri giocatori vedono lo stile del tiratore, non il proprio;
- un reroll crea un nuovo risultato e usa la personalizzazione corrente dell'utente, mentre il vecchio risultato rimane immutato;
- nessuna preferenza estetica modifica RNG, totale o logica dei modificatori.

## 5. Persistenza Supabase

### 5.1 Nuova tabella dadi standard

Nuova migrazione con tabella `public.dice_standard_styles`:

- `campaign_id uuid not null`
- `owner_profile_id uuid not null`
- `sides integer not null check (sides in (4,6,8,10,12,20,100))`
- `body_color text not null`
- `symbol_color text not null`
- `skin_id text not null default 'none'`
- `effects_enabled boolean not null default false`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- primary key `(campaign_id, owner_profile_id, sides)`
- check `skin_id in ('none','fire','ice','lightning','poison','stone','metal','obsidian','arcane')`.

RLS: stesso principio già usato dalla libreria dadi. L'utente può leggere/scrivere solo righe con `owner_profile_id=auth.uid()` e solo per campagne delle quali è proprietario o membro.

Non è necessario pre-popolare sette righe per ogni campagna. Il client usa valori di default quando una riga manca e fa `upsert` solo quando l'utente salva una modifica.

### 5.2 Estensione Dadi Custom

Aggiungere a `public.dice_custom_dice`:

- `skin_id text not null default 'none'` con lo stesso allowlist check;
- `effects_enabled boolean not null default false`.

Il validator delle facce continua a validare esclusivamente geometria/facce; la validità della skin è garantita dal vincolo di tabella.

### 5.3 Service layer

Nuovo `diceStandardStyleService.ts`:

- `loadStandardDiceStyles(campaignId, ownerProfileId)`;
- `saveStandardDieStyle(...)`;
- `saveAllStandardDieStyles(...)` in un'unica operazione `upsert` per il comando Applica a tutti/Salva.

`diceCustomDiceService.ts` viene esteso per mappare, creare, aggiornare e duplicare `skinId` ed `effectsEnabled`.

## 6. Catalogo skin unico

Creare `diceSkins.ts` come fonte canonica condivisa da UI e renderer.

Ogni definizione contiene almeno:

```ts
interface DiceSkinDefinition {
  id: DiceSkinId;
  label: string;
  previewClassName?: string;
  material: 'plastic' | 'metal' | 'stone' | 'glasslike';
  textureKind: DiceSkinId;
  effectKind: DiceSkinId | null;
}
```

Il catalogo non contiene URL esterni. Texture e pattern vengono generati localmente in modo deterministico oppure inclusi come asset del progetto. Questo evita dipendenze da CDN, CORS e asset di terzi.

### 6.1 Aspetto statico iniziale

- `none`: materiale pulito, nessuna texture.
- `fire`: venature/cricche tipo lava.
- `ice`: texture cristallina/frost.
- `lightning`: filamenti elettrici.
- `poison`: pattern organico/liquido.
- `stone`: grana minerale.
- `metal`: micrograffi e riflesso metallico.
- `obsidian`: superficie scura vetrosa con venature.
- `arcane`: rune/segni energetici astratti.

La texture deve essere progettata come pattern neutro/tintabile: `bodyColor` rimane il colore base scelto dall'utente e `symbolColor` rimane indipendente.

Le immagini caricate sulle facce dei Dadi Custom **non vengono mai tintate** dalla skin o da `symbolColor`; la skin agisce sul materiale del corpo sotto/intorno alla faccia.

## 7. UI — Personalizza dadi standard

### 7.1 Accesso

In `DiceQuickRollFloating`, subito dopo `CustomDiceQuestionIcon`, aggiungere un pulsante quadrato con icona Lucide `Palette` e tooltip **Personalizza**.

Il click apre `DiceAppearanceCustomizer` nello stile della palette Hollowgate.

### 7.2 Schermata

Il pannello contiene:

- selettore dei sette tipi di dado;
- anteprima grande del dado selezionato;
- `Colore dado`;
- `Colore numeri`;
- griglia delle nove skin con anteprima e nome;
- switch `Effetti animati`;
- `Applica a tutti`;
- `Annulla` e `Salva`.

Le modifiche restano in un draft locale finché non si preme Salva. `Annulla` non scrive nulla.

`Applica a tutti` copia nel draft degli altri sei dadi i quattro campi del dado selezionato. L'utente può poi modificare ulteriormente singoli dadi prima di salvare.

### 7.3 Default

Quando non esiste una riga salvata, il profilo deve riprodurre il più fedelmente possibile l'aspetto standard attuale `theme_colorset='white'`, skin `none`, effetti `false`.

Il valore esatto dei colori di default verrà centralizzato in `DEFAULT_DICE_APPEARANCE`; non deve essere duplicato nei componenti.

## 8. UI — Dadi Custom

`CustomDieConfigurator` mantiene l'interfaccia attuale per nome, geometria, corpo, simboli e facce.

Nell'aside di sinistra vengono aggiunti:

- sezione `Skin` con lo stesso catalogo visuale dei dadi standard;
- switch `Effetti animati`.

Il preview delle facce usa il nuovo componente condiviso di superficie/skin, ma conserva le regole attuali:

- icone e testo seguono `symbolColor`;
- immagini mantengono i propri colori originali;
- la selezione della faccia-icona della libreria non cambia.

## 9. Stato React e caricamento

Creare un `DiceAppearanceContext` separato da `DiceSessionContext`.

Responsabilità:

- caricare i sette stili standard quando cambiano utente o campagna;
- fornire sempre un profilo completo tramite default per le righe mancanti;
- esporre `saveStyles()`;
- esporre lookup `getStandardAppearance(sides)`;
- notificare immediatamente quick roll e altri consumer dopo il salvataggio.

La persistenza estetica non va inserita nel motore dei dadi né nel contesto realtime. Il motore deve restare indipendente dalla presentazione.

## 10. Snapshot del tiro e realtime

`DiceSessionContext.buildResult()` continua a chiamare `rollDiceFormula()` per ottenere il risultato canonico. Subito dopo, un helper puro `attachDiceAppearanceSnapshots(result, standardStyles)` aggiunge `appearance` solo ai gruppi standard.

I Custom hanno già un `customDieSnapshot`; aggiungendo skin/effetti al modello, lo snapshot li porta automaticamente con il risultato.

`isRollResultPayload()` viene esteso per validare il nuovo `appearance` opzionale e i due nuovi campi dei Custom. Gli ID skin accettati sono solo quelli del catalogo.

Nessun destinatario deve interrogare `dice_standard_styles` per rendere un tiro ricevuto via realtime.

## 11. Barra tiri veloci e chat

### 11.1 Dadi standard

`DiceTypeIcon` rimane responsabile della geometria/numero del dado. Viene avvolto da un componente condiviso `StyledStandardDieIcon` che applica:

- `bodyColor`;
- `symbolColor`;
- pattern statico della skin.

Gli effetti animati non vengono riprodotti nelle piccole icone: il toggle riguarda l'esperienza 3D, mentre quick roll/chat mostrano una rappresentazione statica della skin per non creare rumore visivo e consumo inutile.

### 11.2 Dadi Custom

`CustomDieLibraryIcon` viene esteso per visualizzare anche la skin del corpo, continuando a non colorare le immagini caricate.

### 11.3 Chat

La chat usa gli snapshot contenuti nel `RollResult`. In questo modo una modifica futura delle preferenze non ridisegna retroattivamente i tiri vecchi.

## 12. Renderer 3D — architettura unificata

L'attuale adapter `dice3dCustomMaterials.ts` è già il punto che controlla colori, texture, materiali e facce Custom. La nuova implementazione lo evolve verso un adapter generale per l'aspetto dei dadi, senza duplicare due pipeline concorrenti.

Direzione prevista:

- descriptor 3D per ogni dado fisico, standard o Custom;
- `appearance` sempre disponibile nel descriptor;
- `customDie/role/labels` presenti solo per Custom;
- stessa intercettazione temporanea di `DiceFactory.create()`;
- preservare integralmente il fix speciale d4 (`swapDiceFace_D4`) e il rendering diretto del testo d4;
- ripristinare sempre lo stato del factory nel `finally`.

Per un d100 logico, lo stesso `StandardDieAppearance` viene applicato sia al dado delle decine sia a quello delle unità.

## 13. Texture 3D statiche

Creare un generatore/cache di texture per `(skinId, bodyColor)`.

Principi:

- Canvas locale, dimensione sufficiente per non sfocare in 3D;
- pattern tileable/deterministico;
- nessuna rasterizzazione dei numeri standard: i numeri continuano a essere disegnati dal renderer upstream con `label_color_rand`;
- per Custom, le facce continuano a usare la pipeline attuale e la texture skin riguarda solo il materiale di base;
- cache per evitare di rigenerare la stessa texture a ogni dado del lancio;
- cleanup della cache solo quando necessario, non per ogni frame.

## 14. Effetti animati 3D

Gli effetti sono un **progressive enhancement** sopra la skin statica: un errore negli effetti non deve mai impedire il tiro, la texture statica o la chat.

Creare `dice3dSkinEffects.ts` con un controller per il singolo lancio.

Il controller riceve i mesh creati dal factory e, quando `effectsEnabled=true` e `skinId!='none'`, registra un effetto leggero associato alla skin.

Effetti iniziali desiderati:

- Fire: pulsazione emissiva + scintille/faville leggere.
- Ice: shimmer freddo + piccoli cristalli/nebbia molto leggera.
- Lightning: flash emissivi intermittenti + brevi scariche visive.
- Poison: pulsazione organica + bolle/mote verdi.
- Stone: polvere/mote molto discreti.
- Metal: sweep speculare, senza particelle pesanti.
- Obsidian: bagliore nelle venature + mote scure/violacee.
- Arcane: scintille/rune orbitanti leggere.

Vincoli prestazionali:

- controller attivo soltanto durante un lancio 3D;
- un solo `requestAnimationFrame` condiviso per tutti i dadi del lancio;
- numero di particelle fortemente limitato per dado e limite globale per scena;
- effetti disattivati se l'utente ha disabilitato le animazioni 3D globali;
- rispetto di `prefers-reduced-motion`: skin statica sì, effetti animati no;
- cleanup completo di RAF, listener e oggetti aggiunti alla scena al termine/abort del tiro.

La prima implementazione deve usare le capacità già esposte dai mesh/materiali runtime di `dice-box-threejs`. Se un particolare effetto non può essere legato in modo affidabile al mesh senza introdurre una nuova dipendenza 3D incompatibile, quel singolo effetto degrada a variazione emissiva/materiale animata invece di introdurre un secondo renderer o alterare la fisica.

## 15. Sicurezza e affidabilità

- Skin ID validati client + DB + realtime allowlist.
- Nessuna skin può contenere JavaScript, URL utente o markup arbitrario.
- Nessuna texture remota richiesta dal browser.
- La personalizzazione non entra nel calcolo del risultato.
- Un errore di texture/effetto 3D deve cadere sul materiale base e non perdere il tiro.
- Le immagini Custom rimangono non tintate.
- Il tiro segreto include gli stessi snapshot estetici del tiro pubblico.

## 16. Compatibilità e migrazione

- Dati Custom esistenti: `skin_id='none'`, `effects_enabled=false`.
- Nessuna riga standard esistente richiesta: default lato client.
- Formule salvate non cambiano formato.
- Il formato di `RollResult` rimane retrocompatibile perché `appearance` è opzionale e i nuovi campi Custom hanno default/fallback.
- Payload realtime vecchi senza appearance continuano a essere accettati e renderizzati col default.

## 17. Test e verifiche

### Persistenza

- verifica SQL della nuova tabella, PK, check skin, RLS e colonne Custom;
- mapping service standard e Custom;
- `Applica a tutti` produce sette stili distinti con gli stessi valori.

### Dominio

- default completo per tutti i sette tipi;
- allowlist skin;
- snapshot standard aggiunto ai gruppi corretti;
- d100 applica lo stesso appearance a decine e unità;
- reroll usa il profilo corrente e non muta il risultato precedente.

### Realtime

- `isRollResultPayload` accetta appearance valido;
- rifiuta skin sconosciuta, colori non stringa ed `effectsEnabled` non booleano;
- continua ad accettare payload precedenti senza appearance.

### UI

- pulsante Personalizza immediatamente dopo Dado Custom;
- sette dadi selezionabili;
- nove skin;
- toggle effetti;
- Applica a tutti;
- Salva/Annulla;
- quick roll e chat leggono lo stile corretto;
- Custom configurator salva e ripristina skin/effetti;
- immagini Custom non vengono tintate.

### 3D

- projection queue associa appearance a ogni dado fisico;
- standard e Custom possono coesistere nello stesso lancio;
- d4 Custom mantiene animazione, forced-result remap e testo nitido;
- skin `none` riproduce il percorso neutro;
- errore generazione skin/effect -> fallback senza cambiare risultato;
- cleanup effetti dopo roll, abort e dispose.

### Verifica progetto

Aggiornare gli script di verifica permanenti (`verify:dice-3d`, `verify:dice-realtime`, `verify:dice-ui` e test dedicati alla personalizzazione) e includerli in `npm run check`.

La CI attuale può continuare a fermarsi prima di `npm run check` sul noto `npm audit` preesistente; questo non autorizza aggiornamenti di dipendenze non necessari alla feature.

## 18. Sequenza di implementazione

1. Tipi, catalogo skin e helper puri.
2. Migrazione Supabase + servizi standard/Custom.
3. `DiceAppearanceContext`.
4. Snapshot nei RollResult + realtime validation.
5. UI Personalizza standard.
6. Skin nel CustomDieConfigurator.
7. Icone quick roll/chat.
8. Adapter 3D unificato per colori + skin statiche.
9. Controller effetti animati 3D con fallback.
10. Regression test completi e verifica Production.

La sequenza mantiene il risultato dei dadi canonico e testabile durante tutto il lavoro; gli effetti 3D arrivano soltanto dopo che persistenza, snapshot e skin statiche sono stabili.

## 19. Criteri di accettazione

La feature è completata quando:

- un utente può personalizzare separatamente i sette dadi standard nella campagna corrente;
- le impostazioni sopravvivono a reload/login e non contaminano altre campagne;
- Applica a tutti funziona senza impedire successive modifiche per singolo dado;
- tutti i nove tipi di skin sono selezionabili;
- skin e colori si combinano;
- gli effetti possono essere attivati/disattivati per dado;
- la stessa skin è disponibile nei Dadi Custom;
- quick roll e chat rappresentano staticamente lo stile scelto;
- il 3D usa colori/skin e, quando abilitati, effetti animati con fallback sicuro;
- altri giocatori vedono lo stile del tiratore grazie allo snapshot realtime;
- le immagini delle facce Custom non vengono tintate;
- nessuna personalizzazione altera RNG, valori forzati, totale o logica delle formule;
- non vengono introdotte regressioni sui fix d4 esistenti.
