-- Arrivée d'un prospect, de la demande web à la fiche visible au dispatch.
--
-- Trois origines sont rejouées sur la vraie base : Google Ads, Facebook et
-- Site Internet. Chacune parcourt la file réelle — mise en file, réservation,
-- création de la fiche, attribution, clôture — puis subit une relance, pour
-- vérifier qu'aucun doublon n'apparaît.
--
-- À exécuter dans une transaction annulée : tout est défait à la fin.

create temporary table arrivee (
  rang serial,
  origine text,
  etape text,
  verdict text,
  detail text
) on commit drop;

do $$
declare
  org uuid;
  cas record;
  soumission text;
  file_id uuid;
  reserve_id uuid;
  opp uuid;
  statut text;
  libelle_vu text;
  attribue record;
  lignes integer;
  rejoue boolean;
begin
  select id into org from public.organizations order by created_at limit 1;

  for cas in
    select * from (values
      -- catégorie,    sous-type,  libellé commercial attendu, preuve,  campagne
      ('google_ads',  null,        'Prospect GG Ads', 'gclid',  'PAC hiver', 'gclid'),
      ('meta_ads',    'facebook',  'Prospect Face',   'fbclid', 'PV automne', 'fbclid'),
      ('site_web',    'seo',       'Prospect Site',   'referrer', null,       null)
    ) as t(categorie, sous_type, libelle, preuve, campagne, clic)
  loop
    -- La contrainte impose entre 8 et 128 caractères.
    soumission := cas.categorie || '-' || substr(md5(random()::text), 1, 16);

    -- ----- 1. Mise en file, comme le fait la route d'ingestion -----
    begin
      -- La fonction renvoie une table : identifiant, horodatage, statut, et
      -- un indicateur `duplicate` qui dit si la demande existait déjà.
      select id, status into file_id, statut
        from public.enqueue_web_lead(
          org, soumission, 'lead',
          jsonb_build_object('categorie', cas.categorie, 'nom', 'Essai recette'),
          now(), 30);
      insert into arrivee (origine, etape, verdict, detail)
      values (cas.libelle, '1. mise en file',
              case when statut = 'pending' then 'réussi' else 'ÉCHOUÉ' end,
              'demande ' || statut);
    exception when others then
      insert into arrivee (origine, etape, verdict, detail)
      values (cas.libelle, '1. mise en file', 'ÉCHOUÉ', sqlerrm);
      continue;
    end;

    -- ----- 2. Réservation atomique par un traitant -----
    begin
      select id into reserve_id
        from public.reserve_web_leads('essai-recette', 10)
       where submission_id = soumission;
      insert into arrivee (origine, etape, verdict, detail)
      values (cas.libelle, '2. réservation',
              case when reserve_id is not null then 'réussi' else 'ÉCHOUÉ' end,
              coalesce('réservée', 'non réservée'));
    exception when others then
      insert into arrivee (origine, etape, verdict, detail)
      values (cas.libelle, '2. réservation', 'ÉCHOUÉ', sqlerrm);
      continue;
    end;

    -- ----- 3. Création de la fiche prospect -----
    begin
      opp := gen_random_uuid();
      insert into public.commercial_opportunities
        (id, organization_id, name, source, origin_channel, origin_category,
         origin_subtype, extra)
      values (opp, org, 'Prospect essai ' || cas.categorie, cas.libelle,
              'web_ingest', cas.categorie, cas.sous_type,
              jsonb_build_object('webLead',
                jsonb_build_object('submissionId', soumission)));

      select source into libelle_vu from public.commercial_opportunities where id = opp;
      insert into arrivee (origine, etape, verdict, detail)
      values (cas.libelle, '3. fiche créée',
              case when libelle_vu = cas.libelle then 'réussi' else 'ÉCHOUÉ' end,
              'libellé affiché : ' || libelle_vu);
    exception when others then
      insert into arrivee (origine, etape, verdict, detail)
      values (cas.libelle, '3. fiche créée', 'ÉCHOUÉ', sqlerrm);
      continue;
    end;

    -- ----- 4. Attribution du premier contact -----
    begin
      insert into public.lead_attribution
        (organization_id, opportunity_id, origin_channel, origin_category,
         origin_subtype, submission_id, touch_role, evidence, campaign_name,
         click_kind, click_id, touched_at)
      values (org, opp, 'web_ingest', cas.categorie, cas.sous_type, soumission,
              'premier', cas.preuve, cas.campagne, cas.clic,
              case when cas.clic is not null then 'essai-' || soumission end,
              now());

      select origin_category, touch_role, evidence into attribue
        from public.lead_attribution
       where opportunity_id = opp and touch_role = 'premier';

      insert into arrivee (origine, etape, verdict, detail)
      values (cas.libelle, '4. attribution',
              case when attribue.origin_category = cas.categorie then 'réussi' else 'ÉCHOUÉ' end,
              'premier contact ' || attribue.origin_category || ', preuve ' || attribue.evidence);
    exception when others then
      insert into arrivee (origine, etape, verdict, detail)
      values (cas.libelle, '4. attribution', 'ÉCHOUÉ', sqlerrm);
      continue;
    end;

    -- ----- 5. Clôture de la demande -----
    begin
      perform public.settle_web_lead(file_id, 'succeeded', opp, 'new');
      select status into statut from public.web_lead_submissions where id = file_id;
      insert into arrivee (origine, etape, verdict, detail)
      values (cas.libelle, '5. demande clôturée',
              case when statut = 'done' then 'réussi' else 'ÉCHOUÉ' end,
              'statut ' || statut);
    exception when others then
      insert into arrivee (origine, etape, verdict, detail)
      values (cas.libelle, '5. demande clôturée', 'ÉCHOUÉ', sqlerrm);
      continue;
    end;

    -- ----- 6. Relance : la même demande ne doit rien recréer -----
    begin
      select duplicate into rejoue
        from public.enqueue_web_lead(
          org, soumission, 'lead',
          jsonb_build_object('categorie', cas.categorie, 'nom', 'Essai recette'),
          now(), 30);
      select count(*) into lignes from public.web_lead_submissions
       where organization_id = org and submission_id = soumission;
      insert into arrivee (origine, etape, verdict, detail)
      values (cas.libelle, '6. relance sans doublon',
              case when lignes = 1 and rejoue then 'réussi' else 'ÉCHOUÉ' end,
              lignes || ' demande(s), signalée comme rejouée : ' || rejoue);
    exception when others then
      insert into arrivee (origine, etape, verdict, detail)
      values (cas.libelle, '6. relance sans doublon', 'ÉCHOUÉ', sqlerrm);
    end;

    -- ----- 7. Un second prospect pour la même demande est refusé -----
    begin
      insert into public.commercial_opportunities
        (organization_id, name, source, origin_channel, origin_category, extra)
      values (org, 'Doublon ' || cas.categorie, cas.libelle,
              'web_ingest', cas.categorie,
              jsonb_build_object('webLead',
                jsonb_build_object('submissionId', soumission)));
      insert into arrivee (origine, etape, verdict, detail)
      values (cas.libelle, '7. doublon de fiche refusé', 'ÉCHOUÉ', 'accepté');
    exception when unique_violation then
      insert into arrivee (origine, etape, verdict, detail)
      values (cas.libelle, '7. doublon de fiche refusé', 'réussi',
              'refusé par l''index unique');
    when others then
      insert into arrivee (origine, etape, verdict, detail)
      values (cas.libelle, '7. doublon de fiche refusé', 'ÉCHOUÉ', sqlerrm);
    end;
  end loop;
end $$;

-- Une origine publicitaire ne doit jamais pouvoir devenir de la prospection
-- terrain, ni l'inverse : c'est la règle que vous avez posée dès le départ.
insert into arrivee (origine, etape, verdict, detail)
select 'toutes', 'cloisonnement des familles',
       case when bool_and(refuse) then 'réussi' else 'ÉCHOUÉ' end,
       string_agg(essai, ', ' order by essai)
from (values
  ('web_ingest + prospection', not public.origin_pair_is_valid('web_ingest', 'prospection')),
  ('crm_manual + google_ads',  not public.origin_pair_is_valid('crm_manual', 'google_ads')),
  ('crm_manual + meta_ads',    not public.origin_pair_is_valid('crm_manual', 'meta_ads'))
) as t(essai, refuse);

select rang, origine, etape, verdict, detail from arrivee order by rang;

select verdict, count(*) as nombre from arrivee group by verdict order by verdict;
