-- Modul'O NÉO, Mitsubishi Heavy Industries commercialisé Yack.
-- Fiche produits : FDC100 / FDC125 / FDC140, chacun en VNX monophasé et VSX triphasé.
-- Le module hydraulique YMOH n'est pas créé.
-- Le FDC125VNX (NÉO 14 monophasé) existe déjà : on ne l'écrase pas.
-- La fiche ne donne pas de prix : achat et vente restent à 0.

do $$
declare
  v_org uuid := '00000000-0000-0000-0000-000000000001';
  v_brand_id uuid := '66ae40ea-6e99-4e0b-96bf-6dabb955175c';
  v_brand text := 'MITSUBISHI YACK';
  v_cat_id uuid := '669465a7-7f18-457b-8be8-7347844bd788';
  v_sub_id uuid := 'fcb56b6f-3b55-42bd-bc55-8f4cd9118526';
  v_cat text := 'Chauffage';
  v_sub text := 'Pompe à chaleur';
  v_supply jsonb;
  v_labor jsonb;
  v_row record;
  v_article_id uuid;
  v_garantie text := E'Garantie :\n- 2 ans pièces\n- +1 an pièces et main d''œuvre sous conditions MITSUBISHI YACK\n- 5 ans corps de chauffe, compresseur, échangeur et ballon ECS';
