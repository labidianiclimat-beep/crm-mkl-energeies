-- Contrats d’entretien — modèle relationnel additif.
-- À coller APRÈS 20260931_fleet.sql
-- Safe to re-run. N’altère pas clients, devis, profiles,
-- google_calendar_accounts, maintenance_contracts, maintenance_reports.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Import : mapping configurable (les colonnes sources arrivent plus tard)
-- ---------------------------------------------------------------------------

create table if not exists public.entretien_import_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  kind text not null check (kind in ('client', 'invoice')),
  name text not null,
  column_map jsonb not null default '{}'::jsonb,
  unique_source_column text,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists entretien_import_mappings_org_kind_name_idx
  on public.entretien_import_mappings (organization_id, kind, name);

create table if not exists public.entretien_import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  mapping_id uuid references public.entretien_import_mappings (id) on delete set null,
  kind text not null check (kind in ('client', 'invoice')),
  filename text,
  status text not null default 'draft' check (status in ('draft', 'preview', 'imported', 'cancelled')),
  created_count integer not null default 0,
  linked_count integer not null default 0,
  review_count integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists entretien_import_jobs_org_idx
  on public.entretien_import_jobs (organization_id, created_at desc);

create table if not exists public.entretien_import_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  job_id uuid not null references public.entretien_import_jobs (id) on delete cascade,
  raw jsonb not null default '{}'::jsonb,
  mapped jsonb not null default '{}'::jsonb,
  match_status text not null default 'pending'
    check (match_status in ('pending', 'linked', 'created', 'duplicate', 'review')),
  client_id uuid references public.clients (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists entretien_import_rows_job_idx
  on public.entretien_import_rows (job_id, match_status);

create table if not exists public.entretien_client_keys (
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  import_key text not null,
  client_id uuid not null references public.clients (id) on delete cascade,
  source_job_id uuid references public.entretien_import_jobs (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id, import_key)
);

create index if not exists entretien_client_keys_client_idx
  on public.entretien_client_keys (client_id);

-- ---------------------------------------------------------------------------
-- Classement d’agenda : règles ajustables (jamais un mot = certain)
-- ---------------------------------------------------------------------------

create table if not exists public.entretien_classify_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  family text not null check (family in ('entretien', 'installation', 'ignorer')),
  pattern text not null,
  weight integer not null default 1,
  alone_is_insufficient boolean not null default false,
  active boolean not null default true,
  version integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists entretien_classify_rules_org_family_pattern_idx
  on public.entretien_classify_rules (organization_id, family, lower(pattern));

insert into public.entretien_classify_rules
  (family, pattern, weight, alone_is_insufficient, notes)
select seed.family, seed.pattern, seed.weight, seed.alone_is_insufficient, seed.notes
from (
  values
    ('entretien', 'entretien', 3, false, 'Signal entretien net'),
    ('entretien', 'maintenance', 3, false, 'Signal entretien net'),
    ('entretien', 'visite annuelle', 3, false, 'Signal entretien net'),
    ('entretien', 'contrat d''entretien', 3, false, 'Signal entretien net'),
    ('entretien', 'revision', 2, true, 'Seul, trop vague'),
    ('entretien', 'controle etancheite', 2, false, 'Contrôle d’étanchéité'),
    ('installation', 'pose', 2, true, 'Une pose seule reste ambiguë'),
    ('installation', 'installation', 2, true, 'Le mot seul ne suffit pas'),
    ('installation', 'chantier', 2, true, 'Le mot seul ne suffit pas'),
    ('installation', 'photovoltaique', 1, true, 'Jamais installation certaine sur ce seul mot'),
    ('installation', 'pv', 1, true, 'Jamais installation certaine sur ce seul mot'),
    ('installation', 'mise en service', 1, true, 'Jamais installation certaine sur ce seul mot')
) as seed(family, pattern, weight, alone_is_insufficient, notes)
where not exists (
  select 1
  from public.entretien_classify_rules existing
  where existing.organization_id = '00000000-0000-0000-0000-000000000001'
    and existing.family = seed.family
    and lower(existing.pattern) = lower(seed.pattern)
);

-- ---------------------------------------------------------------------------
-- Sites, contrats, matériel (liens souples vers les record tables JSON)
-- ---------------------------------------------------------------------------

create table if not exists public.entretien_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  client_id uuid not null references public.clients (id) on delete cascade,
  label text,
  adresse text,
  complement_adresse text,
  code_postal text,
  ville text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists entretien_sites_client_idx
  on public.entretien_sites (organization_id, client_id);

create table if not exists public.entretien_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  client_id uuid not null references public.clients (id) on delete cascade,
  site_id uuid references public.entretien_sites (id) on delete set null,
  number text,
  frequency text check (frequency in ('Annuelle', 'Semestrielle', 'Trimestrielle') or frequency is null),
  amount numeric(14, 2),
  start_on date,
  end_on date,
  status text not null default 'inconnu',
  legacy_record_id text,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists entretien_contracts_org_number_idx
  on public.entretien_contracts (organization_id, number)
  where number is not null;
create index if not exists entretien_contracts_client_idx
  on public.entretien_contracts (organization_id, client_id);
create index if not exists entretien_contracts_legacy_idx
  on public.entretien_contracts (organization_id, legacy_record_id)
  where legacy_record_id is not null;

create table if not exists public.entretien_equipment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  client_id uuid not null references public.clients (id) on delete cascade,
  contract_id uuid references public.entretien_contracts (id) on delete set null,
  site_id uuid references public.entretien_sites (id) on delete set null,
  article_id uuid references public.articles (id) on delete set null,
  equipment_type text,
  brand text,
  model text,
  serial text,
  refrigerant text,
  refrigerant_charge numeric(10, 3),
  commissioned_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists entretien_equipment_client_idx
  on public.entretien_equipment (organization_id, client_id);

-- ---------------------------------------------------------------------------
-- Visites : (a) identité + nature  et  (b) réalisation  sont disjoints
-- Classer un RDV « entretien » ne crée JAMAIS une date de dernier entretien.
-- ---------------------------------------------------------------------------

create table if not exists public.entretien_visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  technician_id uuid references public.profiles (id) on delete set null,
  contract_id uuid references public.entretien_contracts (id) on delete set null,
  site_id uuid references public.entretien_sites (id) on delete set null,
  source text not null default 'saisie'
    check (source in ('google', 'import_fichier', 'saisie', 'facture_indice')),
  title text,
  location text,
  description text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  google_user_id uuid references auth.users (id) on delete set null,
  google_calendar_id text,
  google_event_id text,
  ical_uid text,
  google_status text,
  google_updated_at timestamptz,
  signals jsonb not null default '[]'::jsonb,
  -- (a) identité client
  client_id uuid references public.clients (id) on delete set null,
  client_link_status text not null default 'non_rapproche'
    check (client_link_status in ('non_rapproche', 'propose', 'valide', 'rejete')),
  client_linked_at timestamptz,
  client_linked_by uuid references auth.users (id) on delete set null,
  -- (a) nature du rendez-vous
  nature_proposed text check (nature_proposed in ('entretien', 'installation', 'autre') or nature_proposed is null),
  nature_status text not null default 'brut'
    check (nature_status in ('brut', 'propose', 'ambigu', 'valide', 'ecarte')),
  nature_validated text check (nature_validated in ('entretien', 'installation', 'autre') or nature_validated is null),
  nature_validated_at timestamptz,
  nature_validated_by uuid references auth.users (id) on delete set null,
  -- (b) réalisation — indépendante de (a)
  realization_status text not null default 'inconnu'
    check (realization_status in ('inconnu', 'confirme', 'non_confirme')),
  realization_date date,
  realization_basis text
    check (realization_basis in (
      'rapport_signe',
      'attestation_technicien',
      'confirmation_client',
      'revue_humaine',
      'autre'
    ) or realization_basis is null),
  realization_note text,
  realization_recorded_at timestamptz,
  realization_recorded_by uuid references auth.users (id) on delete set null,
  legacy_report_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entretien_visits_realization_unknown_ck check (
    realization_status <> 'inconnu'
    or (
      realization_date is null
      and realization_basis is null
      and realization_recorded_by is null
      and realization_recorded_at is null
    )
  ),
  constraint entretien_visits_realization_denied_ck check (
    realization_status <> 'non_confirme'
    or (
      realization_date is null
      and realization_recorded_by is not null
    )
  ),
  constraint entretien_visits_realization_confirmed_ck check (
    realization_status <> 'confirme'
    or (
      realization_date is not null
      and realization_basis is not null
      and realization_recorded_by is not null
    )
  ),
  constraint entretien_visits_realization_note_ck check (
    realization_basis is null
    or realization_basis not in ('revue_humaine', 'autre')
    or coalesce(nullif(trim(realization_note), ''), '') <> ''
  )
);

