# Catalogo esteso degli oggetti PostgreSQL — migrazione OVHcloud

Rilevazione **sola lettura**, 10 novembre 2026, schema `public`, progetto Supabase connesso.

Il file `SCHEMA_OBJECT_FINGERPRINTS_2026-11-10.json` registra:
- 133 vincoli di tabella (nome, tipo e fingerprint della definizione);
- 98 indici (tabella, nome e fingerprint);
- 34 trigger non interni (tabella, nome e fingerprint);
- 34 funzioni (nome, firma, presenza di SECURITY DEFINER e fingerprint);
- 79 policy RLS (tabella, nome, comando, ruoli, tipo, fingerprint del predicato, segnale di predicato incondizionato).

Non sono stati esportati i corpi delle funzioni, i predicati RLS, le definizioni SQL complete, credenziali né dati degli utenti. I fingerprint sono MD5 **per confronto**, non per sicurezza crittografica.

## Limiti
Questo è un inventario, **non** una baseline SQL. Non è possibile ricostruire funzioni, policy o trigger dai fingerprint; occorre ancora un dump schema-only gestito in ambiente protetto e una revisione tecnica di permessi e definizioni. `SECURITY DEFINER` e le policy con predicati incondizionati richiedono audit manuale; non applicare automaticamente lo schema su alcun server.

Verifica riproducibile:
```bash
python3 tests/infrastructure/verify-schema-objects.py
python3 tests/infrastructure/test-schema-objects.py
```

Per l'esportazione completa, seguire la guida Supabase [Restore a Platform Project to Self-Hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform) ed effettuare prima un dump **schema-only** verso una destinazione privata, separando i ruoli dalla struttura. I file di backup e le chiavi devono rimanere fuori da GitHub. Lo staging deve essere isolato e il ripristino deve essere verificato con dati di prova. I byte Storage e le Edge Functions richiedono procedure separate.

**NO-GO:** nessuna migrazione applicata e nessun backend OVHcloud dichiarato funzionante.
