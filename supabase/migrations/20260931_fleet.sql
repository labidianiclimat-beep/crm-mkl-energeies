-- Parc automobile MKL Énergies
-- À coller après 20260930_remaining_record_tables.sql
-- Safe to re-run

create extension if not exists pgcrypto;

create table if not exists public.fleet_vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  internal_code text not null,
  plate text not null,
  plate_key text not null,
  brand text,
  model text,
  category text not null default 'utilitaire',
  year integer,
  energy text not null default 'diesel',
  entry_date date,
  holding_mode text not null default 'propriete',
  current_km integer not null default 0,
  last_validated_reading_at date,
  status text not null default 'available',
  notes text,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists fleet_vehicles_org_plate_idx
  on public.fleet_vehicles (organization_id, plate_key);
create unique index if not exists fleet_vehicles_org_code_idx
  on public.fleet_vehicles (organization_id, internal_code);
create index if not exists fleet_vehicles_org_status_idx
  on public.fleet_vehicles (organization_id, status, updated_at desc);

create table if not exists public.fleet_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  vehicle_id uuid not null references public.fleet_vehicles (id) on delete restrict,
  driver_id uuid not null references auth.users (id) on delete restrict,
  started_on date not null,
  ended_on date,
  start_km integer,
  end_km integer,
  status text not null default 'pending',
  prepared_by uuid references auth.users (id) on delete set null,
  validated_by uuid references auth.users (id) on delete set null,
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists fleet_assignments_one_active_idx
  on public.fleet_assignments (vehicle_id)
  where status = 'active';
create unique index if not exists fleet_assignments_one_pending_idx
  on public.fleet_assignments (vehicle_id)
  where status = 'pending';
create index if not exists fleet_assignments_driver_idx
  on public.fleet_assignments (organization_id, driver_id, status);

create table if not exists public.fleet_handovers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  assignment_id uuid not null references public.fleet_assignments (id) on delete restrict,
  vehicle_id uuid not null references public.fleet_vehicles (id) on delete restrict,
  kind text not null default 'handover',
  handover_date date not null,
  km integer,
  damages jsonb not null default '[]'::jsonb,
  accessories jsonb not null default '[]'::jsonb,
  observations text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists fleet_handovers_assignment_idx
  on public.fleet_handovers (assignment_id, kind);

create table if not exists public.fleet_mileage_readings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  vehicle_id uuid not null references public.fleet_vehicles (id) on delete restrict,
  driver_id uuid references auth.users (id) on delete set null,
  reading_date date not null,
  km integer not null,
  photo_document_id uuid,
  status text not null default 'pending',
  rejection_reason text,
  flag_low boolean not null default false,
  flag_incoherent boolean not null default false,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null
);

create index if not exists fleet_mileage_vehicle_idx
  on public.fleet_mileage_readings (vehicle_id, reading_date desc);

create table if not exists public.fleet_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  vehicle_id uuid not null references public.fleet_vehicles (id) on delete restrict,
  reporter_id uuid references auth.users (id) on delete set null,
  occurred_on date not null,
  kind text not null default 'panne',
  description text not null,
  urgency text not null default 'normale',
  owner_id uuid references auth.users (id) on delete set null,
  status text not null default 'nouveau',
  due_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fleet_incidents_org_status_idx
  on public.fleet_incidents (organization_id, status, urgency);

create table if not exists public.fleet_incident_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  incident_id uuid not null references public.fleet_incidents (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  action text not null,
  note text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.fleet_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  vehicle_id uuid not null references public.fleet_vehicles (id) on delete restrict,
  category text not null,
  other_label text,
  occurred_on date not null,
  amount_ttc numeric(12,2) not null,
  supplier text,
  payment_method text,
  km integer,
  receipt_document_id uuid,
  status text not null default 'pending',
  rejection_reason text,
  created_by uuid references auth.users (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists fleet_expenses_vehicle_date_idx
  on public.fleet_expenses (vehicle_id, occurred_on desc);

create table if not exists public.fleet_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  vehicle_id uuid not null references public.fleet_vehicles (id) on delete restrict,
  assignment_id uuid references public.fleet_assignments (id) on delete set null,
  incident_id uuid references public.fleet_incidents (id) on delete set null,
  expense_id uuid references public.fleet_expenses (id) on delete set null,
  kind text not null,
  title text not null,
  doc_date date,
  expires_on date,
  mime_type text not null default 'application/octet-stream',
  file_size integer not null default 0,
  storage_path text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists fleet_documents_vehicle_idx
  on public.fleet_documents (vehicle_id, created_at desc);

create table if not exists public.fleet_deadlines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  vehicle_id uuid not null references public.fleet_vehicles (id) on delete restrict,
  kind text not null,
  title text,
  due_on date,
  due_km integer,
  lead_days integer,
  status text not null default 'open',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fleet_deadlines_due_idx
  on public.fleet_deadlines (organization_id, status, due_on);

create table if not exists public.fleet_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  vehicle_id uuid references public.fleet_vehicles (id) on delete cascade,
  kind text not null,
  title text not null,
  due_on date,
  status text not null default 'open',
  owner_id uuid references auth.users (id) on delete set null,
  treated_at timestamptz,
  treated_by uuid references auth.users (id) on delete set null,
  source_type text,
  source_id uuid,
  dedupe_key text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists fleet_alerts_dedupe_idx
  on public.fleet_alerts (organization_id, dedupe_key);

create table if not exists public.fleet_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  vehicle_id uuid not null references public.fleet_vehicles (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.fleet_settings (
  organization_id uuid primary key,
  deadline_lead_days integer not null default 30,
  document_lead_days integer not null default 30,
  mileage_request_day integer not null default 1,
  km_jump_threshold integer not null default 5000,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.fleet_mileage_readings
  drop constraint if exists fleet_mileage_photo_fk;
alter table public.fleet_mileage_readings
  add constraint fleet_mileage_photo_fk
  foreign key (photo_document_id) references public.fleet_documents (id) on delete set null;

alter table public.fleet_expenses
  drop constraint if exists fleet_expenses_receipt_fk;
alter table public.fleet_expenses
  add constraint fleet_expenses_receipt_fk
  foreign key (receipt_document_id) references public.fleet_documents (id) on delete set null;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'fleet_vehicles',
    'fleet_assignments',
    'fleet_handovers',
    'fleet_mileage_readings',
    'fleet_incidents',
    'fleet_incident_events',
    'fleet_expenses',
    'fleet_documents',
    'fleet_deadlines',
    'fleet_alerts',
    'fleet_comments',
    'fleet_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists %I_org on public.%I', tbl, tbl);
    execute format(
      'create policy %I_org on public.%I
        for all to authenticated
        using (
          exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.organization_id = %I.organization_id
              and p.active = true
              and p.onboarding_completed_at is not null
          )
        )
        with check (
          exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.organization_id = %I.organization_id
              and p.active = true
              and p.onboarding_completed_at is not null
          )
        )',
      tbl, tbl, tbl, tbl
    );
    execute format('grant all on table public.%I to service_role', tbl);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', tbl);
  end loop;
end $$;

insert into storage.buckets (id, name, public)
values ('fleet-documents', 'fleet-documents', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists fleet_documents_storage_select on storage.objects;
create policy fleet_documents_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'fleet-documents' and false);

drop policy if exists fleet_documents_storage_write on storage.objects;
create policy fleet_documents_storage_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fleet-documents' and false);
