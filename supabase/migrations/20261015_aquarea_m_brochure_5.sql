-- Brochure Aquarea R290, dernière étape. Lancez ce fichier après les morceaux 1 à 4.
-- Il attache le PDF aux articles et retire la table temporaire.

do $$
declare
  v_b64 text;
  v_count integer;
begin
  select count(*) into v_count from public._aquarea_brochure_part;
  if v_count <> 4 then
    raise exception 'Morceaux incomplets (% sur 4). Relancez les fichiers 1 à 4.', v_count;
  end if;
  select string_agg(part, '' order by n) into v_b64 from public._aquarea_brochure_part;
  if v_b64 is null or length(v_b64) <> 2366064 then
    raise exception 'Brochure incomplète. Relancez les fichiers 1 à 4.';
  end if;
  update public.articles
  set fiche_nom = 'A2W-Aquarea-M_FR.pdf',
      fiche_data = 'data:application/pdf;base64,' || v_b64,
      updated_at = now()
  where source_reference = 'catalogue:aquarea-m-2024'
     or (
       lower(reference) in (
  'wh-wxg09me5',
  'wh-wxg12me5',
  'wh-wxg09me8',
  'wh-wxg12me8',
  'wh-wxg16me8',
  'wh-wxg20me8',
  'wh-wxg25me8',
  'wh-wxg30me8',
  'wh-adc0316m3e52',
  'wh-adc0316m6e52',
  'wh-adc0316m9e82',
  'wh-cme5',
  'wh-cme8',
  'wh-cme8l',
  'cz-rtw2taw1c'
       )
       and lower(coalesce(marque, '')) like '%panasonic%'
     );
  if not found then
    raise exception 'Aucun article Aquarea R290 trouvé. Lancez d''abord 20261015_aquarea_m.sql.';
  end if;
end $$;

drop table if exists public._aquarea_brochure_part;
