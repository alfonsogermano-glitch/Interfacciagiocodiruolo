# Backup Hollowgate — procedura di staging

## Ambito e limiti
Lo script `scripts/backup-staging-postgres.sh` esegue **solo** un dump PostgreSQL in formato custom e un controllo SHA-256 locale. Non è un backup completo di Supabase, non prova il ripristino e **non** va usato come garanzia di protezione della produzione.

Prerequisiti: Bash, PostgreSQL client compatibile (`pg_dump`, `pg_restore`), `sha256sum`; credenziali di **staging** con privilegi di lettura sugli schemi necessari. Per evitare segreti in cronologia, usare un secret manager o un file ambiente protetto, mai committato.

Esempio da terminale **solo su ambiente staging**:

```bash
export BACKUP_SOURCE=staging
export BACKUP_DIR=/var/backups/hollowgate-staging
# DATABASE_URL deve arrivare da un gestore di segreti o da un ambiente protetto.
bash scripts/backup-staging-postgres.sh
```

Il comando si rifiuta di procedere senza `BACKUP_SOURCE=staging`, `DATABASE_URL` e percorso assoluto `BACKUP_DIR`. Crea file con permessi restrittivi, un dump, il catalogo `pg_restore --list` e checksum. **Non** esegue `pg_restore`.

## Componenti da salvare separatamente
1. **Database**: schemi `public`, `auth`, `storage`, `realtime` e altri schemi applicabili; ruoli, grants, extensions e policy RLS vanno verificati separatamente. `pg_dump --no-owner --no-acl` non preserva ownership e ACL; occorre un inventario di ruoli e grants.
2. **Storage**: il dump delle righe `storage.objects` **non include i byte dei file**. Esportare ogni bucket e verificare checksum dei file; conservare ACL/policy e impostazioni bucket.
3. **Auth**: utenti e identità sono dati sensibili; verificare schemi, provider OAuth, URL di redirect, configurazione SMTP, template email, JWT secret e strategia di rotazione. Non esportare segreti in GitHub.
4. **Edge Functions**: versioni distribuite `make-server-771c5bfd` e `dice-secret-roll`; ambiente Deno, dipendenze e segreti gestiti fuori dal repository.
5. **Realtime**: pubblicazioni, policy, trigger e configurazione WebSocket.
6. **Operatività**: DNS, TLS, webhook e integrazioni Gemini/Resend.

## Collaudo ripristino (ancora da eseguire)
- [ ] Preparare PostgreSQL di staging **vuoto**, separato dalla produzione.
- [ ] Inventariare ruoli/estensioni e predisporli in modo compatibile.
- [ ] Verificare checksum: `cd <directory-backup> && sha256sum --check SHA256SUMS`.
- [ ] Ripristinare solo sul database isolato, con comando verificato e approvato per la specifica versione PostgreSQL.
- [ ] Confrontare conteggi e integrità referenziale, poi testare login e accessi autorizzati.
- [ ] Ripristinare byte Storage, verificare hash e URL, poi testare permessi RLS.
- [ ] Testare recupero completo con API, Auth, Realtime e due Edge Functions.
- [ ] Cifrare backup offsite e applicare retention; definire RPO/RTO e periodicità.

## Sicurezza
Mai caricare `*.dump`, file ambiente, segreti, credenziali o dati utenti su GitHub. Un backup PostgreSQL può contenere dati personali e token. Il controllo checksum attesta l'integrità del file, **non** la recuperabilità del sistema. La procedura per backup della produzione richiederà una revisione dedicata e una finestra concordata.
