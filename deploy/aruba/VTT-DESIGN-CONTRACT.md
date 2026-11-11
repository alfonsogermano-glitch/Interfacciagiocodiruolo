# Decisione UI del VTT (vincolo vincolante)
La migrazione Aruba NON deve reinventare la disposizione dei comandi.
Il codice originale di riferimento è:
- `src/app/layout/LeftSidebar.tsx`: colonna SINISTRA **100 px** con logo, Panoramica, Personaggi, Campagne, campagne selezionate.
- `src/app/layout/GmSectionSidebar.tsx`: colonna DESTRA **80 px** con sezioni e strumenti GM. Non spostare qui le funzioni della colonna sinistra e viceversa.
- `src/app/layout/TopBar.tsx` e `src/app/layout/AppShell.tsx`: preservare interazioni, map tool e posizione.
- `src/app/App.tsx`: recuperare le vere sezioni e i componenti, non sostituirle con un nuovo layout inventato.
La nuova combinazione cromatica nero/oro è la sostituta della palette Noir, ma NON della struttura o delle interazioni.
Le icone Phosphor sono SOLO una ricerca estetica. Confronto isolato in `/vtt/icon-study`. La libreria non deve essere importata nel VTT originale né sostituire le icone funzionanti prima che il sito sia di nuovo operativo.
Obiettivo: sito utilizzabile il più presto possibile. Non lavorare su redesign generali mentre la migrazione delle funzioni è incompleta.
