-- Gamme Technotherm TT-KS 2026 : catégories dans Radiateur électrique, prix de vente = prix net × 5.
-- Prix d’achat = prix net hors taxe de la liste. TVA 10 %.
-- « accumulation » est remplacé par « brique réfractaire » sur les gammes déjà créées.

update public.article_subcategories
set name = replace(name, 'Accumulation', 'Brique réfractaire')
where name like 'Accumulation partielle%';

update public.articles
set sous_categorie = replace(sous_categorie, 'Accumulation', 'Brique réfractaire'),
    description = replace(description, 'accumulation', 'brique réfractaire'),
    description_technique = replace(description_technique, 'accumulation', 'brique réfractaire'),
    updated_at = now()
where source_reference = 'technotherm-preisliste-2026'
  and (
    sous_categorie like 'Accumulation%'
    or description like '%accumulation%'
    or coalesce(description_technique, '') like '%accumulation%'
  );

insert into public.article_brands (organization_id, name, actif)
select o.id, 'Technotherm', true
from public.organizations o
where not exists (
  select 1 from public.article_brands b
  where b.organization_id = o.id and lower(b.name) = 'technotherm'
);

insert into public.article_subcategories (organization_id, category_id, name, sort_order)
select c.organization_id, c.id, v.name, v.sort_order
from public.article_categories c
join (values
  ('Brique réfractaire partielle standard blanc', 21),
  ('Brique réfractaire partielle standard anthracite', 22),
  ('Brique réfractaire partielle bas blanc', 23),
  ('Brique réfractaire partielle bas anthracite', 24),
  ('Brique réfractaire partielle haut blanc', 25),
  ('Brique réfractaire partielle haut anthracite', 26),
  ('Plat standard blanc', 27),
  ('Plat standard anthracite', 28),
  ('Plat haut blanc', 29),
  ('Plat haut anthracite', 30),
  ('Plat bas blanc', 31),
  ('Plat bas anthracite', 32),
  ('Accessoires', 33)
) as v(name, sort_order) on lower(c.name) = 'chauffage'
where not exists (
  select 1 from public.article_subcategories s
  where s.organization_id = c.organization_id
    and s.category_id = c.id
    and lower(s.name) = lower(v.name)
);

insert into public.articles (
  organization_id, reference, designation, description, description_technique,
  categorie, sous_categorie, category_id, subcategory_id, marque, brand_id,
  prix_achat_ht, prix_vente_ht, taux_tva, unite, actif, power_w, source_reference
)
select
  o.id,
  v.reference,
  v.designation,
  v.description,
  v.description_technique,
  'Chauffage',
  v.sous_categorie,
  c.id,
  s.id,
  'Technotherm',
  b.id,
  v.prix_achat_ht::numeric,
  v.prix_vente_ht::numeric,
  10,
  'Unité',
  true,
  v.power_w::numeric,
  'technotherm-preisliste-2026'
