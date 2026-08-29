# Contextual Dice Modifiers Design

**Date:** 2026-08-29  
**Scope:** estensione del motore Dadi di Hollowgate per rendere i Modifier contestuali alla formula, permettere Keep/Compare per-dado dopo un Modifier e mostrare il risultato Keep come `N (totale)`.

## 1. Obiettivo

Il sistema deve mantenere una sintassi naturale per i giochi di ruolo senza aggiungere radio button o checkbox `Totale / Singolo dado` ai Modifier.

La stessa notazione deve essere interpretata in base a cio' che segue nella formula:

- `4d20 +3` -> `+3` modifica il totale;
- `4d20 +3 k>=15` -> `+3` modifica ogni risultato del gruppo prima del Keep;
- `4d20 +3 >=15` con Compare per-dado -> `+3` modifica ogni risultato prima del Compare;
- `4d20 k>=15 +3` -> il Keep filtra prima i dadi naturali e il `+3`, non essendoci una successiva condizione per-dado, modifica il totale.

Quando una formula usa Keep, il risultato principale deve mostrare contemporaneamente il numero di risultati mantenuti e il totale numerico finale, nel formato `N (totale)`.

## 2. Principio autoritativo

Il `RollResult` canonico continua a essere calcolato una sola volta dal motore Hollowgate.

Ogni dado conserva due concetti distinti:

- `face`: faccia naturale fisicamente ottenuta dal dado;
- `contribution`: valore effettivo del dado dopo eventuali modificatori per-dado e altri effetti numerici.

L'animazione 3D continua a usare esclusivamente `face`. I Modifier non possono cambiare quale faccia e' stata tirata.

## 3. Determinazione automatica dello scope del Modifier

Non viene aggiunto alcun nuovo controllo UI al Modifier e non cambia la struttura persistita di `DiceFormulaItem`.

Per ogni Modifier, mentre esiste un gruppo Dice attivo, il motore guarda gli elementi successivi **fino al prossimo elemento `Dice` oppure alla fine della formula**.

Il Modifier e' **per-dado** se, prima di quel confine, esiste almeno una futura operazione che richiede i valori individuali del gruppo corrente:

- `Keep`;
- `Compare` con `total: false`.

Negli altri casi il Modifier e' **sul totale**.

Non attivano da soli lo scope per-dado:

- `Drop`;
- `Exploding`;
- `Compare` con `total: true`.

Un nuovo `Dice` e' sempre un confine: i Modifier precedenti non possono essere reinterpretati in funzione di Keep/Compare appartenenti al nuovo gruppo.

### 3.1 Esempi

`4d20 +3`

- nessuna futura condizione per-dado;
- `+3` e' sul totale.

Con risultati `12,15,10,3`: totale `40 + 3 = 43`.

`4d20 +3 k>=15`

- esiste un Keep prima del prossimo Dice/fine formula;
- `+3` e' per-dado.

Con risultati naturali `12,15,3,9`:

- contribution dopo `+3`: `15,18,6,12`;
- Keep `>=15`: mantiene `15,18`;
- risultato: `2 (33)`.

`4d20 k>=15 +3`

Con risultati `16,16,12,7`:

- Keep mantiene `16,16`;
- il `+3` non ha una futura condizione per-dado;
- `+3` agisce sul totale `32`;
- risultato: `2 (35)`.

`4d20 +3 >=15`

Se il Compare e' per-dado:

- `+3` e' per-dado;
- il Compare valuta le contribution modificate.

Se il Compare e' `Totale`:

- `+3` resta sul totale;
- il Compare valuta il totale modificato.

`4d20 +3 +2 k>=15`

Entrambi i Modifier precedono una futura condizione per-dado nello stesso gruppo e vengono applicati, nell'ordine visuale, a ogni risultato attivo.

`4d20 +3 + 2d6 k>=4`

