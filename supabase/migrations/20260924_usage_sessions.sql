-- Temps passé sur le CRM (heartbeat onglet visible)
-- Safe to re-run

create table if not exists public.usage_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  user_name text,
  day date not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_module text,
  modules jsonb not null default '[]'::jsonb
);

create index if not exists usage_sessions_org_day_idx
  on public.usage_sessions (organization_id, day desc);

create index if not exists usage_sessions_user_seen_idx
  on public.usage_sessions (organization_id, user_id, last_seen_at desc);

alter table public.usage_sessions enable row level security;

drop policy if exists usage_sessions_select_admin on public.usage_sessions;
create policy usage_sessions_select_admin on public.usage_sessions
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.organization_id = usage_sessions.organization_id
        and p.role = 'Admin VIP'
    )
  );

drop policy if exists usage_sessions_insert_none on public.usage_sessions;
create policy usage_sessions_insert_none on public.usage_sessions
  for insert to authenticated
  with check (false);

drop policy if exists usage_sessions_update_none on public.usage_sessions;
create policy usage_sessions_update_none on public.usage_sessions
  for update to authenticated
  using (false);

grant all on table public.usage_sessions to service_role;
grant select on table public.usage_sessions to authenticated;
