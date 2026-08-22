-- P1B.3 — consolidate duplicate KV key indexes
-- Keep the actively used canonical index kv_store_771c5bfd_key_idx3.
-- Drop only the three structurally identical, dependency-free duplicates.
-- No table data, constraints, policies, functions, or application code are changed.

drop index if exists public.kv_store_771c5bfd_key_idx;
drop index if exists public.kv_store_771c5bfd_key_idx1;
drop index if exists public.kv_store_771c5bfd_key_idx2;