Il nuovo `2d6` chiude il look-ahead del primo gruppo. Il `+3` del `4d20` resta quindi un modificatore del totale; il Keep appartiene soltanto al gruppo `2d6`.

## 4. Ordine di esecuzione

L'ordine visuale continua a essere l'ordine di esecuzione.

### Modifier per-dado

Un Modifier per-dado:

1. prende i risultati **attivi e gia' esistenti** del gruppo corrente;
2. applica l'operazione alla loro `contribution`;
3. lascia invariata la `face`;
4. aggiorna la contribution del gruppo e il totale accumulato della differenza prodotta.

Questo vale per:

- Add;
- Subtract;
- Multiply;
- Divide;
- Exponent.

La divisione per zero resta sempre invalida.

Un Modifier non si applica retroattivamente a dadi generati successivamente da un Exploding. Se la formula vuole modificare anche quei risultati, deve contenere un Modifier dopo la loro generazione nell'ordine della formula.

### Modifier sul totale

Un Modifier sul totale mantiene il comportamento attuale:

- modifica il totale numerico accumulato;
- non cambia le contribution individuali dei dadi.

## 5. Keep e conteggio del risultato

Keep continua a usare la semantica a soglia gia' approvata:

- `Highest N` -> mantiene contribution `>= N`;
- `Lowest N` -> mantiene contribution `<= N`;
- `Equal N` -> mantiene contribution `= N`.

Il confronto avviene sulla `contribution` esistente nel momento in cui viene eseguito il Keep, quindi include eventuali Modifier per-dado precedenti.

Ogni risultato che supera un Keep viene marcato nel `RollResult` come risultato passato attraverso una soglia Keep. Se Keep successivi lo escludono oppure un Drop successivo lo rende inattivo, non deve piu' contribuire al conteggio finale.

Il conteggio principale e' quindi:

**numero di risultati finali attivi che hanno superato almeno un Keep**.

I dadi generati da Exploding dopo un Keep non vengono conteggiati come successi Keep finche' non attraversano essi stessi un Keep successivo.

### 5.1 Formato del risultato

Se la formula non contiene Keep:

- viene mostrato il totale normale, per esempio `43`.

Se la formula contiene almeno un Keep:

- viene mostrato `keepCount (total)`.

Esempi:

- due contribution `16,16` con Keep `>=15` -> `2 (32)`;
- stessi dadi seguiti da `+3` totale -> `2 (35)`;
- nessun dado mantenuto e nessun altro termine -> `0 (0)`;
- nessun dado mantenuto seguito da `+3` totale -> `0 (3)`.

Con piu' gruppi Dice che contengono Keep, `keepCount` e' la somma dei risultati finali attivi marcati come passati da Keep nei diversi gruppi. Il valore tra parentesi resta sempre il totale numerico finale dell'intera formula.

## 6. Compare

Compare per-dado usa sempre le `contribution` attive nel punto della formula in cui viene eseguito.

Questo significa che in:

`4d20 +3 >=15`

il Compare vede i valori dopo il `+3` per-dado.

Compare Totale continua invece a confrontare il totale numerico accumulato e non forza i Modifier precedenti a diventare per-dado.

Il Compare non modifica il totale e non modifica il `keepCount`.

## 7. Drop ed Exploding

### Drop

Drop mantiene la semantica count-based esistente (`dhN`, `dlN`). Non determina lo scope dei Modifier.

Se viene eseguito dopo Keep e rende inattivo un risultato precedentemente mantenuto, quel risultato viene rimosso anche dal `keepCount` finale.

### Exploding

La decisione di esplodere continua a usare la **faccia naturale** (`face`) e mai la contribution modificata.

Un `17` naturale su d20 con `+3` per-dado puo' avere contribution `20`, ma **non** diventa un'esplosione artificiale.

Analogamente, un `20` naturale continua a esplodere anche se una contribution precedente o successiva viene modificata.

## 8. Validazione e scope del gruppo

