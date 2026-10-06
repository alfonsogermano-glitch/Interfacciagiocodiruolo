begin;
create table if not exists public.campaign_documents (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  document_key text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (campaign_id, document_key)
);
alter table public.campaign_documents enable row level security;
grant select, insert, update, delete on public.campaign_documents to authenticated;
drop policy if exists campaign_documents_owner on public.campaign_documents;
create policy campaign_documents_owner on public.campaign_documents for all to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_profile_id::text = auth.uid()::text))
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_profile_id::text = auth.uid()::text));
commit;
