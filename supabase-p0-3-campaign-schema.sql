-- P0.3: schema additivo per rendere PostgreSQL la fonte canonica delle campagne.
-- Nessuna riga esistente viene eliminata.

alter table public.campaigns add column if not exists invite_code text;
alter table public.campaigns add column if not exists last_opened_at timestamptz;
alter table public.campaigns add column if not exists logo_url text;
alter table public.campaigns add column if not exists cover_image_url text;
alter table public.campaigns add column if not exists cover_crop jsonb;
alter table public.campaigns add column if not exists cover_rotation_degrees integer;
alter table public.campaigns add column if not exists tab_order jsonb;
alter table public.campaigns add column if not exists tab_order_campaign_notes jsonb;
alter table public.campaigns add column if not exists tab_order_gm_notes jsonb;
alter table public.campaigns add column if not exists deleted_at timestamptz;

create unique index if not exists idx_campaigns_current_invite_code
  on public.campaigns(invite_code)
  where invite_code is not null;

create index if not exists idx_campaigns_owner_active
  on public.campaigns(owner_profile_id, deleted_at);

create table if not exists public.campaign_invite_codes (
  code text primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_invite_codes_campaign
  on public.campaign_invite_codes(campaign_id);

alter table public.campaign_invite_codes enable row level security;
revoke all on table public.campaign_invite_codes from anon, authenticated;
