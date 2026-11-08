-- Tickets internes MKL-DM-00001.
-- À coller dans Supabase → SQL Editor → Run.
-- N'écrase aucune donnée. Ajoute les tables et une colonne request_id sur les notifications.

create table if not exists public.internal_request_counters (
  organization_id uuid primary key,
  last_value integer not null default 0
);

create or replace function public.next_internal_request_number(p_org uuid)
returns integer
language plpgsql
as $$
declare
  v_next integer;
begin
  insert into public.internal_request_counters (organization_id, last_value)
  values (p_org, 1)
  on conflict (organization_id)
  do update set last_value = public.internal_request_counters.last_value + 1
  returning last_value into v_next;
  return v_next;
end;
$$;

create table if not exists public.internal_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  number integer,
  title text not null,
  description text not null default '',
  status text not null default 'sent',
  priority text not null default 'normal',
  requester_id uuid not null,
  assignee_id uuid not null,
  assignee_ids uuid[] not null default '{}',
  client_id uuid,
  due_at timestamptz not null,
  opened_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  response_sent_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  wait_reason text,
  wait_for text,
  wait_until date,
  block_reason text,
  result_comment text,
  cancel_reason text,
  overdue_noted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.assign_internal_request_number()
returns trigger
language plpgsql
as $$
begin
  if new.number is null then
    new.number := public.next_internal_request_number(new.organization_id);
  end if;
  return new;
end;
$$;

drop trigger if exists internal_requests_assign_number on public.internal_requests;
create trigger internal_requests_assign_number
before insert on public.internal_requests
for each row
execute function public.assign_internal_request_number();

create unique index if not exists internal_requests_org_number_idx
  on public.internal_requests (organization_id, number);

create index if not exists internal_requests_assignee_idx
  on public.internal_requests (organization_id, assignee_id, status);

create index if not exists internal_requests_requester_idx
  on public.internal_requests (organization_id, requester_id, status);

create index if not exists internal_requests_due_idx
  on public.internal_requests (organization_id, due_at);

create table if not exists public.internal_request_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  request_id uuid not null references public.internal_requests (id) on delete cascade,
  author_id uuid,
  kind text not null,
  from_status text,
  to_status text,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists internal_request_events_request_idx
  on public.internal_request_events (request_id, created_at);

create table if not exists public.internal_request_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  request_id uuid not null references public.internal_requests (id) on delete cascade,
  author_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists internal_request_messages_request_idx
  on public.internal_request_messages (request_id, created_at);

alter table public.crm_notifications
  add column if not exists request_id uuid;

create index if not exists crm_notifications_request_idx
  on public.crm_notifications (request_id)
  where request_id is not null;

alter table public.internal_requests enable row level security;
alter table public.internal_request_events enable row level security;
alter table public.internal_request_messages enable row level security;
alter table public.internal_request_counters enable row level security;

revoke all on public.internal_requests from anon, authenticated;
revoke all on public.internal_request_events from anon, authenticated;
revoke all on public.internal_request_messages from anon, authenticated;
revoke all on public.internal_request_counters from anon, authenticated;

grant select, insert, update on public.internal_requests to service_role;
grant select, insert on public.internal_request_events to service_role;
grant select, insert on public.internal_request_messages to service_role;
grant select, insert, update on public.internal_request_counters to service_role;
grant execute on function public.next_internal_request_number(uuid) to service_role;
