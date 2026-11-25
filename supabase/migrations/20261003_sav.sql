-- Dossiers SAV MKL-SAV-00001.
-- À coller dans Supabase → SQL Editor → Run.
-- N'écrase aucune donnée. N'altère pas les clients, l'entretien ni les tickets internes.

create table if not exists public.sav_counters (
  organization_id uuid primary key,
  last_value integer not null default 0
);

create or replace function public.next_sav_number(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  insert into public.sav_counters (organization_id, last_value)
  values (p_org, 1)
  on conflict (organization_id)
  do update set last_value = public.sav_counters.last_value + 1
  returning last_value into v_next;
  return v_next;
end;
$$;

create table if not exists public.sav_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  number integer,
  client_id uuid not null,
  caller_name text,
  caller_phone text,
  subject text not null,
  description text not null default '',
  category text not null,
  priority text not null default 'normal',
  channel text not null default 'telephone',
  status text not null default 'new',
  owner_id uuid not null,
  created_by uuid not null,
  due_at timestamptz not null,
  opened_at timestamptz,
  opened_by uuid,
  accepted_at timestamptz,
  accepted_by uuid,
  scheduled_at timestamptz,
  intervened_at timestamptz,
  next_action text,
  next_action_at timestamptz,
  wait_reason text,
  wait_for text,
  wait_until date,
  block_reason text,
  result_comment text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  client_informed boolean not null default false,
  client_informed_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  reopen_count integer not null default 0,
  reopen_reason text,
  overdue_noted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sav_cases_status_chk check (status in (
    'new', 'to_qualify', 'assigned', 'accepted', 'scheduled', 'in_progress',
    'waiting_client', 'waiting_internal', 'blocked', 'to_review', 'resolved', 'closed', 'cancelled'
  )),
  constraint sav_cases_priority_chk check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint sav_cases_channel_chk check (channel in ('telephone', 'email', 'visite', 'autre')),
  constraint sav_cases_category_chk check (category in (
    'panne', 'fuite', 'dysfonctionnement', 'piece', 'reglage',
    'erreur_installation', 'demande_intervention', 'reclamation', 'autre'
  ))
);

create or replace function public.assign_sav_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.number is null then
    new.number := public.next_sav_number(new.organization_id);
  end if;
  return new;
end;
$$;

drop trigger if exists sav_cases_assign_number on public.sav_cases;
create trigger sav_cases_assign_number
before insert on public.sav_cases
for each row
execute function public.assign_sav_number();

create unique index if not exists sav_cases_org_number_idx
  on public.sav_cases (organization_id, number);

create index if not exists sav_cases_owner_idx
  on public.sav_cases (organization_id, owner_id, status);

create index if not exists sav_cases_client_idx
  on public.sav_cases (organization_id, client_id);

create index if not exists sav_cases_due_idx
  on public.sav_cases (organization_id, due_at);

create table if not exists public.sav_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null references public.sav_cases (id) on delete cascade,
  author_id uuid,
  kind text not null,
  from_status text,
  to_status text,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sav_events_case_idx
  on public.sav_events (case_id, created_at);

alter table public.sav_cases enable row level security;
alter table public.sav_events enable row level security;
alter table public.sav_counters enable row level security;

revoke all on public.sav_cases from anon, authenticated;
revoke all on public.sav_events from anon, authenticated;
revoke all on public.sav_counters from anon, authenticated;

grant select, insert, update on public.sav_cases to service_role;
grant select, insert on public.sav_events to service_role;
grant select, insert, update on public.sav_counters to service_role;

revoke all on function public.next_sav_number(uuid) from public, anon, authenticated;
revoke all on function public.assign_sav_number() from public, anon, authenticated;
grant execute on function public.next_sav_number(uuid) to service_role;
grant execute on function public.assign_sav_number() to service_role;