create unique index if not exists entretien_visits_google_event_uidx
  on public.entretien_visits (organization_id, google_user_id, google_calendar_id, google_event_id)
  where google_event_id is not null;
create unique index if not exists entretien_visits_ical_uidx
  on public.entretien_visits (organization_id, google_user_id, ical_uid)
  where ical_uid is not null;
create index if not exists entretien_visits_client_idx
  on public.entretien_visits (organization_id, client_id, scheduled_start desc);
create index if not exists entretien_visits_review_idx
  on public.entretien_visits (organization_id, nature_status, client_link_status);
create index if not exists entretien_visits_realization_idx
  on public.entretien_visits (organization_id, realization_status, realization_date);

-- ---------------------------------------------------------------------------
-- Factures historiques : référence uniquement, jamais un nouveau FAC-
-- ---------------------------------------------------------------------------

create table if not exists public.entretien_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  origin text not null default 'historique' check (origin in ('historique', 'crm')),
  external_number text,
  invoice_date date,
  amount_ht numeric(14, 2),
  amount_tva numeric(14, 2),
  amount_ttc numeric(14, 2),
  client_id uuid references public.clients (id) on delete set null,
  client_link_status text not null default 'non_rapproche'
    check (client_link_status in ('non_rapproche', 'propose', 'valide', 'rejete')),
  payment_status text not null default 'inconnu'
    check (payment_status in ('inconnu', 'impaye', 'partiel', 'paye')),
  payment_date date,
  visit_date_hint date,
  document_ref text,
  devis_id uuid references public.devis (id) on delete set null,
  import_row_id uuid references public.entretien_import_rows (id) on delete set null,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entretien_invoices_historical_no_devis_ck check (
    origin <> 'historique' or devis_id is null
  )
);

