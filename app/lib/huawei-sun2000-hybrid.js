/** Catalogue local des 13 onduleurs hybrides Huawei SUN2000. Aucune écriture distante. */

export const HUAWEI_SUN2000_SOURCE = "catalogue:huawei-sun2000-hybride";
export const HUAWEI_SUN2000_BRAND = "Huawei";
export const HUAWEI_SUN2000_CATEGORY = "Photovoltaïque";
export const HUAWEI_SUN2000_SUBCATEGORY = "Onduleurs";
const BATTERIES = "LUNA2000-5/10/15-S0 et LUNA2000-7/14/21-S1";

const MODELS = [
  { model: "SUN2000-3K-LB0", family: "LB0", phase: "mono", acW: 3000, pvW: 4500, mppt: 2, efficiency: "97,8 %", dcMaxV: 600, mpptRange: "40 à 560 V" },
  { model: "SUN2000-3.68K-LB0", family: "LB0", phase: "mono", acW: 3680, pvW: 5520, mppt: 2, efficiency: "97,8 %", dcMaxV: 600, mpptRange: "40 à 560 V" },
  { model: "SUN2000-4K-LB0", family: "LB0", phase: "mono", acW: 4000, pvW: 6000, mppt: 2, efficiency: "97,8 %", dcMaxV: 600, mpptRange: "40 à 560 V" },
  { model: "SUN2000-4.6K-LB0", family: "LB0", phase: "mono", acW: 4600, pvW: 6900, mppt: 2, efficiency: "97,8 %", dcMaxV: 600, mpptRange: "40 à 560 V" },
  { model: "SUN2000-5K-LB0", family: "LB0", phase: "mono", acW: 5000, pvW: 7500, mppt: 2, efficiency: "97,8 %", dcMaxV: 600, mpptRange: "40 à 560 V" },
  { model: "SUN2000-6K-LB0", family: "LB0", phase: "mono", acW: 6000, pvW: 9000, mppt: 2, efficiency: "97,8 %", dcMaxV: 600, mpptRange: "40 à 560 V" },
  { model: "SUN2000-8K-LC0", family: "LC0", phase: "mono", acW: 8000, pvW: 12000, mppt: 3, efficiency: "98,1 %", dcMaxV: 600, mpptRange: "40 à 560 V" },
  { model: "SUN2000-10K-LC0", family: "LC0", phase: "mono", acW: 10000, pvW: 15000, mppt: 3, efficiency: "98,1 %", dcMaxV: 600, mpptRange: "40 à 560 V" },
  { model: "SUN2000-5K-MAP0", family: "MAP0", phase: "tri", acW: 5000, pvW: 9000, mppt: 2, efficiency: "98,4 %", dcMaxV: 1100, mpptRange: "" },
  { model: "SUN2000-6K-MAP0", family: "MAP0", phase: "tri", acW: 6000, pvW: 11000, mppt: 2, efficiency: "98,6 %", dcMaxV: 1100, mpptRange: "" },
  { model: "SUN2000-8K-MAP0", family: "MAP0", phase: "tri", acW: 8000, pvW: 14600, mppt: 2, efficiency: "98,6 %", dcMaxV: 1100, mpptRange: "" },
  { model: "SUN2000-10K-MAP0", family: "MAP0", phase: "tri", acW: 10000, pvW: 18000, mppt: 2, efficiency: "98,6 %", dcMaxV: 1100, mpptRange: "" },
  { model: "SUN2000-12K-MAP0", family: "MAP0", phase: "tri", acW: 12000, pvW: 22000, mppt: 2, efficiency: "98,6 %", dcMaxV: 1100, mpptRange: "" },
];

function frKilo(watts) {
  const value = watts / 1000;
  return (Number.isInteger(value) ? String(value) : String(value)).replace(".", ",");
}

function phaseLabel(phase) {
  return phase === "tri" ? "Triphasé" : "Monophasé";
}

function backupText(family) {
  if (family === "MAP0") {
    return "Secours uniquement avec le coffret SmartGuard-63A-T0, non fourni. La batterie n’est pas incluse.";
  }
  return "Secours uniquement avec le coffret SmartGuard-63A-S0, non fourni. La batterie n’est pas incluse.";
}

