-- Pulizia: rimuove le policy diagnostiche temporanee create durante il
-- debug del canale Presence privato (vedi supabase-diag-private-channel-test.sql).
-- Il canale finale e' "online:all", gia' autorizzato da
-- supabase-add-presence-global-realtime-policy.sql - queste policy su
-- "diag:test1" non servono piu'.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).
-- Idempotente: drop policy if exists.

drop policy if exists "diag temp - listen diag:test1" on "realtime"."messages";
drop policy if exists "diag temp - track diag:test1" on "realtime"."messages";