create unique index if not exists entretien_invoices_org_external_uidx
  on public.entretien_invoices (organization_id, external_number)
  where external_number is not null;
create unique index if not exists entretien_invoices_devis_uidx
  on public.entretien_invoices (devis_id)
  where devis_id is not null;
create index if not exists entretien_invoices_client_idx
  on public.entretien_invoices (organization_id, client_id, invoice_date desc);
create index if not exists entretien_invoices_review_idx
  on public.entretien_invoices (organization_id, client_link_status, payment_status);

create table if not exists public.entretien_invoice_visit_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  invoice_id uuid not null references public.entretien_invoices (id) on delete cascade,
  visit_id uuid not null references public.entretien_visits (id) on delete cascade,
  linked_by uuid references auth.users (id) on delete set null,
  linked_at timestamptz not null default now(),
  notes text,
  unique (invoice_id, visit_id)
);

-- Ce lien ne change pas realization_status.

create table if not exists public.entretien_google_sync_state (
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  user_id uuid not null references auth.users (id) on delete cascade,
  calendar_id text not null default 'primary',
  history_from date,
  history_to date,
  last_full_synced_at timestamptz,
  last_incremental_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, calendar_id)
);

-- ---------------------------------------------------------------------------
-- Pilotage : trois files distinctes, jamais « entretien jamais effectué »
-- ---------------------------------------------------------------------------

create or replace view public.entretien_client_pilotage as
select
  c.organization_id,
  c.id as client_id,
  last_done.realization_date as last_confirmed_entretien_on,
  case ct.frequency
    when 'Annuelle' then last_done.realization_date + interval '1 year'
    when 'Semestrielle' then last_done.realization_date + interval '6 months'
    when 'Trimestrielle' then last_done.realization_date + interval '3 months'
    else null
  end::date as next_due_on,
  last_done.realization_date is null as is_last_entretien_unknown,
  (
    last_done.realization_date is not null
    and ct.frequency is not null
    and (
      case ct.frequency
        when 'Annuelle' then last_done.realization_date + interval '1 year'
        when 'Semestrielle' then last_done.realization_date + interval '6 months'
        when 'Trimestrielle' then last_done.realization_date + interval '3 months'
      end
    )::date < current_date
  ) as is_confirmed_overdue,
  coalesce(review.pending_visits, 0) as pending_visit_reviews,
  coalesce(review.pending_invoices, 0) as pending_invoice_reviews,
  coalesce(review.pending_visits, 0) + coalesce(review.pending_invoices, 0) > 0 as has_items_to_review
from public.clients c
left join lateral (
  select v.realization_date
  from public.entretien_visits v
  where v.organization_id = c.organization_id
    and v.client_id = c.id
    and v.nature_status = 'valide'
    and v.nature_validated = 'entretien'
    and v.realization_status = 'confirme'
    and v.realization_date is not null
  order by v.realization_date desc
  limit 1
) last_done on true
left join lateral (
  select ct0.frequency
  from public.entretien_contracts ct0
  where ct0.organization_id = c.organization_id
    and ct0.client_id = c.id
  order by ct0.updated_at desc
  limit 1
) ct on true
left join lateral (
  select
    count(*) filter (
      where v.nature_status in ('brut', 'propose', 'ambigu')
        or v.client_link_status in ('non_rapproche', 'propose')
    )::integer as pending_visits,
    (
      select count(*)::integer
      from public.entretien_invoices i
      where i.organization_id = c.organization_id
        and i.client_id = c.id
        and i.client_link_status in ('non_rapproche', 'propose')
    ) as pending_invoices
  from public.entretien_visits v
  where v.organization_id = c.organization_id
    and v.client_id = c.id
) review on true
where exists (
  select 1 from public.entretien_client_keys k
  where k.client_id = c.id
)
or exists (
  select 1 from public.entretien_visits v
  where v.client_id = c.id
)
or exists (
  select 1 from public.entretien_invoices i
  where i.client_id = c.id
)
or exists (
  select 1 from public.entretien_contracts ct1
  where ct1.client_id = c.id
);

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'entretien_import_mappings',
    'entretien_import_jobs',
    'entretien_import_rows',
    'entretien_client_keys',
    'entretien_classify_rules',
    'entretien_sites',
    'entretien_contracts',
    'entretien_equipment',
    'entretien_visits',
    'entretien_invoices',
    'entretien_invoice_visit_links',
    'entretien_google_sync_state'
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

grant select on public.entretien_client_pilotage to service_role;
grant select on public.entretien_client_pilotage to authenticated;
