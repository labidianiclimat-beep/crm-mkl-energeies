-- Devis CRM — devis + devis_lignes + compteur
-- Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS)

create extension if not exists pgcrypto;

create table if not exists public.devis (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  kind text not null default 'Devis',
  numero_devis text not null,
  client_id uuid references public.clients (id) on delete set null,
  client_name text,
  commercial_id uuid references auth.users (id) on delete set null,
  statut text not null default 'Brouillon',
  date_creation date not null default current_date,
  date_validite date,
  date_livraison date,
  total_ht numeric(14,2) not null default 0,
  total_tva numeric(14,2) not null default 0,
  total_ttc numeric(14,2) not null default 0,
  remise_globale_type text default 'percent',
  remise_globale numeric(14,2) not null default 0,
  acompte numeric(14,2) not null default 0,
  reste_a_payer numeric(14,2) not null default 0,
  conditions_reglement text,
  observations text,
  label text,
  tax_default numeric(5,2) not null default 20,
  financier text,
  financed_amount numeric(14,2),
  finance_months integer,
  monthly_payment numeric(14,2),
  electricity_operator text,
  pv_power_kwp numeric(12,2),
  pv_study_id bigint,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create unique index if not exists devis_org_numero_uidx
  on public.devis (organization_id, numero_devis);

create index if not exists devis_org_idx on public.devis (organization_id);
create index if not exists devis_client_idx on public.devis (client_id);
create index if not exists devis_commercial_idx on public.devis (commercial_id);
create index if not exists devis_statut_idx on public.devis (organization_id, statut);
create index if not exists devis_kind_idx on public.devis (organization_id, kind);

create table if not exists public.devis_lignes (
  id uuid primary key default gen_random_uuid(),
  devis_id uuid not null references public.devis (id) on delete cascade,
  article_id uuid references public.articles (id) on delete set null,
  reference text,
  designation text not null,
  description text,
  quantite numeric(12,3) not null default 1,
  unite text default 'Unité',
  prix_unitaire_ht numeric(14,2) not null default 0,
  remise_type text default 'percent',
  remise numeric(14,2) not null default 0,
  taux_tva numeric(5,2) not null default 20,
  total_ht numeric(14,2) not null default 0,
  total_tva numeric(14,2) not null default 0,
  total_ttc numeric(14,2) not null default 0,
  categorie text,
  sous_categorie text,
  bundle_id text,
  bundle_name text,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists devis_lignes_devis_idx on public.devis_lignes (devis_id, ordre);

create table if not exists public.devis_counters (
  organization_id uuid not null,
  kind text not null,
  year integer not null,
  last_value integer not null default 0,
  primary key (organization_id, kind, year)
);

create or replace function public.next_devis_number(
  p_org uuid,
  p_kind text,
  p_year integer default extract(year from current_date)::integer
)
returns text
language plpgsql
as $$
declare
  v_prefix text;
  v_next integer;
begin
  v_prefix := case
    when p_kind = 'Facture' then 'FAC'
    when p_kind = 'Pro forma' then 'PRO'
    else 'DEV'
  end;

  insert into public.devis_counters (organization_id, kind, year, last_value)
  values (p_org, p_kind, p_year, 1)
  on conflict (organization_id, kind, year)
  do update set last_value = public.devis_counters.last_value + 1
  returning last_value into v_next;

  return v_prefix || '-' || p_year::text || '-' || lpad(v_next::text, 6, '0');
end;
$$;

create or replace function public.can_manage_devis(role_name text, modules text[])
returns boolean
language sql
immutable
as $$
  select role_name in ('Admin VIP', 'Admin second', 'Responsable commercial', 'Direction')
    or 'Devis' = any (coalesce(modules, '{}'::text[]))
    or 'Factures' = any (coalesce(modules, '{}'::text[]))
    or 'Factures pro forma' = any (coalesce(modules, '{}'::text[]));
$$;

create or replace function public.can_access_devis_row(d public.devis)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.onboarding_completed_at is not null
      and p.organization_id = d.organization_id
      and (
        public.can_manage_all_clients(p.role)
        or d.commercial_id = auth.uid()
        or d.created_by = auth.uid()
        or exists (
          select 1 from public.clients c
          where c.id = d.client_id
            and (c.commercial_id = auth.uid() or c.created_by = auth.uid())
        )
      )
  );
$$;

alter table public.devis enable row level security;
alter table public.devis_lignes enable row level security;
alter table public.devis_counters enable row level security;

drop policy if exists devis_select on public.devis;
create policy devis_select on public.devis
  for select to authenticated
  using (public.can_access_devis_row(devis));

drop policy if exists devis_insert on public.devis;
create policy devis_insert on public.devis
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = devis.organization_id
        and public.can_manage_devis(p.role, p.modules)
    )
  );

drop policy if exists devis_update on public.devis;
create policy devis_update on public.devis
  for update to authenticated
  using (public.can_access_devis_row(devis))
  with check (public.can_access_devis_row(devis));

drop policy if exists devis_delete on public.devis;
create policy devis_delete on public.devis
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.onboarding_completed_at is not null
        and p.organization_id = devis.organization_id
        and public.is_admin_role(p.role)
    )
  );

drop policy if exists devis_lignes_select on public.devis_lignes;
create policy devis_lignes_select on public.devis_lignes
  for select to authenticated
  using (
    exists (
      select 1 from public.devis d
      where d.id = devis_lignes.devis_id
        and public.can_access_devis_row(d)
    )
  );

drop policy if exists devis_lignes_insert on public.devis_lignes;
create policy devis_lignes_insert on public.devis_lignes
  for insert to authenticated
  with check (
    exists (
      select 1 from public.devis d
      where d.id = devis_lignes.devis_id
        and public.can_access_devis_row(d)
    )
  );

drop policy if exists devis_lignes_update on public.devis_lignes;
create policy devis_lignes_update on public.devis_lignes
  for update to authenticated
  using (
    exists (
      select 1 from public.devis d
      where d.id = devis_lignes.devis_id
        and public.can_access_devis_row(d)
    )
  )
  with check (
    exists (
      select 1 from public.devis d
      where d.id = devis_lignes.devis_id
        and public.can_access_devis_row(d)
    )
  );

drop policy if exists devis_lignes_delete on public.devis_lignes;
create policy devis_lignes_delete on public.devis_lignes
  for delete to authenticated
  using (
    exists (
      select 1 from public.devis d
      where d.id = devis_lignes.devis_id
        and public.can_access_devis_row(d)
    )
  );

drop policy if exists devis_counters_all on public.devis_counters;
create policy devis_counters_all on public.devis_counters
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = devis_counters.organization_id
        and public.can_manage_devis(p.role, p.modules)
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = devis_counters.organization_id
        and public.can_manage_devis(p.role, p.modules)
    )
  );

grant all on table public.devis to service_role;
grant all on table public.devis_lignes to service_role;
grant all on table public.devis_counters to service_role;
grant select, insert, update, delete on table public.devis to authenticated;
grant select, insert, update, delete on table public.devis_lignes to authenticated;
grant select, insert, update, delete on table public.devis_counters to authenticated;
grant execute on function public.next_devis_number(uuid, text, integer) to service_role;
grant execute on function public.next_devis_number(uuid, text, integer) to authenticated;
