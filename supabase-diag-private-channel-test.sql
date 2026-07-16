-- DIAGNOSTICO TEMPORANEO (aggiornamento) - da rimuovere subito dopo il
-- test, indipendentemente dall'esito.
--
-- Ipotesi da testare: il probe interno di autorizzazione di Supabase
-- Realtime per phx_join su canali private:true potrebbe testare
-- l'inserimento/lettura usando un valore di extension fisso (es. sempre
-- 'broadcast'), indipendentemente da quali extension il client dichiara
-- nel config del canale. Le policy campaign:* che funzionano non filtrano
-- MAI per extension - controllano solo il pattern del topic. Le nostre
-- filtravano anche extension = 'presence', che potrebbe bloccare il probe
-- interno anche quando la vera policy per presence sarebbe corretta.
--
-- Fix di test: allenta le due policy diag:test1 togliendo il filtro su
-- extension, lasciando solo il controllo sul topic - stesso pattern esatto
-- delle policy campaign:* (characters_broadcast_select e affini).
--
-- ALTER POLICY modifica solo using/with_check, lasciando invariati nome,
-- comando e ruoli.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).

alter policy "diag temp - listen diag:test1"
on "realtime"."messages"
using (
  (select realtime.topic()) = 'diag:test1'
);

alter policy "diag temp - track diag:test1"
on "realtime"."messages"
with check (
  (select realtime.topic()) = 'diag:test1'
);

-- Dopo il test, esegui questo per rimuoverle (a prescindere dall'esito):
-- drop policy if exists "diag temp - listen diag:test1" on "realtime"."messages";
-- drop policy if exists "diag temp - track diag:test1" on "realtime"."messages";