from public.organizations o
join (values
  ('450605985', 'TT-KS 500 S — blanc', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 0,5 kW. Dimensions (L × H × P) 380 × 630 × 70 mm. Poids environ 22 kg.', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 0,5 kW. Dimensions (L × H × P) 380 × 630 × 70 mm. Poids environ 22 kg. Référence constructeur 450605985.', 'Brique réfractaire partielle standard blanc', 275.50, 1377.50, 500),
  ('450610985', 'TT-KS 1000 S — blanc', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 1,0 kW. Dimensions (L × H × P) 680 × 630 × 70 mm. Poids environ 36 kg.', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 1,0 kW. Dimensions (L × H × P) 680 × 630 × 70 mm. Poids environ 36 kg. Référence constructeur 450610985.', 'Brique réfractaire partielle standard blanc', 369.04, 1845.20, 1000),
  ('450612985', 'TT-KS 1200 S — blanc', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 1,2 kW. Dimensions (L × H × P) 680 × 630 × 70 mm. Poids environ 36 kg.', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 1,2 kW. Dimensions (L × H × P) 680 × 630 × 70 mm. Poids environ 36 kg. Référence constructeur 450612985.', 'Brique réfractaire partielle standard blanc', 392.14, 1960.70, 1200),
  ('450615985', 'TT-KS 1500 S — blanc', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 1,5 kW. Dimensions (L × H × P) 980 × 630 × 70 mm. Poids environ 50 kg.', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 1,5 kW. Dimensions (L × H × P) 980 × 630 × 70 mm. Poids environ 50 kg. Référence constructeur 450615985.', 'Brique réfractaire partielle standard blanc', 426.01, 2130.05, 1500),
  ('450618985', 'TT-KS 1800 S — blanc', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 1,8 kW. Dimensions (L × H × P) 980 × 630 × 70 mm. Poids environ 50 kg.', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 1,8 kW. Dimensions (L × H × P) 980 × 630 × 70 mm. Poids environ 50 kg. Référence constructeur 450618985.', 'Brique réfractaire partielle standard blanc', 432.56, 2162.80, 1800),
  ('450620985', 'TT-KS 2000 S — blanc', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 2,0 kW. Dimensions (L × H × P) 1280 × 630 × 70 mm. Poids environ 62 kg.', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 2,0 kW. Dimensions (L × H × P) 1280 × 630 × 70 mm. Poids environ 62 kg. Référence constructeur 450620985.', 'Brique réfractaire partielle standard blanc', 446.03, 2230.15, 2000),
  ('450624985', 'TT-KS 2400 S — blanc', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 2,4 kW. Dimensions (L × H × P) 1280 × 630 × 70 mm. Poids environ 62 kg.', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 2,4 kW. Dimensions (L × H × P) 1280 × 630 × 70 mm. Poids environ 62 kg. Référence constructeur 450624985.', 'Brique réfractaire partielle standard blanc', 461.43, 2307.15, 2400),
  ('450628985', 'TT-KS 2800 S — blanc', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 2,8 kW. Dimensions (L × H × P) 1580 × 630 × 70 mm. Poids environ 82 kg.', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 2,8 kW. Dimensions (L × H × P) 1580 × 630 × 70 mm. Poids environ 82 kg. Référence constructeur 450628985.', 'Brique réfractaire partielle standard blanc', 501.84, 2509.20, 2800),
  ('451605985', 'TT-KS 500 S — anthracite', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 0,5 kW. Dimensions (L × H × P) 380 × 630 × 70 mm. Poids environ 22 kg.', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 0,5 kW. Dimensions (L × H × P) 380 × 630 × 70 mm. Poids environ 22 kg. Référence constructeur 451605985.', 'Brique réfractaire partielle standard anthracite', 353.77, 1768.85, 500),
  ('451610985', 'TT-KS 1000 S — anthracite', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 1,0 kW. Dimensions (L × H × P) 680 × 630 × 70 mm. Poids environ 36 kg.', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 1,0 kW. Dimensions (L × H × P) 680 × 630 × 70 mm. Poids environ 36 kg. Référence constructeur 451610985.', 'Brique réfractaire partielle standard anthracite', 447.31, 2236.55, 1000),
  ('451612985', 'TT-KS 1200 S — anthracite', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 1,2 kW. Dimensions (L × H × P) 680 × 630 × 70 mm. Poids environ 36 kg.', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 1,2 kW. Dimensions (L × H × P) 680 × 630 × 70 mm. Poids environ 36 kg. Référence constructeur 451612985.', 'Brique réfractaire partielle standard anthracite', 470.40, 2352.00, 1200),
  ('451615985', 'TT-KS 1500 S — anthracite', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 1,5 kW. Dimensions (L × H × P) 980 × 630 × 70 mm. Poids environ 50 kg.', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 1,5 kW. Dimensions (L × H × P) 980 × 630 × 70 mm. Poids environ 50 kg. Référence constructeur 451615985.', 'Brique réfractaire partielle standard anthracite', 504.28, 2521.40, 1500),
  ('451618985', 'TT-KS 1800 S — anthracite', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 1,8 kW. Dimensions (L × H × P) 980 × 630 × 70 mm. Poids environ 50 kg.', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 1,8 kW. Dimensions (L × H × P) 980 × 630 × 70 mm. Poids environ 50 kg. Référence constructeur 451618985.', 'Brique réfractaire partielle standard anthracite', 510.82, 2554.10, 1800),
  ('451620985', 'TT-KS 2000 S — anthracite', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 2,0 kW. Dimensions (L × H × P) 1280 × 630 × 70 mm. Poids environ 62 kg.', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 2,0 kW. Dimensions (L × H × P) 1280 × 630 × 70 mm. Poids environ 62 kg. Référence constructeur 451620985.', 'Brique réfractaire partielle standard anthracite', 524.30, 2621.50, 2000),
  ('451624985', 'TT-KS 2400 S — anthracite', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 2,4 kW. Dimensions (L × H × P) 1280 × 630 × 70 mm. Poids environ 62 kg.', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 2,4 kW. Dimensions (L × H × P) 1280 × 630 × 70 mm. Poids environ 62 kg. Référence constructeur 451624985.', 'Brique réfractaire partielle standard anthracite', 539.69, 2698.45, 2400),
  ('451628985', 'TT-KS 2800 S — anthracite', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 2,8 kW. Dimensions (L × H × P) 1580 × 630 × 70 mm. Poids environ 82 kg.', 'Radiateur électrique à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 2,8 kW. Dimensions (L × H × P) 1580 × 630 × 70 mm. Poids environ 82 kg. Référence constructeur 451628985.', 'Brique réfractaire partielle standard anthracite', 580.11, 2900.55, 2800),
  ('450308985', 'TT-KS 800 N — blanc', 'Radiateur électrique à brique réfractaire partielle bas, thermostat DSD, finition blanc. Puissance 0,8 kW. Dimensions (L × H × P) 680 × 340 × 70 mm. Poids environ 21 kg.', 'Radiateur électrique à brique réfractaire partielle bas, thermostat DSD, finition blanc. Puissance 0,8 kW. Dimensions (L × H × P) 680 × 340 × 70 mm. Poids environ 21 kg. Référence constructeur 450308985.', 'Brique réfractaire partielle bas blanc', 285.13, 1425.65, 800),
  ('450312985', 'TT-KS 1200 N — blanc', 'Radiateur électrique à brique réfractaire partielle bas, thermostat DSD, finition blanc. Puissance 1,2 kW. Dimensions (L × H × P) 980 × 340 × 70 mm. Poids environ 24,5 kg.', 'Radiateur électrique à brique réfractaire partielle bas, thermostat DSD, finition blanc. Puissance 1,2 kW. Dimensions (L × H × P) 980 × 340 × 70 mm. Poids environ 24,5 kg. Référence constructeur 450312985.', 'Brique réfractaire partielle bas blanc', 354.41, 1772.05, 1200),
  ('450316985', 'TT-KS 1600 N — blanc', 'Radiateur électrique à brique réfractaire partielle bas, thermostat DSD, finition blanc. Puissance 1,6 kW. Dimensions (L × H × P) 1280 × 340 × 70 mm. Poids environ 34,5 kg.', 'Radiateur électrique à brique réfractaire partielle bas, thermostat DSD, finition blanc. Puissance 1,6 kW. Dimensions (L × H × P) 1280 × 340 × 70 mm. Poids environ 34,5 kg. Référence constructeur 450316985.', 'Brique réfractaire partielle bas blanc', 418.31, 2091.55, 1600),
  ('450320985', 'TT-KS 2000 N — blanc', 'Radiateur électrique à brique réfractaire partielle bas, thermostat DSD, finition blanc. Puissance 2,0 kW. Dimensions (L × H × P) 1580 × 340 × 70 mm. Poids environ 38 kg.', 'Radiateur électrique à brique réfractaire partielle bas, thermostat DSD, finition blanc. Puissance 2,0 kW. Dimensions (L × H × P) 1580 × 340 × 70 mm. Poids environ 38 kg. Référence constructeur 450320985.', 'Brique réfractaire partielle bas blanc', 426.78, 2133.90, 2000),
  ('451308985', 'TT-KS 800 N — anthracite', 'Radiateur électrique à brique réfractaire partielle bas, thermostat DSD, finition anthracite. Puissance 0,8 kW. Dimensions (L × H × P) 680 × 340 × 70 mm. Poids environ 21 kg.', 'Radiateur électrique à brique réfractaire partielle bas, thermostat DSD, finition anthracite. Puissance 0,8 kW. Dimensions (L × H × P) 680 × 340 × 70 mm. Poids environ 21 kg. Référence constructeur 451308985.', 'Brique réfractaire partielle bas anthracite', 363.40, 1817.00, 800),
  ('451312985', 'TT-KS 1200 N — anthracite', 'Radiateur électrique à brique réfractaire partielle bas, thermostat DSD, finition anthracite. Puissance 1,2 kW. Dimensions (L × H × P) 980 × 340 × 70 mm. Poids environ 24,5 kg.', 'Radiateur électrique à brique réfractaire partielle bas, thermostat DSD, finition anthracite. Puissance 1,2 kW. Dimensions (L × H × P) 980 × 340 × 70 mm. Poids environ 24,5 kg. Référence constructeur 451312985.', 'Brique réfractaire partielle bas anthracite', 432.68, 2163.40, 1200),
  ('451316985', 'TT-KS 1600 N — anthracite', 'Radiateur électrique à brique réfractaire partielle bas, thermostat DSD, finition anthracite. Puissance 1,6 kW. Dimensions (L × H × P) 1280 × 340 × 70 mm. Poids environ 34,5 kg.', 'Radiateur électrique à brique réfractaire partielle bas, thermostat DSD, finition anthracite. Puissance 1,6 kW. Dimensions (L × H × P) 1280 × 340 × 70 mm. Poids environ 34,5 kg. Référence constructeur 451316985.', 'Brique réfractaire partielle bas anthracite', 496.58, 2482.90, 1600),
  ('451320985', 'TT-KS 2000 N — anthracite', 'Radiateur électrique à brique réfractaire partielle bas, thermostat DSD, finition anthracite. Puissance 2,0 kW. Dimensions (L × H × P) 1580 × 340 × 70 mm. Poids environ 38 kg.', 'Radiateur électrique à brique réfractaire partielle bas, thermostat DSD, finition anthracite. Puissance 2,0 kW. Dimensions (L × H × P) 1580 × 340 × 70 mm. Poids environ 38 kg. Référence constructeur 451320985.', 'Brique réfractaire partielle bas anthracite', 505.05, 2525.25, 2000),
  ('450112985', 'TT-KS 1200 H — blanc', 'Radiateur électrique à brique réfractaire partielle haut, thermostat DSD, finition blanc. Puissance 1,2 kW. Dimensions (L × H × P) 380 × 1240 × 70 mm. Poids environ 35 kg.', 'Radiateur électrique à brique réfractaire partielle haut, thermostat DSD, finition blanc. Puissance 1,2 kW. Dimensions (L × H × P) 380 × 1240 × 70 mm. Poids environ 35 kg. Référence constructeur 450112985.', 'Brique réfractaire partielle haut blanc', 407.92, 2039.60, 1200),
  ('450118985', 'TT-KS 1800 H — blanc', 'Radiateur électrique à brique réfractaire partielle haut, thermostat DSD, finition blanc. Puissance 1,8 kW. Dimensions (L × H × P) 550 × 1240 × 70 mm. Poids environ 58 kg.', 'Radiateur électrique à brique réfractaire partielle haut, thermostat DSD, finition blanc. Puissance 1,8 kW. Dimensions (L × H × P) 550 × 1240 × 70 mm. Poids environ 58 kg. Référence constructeur 450118985.', 'Brique réfractaire partielle haut blanc', 446.80, 2234.00, 1800),
  ('450122985', 'TT-KS 2200 H — blanc', 'Radiateur électrique à brique réfractaire partielle haut, thermostat DSD, finition blanc. Puissance 2,2 kW. Dimensions (L × H × P) 680 × 1240 × 70 mm. Poids environ 66 kg.', 'Radiateur électrique à brique réfractaire partielle haut, thermostat DSD, finition blanc. Puissance 2,2 kW. Dimensions (L × H × P) 680 × 1240 × 70 mm. Poids environ 66 kg. Référence constructeur 450122985.', 'Brique réfractaire partielle haut blanc', 495.69, 2478.45, 2200),
  ('451112985', 'TT-KS 1200 H — anthracite', 'Radiateur électrique à brique réfractaire partielle haut, thermostat DSD, finition anthracite. Puissance 1,2 kW. Dimensions (L × H × P) 380 × 1240 × 70 mm. Poids environ 35 kg.', 'Radiateur électrique à brique réfractaire partielle haut, thermostat DSD, finition anthracite. Puissance 1,2 kW. Dimensions (L × H × P) 380 × 1240 × 70 mm. Poids environ 35 kg. Référence constructeur 451112985.', 'Brique réfractaire partielle haut anthracite', 486.19, 2430.95, 1200),
  ('451118985', 'TT-KS 1800 H — anthracite', 'Radiateur électrique à brique réfractaire partielle haut, thermostat DSD, finition anthracite. Puissance 1,8 kW. Dimensions (L × H × P) 550 × 1240 × 70 mm. Poids environ 58 kg.', 'Radiateur électrique à brique réfractaire partielle haut, thermostat DSD, finition anthracite. Puissance 1,8 kW. Dimensions (L × H × P) 550 × 1240 × 70 mm. Poids environ 58 kg. Référence constructeur 451118985.', 'Brique réfractaire partielle haut anthracite', 525.06, 2625.30, 1800),
  ('451122985', 'TT-KS 2200 H — anthracite', 'Radiateur électrique à brique réfractaire partielle haut, thermostat DSD, finition anthracite. Puissance 2,2 kW. Dimensions (L × H × P) 680 × 1240 × 70 mm. Poids environ 66 kg.', 'Radiateur électrique à brique réfractaire partielle haut, thermostat DSD, finition anthracite. Puissance 2,2 kW. Dimensions (L × H × P) 680 × 1240 × 70 mm. Poids environ 66 kg. Référence constructeur 451122985.', 'Brique réfractaire partielle haut anthracite', 573.95, 2869.75, 2200),
  ('450605185', 'TT-KS Flat 500 S — blanc', 'Radiateur électrique plat à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 0,5 kW. Dimensions (L × H × P) 380 × 630 × 70 mm. Poids environ 36 kg.', 'Radiateur électrique plat à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 0,5 kW. Dimensions (L × H × P) 380 × 630 × 70 mm. Poids environ 36 kg. Référence constructeur 450605185.', 'Plat standard blanc', 259.59, 1297.95, 500),
  ('450610185', 'TT-KS Flat 1000 S — blanc', 'Radiateur électrique plat à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 1,0 kW. Dimensions (L × H × P) 680 × 630 × 70 mm. Poids environ 36 kg.', 'Radiateur électrique plat à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 1,0 kW. Dimensions (L × H × P) 680 × 630 × 70 mm. Poids environ 36 kg. Référence constructeur 450610185.', 'Plat standard blanc', 347.51, 1737.55, 1000),
  ('450615185', 'TT-KS Flat 1500 S — blanc', 'Radiateur électrique plat à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 1,5 kW. Dimensions (L × H × P) 980 × 630 × 70 mm. Poids environ 50 kg.', 'Radiateur électrique plat à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 1,5 kW. Dimensions (L × H × P) 980 × 630 × 70 mm. Poids environ 50 kg. Référence constructeur 450615185.', 'Plat standard blanc', 401.07, 2005.35, 1500),
  ('450620185', 'TT-KS Flat 2000 S — blanc', 'Radiateur électrique plat à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 2,0 kW. Dimensions (L × H × P) 1280 × 630 × 70 mm. Poids environ 62 kg.', 'Radiateur électrique plat à brique réfractaire partielle standard, thermostat DSD, finition blanc. Puissance 2,0 kW. Dimensions (L × H × P) 1280 × 630 × 70 mm. Poids environ 62 kg. Référence constructeur 450620185.', 'Plat standard blanc', 419.88, 2099.40, 2000),
  ('450605285', 'TT-KS Flat-Z 500 S — anthracite', 'Radiateur électrique plat à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 0,5 kW. Dimensions (L × H × P) 380 × 630 × 70 mm. Poids environ 36 kg.', 'Radiateur électrique plat à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 0,5 kW. Dimensions (L × H × P) 380 × 630 × 70 mm. Poids environ 36 kg. Référence constructeur 450605285.', 'Plat standard anthracite', 337.85, 1689.25, 500),
  ('450610285', 'TT-KS Flat-Z 1000 S — anthracite', 'Radiateur électrique plat à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 1,0 kW. Dimensions (L × H × P) 680 × 630 × 70 mm. Poids environ 36 kg.', 'Radiateur électrique plat à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 1,0 kW. Dimensions (L × H × P) 680 × 630 × 70 mm. Poids environ 36 kg. Référence constructeur 450610285.', 'Plat standard anthracite', 425.78, 2128.90, 1000),
  ('450615285', 'TT-KS Flat-Z 1500 S — anthracite', 'Radiateur électrique plat à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 1,5 kW. Dimensions (L × H × P) 980 × 630 × 70 mm. Poids environ 50 kg.', 'Radiateur électrique plat à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 1,5 kW. Dimensions (L × H × P) 980 × 630 × 70 mm. Poids environ 50 kg. Référence constructeur 450615285.', 'Plat standard anthracite', 479.33, 2396.65, 1500),
  ('450620285', 'TT-KS Flat-Z 2000 S — anthracite', 'Radiateur électrique plat à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 2,0 kW. Dimensions (L × H × P) 1280 × 630 × 70 mm. Poids environ 62 kg.', 'Radiateur électrique plat à brique réfractaire partielle standard, thermostat DSD, finition anthracite. Puissance 2,0 kW. Dimensions (L × H × P) 1280 × 630 × 70 mm. Poids environ 62 kg. Référence constructeur 450620285.', 'Plat standard anthracite', 498.15, 2490.75, 2000),
  ('450110185', 'TT-KS Flat 1000 H — blanc', 'Radiateur électrique plat à brique réfractaire partielle haut, thermostat DSD, finition blanc. Puissance 1,0 kW. Dimensions (L × H × P) 380 × 1240 × 70 mm. Poids environ 35 kg.', 'Radiateur électrique plat à brique réfractaire partielle haut, thermostat DSD, finition blanc. Puissance 1,0 kW. Dimensions (L × H × P) 380 × 1240 × 70 mm. Poids environ 35 kg. Référence constructeur 450110185.', 'Plat haut blanc', 377.19, 1885.95, 1000),
  ('450115185', 'TT-KS Flat 1500 H — blanc', 'Radiateur électrique plat à brique réfractaire partielle haut, thermostat DSD, finition blanc. Puissance 1,5 kW. Dimensions (L × H × P) 550 × 1240 × 70 mm. Poids environ 58 kg.', 'Radiateur électrique plat à brique réfractaire partielle haut, thermostat DSD, finition blanc. Puissance 1,5 kW. Dimensions (L × H × P) 550 × 1240 × 70 mm. Poids environ 58 kg. Référence constructeur 450115185.', 'Plat haut blanc', 415.90, 2079.50, 1500),
  ('450110285', 'TT-KS Flat-Z 1000 H — anthracite', 'Radiateur électrique plat à brique réfractaire partielle haut, thermostat DSD, finition anthracite. Puissance 1,0 kW. Dimensions (L × H × P) 380 × 1240 × 70 mm. Poids environ 35 kg.', 'Radiateur électrique plat à brique réfractaire partielle haut, thermostat DSD, finition anthracite. Puissance 1,0 kW. Dimensions (L × H × P) 380 × 1240 × 70 mm. Poids environ 35 kg. Référence constructeur 450110285.', 'Plat haut anthracite', 455.45, 2277.25, 1000),
  ('450115285', 'TT-KS Flat-Z 1500 H — anthracite', 'Radiateur électrique plat à brique réfractaire partielle haut, thermostat DSD, finition anthracite. Puissance 1,5 kW. Dimensions (L × H × P) 550 × 1240 × 70 mm. Poids environ 58 kg.', 'Radiateur électrique plat à brique réfractaire partielle haut, thermostat DSD, finition anthracite. Puissance 1,5 kW. Dimensions (L × H × P) 550 × 1240 × 70 mm. Poids environ 58 kg. Référence constructeur 450115285.', 'Plat haut anthracite', 494.17, 2470.85, 1500),
  ('450308185', 'TT-KS Flat 800 N — blanc', 'Radiateur électrique plat à brique réfractaire partielle bas, thermostat DSD, finition blanc. Puissance 0,5 kW. Dimensions (L × H × P) 680 × 340 × 70 mm. Poids environ 21 kg.', 'Radiateur électrique plat à brique réfractaire partielle bas, thermostat DSD, finition blanc. Puissance 0,5 kW. Dimensions (L × H × P) 680 × 340 × 70 mm. Poids environ 21 kg. Référence constructeur 450308185.', 'Plat bas blanc', 268.64, 1343.20, 500),
  ('450312185', 'TT-KS Flat 1200 N — blanc', 'Radiateur électrique plat à brique réfractaire partielle bas, thermostat DSD, finition blanc. Puissance 1,2 kW. Dimensions (L × H × P) 680 × 340 × 70 mm. Poids environ 24,5 kg.', 'Radiateur électrique plat à brique réfractaire partielle bas, thermostat DSD, finition blanc. Puissance 1,2 kW. Dimensions (L × H × P) 680 × 340 × 70 mm. Poids environ 24,5 kg. Référence constructeur 450312185.', 'Plat bas blanc', 333.76, 1668.80, 1200),
  ('450316185', 'TT-KS Flat 1600 N — blanc', 'Radiateur électrique plat à brique réfractaire partielle bas, thermostat DSD, finition blanc. Puissance 1,6 kW. Dimensions (L × H × P) 680 × 340 × 70 mm. Poids environ 35,5 kg.', 'Radiateur électrique plat à brique réfractaire partielle bas, thermostat DSD, finition blanc. Puissance 1,6 kW. Dimensions (L × H × P) 680 × 340 × 70 mm. Poids environ 35,5 kg. Référence constructeur 450316185.', 'Plat bas blanc', 393.83, 1969.15, 1600),
  ('450308285', 'TT-KS Flat-Z 800 — anthracite', 'Radiateur électrique plat à brique réfractaire partielle bas, thermostat DSD, finition anthracite. Puissance 0,5 kW. Dimensions (L × H × P) 680 × 340 × 70 mm. Poids environ 21 kg.', 'Radiateur électrique plat à brique réfractaire partielle bas, thermostat DSD, finition anthracite. Puissance 0,5 kW. Dimensions (L × H × P) 680 × 340 × 70 mm. Poids environ 21 kg. Référence constructeur 450308285.', 'Plat bas anthracite', 346.90, 1734.50, 500),
  ('450312285', 'TT-KS Flat-Z 1200 N — anthracite', 'Radiateur électrique plat à brique réfractaire partielle bas, thermostat DSD, finition anthracite. Puissance 1,2 kW. Dimensions (L × H × P) 680 × 340 × 70 mm. Poids environ 24,5 kg.', 'Radiateur électrique plat à brique réfractaire partielle bas, thermostat DSD, finition anthracite. Puissance 1,2 kW. Dimensions (L × H × P) 680 × 340 × 70 mm. Poids environ 24,5 kg. Référence constructeur 450312285.', 'Plat bas anthracite', 412.03, 2060.15, 1200),
  ('450316285', 'TT-KS Flat-Z 1600 N — anthracite', 'Radiateur électrique plat à brique réfractaire partielle bas, thermostat DSD, finition anthracite. Puissance 1,6 kW. Dimensions (L × H × P) 680 × 340 × 70 mm. Poids environ 35,5 kg.', 'Radiateur électrique plat à brique réfractaire partielle bas, thermostat DSD, finition anthracite. Puissance 1,6 kW. Dimensions (L × H × P) 680 × 340 × 70 mm. Poids environ 35,5 kg. Référence constructeur 450316285.', 'Plat bas anthracite', 472.10, 2360.50, 1600),
  ('450912965', 'Roulettes TT-KS standard, paire, blanc RAL 9003', 'Paire de roulettes pour radiateur à brique réfractaire TT-KS, blanc RAL 9003. Poids environ 1,5 kg.', 'Paire de roulettes pour radiateur à brique réfractaire TT-KS, blanc RAL 9003. Poids environ 1,5 kg. Référence constructeur 450912965.', 'Accessoires', 21.56, 107.80, null),
  ('450910965', 'Pieds TT-KS standard, paire, blanc RAL 9003', 'Paire de pieds pour radiateur à brique réfractaire TT-KS, blanc RAL 9003. Poids environ 1,5 kg.', 'Paire de pieds pour radiateur à brique réfractaire TT-KS, blanc RAL 9003. Poids environ 1,5 kg. Référence constructeur 450910965.', 'Accessoires', 21.56, 107.80, null),
  ('150-RAL-TT-KS', 'Supplément teinte RAL — radiateur à brique réfractaire TT-KS', 'Supplément pour une teinte RAL au choix sur un radiateur à brique réfractaire partielle TT-KS ou TT-KS Flat.', 'Supplément pour une teinte RAL au choix sur un radiateur à brique réfractaire partielle TT-KS ou TT-KS Flat. Référence constructeur 150-RAL-TT-KS.', 'Accessoires', 78.27, 391.35, null),
  ('150-RAL-VPS', 'Supplément teinte RAL — panneau rayonnant électrique', 'Supplément pour une teinte RAL au choix sur un panneau rayonnant électrique VPS, SPH ou CHM.', 'Supplément pour une teinte RAL au choix sur un panneau rayonnant électrique VPS, SPH ou CHM. Référence constructeur 150-RAL-VPS.', 'Accessoires', 44.30, 221.50, null),
  ('150-IPX4-TT-KS', 'Supplément protection IPX4 — radiateur TT-KS', 'Supplément de protection contre les projections d’eau IPX4 pour un radiateur à brique réfractaire partielle TT-KS.', 'Supplément de protection contre les projections d’eau IPX4 pour un radiateur à brique réfractaire partielle TT-KS. Référence constructeur 150-IPX4-TT-KS.', 'Accessoires', 19.25, 96.25, null)
) as v(reference, designation, description, description_technique, sous_categorie, prix_achat_ht, prix_vente_ht, power_w) on true
left join public.article_categories c
  on c.organization_id = o.id and lower(c.name) = 'chauffage'
left join public.article_subcategories s
  on s.organization_id = o.id and s.category_id = c.id and lower(s.name) = lower(v.sous_categorie)
left join public.article_brands b
  on b.organization_id = o.id and lower(b.name) = 'technotherm'
where not exists (
  select 1 from public.articles a
  where a.organization_id = o.id and lower(a.reference) = lower(v.reference)
);

update public.articles
set prix_vente_ht = round(prix_achat_ht * 5, 2),
    taux_tva = 10,
    updated_at = now()
where source_reference = 'technotherm-preisliste-2026'
  and (
    prix_vente_ht is distinct from round(prix_achat_ht * 5, 2)
    or taux_tva is distinct from 10
  );
