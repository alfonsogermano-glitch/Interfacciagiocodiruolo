# P1B.3 — KV duplicate indexes consolidation report

Date: 2026-08-22
Branch: `hardening/p1b3-kv-duplicate-indexes`
Base: `main` after P1B.2 (`9b566e1041b603b05fb2207ff72b7680626ad621`)

## Scope

P1B.3 was limited to the four duplicate `text_pattern_ops` indexes on `public.kv_store_771c5bfd(key)` reported by Supabase Performance Advisor.

No KV rows, table columns, constraints, RLS policies, functions, frontend code, Edge Functions, or unrelated indexes were changed.

## RED audit

The four duplicate indexes were:

- `kv_store_771c5bfd_key_idx`
- `kv_store_771c5bfd_key_idx1`
- `kv_store_771c5bfd_key_idx2`
- `kv_store_771c5bfd_key_idx3`

All four had the same effective definition:

```sql
CREATE INDEX <name>
ON public.kv_store_771c5bfd
USING btree (key text_pattern_ops)
```

All four were:

- non-unique;
- non-primary;
- valid and ready;
- non-partial;
- expression-free;
- 16 KB each;
- not backing any constraint;
- not referenced by dependent database objects.

Observed index scan counts before consolidation:

| Index | idx_scan |
| --- | ---: |
| `kv_store_771c5bfd_key_idx` | 0 |
| `kv_store_771c5bfd_key_idx1` | 16 |
| `kv_store_771c5bfd_key_idx2` | 4 |
| `kv_store_771c5bfd_key_idx3` | 30,407 |

Because `idx3` was structurally identical and overwhelmingly selected by the planner, it was chosen as the canonical index to retain.

The table contained 113 rows before the migration.

Representative query plans before migration selected `kv_store_771c5bfd_key_idx3` for both:

- prefix lookup: `key LIKE 'campaign:%'`;
- exact key lookup.

## Migration

Repository artifact:

`supabase-p1b3-kv-duplicate-indexes.sql`

Applied migration:

`p1b3_consolidate_kv_duplicate_indexes`

The migration drops only:

```sql
drop index if exists public.kv_store_771c5bfd_key_idx;
drop index if exists public.kv_store_771c5bfd_key_idx1;
drop index if exists public.kv_store_771c5bfd_key_idx2;
```

It intentionally retains:

```text
kv_store_771c5bfd_key_idx3
```

The table primary-key index `kv_store_771c5bfd_pkey` was not part of the duplicate set and was not modified.

## GREEN verification

After migration, indexes on `public.kv_store_771c5bfd` are:

- `kv_store_771c5bfd_pkey` — unique primary-key btree on `key`;
- `kv_store_771c5bfd_key_idx3` — btree `key text_pattern_ops`.

The three duplicate indexes selected for removal no longer exist.

KV row count after migration remains exactly 113.

Representative prefix query still produces:

```text
Index Only Scan using kv_store_771c5bfd_key_idx3
```

Representative exact-key query also continues to select `kv_store_771c5bfd_key_idx3` in the observed plan.

## Advisors

Post-migration Supabase Performance Advisor no longer reports the `duplicate_index` warning for `public.kv_store_771c5bfd`.

Only pre-existing `unused_index` INFO findings remain. They are intentionally out of scope and were not acted upon.

Post-migration Security Advisor is unchanged from the prior P1B state:

- server-only RLS INFO findings for `campaign_invite_codes`, `entity_notes`, and `kv_store_771c5bfd`;
- `Leaked Password Protection Disabled` warning.

No new security finding was introduced by P1B.3.

## Rollback

If rollback is required, recreate the three removed indexes with their original definitions:

```sql
create index kv_store_771c5bfd_key_idx
  on public.kv_store_771c5bfd using btree (key text_pattern_ops);
create index kv_store_771c5bfd_key_idx1
  on public.kv_store_771c5bfd using btree (key text_pattern_ops);
create index kv_store_771c5bfd_key_idx2
  on public.kv_store_771c5bfd using btree (key text_pattern_ops);
```

No data rollback is required because P1B.3 changes index metadata only.

## Outcome

P1B.3 consolidates four identical secondary indexes into the one actively used `text_pattern_ops` index, removes the Supabase duplicate-index warning, preserves the observed KV query plans, and leaves KV data unchanged.
