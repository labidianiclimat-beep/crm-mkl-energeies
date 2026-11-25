-- Montants confidentiels d’un chantier.
-- À coller dans Supabase. Le service role est le seul accès :
-- l’API refuse la lecture au secrétariat, au responsable technique,
-- au commercial et au responsable commercial.

create table if not exists public.installation_finances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  installation_id text not null,
  commercial_id uuid,
  sale_ttc_cents bigint not null check (sale_ttc_cents >= 0),
  pose_cents bigint not null check (pose_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (organization_id, installation_id)
);

create table if not exists public.installation_purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  finance_id uuid not null references public.installation_finances (id) on delete cascade,
  position integer not null check (position > 0),
  label text not null check (char_length(btrim(label)) between 1 and 200),
  amount_cents bigint not null check (amount_cents >= 0),
  unique (finance_id, position)
);

create index if not exists installation_finances_org_idx
  on public.installation_finances (organization_id, installation_id);

create index if not exists installation_purchases_finance_idx
  on public.installation_purchases (finance_id, position);

alter table public.installation_finances enable row level security;
alter table public.installation_purchases enable row level security;

revoke all on table public.installation_finances from public, anon, authenticated;
revoke all on table public.installation_purchases from public, anon, authenticated;
grant all on table public.installation_finances to service_role;
grant all on table public.installation_purchases to service_role;

create or replace function public.save_installation_finance(
  p_org uuid,
  p_installation_id text,
  p_commercial_id uuid,
  p_sale_cents bigint,
  p_pose_cents bigint,
  p_purchases jsonb,
  p_user uuid
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_finance uuid;
  v_line jsonb;
  v_label text;
  v_cents bigint;
  v_pos integer := 0;
begin
  if p_installation_id is null or p_installation_id !~ '^[A-Za-z0-9_-]{1,80}$' then
    raise exception 'Chantier invalide';
  end if;
  if p_sale_cents is null or p_sale_cents < 0 or p_pose_cents is null or p_pose_cents < 0 then
    raise exception 'Montant invalide';
  end if;
  if jsonb_typeof(p_purchases) <> 'array' or jsonb_array_length(p_purchases) < 1 or jsonb_array_length(p_purchases) > 50 then
    raise exception 'Achat obligatoire';
  end if;
  if p_commercial_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = p_commercial_id
      and p.organization_id = p_org
      and coalesce(p.active, true)
      and p.role in ('Commercial', 'Responsable commercial')
  ) then
    raise exception 'Commercial introuvable';
  end if;

  insert into public.installation_finances (
    organization_id, installation_id, commercial_id, sale_ttc_cents, pose_cents, updated_by
  ) values (
    p_org, p_installation_id, p_commercial_id, p_sale_cents, p_pose_cents, p_user
  )
  on conflict (organization_id, installation_id) do update
    set commercial_id = excluded.commercial_id,
        sale_ttc_cents = excluded.sale_ttc_cents,
        pose_cents = excluded.pose_cents,
        updated_at = now(),
        updated_by = excluded.updated_by
  returning id into v_finance;

  delete from public.installation_purchases where finance_id = v_finance;

  for v_line in select value from jsonb_array_elements(p_purchases)
  loop
    v_pos := v_pos + 1;
    v_label := btrim(coalesce(v_line->>'label', ''));
    if v_label = '' or char_length(v_label) > 200 then
      raise exception 'Ligne d’achat invalide';
    end if;
    if coalesce(v_line->>'amountCents', '') !~ '^[0-9]+$' then
      raise exception 'Montant d’achat invalide';
    end if;
    v_cents := (v_line->>'amountCents')::bigint;
    if v_cents < 0 then
      raise exception 'Montant d’achat invalide';
    end if;
    insert into public.installation_purchases (organization_id, finance_id, position, label, amount_cents)
    values (p_org, v_finance, v_pos, v_label, v_cents);
  end loop;
end;
$$;

revoke all on function public.save_installation_finance(uuid, text, uuid, bigint, bigint, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.save_installation_finance(uuid, text, uuid, bigint, bigint, jsonb, uuid) to service_role;
