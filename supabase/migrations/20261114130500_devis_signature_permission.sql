-- PRÉPARÉE, NON APPLIQUÉE.
-- Ne pas exécuter tant que la transition de production n'est pas autorisée.
-- Avant exécution, accorder action:validate_signed_quote au responsable du pilote.
-- Sans cette case, sa confirmation échoue ici alors que l'application l'autorise encore par son rôle.
-- Ce fichier ne modifie aucun devis, client, rendez-vous, opportunité ou preuve.
-- Le rôle et les modules lus sont ceux de public.profiles, pas ceux d'une requête.
-- La confirmation passe le devis à Accepté et l'opportunité liée à Gagné.
-- Elle ne change pas le statut administratif du client ni le rendez-vous.

create or replace function public.sale_can_confirm(role_name text)
returns boolean
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
  select public.sale_role(role_name) in ('Superadmin', 'Admin VIP');
$$;

create or replace function public.sale_profile_can_confirm(role_name text, modules text[])
returns boolean
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
  select public.sale_role(role_name) in ('Superadmin', 'Admin VIP')
    or 'action:validate_signed_quote' = any (coalesce(modules, '{}'::text[]));
$$;

revoke all on function public.sale_can_confirm(text) from public, anon, authenticated;
revoke all on function public.sale_profile_can_confirm(text, text[]) from public, anon, authenticated;
grant execute on function public.sale_can_confirm(text) to service_role;
grant execute on function public.sale_profile_can_confirm(text, text[]) to service_role;

