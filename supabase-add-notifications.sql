-- Sistema di notifiche generico per-utente (tipo/payload variabile).
-- Prima feature realtime scoped per-utente invece che per-campagna: usa
-- Broadcast (non Presence) su canale profile:{userId}, per lo stesso
-- motivo per cui tutti i canali campaign:{id} usano Broadcast e sono
-- stabili, mentre l'unico canale Presence globale (online:all) ha un
-- fallimento aperto e mai risolto.
--
-- Nota sicurezza-RLS (bug di ieri): le policy campaign:* funzionanti su
-- realtime.messages fanno split_part(realtime.topic(), ':', 2)::uuid,
-- protetto da una guardia a due stadi perché un cast fallito su un topic
-- estraneo avvelena via OR l'intera verifica RLS per policy PERMISSIVE
-- multiple. Qui non serve alcuna guardia equivalente: recipient_profile_id
-- è TEXT (come tutte le colonne owner/profile in questo schema), quindi
-- la policy sotto non fa mai un cast a ::uuid - nessun modo di fallire il
-- confronto con un errore anziché con false. Inoltre, coerente con le
-- policy campaign:* (verificate dal vivo, funzionanti), NON si filtra su
-- realtime.messages.extension: solo le policy rotte di online:all lo
-- fanno, quindi si evita deliberatamente quel dettaglio.

create table if not exists notifications (
  id UUID primary key default uuid_generate_v4(),
  recipient_profile_id TEXT not null,
  type TEXT not null,
  data JSONB not null default '{}'::jsonb,
  read BOOLEAN not null default false,
  created_at TIMESTAMPTZ default now(),
  updated_at TIMESTAMPTZ default now()
);

create index if not exists idx_notifications_recipient_created
  on notifications (recipient_profile_id, created_at desc);

drop trigger if exists update_notifications_updated_at on notifications;
create trigger update_notifications_updated_at before update on notifications
  for each row execute function update_updated_at_column();

alter table notifications enable row level security;

-- Solo il destinatario legge le proprie notifiche. Nessuna policy
-- insert/update per authenticated: ogni scrittura (creazione, mark-as-
-- read, accept/decline invito) passa esclusivamente dall'edge function
-- via service role (BYPASSRLS) - un solo punto di scrittura per una
-- tabella con effetti collaterali cross-tabella (accept -> campaign_members).
create policy notifications_select_own
  on notifications for select
  using (recipient_profile_id = auth.uid()::text);

-- Realtime: autorizzazione del canale profile:{userId}. Solo lettura:
-- nessun client scrive mai su questo canale, solo l'edge function via
-- service role.
drop policy if exists "authenticated can listen to own profile channel" on "realtime"."messages";
create policy "authenticated can listen to own profile channel"
on "realtime"."messages"
for select
to authenticated
using (
  realtime.topic() like 'profile:%'
  and split_part(realtime.topic(), ':', 2) = (auth.uid())::text
);