function technicalDescription(model) {
  const network = model.phase === "tri" ? "triphasé" : "monophasé";
  const lines = [
    `Onduleur hybride photovoltaïque Huawei ${model.model}, réseau ${network}, puissance nominale AC ${frKilo(model.acW)} kW, puissance photovoltaïque maximale recommandée ${frKilo(model.pvW)} kWc, ${model.mppt} trackers MPPT. Compatibilité batterie et fonctionnalités de secours soumises aux conditions et équipements définis par Huawei.`,
    "",
    `Référence constructeur : ${model.model}`,
    "Gamme : Huawei SUN2000",
    `Type de réseau : ${phaseLabel(model.phase)}`,
    `Puissance AC : ${model.acW} W`,
    `Puissance PV maximale recommandée : ${model.pvW} Wc`,
    `Nombre de MPPT : ${model.mppt}`,
    `Rendement maximal : ${model.efficiency}`,
    `Tension DC maximale : ${model.dcMaxV} V`,
  ];
  if (model.mpptRange) lines.push(`Plage MPPT : ${model.mpptRange}`);
  else lines.push("Plage de fonctionnement PV : 160 à 1 000 V");
  lines.push(`Batteries compatibles selon Huawei : ${BATTERIES}`);
  lines.push(`Secours : ${backupText(model.family)}`);
  return lines.join("\n");
}

export function huaweiSun2000HybridArticles() {
  return MODELS.map(model => ({
    manufacturerReference: model.model,
    reference: `HUA-${model.model}`,
    designation: `Onduleur hybride Huawei ${model.model} — ${frKilo(model.acW)} kW — ${phaseLabel(model.phase)}`,
    description: `Fourniture d’un onduleur photovoltaïque hybride Huawei SUN2000, de puissance nominale ${frKilo(model.acW)} kW, compatible avec un système de stockage Huawei LUNA2000 selon les spécifications du fabricant, intégrant une gestion MPPT et une supervision via FusionSolar.`,
    descriptionTechnique: technicalDescription(model),
    marque: HUAWEI_SUN2000_BRAND,
    categorie: HUAWEI_SUN2000_CATEGORY,
    sousCategorie: HUAWEI_SUN2000_SUBCATEGORY,
    powerW: model.acW,
    pvW: model.pvW,
    mppt: model.mppt,
    phase: model.phase,
    family: model.family,
    efficiency: model.efficiency,
    dcMaxV: model.dcMaxV,
    mpptRange: model.mpptRange,
    prixAchatHt: 0,
    prixVenteHt: 0,
    tauxTva: 20,
    unite: "Unité",
    actif: true,
    sourceReference: HUAWEI_SUN2000_SOURCE,
    ficheNom: "",
    ficheData: "",
  }));
}

export function huaweiSun2000HybridRecords() {
  return huaweiSun2000HybridArticles().map(article => ({
    reference: article.reference,
    designation: article.designation,
    description: article.description,
    description_technique: article.descriptionTechnique,
    marque: article.marque,
    categorie: article.categorie,
    sous_categorie: article.sousCategorie,
    power_w: article.powerW,
    prix_achat_ht: article.prixAchatHt,
    prix_vente_ht: article.prixVenteHt,
    taux_tva: article.tauxTva,
    unite: article.unite,
    actif: article.actif,
    source_reference: article.sourceReference,
    fiche_nom: null,
    fiche_data: null,
  }));
}

export function huaweiSun2000HybridUiArticles() {
  return huaweiSun2000HybridArticles().map((article, index) => ({
    id: `huawei-sun2000-${index + 1}`,
    code: article.reference,
    name: article.designation,
    description: article.description,
    technicalDescription: article.descriptionTechnique,
    category: article.categorie,
    subcategory: article.sousCategorie,
    brand: article.marque,
    buy: 0,
    sell: 0,
    tax: 20,
    unit: article.unite,
    status: "Actif",
    active: true,
    powerW: article.powerW,
    ficheName: "",
    ficheData: "",
    sourceReference: article.sourceReference,
  }));
}

/** Clé constructeur : majuscules, sans espace, virgule devenue point, préfixe HUA- retiré. */
export function normalizeHuaweiModelKey(value) {
  const compact = String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/^HUA-/, "");
  if (compact === "SUN2000-4.6K-LB00") return "SUN2000-4.6K-LB0";
  return compact;
}

export function huaweiModelKeysIn(value) {
  const prepared = String(value || "")
    .toUpperCase()
    .replace(/,/g, ".")
    .replace(/\s*-\s*/g, "-");
  const keys = new Set();
  for (const match of prepared.match(/SUN2000-[\d.]+K-[A-Z0-9]+/g) || []) {
    keys.add(normalizeHuaweiModelKey(match));
  }
  return [...keys];
}

function articleBlob(article) {
  return [
    article?.reference,
    article?.code,
    article?.designation,
    article?.name,
    article?.description,
    article?.description_technique,
    article?.technicalDescription,
  ].filter(Boolean).join(" ");
}

