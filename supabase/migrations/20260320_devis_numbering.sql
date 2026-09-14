-- Étape 5 — numérotation devis DEV-YYYY-000001 (6 chiffres)
-- Safe to re-run

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

grant execute on function public.next_devis_number(uuid, text, integer) to service_role;
grant execute on function public.next_devis_number(uuid, text, integer) to authenticated;
