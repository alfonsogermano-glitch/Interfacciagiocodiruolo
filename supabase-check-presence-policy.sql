-- Solo lettura: quadro completo dello schema realtime - tutte le tabelle e
-- tutte le funzioni/routine. Obiettivo: capire se esiste un meccanismo di
-- autorizzazione diverso/aggiuntivo rispetto alla semplice RLS su
-- realtime.messages (es. una tabella di registro/allowlist dei canali, o
-- una funzione custom richiamata altrove per validare i topic), che
-- spiegherebbe perche' campaign:* funziona sempre e qualunque altro topic
-- nuovo fallisce sempre, a prescindere da come scriviamo le policy RLS.

select table_name
from information_schema.tables
where table_schema = 'realtime'
order by table_name;

select routine_name, routine_type
from information_schema.routines
where routine_schema = 'realtime'
order by routine_name;
