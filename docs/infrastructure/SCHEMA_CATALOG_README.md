# Hollowgate — catalogo di riferimento per lo staging

Rilevazione **sola lettura** dello schema `public` del database Supabase connesso, 10 novembre 2026.

`SCHEMA_CATALOG_METADATA_2026-11-10.json` elenca le **31 tabelle** con colonne (nome, tipo interno PostgreSQL, nullabilità), stato RLS, policy (solo nomi/comandi), riferimenti FK. Nessuna riga utente, credenziale, espressione SQL di autorizzazione o dato sensibile è stata esportata.

## Perché serve
Fornisce un inventario indipendente dei file SQL storici per verificare lo scostamento di uno schema restaurato sullo staging. La verifica statica testabile è:

```bash
python3 tests/infrastructure/verify-schema-catalog.py
python3 tests/infrastructure/test-schema-catalog.py
```

## Limiti e blocchi
**Questo NON è una migrazione SQL né un backup**. Mancano definizioni complete di indici, check, tipi composti, defaults, funzioni, trigger, estensioni, grants, ruoli, policy RLS, Auth, Storage e Realtime. La presenza di `rls: true` non dimostra policy sicure, e nomi di policy non ne descrivono la logica. Occorre ottenere e revisionare uno schema-only dump compatibile, poi verificarlo in un ambiente isolato senza dati reali. Non applicare i file SQL storici del repository senza riconciliazione.

Guida ufficiale di riferimento: https://supabase.com/docs/guides/self-hosting/restore-from-platform

**Produzione invariata, nessun restore effettuato e nessuna Edge Function avviata su OVHcloud.**
