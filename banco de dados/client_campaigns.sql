create table if not exists public.client_campaigns (
  id bigserial primary key,
  segment text not null default 'all',
  search_term text null,
  with_orders boolean not null default false,
  message_template text not null,
  target_count integer not null default 0,
  valid_count integer not null default 0,
  skipped_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  status text not null default 'draft',
  created_by text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_campaigns_created_at on public.client_campaigns (created_at desc);
create index if not exists idx_client_campaigns_status on public.client_campaigns (status);

create table if not exists public.client_campaign_recipients (
  id bigserial primary key,
  campaign_id bigint null references public.client_campaigns(id) on delete set null,
  client_id bigint null,
  client_name text null,
  destination_phone text null,
  rendered_message text null,
  local_status text not null default 'unknown',
  error_detail text null,
  provider_response jsonb not null default '{}'::jsonb,
  message_id text null,
  zaap_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_campaign_recipients_campaign_id on public.client_campaign_recipients (campaign_id);
create index if not exists idx_client_campaign_recipients_client_id on public.client_campaign_recipients (client_id);
create index if not exists idx_client_campaign_recipients_status on public.client_campaign_recipients (local_status);
