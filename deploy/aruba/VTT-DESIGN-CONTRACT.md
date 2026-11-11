# Decisione UI del VTT (vincolo vincolante)
La migrazione Aruba NON deve reinventare la disposizione dei comandi.
Il codice originale di riferimento è:
- `src/app/layout/LeftSidebar.tsx`: colonna SINISTRA **100 px** con logo, Panoramica, Personaggi, Campagne, campagne selezionate.
- `src/app/layout/GmSectionSidebar.tsx`: colonna DESTRA **80 px** con sezioni e strumenti GM. Non spostare qui le funzioni della colonna sinistra e viceversa.
- `src/app/layout/TopBar.tsx` e `src/app/layout/AppShell.tsx`: preservare interazioni, map tool e posizione.
- `src/app/App.tsx`: recuperare le vere sezioni e i componenti, non sostituirle con un nuovo layout inventato.
La nuova combinazione cromatica nero/oro è la sostituta della palette Noir, ma NON della struttura o delle interazioni.
Le icone **Phosphor Duotone** della navigazione sono state approvate: nel portale Aruba sono consentite per le barre principali, con **PNG = Identification Badge** e **Mostri = Ghost**. La libreria non autorizza un redesign delle posizioni. Le altre icone specialistiche e le animazioni restano da valutare solo dopo il ripristino del VTT. Il confronto isolato rimane disponibile in `/vtt/icon-study`.
Obiettivo: sito utilizzabile il più presto possibile. Non lavorare su redesign generali mentre la migrazione delle funzioni è incompleta.
