-- TVA 5,5 % pour la climatisation et les articles pompe à chaleur RO.
-- À coller dans Supabase → SQL Editor.

update public.articles
set taux_tva = 5.5,
    updated_at = now()
where taux_tva is distinct from 5.5
  and (
    lower(translate(coalesce(categorie, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like 'climatis%'
    or lower(translate(coalesce(sous_categorie, ''), 'àâäéèêëïîôùûüç', 'aaaeeeeiioouuuc')) like 'climatis%'
    or (
      lower(translate(
        coalesce(designation, '') || ' ' || coalesce(reference, '') || ' ' || coalesce(categorie, '') || ' ' || coalesce(sous_categorie, ''),
        'àâäéèêëïîôùûüç',
        'aaaeeeeiioouuuc'
      )) ~ '(pompe a chaleur|(^|[^a-z0-9])pac([^a-z0-9]|$))'
      and lower(translate(
        coalesce(designation, '') || ' ' || coalesce(reference, '') || ' ' || coalesce(sous_categorie, ''),
        'àâäéèêëïîôùûüç',
        'aaaeeeeiioouuuc'
      )) ~ '(^|[^a-z0-9])ro([^a-z0-9]|$)'
    )
  );