export function planHuaweiSun2000Import(existing = []) {
  const catalog = huaweiSun2000HybridArticles();
  const snapshot = (existing || []).map(item => ({ ...item }));
  const report = [];
  const toInsert = [];
  for (const article of catalog) {
    const matches = snapshot.filter(item => huaweiModelKeysIn(articleBlob(item)).includes(article.manufacturerReference));
    if (!matches.length) {
      report.push({
        manufacturerReference: article.manufacturerReference,
        internalReference: article.reference,
        status: "absent",
        existingReference: "",
        existingDesignation: "",
        note: "À créer.",
      });
      toInsert.push(article);
      continue;
    }
    const exact = matches.find(item => String(item.reference || item.code || "").toUpperCase() === article.reference);
    const match = exact || matches[0];
    const sameInternal = String(match.reference || match.code || "").toUpperCase() === article.reference;
    report.push({
      manufacturerReference: article.manufacturerReference,
      internalReference: article.reference,
      status: sameInternal ? "deja_present" : "conflit",
      existingReference: String(match.reference || match.code || ""),
      existingDesignation: String(match.designation || match.name || ""),
      note: sameInternal
        ? "Référence interne déjà présente. Aucune modification."
        : `Correspondance proposée avec ${match.reference || match.code}. Article laissé intact.`,
    });
  }
  return { report, toInsert };
}

function sqlText(value) {
  return `$huawei$${String(value)}$huawei$`;
}

const RECETTE_CONFIRMATION = "CONFIRME-RECETTE-xqbjfytrssslnsxxdrou";

function candidateValuesSql() {
  return huaweiSun2000HybridArticles()
    .map(article => `  (${sqlText(article.manufacturerReference)}, ${sqlText(article.reference)}, ${sqlText(article.designation)}, ${sqlText(article.description)}, ${sqlText(article.descriptionTechnique)}, ${article.powerW}::numeric)`)
    .join(",\n");
}

function matchLateralsSql(orgColumn) {
  return `left join lateral (
    select a.reference, a.designation
    from public.articles a
    where a.organization_id = ${orgColumn}
      and upper(a.reference) = upper(c.reference)
    limit 1
  ) exact_internal on true
  left join lateral (
    select a.reference, a.designation
    from public.articles a
    where a.organization_id = ${orgColumn}
      and position(
        c.manufacturer_reference in
        regexp_replace(
          upper(replace(replace(
            coalesce(a.reference, '') || ' ' || coalesce(a.designation, '') || ' ' || coalesce(a.description, '') || ' ' || coalesce(a.description_technique, ''),
            ' ', ''
          ), ',', '.')),
          'SUN2000-4\\.6K-LB00',
          'SUN2000-4.6K-LB0',
          'g'
        )
      ) > 0
    order by a.reference
    limit 1
  ) found on true`;
}

export function renderHuaweiSun2000PreviewSql() {
  return `-- Prévisualisation Huawei SUN2000. Lecture seule.
-- Projet autorisé : MKL CRM RECETTE, référence xqbjfytrssslnsxxdrou.
-- N’ouvrez pas le projet MKL Energies CRM.
-- Ce script ne crée, ne modifie et ne supprime aucune ligne.

select required.table_name,
       exists (
         select 1
         from information_schema.tables t
         where t.table_schema = 'public'
           and t.table_name = required.table_name
       ) as presente
from (values
  ('organizations'),
  ('articles'),
  ('article_categories'),
  ('article_subcategories'),
  ('article_brands'),
  ('devis'),
  ('devis_lignes')
) as required(table_name)
order by required.table_name;

-- Rapport. Les statuts sont absent, deja_present, conflit ou bloque.
-- bloque : la catégorie Photovoltaïque / Onduleurs est absente, donc l’import s’arrêtera.
with candidates (
  manufacturer_reference, reference, designation, description, description_technique, power_w
) as (
  values
${candidateValuesSql()}
),
target as (
  select o.id as organization_id
  from public.organizations o
  where exists (
    select 1
    from public.article_categories c
    join public.article_subcategories s
      on s.category_id = c.id
     and s.organization_id = c.organization_id
    where c.organization_id = o.id
      and lower(c.name) = 'photovoltaïque'
      and lower(s.name) = 'onduleurs'
  )
  order by (select count(*) from public.articles a where a.organization_id = o.id) desc, o.name
  limit 1
)
select
  c.manufacturer_reference,
  c.reference as internal_reference,
  c.power_w,
  case
    when target.organization_id is null then 'bloque'
    when exact_internal.reference is not null then 'deja_present'
    when found.reference is not null then 'conflit'
    else 'absent'
  end as status,
  coalesce(exact_internal.reference, found.reference, '') as existing_reference,
  coalesce(exact_internal.designation, found.designation, '') as existing_designation,
  case
    when target.organization_id is null then 'Catégorie Photovoltaïque ou sous-catégorie Onduleurs absente. Aucune écriture possible.'
    when exact_internal.reference is not null then 'Référence interne déjà présente. Aucune modification.'
    when found.reference is not null then 'Correspondance proposée avec ' || found.reference || '. Article laissé intact.'
    else 'À créer après validation explicite de l’import.'
  end as note
from candidates c
left join target on true
${matchLateralsSql("target.organization_id")}
order by c.reference;
`;
}