create or replace function public.commit_devis_signature(
  p_devis_id uuid,
  p_action text,
  p_actor_id uuid,
  p_proof_kind text,
  p_declared_signature_on date,
  p_proof_digest text,
  p_idempotency_key text,
  p_storage_path text,
  p_reason text default null,
  p_replaces_devis_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_devis public.devis%rowtype;
  v_profile public.profiles%rowtype;
  v_role text;
  v_amount numeric(14,2);
  v_prospect uuid;
  v_link text := 'À rattacher';
  v_open public.devis_signatures%rowtype;
  v_previous public.devis_signatures%rowtype;
  v_signature_id uuid;
  v_action text := btrim(coalesce(p_action, ''));
begin
  if p_proof_kind = 'electronique' then
    raise exception 'La signature électronique n’est pas installée.'
      using errcode = 'P0001';
  end if;

  select * into v_devis
  from public.devis
  where id = p_devis_id
  for update;
  if not found then
    raise exception 'Devis introuvable.' using errcode = 'P0002';
  end if;
  if v_devis.kind is distinct from 'Devis' then
    raise exception 'Seuls les devis peuvent être signés.' using errcode = 'P0001';
  end if;
  if v_devis.total_ttc is null then
    raise exception 'Le montant du devis enregistré est indisponible.' using errcode = 'P0001';
  end if;
  v_amount := round(v_devis.total_ttc, 2);

  select * into v_profile
  from public.profiles
  where id = p_actor_id;
  if not found
     or v_profile.active is distinct from true
     or v_profile.onboarding_completed_at is null
     or v_profile.organization_id is distinct from v_devis.organization_id then
    raise exception 'Profil non autorisé.' using errcode = '42501';
  end if;
  v_role := public.sale_role(v_profile.role);

  begin
    v_prospect := nullif(btrim(coalesce(v_devis.extra ->> 'sourceProspectId', '')), '')::uuid;
  exception
    when invalid_text_representation then
      v_prospect := null;
  end;

  select * into v_open
  from public.devis_signatures
  where devis_id = p_devis_id
    and status in ('demande', 'confirmee')
  for update;

  if v_action = 'demande' then
    if not public.sale_can_request(v_role) then
      raise exception 'Vous ne pouvez pas déposer de signature.' using errcode = '42501';
    end if;
    if v_devis.commercial_id is distinct from p_actor_id then
      raise exception 'Vous ne pouvez déposer une preuve que pour un devis dont vous êtes responsable.'
        using errcode = '42501';
    end if;
    if p_proof_kind is distinct from 'devis_signe' then
      raise exception 'Le justificatif doit être le PDF signé.' using errcode = 'P0001';
    end if;
    if p_declared_signature_on is null
       or p_declared_signature_on > (timezone('Europe/Paris', now()))::date then
      raise exception 'Indiquez la date de signature.' using errcode = 'P0001';
    end if;
    if v_open.id is not null then
      if v_open.status = 'confirmee' then
        raise exception 'Cette vente est déjà confirmée.' using errcode = '23505';
      end if;
      if v_open.idempotency_key = p_idempotency_key then
        return jsonb_build_object('ok', true, 'identical', true, 'status', v_open.status, 'amountTtc', v_open.amount_ttc);
      end if;
      raise exception 'Une demande est déjà en cours pour ce devis.' using errcode = '23505';
    end if;
    insert into public.devis_signatures (
      organization_id, devis_id, prospect_id, commercial_id, proof_kind, status,
      declared_signature_on, requested_by, requested_by_name, requested_at,
      amount_ttc, storage_path, proof_digest, idempotency_key, link_state
    ) values (
      v_devis.organization_id, v_devis.id, v_prospect, v_devis.commercial_id, 'devis_signe', 'demande',
      p_declared_signature_on, p_actor_id, v_profile.full_name, now(),
      v_amount, p_storage_path, p_proof_digest, p_idempotency_key, 'À rattacher'
    )
    returning id into v_signature_id;
    insert into public.devis_signature_journal (signature_id, devis_id, action, actor_id, actor_name, amount_ttc)
    values (v_signature_id, v_devis.id, 'demande', p_actor_id, v_profile.full_name, v_amount);
    return jsonb_build_object('ok', true, 'status', 'demande', 'amountTtc', v_amount, 'amountSource', 'devis.total_ttc');
  end if;

  if v_action = 'remplacer' then
    if not public.sale_profile_can_confirm(v_profile.role, v_profile.modules) then
      raise exception 'Vous ne pouvez pas confirmer cette vente.' using errcode = '42501';
    end if;
    if p_replaces_devis_id is null or p_replaces_devis_id = p_devis_id then
      raise exception 'Un devis ne peut pas se remplacer lui-même.' using errcode = 'P0001';
    end if;
    select * into v_previous
    from public.devis_signatures
    where devis_id = p_replaces_devis_id
      and status = 'confirmee'
    for update;
    if v_previous.id is null then
      raise exception 'Le devis remplacé n’a pas de vente confirmée.' using errcode = 'P0002';
    end if;
    v_action := 'confirmer';
  end if;

  if v_action = 'confirmer' then
    if not public.sale_profile_can_confirm(v_profile.role, v_profile.modules) then
      raise exception 'Vous ne pouvez pas confirmer cette vente.' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.devis_signatures
      where devis_id = p_devis_id and status = 'remplacee'
    ) then
      raise exception 'Ce devis a été remplacé et ne peut plus être confirmé.' using errcode = 'P0001';
    end if;
    if p_proof_kind is not null and p_proof_kind not in ('devis_signe', 'manuel') then
      raise exception 'Justificatif non reconnu.' using errcode = 'P0001';
    end if;
    if v_open.id is not null and v_open.status = 'confirmee' and v_open.idempotency_key = p_idempotency_key then
      return jsonb_build_object(
        'ok', true,
        'identical', true,
        'status', 'confirmee',
        'amountTtc', v_open.amount_ttc,
        'amountSource', 'devis.total_ttc'
      );
    end if;
    if v_open.id is not null and v_open.status = 'confirmee' then
      raise exception 'Cette vente est déjà confirmée.' using errcode = '23505';
    end if;
    if v_open.id is not null and v_open.status = 'demande' and p_proof_digest is not null and p_proof_digest is distinct from v_open.proof_digest then
      raise exception 'Le justificatif ne correspond pas à la demande.' using errcode = 'P0001';
    end if;
    if v_open.id is null and (p_proof_digest is null or p_declared_signature_on is null) then
      raise exception 'Le justificatif doit être le PDF signé.' using errcode = 'P0001';
    end if;

    update public.devis
    set statut = 'Accepté',
        updated_at = now()
    where id = v_devis.id;

    if v_prospect is not null then
      update public.commercial_opportunities
      set stage = 'Gagné',
          updated_at = now()
      where id = v_prospect
        and organization_id = v_devis.organization_id;
      if found then
        v_link := 'reliée';
      end if;
    end if;

    if v_open.id is not null then
      update public.devis_signatures
      set status = 'confirmee',
          amount_ttc = v_amount,
          prospect_id = v_prospect,
          link_state = v_link,
          replaces_devis_id = coalesce(p_replaces_devis_id, replaces_devis_id),
          confirmed_by = p_actor_id,
          confirmed_by_name = v_profile.full_name,
          confirmed_at = now()
      where id = v_open.id
      returning id into v_signature_id;
    else
      insert into public.devis_signatures (
        organization_id, devis_id, prospect_id, commercial_id, proof_kind, status,
        declared_signature_on, confirmed_by, confirmed_by_name, confirmed_at,
        amount_ttc, storage_path, proof_digest, idempotency_key, link_state, replaces_devis_id
      ) values (
        v_devis.organization_id, v_devis.id, v_prospect, v_devis.commercial_id, coalesce(p_proof_kind, 'manuel'), 'confirmee',
        p_declared_signature_on, p_actor_id, v_profile.full_name, now(),
        v_amount, p_storage_path, p_proof_digest, p_idempotency_key, v_link, p_replaces_devis_id
      )
      returning id into v_signature_id;
    end if;

    insert into public.devis_signature_journal (signature_id, devis_id, action, actor_id, actor_name, amount_ttc)
    values (v_signature_id, v_devis.id, 'confirmation', p_actor_id, v_profile.full_name, v_amount);

    if v_previous.id is not null then
      update public.devis_signatures
      set status = 'remplacee',
          replaced_by_devis_id = p_devis_id
      where id = v_previous.id
        and status = 'confirmee';
      insert into public.devis_signature_journal (signature_id, devis_id, action, actor_id, actor_name, amount_ttc)
      values (v_previous.id, v_previous.devis_id, 'remplacement', p_actor_id, v_profile.full_name, v_previous.amount_ttc);
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', 'confirmee',
      'amountTtc', v_amount,
      'amountSource', 'devis.total_ttc',
      'devisStatus', 'Accepté',
      'opportunityStage', case when v_link = 'reliée' then 'Gagné' else null end,
      'linkState', v_link
    );
  end if;

  if v_action = 'annuler' then
    if not public.sale_profile_can_confirm(v_profile.role, v_profile.modules) then
      raise exception 'Vous ne pouvez pas confirmer cette vente.' using errcode = '42501';
    end if;
    if v_open.id is null or v_open.status is distinct from 'confirmee' then
      raise exception 'Aucune vente confirmée pour ce devis.' using errcode = 'P0002';
    end if;
    if char_length(btrim(coalesce(p_reason, ''))) < 3 then
      raise exception 'Indiquez le motif d’annulation.' using errcode = 'P0001';
    end if;
    update public.devis_signatures
    set status = 'annulee',
        cancel_reason = btrim(p_reason),
        cancelled_by = p_actor_id,
        cancelled_at = now()
    where id = v_open.id
    returning id into v_signature_id;
    insert into public.devis_signature_journal (signature_id, devis_id, action, actor_id, actor_name, amount_ttc, reason)
    values (v_signature_id, v_devis.id, 'annulation', p_actor_id, v_profile.full_name, v_open.amount_ttc, btrim(p_reason));
    return jsonb_build_object('ok', true, 'status', 'annulee', 'devisStatus', 'inchangé');
  end if;

  raise exception 'Action inconnue.' using errcode = 'P0001';
end;
$$;


revoke all on function public.commit_devis_signature(uuid, text, uuid, text, date, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.commit_devis_signature(uuid, text, uuid, text, date, text, text, text, text, uuid) to service_role;
