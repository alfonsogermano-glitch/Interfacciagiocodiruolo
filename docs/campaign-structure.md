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
- **Scena**: unità concreta giocabile, pubblicabile nella sessione e collegabile a luoghi, personaggi, creature, indizi e oggetti.

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

La migration `supabase/migrations/20261010120000_chapters_domain_rename.sql` rinomina i dati PostgreSQL in transazione mantenendo UUID, relazioni e comportamento `ON DELETE SET NULL`. I migratori client convertono una volta storage locale, Tauri e backup versione 1.