export function renderHuaweiSun2000ImportSql() {
  return `-- Import Huawei SUN2000. N’insère rien tant que la confirmation n’est pas remplacée.
-- Projet autorisé : MKL CRM RECETTE, référence xqbjfytrssslnsxxdrou.
-- N’ouvrez pas le projet MKL Energies CRM.
-- Ne modifie aucun article existant, aucun prix et aucun devis.
-- Confirmation attendue : ${RECETTE_CONFIRMATION}

do $$
declare
  v_confirmation text := 'EN-ATTENTE';
  v_org uuid;
  v_brand_id uuid;
  v_cat_id uuid;
  v_sub_id uuid;
  v_created integer := 0;
begin
  if v_confirmation <> '${RECETTE_CONFIRMATION}' then
    raise exception 'Import non confirmé. Aucun article créé. Lancez d’abord la prévisualisation, puis remplacez EN-ATTENTE.';
  end if;

  select o.id
    into v_org
  from public.organizations o
  where exists (
    select 1
    from public.article_categories c
    join public.article_subcategories s
      on s.category_id = c.id
     and s.organization_id = c.organization_id
    where c.organization_id = o.id
      and lower(c.name) = 'photovoltaïque'
      and lower(s.name) = 'onduleurs'
  )
  order by (select count(*) from public.articles a where a.organization_id = o.id) desc, o.name
  limit 1;

  if v_org is null then
    raise exception 'Catégorie Photovoltaïque ou sous-catégorie Onduleurs absente. Aucun onduleur Huawei n’a été créé.';
  end if;

  select c.id, s.id
    into v_cat_id, v_sub_id
  from public.article_categories c
  join public.article_subcategories s
    on s.category_id = c.id
   and s.organization_id = c.organization_id
  where c.organization_id = v_org
    and lower(c.name) = 'photovoltaïque'
    and lower(s.name) = 'onduleurs'
  order by s.sort_order
  limit 1;

  select b.id
    into v_brand_id
  from public.article_brands b
  where b.organization_id = v_org
    and lower(b.name) = 'huawei'
  order by b.actif desc, b.name
  limit 1;

  if v_brand_id is null then
    insert into public.article_brands (organization_id, name, actif)
    values (v_org, 'Huawei', true)
    returning id into v_brand_id;
  end if;

  create temporary table huawei_sun2000_candidates (
    manufacturer_reference text primary key,
    reference text not null,
    designation text not null,
    description text not null,
    description_technique text not null,
    power_w numeric not null
  ) on commit drop;

  insert into huawei_sun2000_candidates (
    manufacturer_reference, reference, designation, description, description_technique, power_w
  ) values
${candidateValuesSql()};

  create temporary table huawei_sun2000_import_report (
    manufacturer_reference text,
    internal_reference text,
    status text,
    existing_reference text,
    existing_designation text,
    note text
  ) on commit drop;

  insert into huawei_sun2000_import_report (
    manufacturer_reference, internal_reference, status, existing_reference, existing_designation, note
  )
  select
    c.manufacturer_reference,
    c.reference,
    case
      when exact_internal.reference is not null then 'deja_present'
      when found.reference is not null then 'conflit'
      else 'absent'
    end,
    coalesce(exact_internal.reference, found.reference, ''),
    coalesce(exact_internal.designation, found.designation, ''),
    case
      when exact_internal.reference is not null then 'Référence interne déjà présente. Aucune modification.'
      when found.reference is not null then 'Correspondance proposée avec ' || found.reference || '. Article laissé intact.'
      else 'À créer.'
    end
  from huawei_sun2000_candidates c
  ${matchLateralsSql("v_org")};

  insert into public.articles (
    organization_id, reference, designation, description, description_technique,
    categorie, sous_categorie, category_id, subcategory_id,
    marque, brand_id,
    prix_achat_ht, prix_vente_ht, taux_tva, unite, actif, power_w, source_reference,
    fiche_nom, fiche_data, updated_at
  )
  select
    v_org, c.reference, c.designation, c.description, c.description_technique,
    'Photovoltaïque', 'Onduleurs', v_cat_id, v_sub_id,
    'Huawei', v_brand_id,
    0, 0, 20, 'Unité', true, c.power_w, '${HUAWEI_SUN2000_SOURCE}',
    null, null, now()
  from huawei_sun2000_candidates c
  join huawei_sun2000_import_report r on r.internal_reference = c.reference
  where r.status = 'absent'
    and not exists (
      select 1
      from public.articles a
      where a.organization_id = v_org
        and lower(a.reference) = lower(c.reference)
    );

  get diagnostics v_created = row_count;
  raise notice 'Onduleurs Huawei créés : %', v_created;
end $$;
`;
}

