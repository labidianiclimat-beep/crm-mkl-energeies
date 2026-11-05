-- Planning, chantiers, visites, chiffrages, équipes, bons et rapports.
-- À coller après 20260929_record_tables.sql

do $$
declare
  t text;
begin
  foreach t in array array[
    'cost_requests',
    'suppliers',
    'technical_visits',
    'installations',
    'installation_teams',
    'purchase_orders',
    'maintenance_reports'
  ]
  loop
    execute format($sql$
      create table if not exists public.%I (
        organization_id uuid not null,
        record_id text not null,
        client_id uuid,
        client_name text,
        title text,
        status text,
        payload jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        updated_by uuid,
        primary key (organization_id, record_id)
      )
    $sql$, t);

    execute format(
      'create index if not exists %I on public.%I (organization_id, updated_at desc)',
      t || '_org_updated_idx',
      t
    );
    execute format(
      'create index if not exists %I on public.%I (organization_id, client_id)',
      t || '_client_idx',
      t
    );

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_org', t);
    execute format($sql$
      create policy %I on public.%I
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
        )
    $sql$, t || '_org', t, t, t);

    execute format('grant all on table public.%I to service_role', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;
