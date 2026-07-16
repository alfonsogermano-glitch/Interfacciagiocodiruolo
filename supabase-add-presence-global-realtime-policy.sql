-- Autorizza il canale Realtime Presence globale, ora rinominato da
-- "presence:global" a "online:all" (vedi src/app/presence/PresenceContext.tsx).
--
-- Motivo del rename: dopo aver escluso in verifica dal vivo sia un problema
-- di setAuth() mancante, sia un errore di cast su una policy preesistente
-- (characters_broadcast_select e affini, corrette in
-- supabase-fix-campaign-broadcast-policies-uuid-cast.sql), sia una cache
-- lato Realtime (CHANNEL_ERROR persistente anche dopo diversi minuti di
-- retry), resta l'ipotesi che il prefisso "presence:" nel NOME del topic
-- collidesse con "presence" come nome della extension dichiarata nello
-- stesso canale - possibile gestione speciale/riservata lato servizio
-- Realtime non documentata. "online:all" non condivide questa ambiguita'.
--
-- Le vecchie policy per presence:global vengono rimosse (topic non piu'
-- usato dal client) e ricreate identiche per online:all.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).
-- Idempotente: drop policy if exists prima di ricrearla.

drop policy if exists "authenticated can listen to presence:global" on "realtime"."messages";
drop policy if exists "authenticated can track presence:global" on "realtime"."messages";

drop policy if exists "authenticated can listen to online:all" on "realtime"."messages";
create policy "authenticated can listen to online:all"
on "realtime"."messages"
for select
to authenticated
using (
  realtime.messages.extension = 'presence'
  and (select realtime.topic()) = 'online:all'
);

drop policy if exists "authenticated can track online:all" on "realtime"."messages";
create policy "authenticated can track online:all"
on "realtime"."messages"
for insert
to authenticated
with check (
  realtime.messages.extension = 'presence'
  and (select realtime.topic()) = 'online:all'
);
