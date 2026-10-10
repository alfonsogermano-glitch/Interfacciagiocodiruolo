# Struttura della campagna

## Gerarchia canonica

Il dominio narrativo del VTT usa una sola gerarchia:

```text
Campagna
└── Capitolo
    └── Scena
```

- **Campagna**: contenitore complessivo del gioco, dei partecipanti e degli archivi.
- **Capitolo**: blocco narrativo della campagna. È il termine unico per ogni genere e regolamento.
- **Scena**: unità concreta giocabile, preparata privatamente dal GM e collegabile a un luogo opzionale. Il luogo è riutilizzabile; la scena descrive ciò che accade.

Il termine precedente "Avventura" resta soltanto nei migratori necessari a leggere dati creati dalle versioni precedenti; non appartiene più al dominio o all'interfaccia.

## Gestione e sessione

La gestione strutturale è separata dalla sessione live:

- La **Gestione campagna**, accessibile solo al GM, crea e organizza capitoli, scene, luoghi ed entità dell'archivio.
- La **Sessione di gioco** pubblica una scena preparata e consente modifiche operative: scena attiva, token, visibilità, condizioni, valori temporanei e inserimento di entità già esistenti.
- Gli elementi improvvisati durante la sessione appartengono inizialmente alla scena; il GM può successivamente promuoverli nell'archivio della campagna.
- La sessione non crea o riorganizza la struttura dei capitoli.

Regola architetturale: **la gestione modifica il mondo della campagna; la sessione modifica lo stato corrente della scena**.

## Persistenza

Il contratto canonico usa:

- tipo `Chapter` e proprietà `chapterId` / `nextChapterIds`;
- tabella PostgreSQL `chapters` e colonne `chapter_id` / `next_chapter_ids`;
- chiavi locali e collezioni `chapters`;
- backup versione 2 con `data.chapters`.

Le scene usano il tipo `Scene`, la tabella/collezione `scenes` e i campi `chapterId`, `environmentId`, `sortOrder` e `nextSceneIds`. La tabella applica una relazione composita che impedisce di collegare la scena a un capitolo di un'altra campagna; luogo e scene successive devono appartenere alla stessa campagna, e le diramazioni restano nello stesso capitolo. Le policy RLS consentono CRUD soltanto al proprietario GM.

L'editor strutturale delle scene vive nel dettaglio del capitolo. Stato, ordine, descrizione, note GM, immagine, luogo e diramazioni sono preparazione persistente; `active-encounter` resta invece uno snapshot runtime separato e non è una Scena persistente.

La migration `supabase/migrations/20261010120000_chapters_domain_rename.sql` rinomina i dati PostgreSQL in transazione mantenendo UUID, relazioni e comportamento `ON DELETE SET NULL`. I migratori client convertono una volta storage locale, Tauri e backup versione 1.

La migration `supabase/migrations/20261010130000_campaign_scenes.sql` crea il dominio Scene persistente, i vincoli di integrità, il cleanup dei collegamenti e le policy private del GM.
