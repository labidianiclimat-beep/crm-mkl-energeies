-- Agenda commercial : historique, notifications, comptes Google.
-- À coller dans Supabase → SQL Editor → Run.
-- Compatible avec commercial_appointments / commercial_opportunities.
-- N'écrase aucune donnée. Les champs métier restent aussi dans extra jsonb.

create table if not exists public.appointment_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  appointment_id uuid not null references public.commercial_appointments (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  user_name text,
  field text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists appointment_history_appointment_idx
  on public.appointment_history (appointment_id, created_at desc);

create table if not exists public.crm_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  appointment_id uuid references public.commercial_appointments (id) on delete cascade,
  title text not null,
  body text,
  channel text not null default 'crm',
  kind text not null default 'agenda',
  read_at timestamptz,
  unique_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists crm_notifications_unique_idx
  on public.crm_notifications (organization_id, unique_key)
  where unique_key is not null;

create index if not exists crm_notifications_user_idx
  on public.crm_notifications (user_id, created_at desc);

create table if not exists public.google_calendar_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  google_email text,
  calendar_id text not null default 'primary',
  access_token_enc text,
  refresh_token_enc text,
  token_expires_at timestamptz,
  scope text,
  last_synced_at timestamptz,
  last_error text,
  status text not null default 'disconnected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.appointment_history enable row level security;
alter table public.crm_notifications enable row level security;
alter table public.google_calendar_accounts enable row level security;

drop policy if exists appointment_history_select on public.appointment_history;
create policy appointment_history_select on public.appointment_history
  for select to authenticated
  using (
    exists (
      select 1 from public.commercial_appointments a
      where a.id = appointment_history.appointment_id
        and public.can_access_appointment_row(a)
    )
  );

drop policy if exists crm_notifications_select on public.crm_notifications;
create policy crm_notifications_select on public.crm_notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists crm_notifications_update on public.crm_notifications;
create policy crm_notifications_update on public.crm_notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists google_calendar_accounts_owner on public.google_calendar_accounts;
create policy google_calendar_accounts_owner on public.google_calendar_accounts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant all on table public.appointment_history to service_role;
grant all on table public.crm_notifications to service_role;
grant all on table public.google_calendar_accounts to service_role;
grant select, insert on table public.appointment_history to authenticated;
grant select, update on table public.crm_notifications to authenticated;
grant select, insert, update, delete on table public.google_calendar_accounts to authenticated;

update public.commercial_appointments
set status = 'Planifié'
where status in ('À dispatcher', 'Affecté');
