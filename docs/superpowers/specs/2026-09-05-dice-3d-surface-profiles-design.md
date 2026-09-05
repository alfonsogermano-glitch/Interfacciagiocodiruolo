# Profili materiali delle skin 3D

## Obiettivo

Separare la resa della texture fotografica dal carattere fisico ed animato della skin, così ogni nuova skin sceglie un profilo materiale dichiarativo senza duplicare la pipeline dei dadi.

## Profili

- `photo-lit`: mantiene il materiale illuminato di `dice-box-threejs`; è il profilo di Fuoco.
- `photo-unlit`: sostituisce soltanto i materiali delle facce con `MeshBasicMaterial`, preservando mappa, numeri, trasparenza e impostazioni di profondità; è il profilo di Ghiaccio.
- `physical`: riserva una pipeline illuminata per Metallo e le future skin che richiedono riflessi fisici.

I bordi rimangono sempre il materiale all'indice zero creato dal renderer e continuano a usare il colore dado scelto. Gli effetti e le particelle restano componenti separate dal materiale delle facce.

## Vincoli

- La fotografia Ghiaccio incorporata non cambia.
- Fuoco non cambia materiale né animazione.
- Il colore dei numeri resta parte della texture composita generata da `dice-box-threejs`.
- Zoom, snapshot, persistenza e lifecycle post-settle restano invariati.
- I dadi Custom non usano i profili delle skin standard.
- Un solo commit atomico su `main`, senza PR.

## Verifica

Un test comportamentale deve costruire veri materiali Three.js e dimostrare che Ghiaccio sostituisce solo le facce con materiali unlit, mentre Fuoco mantiene i materiali Phong. I controlli esistenti di Ghiaccio, Fuoco, colori, zoom e lifecycle devono restare verdi.