begin
  select jsonb_build_object(
    'articleId', a.id, 'code', a.reference, 'name', a.designation,
    'description', '', 'category', a.categorie, 'subcategory', coalesce(a.sous_categorie, ''),
    'brand', '', 'brandId', '', 'sourceReference', coalesce(a.source_reference, ''),
    'qty', 1, 'price', a.prix_vente_ht, 'buy', a.prix_achat_ht, 'tax', a.taux_tva,
    'unit', coalesce(a.unite, 'Unité'), 'role', 'supply'
  ) into v_supply
  from public.articles a
  where a.organization_id = v_org and a.reference = 'FOURNITURE-PAC' and a.actif is not false;

  select jsonb_build_object(
    'articleId', a.id, 'code', a.reference, 'name', a.designation,
    'description', '', 'category', a.categorie, 'subcategory', coalesce(a.sous_categorie, ''),
    'brand', '', 'brandId', '', 'sourceReference', coalesce(a.source_reference, ''),
    'qty', 1, 'price', a.prix_vente_ht, 'buy', a.prix_achat_ht, 'tax', a.taux_tva,
    'unit', coalesce(a.unite, 'Unité'), 'role', 'labor'
  ) into v_labor
  from public.articles a
  where a.organization_id = v_org and a.reference = 'INST-PAC' and a.actif is not false;

  if v_supply is null or v_labor is null then
    raise exception 'Fourniture ou installation PAC introuvable.';
  end if;

  for v_row in
    select *
    from (values
      (
        'FDC100VNX-MODUL''O-NEO-12-MONO',
        'FDC100VNX MODUL''O NÉO 12 MONO',
        12000,
        $d$FDC100VNX MODUL'O NÉO 12 MONO
Groupe extérieur monophasé. Pompe à chaleur air/eau Modul'O NÉO 12.

Marque : MITSUBISHI YACK
Efficacité énergétique saisonnière - chauffage (35°C/55°C) : 133 % / 116 %
Température de départ maximum : 55 °C
Niveau sonore : 68 dB(A) (unité extérieure)
Ballon ECS intégré : Non
Plage de fonctionnement conseillée mini./maxi. mode chaud : jusqu'à -10 °C (température limite de fonctionnement)
Alimentation : Monophasé
Appoint électrique : puissance / calibre disjoncteur / câble d'alimentation : 0 kW à 35 °C / 1,3 kW à 55 °C, électricité

Puissance thermique nominale, climat moyen : 12 kW à 35 °C / 10 kW à 55 °C
Consommation annuelle, climat moyen : 7 274 kWh à 35 °C / 6 988 kWh à 55 °C
Climat chaud : 12 kW / 10 kW, efficacité 161 % / 126 %, consommation 3 928 kWh / 4 151 kWh
Climat froid : non utilisable
Débit d'air nominal extérieur : 6 000 m³/h

Données ErP à charge partielle, climat moyen, application basse température (35 °C) :
-7 °C : 10,5 kW, COP 2,68
+2 °C : 6,2 kW, COP 3,41
+7 °C : 4,6 kW, COP 4,21
+12 °C : 4,0 kW, COP 4,63
Température bivalente -10 °C : 12,03 kW, COP 2,52

Données ErP à charge partielle, climat moyen, application moyenne température (55 °C) :
-7 °C : 9,2 kW, COP 1,99
+2 °C : 8,1 kW, COP 2,99
+7 °C : 6,8 kW, COP 4,05
+12 °C : 3,7 kW, COP 4,92
Température bivalente -7 °C : 9,2 kW, COP 1,99
Température limite de fonctionnement : 8,7 kW, COP 1,71

$d$
      ),
      (
        'FDC100VSX-MODUL''O-NEO-12-TRI',
        'FDC100VSX MODUL''O NÉO 12 TRI',
        12000,
        $d$FDC100VSX MODUL'O NÉO 12 TRI
Groupe extérieur triphasé. Pompe à chaleur air/eau Modul'O NÉO 12.

Marque : MITSUBISHI YACK
Efficacité énergétique saisonnière - chauffage (35°C/55°C) : 133 % / 116 %
Température de départ maximum : 55 °C
Niveau sonore : 68 dB(A) (unité extérieure)
Ballon ECS intégré : Non
Plage de fonctionnement conseillée mini./maxi. mode chaud : jusqu'à -10 °C (température limite de fonctionnement)
Alimentation : Triphasé
Appoint électrique : puissance / calibre disjoncteur / câble d'alimentation : 0 kW à 35 °C / 1,3 kW à 55 °C, électricité

Puissance thermique nominale, climat moyen : 12 kW à 35 °C / 10 kW à 55 °C
Consommation annuelle, climat moyen : 7 274 kWh à 35 °C / 6 988 kWh à 55 °C
Climat chaud : 12 kW / 10 kW, efficacité 161 % / 126 %, consommation 3 928 kWh / 4 151 kWh
Climat froid : non utilisable
Débit d'air nominal extérieur : 6 000 m³/h

Données ErP à charge partielle, climat moyen, application basse température (35 °C) :
-7 °C : 10,5 kW, COP 2,68
+2 °C : 6,2 kW, COP 3,41
+7 °C : 4,6 kW, COP 4,21
+12 °C : 4,0 kW, COP 4,63
Température bivalente -10 °C : 12,03 kW, COP 2,52

Données ErP à charge partielle, climat moyen, application moyenne température (55 °C) :
-7 °C : 9,2 kW, COP 1,99
+2 °C : 8,1 kW, COP 2,99
+7 °C : 6,8 kW, COP 4,05
+12 °C : 3,7 kW, COP 4,92
Température bivalente -7 °C : 9,2 kW, COP 1,99
Température limite de fonctionnement : 8,7 kW, COP 1,71

$d$
      ),
      (
        'FDC125VSX-MODUL''O-NEO-14-TRI',
        'FDC125VSX MODUL''O NÉO 14 TRI',
        14000,
        $d$FDC125VSX MODUL'O NÉO 14 TRI
Groupe extérieur triphasé. Pompe à chaleur air/eau Modul'O NÉO 14.

Marque : MITSUBISHI YACK
Classe énergétique - chauffage (35°C/55°C) : A+ / A+
Efficacité énergétique saisonnière - chauffage (35°C/55°C) : 132 % / 117 %
Niveau sonore : 70 dB(A) (unité extérieure)
Ballon ECS intégré : Non
Alimentation : Triphasé
Appoint électrique : puissance / calibre disjoncteur / câble d'alimentation : 0 kW à 35 °C / 1,9 kW à 55 °C, électricité

Puissance thermique nominale, climat moyen : 14 kW à 35 °C / 12 kW à 55 °C
Consommation annuelle, climat moyen : 8 437 kWh à 35 °C / 8 278 kWh à 55 °C
Climat chaud : 14 kW / 12 kW, efficacité 170 % / 128 %, consommation 4 342 kWh / 4 886 kWh
Climat froid : non utilisable

$d$
      ),
      (
        'FDC140VNX-MODUL''O-NEO-16-MONO',
        'FDC140VNX MODUL''O NÉO 16 MONO',
        16000,
        $d$FDC140VNX MODUL'O NÉO 16 MONO
Groupe extérieur monophasé. Pompe à chaleur air/eau Modul'O NÉO 16.

Marque : MITSUBISHI YACK
Classe énergétique - chauffage (35°C/55°C) : A+ / A+
Efficacité énergétique saisonnière - chauffage (35°C/55°C) : 137 % / 113 %
Niveau sonore : 73 dB(A) (unité extérieure)
Ballon ECS intégré : Non
Alimentation : Monophasé
Appoint électrique : puissance / calibre disjoncteur / câble d'alimentation : 0 kW à 35 °C / 2,91 kW à 55 °C, électricité

Puissance thermique nominale, climat moyen : 16 kW à 35 °C / 13 kW à 55 °C
Consommation annuelle, climat moyen : 9 092 kWh à 35 °C / 9 330 kWh à 55 °C
Climat chaud : 16 kW / 13 kW, efficacité 164 % / 137 %, consommation 5 136 kWh / 4 974 kWh
Climat froid : non utilisable

$d$
      ),
      (
        'FDC140VSX-MODUL''O-NEO-16-TRI',
        'FDC140VSX MODUL''O NÉO 16 TRI',
        16000,
        $d$FDC140VSX MODUL'O NÉO 16 TRI
Groupe extérieur triphasé. Pompe à chaleur air/eau Modul'O NÉO 16.

Marque : MITSUBISHI YACK
Classe énergétique - chauffage (35°C/55°C) : A+ / A+
Efficacité énergétique saisonnière - chauffage (35°C/55°C) : 137 % / 113 %
Niveau sonore : 73 dB(A) (unité extérieure)
Ballon ECS intégré : Non
Alimentation : Triphasé
Appoint électrique : puissance / calibre disjoncteur / câble d'alimentation : 0 kW à 35 °C / 2,91 kW à 55 °C, électricité

Puissance thermique nominale, climat moyen : 16 kW à 35 °C / 13 kW à 55 °C
Consommation annuelle, climat moyen : 9 092 kWh à 35 °C / 9 330 kWh à 55 °C
Climat chaud : 16 kW / 13 kW, efficacité 164 % / 137 %, consommation 5 136 kWh / 4 974 kWh
Climat froid : non utilisable

$d$
      )
    ) as modele(reference, designation, power_w, description)
  loop
    select a.id into v_article_id
    from public.articles a
    where a.organization_id = v_org
      and lower(a.reference) = lower(v_row.reference)
    limit 1;

    if v_article_id is null then
      insert into public.articles (
        organization_id, reference, designation, description,
        categorie, sous_categorie, category_id, subcategory_id,
        marque, brand_id, prix_achat_ht, prix_vente_ht, taux_tva,
        unite, actif, power_w, source_reference, updated_at
      ) values (
        v_org, v_row.reference, v_row.designation,
        v_row.description || v_garantie,
        v_cat, v_sub, v_cat_id, v_sub_id,
        v_brand, v_brand_id, 0, 0, 5.5,
        'Unité', true, v_row.power_w, 'catalogue:modulo-neo', now()
      )
      returning id into v_article_id;
    end if;

    if not exists (
      select 1 from public.article_bundles b
      where b.organization_id = v_org and lower(b.name) = lower(v_row.designation)
    ) then
      insert into public.article_bundles (
        organization_id, name, category, subcategory, brand, family, items, actif, updated_at
      ) values (
        v_org, v_row.designation, v_cat, v_sub, v_brand, v_sub,
        jsonb_build_array(
          jsonb_build_object(
            'articleId', v_article_id,
            'code', v_row.reference,
            'name', v_row.designation,
            'description', '',
            'category', v_cat,
            'subcategory', v_sub,
            'brand', v_brand,
            'brandId', v_brand_id,
            'sourceReference', 'catalogue:modulo-neo',
            'qty', 1,
            'price', 0,
            'buy', 0,
            'tax', 5.5,
            'unit', 'Unité',
            'role', 'principal'
          ),
          v_supply,
          v_labor
        ),
        true, now()
      );
    end if;
  end loop;
end $$;