La regola precedente secondo cui ogni Modifier chiudeva il gruppo Dice viene rimossa.

Un gruppo resta disponibile per Keep/Drop/Exploding/Compare-per-dado fino a quando:

- compare un nuovo `Dice`, che apre un nuovo gruppo;
- termina la formula.

Questo rende valida una formula come:

`4d20 +3 k>=15`

che prima veniva rifiutata dalla validazione.

Restano invalide le operazioni di gruppo quando non esiste ancora alcun Dice attivo.

## 9. Modello canonico del RollResult

La struttura persistita delle formule non cambia e non serve alcuna migrazione Supabase.

Il `RollResult` puo' essere esteso con metadati canonici necessari alla presentazione e al Realtime:

```ts
interface RollDie {
  // campi esistenti...
  keepMatched?: boolean;
}

interface RollArithmeticStep {
  // campi esistenti...
  scope: 'dice' | 'total';
  groupItemId?: string;
}
```

`keepMatched` indica che il risultato ha superato almeno un Keep ed e' usato insieme ad `active` per derivare il conteggio finale.

`scope` rende esplicito nel risultato canonico come il motore ha interpretato il Modifier, senza aggiungere questa scelta alla formula salvata.

I validator Realtime devono accettare e validare questi campi, mantenendo il RollResult ricevuto come unica fonte di verita'.

## 10. UI e storico

La riga Modifier non riceve radio button o checkbox aggiuntivi.

La UI del builder resta quindi semplice:

- tipo di operazione;
- valore.

La formula compatta non cambia sintassi per i Modifier: `+3`, `-2`, `*2`, `/2`, `^2`.

Nello storico:

- la faccia naturale continua a essere mostrata normalmente;
- quando `contribution !== face`, il valore effettivo resta mostrato tra parentesi accanto al dado, come gia' previsto dalla card;
- il campo principale oggi etichettato `Totale` mostra `N (totale)` quando il tiro contiene Keep;
- senza Keep mostra il totale semplice.

Non viene introdotto un secondo risultato separato: `N (totale)` e' la rappresentazione compatta del medesimo RollResult.

## 11. Compatibilita' con formule salvate

Non cambia il JSON persistito dei Modifier, quindi le formule esistenti non richiedono migrazioni.

Le formule esistenti senza Keep/Compare-per-dado dopo un Modifier conservano il comportamento precedente. In particolare:

`4d20 +3`

continua a significare somma dei quattro dadi piu' tre.

Le formule che contengono un Modifier prima di Keep/Compare-per-dado acquisiscono invece la nuova semantica contestuale. Questo e' un cambiamento intenzionale.

## 12. Test obbligatori

Il verificatore del motore deve coprire almeno:

1. `4d20 +3` con `12,15,10,3` -> totale `43`, nessun keepCount;
2. `4d20 +3 k>=15` con `12,15,3,9` -> contribution `15,18,6,12`, attivi `15,18`, risultato `2 (33)`;
3. `4d20 k>=15 +3` con `16,16,12,7` -> attivi `16,16`, risultato `2 (35)`;
4. `4d20 +3 >=15` Compare per-dado -> Compare sui valori modificati;
5. `4d20 +3 T>=40` -> `+3` sul totale e Compare Totale;
6. piu' Modifier prima di Keep -> applicazione sequenziale per-dado;
7. nuovo Dice come confine dello scope;
8. Modifier per-dado non modifica `face`;
9. Exploding continua a dipendere dalla faccia naturale;
10. Drop successivo a Keep rimuove il dado dal conteggio finale;
11. Keep con zero successi -> `0 (totale)`;
12. Realtime validator accetta il nuovo RollResult;
13. history card mostra `N (totale)` solo quando e' presente Keep;
14. reroll preserva la stessa semantica contestuale ricostruendo il tiro dai `sourceItems`.

La suite completa `npm run check` deve restare verde prima del merge.
