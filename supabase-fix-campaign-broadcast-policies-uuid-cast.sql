-- Fix: le tre policy su realtime.messages che autorizzano i topic
-- campaign:{uuid} (characters_broadcast_select, campaign_presence_member_write,
-- campaign_presence_owner_write) fanno split_part(realtime.topic(), ':', 2)::uuid
-- senza verificare prima che il topic segua davvero il pattern campaign:{uuid}.
-- Per un topic come presence:global, questo tenta 'global'::uuid, che solleva
-- un errore di cast (non restituisce false). Con piu' policy PERMISSIVE in OR,
-- un errore di valutazione in una qualsiasi fa fallire l'intera verifica RLS,
-- quindi anche una policy nuova e corretta per un topic diverso (es. la nostra
-- "authenticated can listen to presence:global") viene bloccata di riflesso.
--
-- Fix: aggiungere un guard a doppio livello prima del cast - prefisso
-- "campaign:" e formato UUID sul resto della stringa - cosi' il cast scatta
-- solo quando e' sicuro farlo. La logica di autorizzazione esistente per i
-- topic campaign:{uuid} resta identica, cambia solo cosa succede per i
-- topic che non rispettano quel pattern (ora: nessun match, non piu' errore).
--
-- ALTER POLICY modifica solo l'espressione using/with_check indicata,
-- lasciando invariati nome, comando e ruoli della policy esistente.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).

alter policy "characters_broadcast_select"
on "realtime"."messages"
using (
  realtime.topic() like 'campaign:%'
  and split_part(realtime.topic(), ':', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  and (
    (EXISTS ( SELECT 1 FROM campaigns WHERE ((campaigns.id = (split_part(realtime.topic(), ':'::text, 2))::uuid) AND (campaigns.owner_profile_id = (auth.uid())::text))))
    OR
    (EXISTS ( SELECT 1 FROM campaign_members WHERE ((campaign_members.campaign_id = (split_part(realtime.topic(), ':'::text, 2))::uuid) AND (campaign_members.profile_id = (auth.uid())::text))))
  )
);

alter policy "campaign_presence_member_write"
on "realtime"."messages"
with check (
  realtime.topic() like 'campaign:%'
  and split_part(realtime.topic(), ':', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  and (EXISTS ( SELECT 1 FROM campaign_members WHERE ((campaign_members.campaign_id = (split_part(realtime.topic(), ':'::text, 2))::uuid) AND (campaign_members.profile_id = (auth.uid())::text))))
);

alter policy "campaign_presence_owner_write"
on "realtime"."messages"
with check (
  realtime.topic() like 'campaign:%'
  and split_part(realtime.topic(), ':', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  and (EXISTS ( SELECT 1 FROM campaigns WHERE ((campaigns.id = (split_part(realtime.topic(), ':'::text, 2))::uuid) AND (campaigns.owner_profile_id = (auth.uid())::text))))
);
