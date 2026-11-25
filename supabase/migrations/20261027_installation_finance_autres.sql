-- Chantier sans commercial : la secrétaire peut choisir « Autres ».
-- À coller dans Supabase. Le commercial reste obligatoire s’il est renseigné.

alter table public.installation_finances
  alter column commercial_id drop not null;

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
