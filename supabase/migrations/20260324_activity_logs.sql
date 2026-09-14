-- Étape 12 — Traçabilité (journal d’actions importantes)
-- Safe to re-run

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  user_name text,
  action text not null,
  module text not null,
  entity_type text,
  entity_id text,
  entity_label text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_org_created_idx
  on public.activity_logs (organization_id, created_at desc);

create index if not exists activity_logs_entity_idx
  on public.activity_logs (entity_type, entity_id);

create index if not exists activity_logs_action_idx
  on public.activity_logs (action);

alter table public.activity_logs enable row level security;

drop policy if exists activity_logs_select_admin on public.activity_logs;
create policy activity_logs_select_admin on public.activity_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.organization_id = activity_logs.organization_id
        and p.role in ('Admin VIP', 'Admin second', 'Direction')
    )
  );

-- Écritures uniquement via service_role (API serveur)
drop policy if exists activity_logs_insert_none on public.activity_logs;
create policy activity_logs_insert_none on public.activity_logs
  for insert to authenticated
  with check (false);

grant all on table public.activity_logs to service_role;
grant select on table public.activity_logs to authenticated;
