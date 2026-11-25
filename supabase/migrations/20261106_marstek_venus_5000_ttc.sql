-- Batterie MARSTEK VENUS-E : 5 000 € TTC, TVA catalogue 5,5 % inchangée.

update public.articles
set prix_vente_ht = 4739.34,
    updated_at = now()
where lower(reference) = 'marstek-venus-e'
  and taux_tva = 5.5;
