/**
 * Origines des prospects et droits, éprouvés sur une base PostgreSQL réelle.
 *
 * Deux choses sont vérifiées ici, qu'aucune lecture de code ne peut établir.
 *
 * D'abord que les garde-fous posés sur `commercial_opportunities` n'empêchent
 * pas le travail quotidien. C'est le risque propre à cette migration : elle
 * est la seule à poser des déclencheurs sur une table en service, et un
 * garde-fou trop zélé casserait la saisie au lieu de la protéger.
 *
 * Ensuite que les droits accordés sont bien ceux voulus. Un `revoke` passe
 * sans erreur même s'il porte sur un droit jamais accordé : seule une lecture
 * des privilèges effectifs dit la vérité.
 *
 *   bash scripts/pg-test/install.sh
 *   node scripts/pg-test/05-origines-et-droits.mjs
 */

import { ORG, journal, preparerBase } from "./lib.mjs";

const log = journal();

// Base propre, et non celle laissée par les autres suites : leurs essais de
// retour arrière suppriment des index pour prouver qu'ils sont annulables.
const { sql, restants } = await preparerBase(process.env.PG_TEST_DB_OD || "mkl_origines");

const bloquantes = restants;
if (bloquantes.length === 0) {
  log.ok("les migrations de structure sont toutes appliquées");
} else {
  log.ko(`${bloquantes.length} migration(s) non appliquée(s)`, bloquantes.map(item => item.nom).join(", "));
}

/** Libellés produits par `mirrorSourceLabel`, dans app/lib/origin-taxonomy.js. */
const LIBELLES = [
  "Prospect GG Ads",
  "Prospect Face",
  "Prospect Site",
  "Prospection",
  "Entrant & relationnel",
  "À qualifier",
];

/** Codes internes, qui ne doivent jamais s'afficher à l'écran. */
const CODES = ["google_ads", "meta_ads", "site_web", "prospection", "entrant", "a_qualifier"];

await sql`delete from public.lead_attribution`;
await sql`delete from public.lead_origin_history`;
await sql`delete from public.commercial_appointments`;
await sql`delete from public.commercial_opportunities`;
await sql`insert into public.organizations (id, name) values (${ORG}, 'MKL Essai') on conflict (id) do nothing`;

async function creer({ source = null, canal = null, categorie = null, nom = "Essai" } = {}) {
  const [row] = await sql`
    insert into public.commercial_opportunities
      (organization_id, name, phone, stage, source, origin_channel, origin_category)
    values (${ORG}, ${nom}, '0612345678', 'Nouveau', ${source}, ${canal}, ${categorie})
    returning id, origin_set_at
  `;
  return row;
}

// ---------------------------------------------------------------------------
log.titre("1. Les libellés de vos équipes passent tous");
// ---------------------------------------------------------------------------

for (const libelle of LIBELLES) {
  try {
    await creer({ source: libelle, nom: libelle });
    log.ok(`« ${libelle} » est accepté`);
  } catch (error) {
    log.ko(`« ${libelle} » est refusé`, error.message);
  }
}
log.info("« Prospection » était refusé avant correction : le garde-fou");
log.info("normalisait en minuscules, et confondait le libellé avec son code.");

// ---------------------------------------------------------------------------
log.titre("1 bis. Les libellés que le CRM propose aujourd'hui");
// ---------------------------------------------------------------------------

/**
 * Les six libellés ci-dessus viennent du nouveau module. Ceux-ci sont les
 * choix que le formulaire prospect propose déjà, et ils en diffèrent presque
 * tous. C'est le contrôle qui compte vraiment : la migration pose son
 * garde-fou sur une table que le code **actuellement en production** écrit, et
 * ce code ne connaît pas le garde-fou. Un seul de ces libellés refusé, et la
 * saisie casse entre la migration et le déploiement du code.
 */
const { PROSPECT_SOURCES } = await import("../../app/lib/prospects.js");
log.info(`${PROSPECT_SOURCES.length} choix dans PROSPECT_SOURCES`);
for (const libelle of PROSPECT_SOURCES) {
  try {
    await creer({ source: libelle, nom: `actuel ${libelle}` });
    log.ok(`« ${libelle} » est accepté`);
  } catch (error) {
    log.ko(`« ${libelle} » est refusé : la saisie casserait en production`, error.message);
  }
}

// ---------------------------------------------------------------------------
log.titre("2. Les codes internes restent refusés");
// ---------------------------------------------------------------------------

for (const code of CODES) {
  try {
    await creer({ source: code, nom: `code ${code}` });
    log.ko(`le code brut « ${code} » a été accepté`);
  } catch (error) {
    if (String(error.message).includes("SOURCE_EXPECTS_LABEL")) {
      log.ok(`le code brut « ${code} » est refusé`);
    } else {
      log.ko(`« ${code} » : refus pour une autre raison`, error.message);
    }
  }
}

// ---------------------------------------------------------------------------
log.titre("3. Le marqueur de Google Calendar reste réservé");
// ---------------------------------------------------------------------------

for (const variante of ["google", "Google", "  GOOGLE  "]) {
  try {
    await creer({ source: variante, nom: `marqueur ${variante}` });
    log.ko(`« ${variante} » a été accepté comme origine`);
  } catch (error) {
    if (String(error.message).includes("SOURCE_RESERVED_MARKER")) {
      log.ok(`« ${variante} » est refusé, quelle que soit la casse`);
    } else {
      log.ko(`« ${variante} » : refus pour une autre raison`, error.message);
    }
  }
}
log.info("sans cela, un prospect Google Ads passerait pour un événement");
log.info("d'agenda importé, que le CRM marque déjà « google ».");

// ---------------------------------------------------------------------------
log.titre("4. Les origines libres de vos équipes ne sont pas gênées");
// ---------------------------------------------------------------------------

for (const libre of ["Prospection terrain", "Salon de l'habitat", "Recommandation client", "Call Marrakech", ""]) {
  try {
    await creer({ source: libre, nom: `libre ${libre || "vide"}` });
    log.ok(`« ${libre || "(vide)"} » passe sans contrainte`);
  } catch (error) {
    log.ko(`« ${libre || "(vide)"} » est refusé`, error.message);
  }
}

// ---------------------------------------------------------------------------
log.titre("5. Un prospect historique reste modifiable");
// ---------------------------------------------------------------------------

const historique = await creer({ source: "Prospection terrain", nom: "Fiche historique" });
if (historique.origin_set_at === null) {
  log.ok("une fiche sans origine structurée est acceptée, comme l'existant");
} else {
  log.ko("une date d'origine a été posée sur une fiche sans origine");
}

try {
  await sql`
    update public.commercial_opportunities
       set notes = 'note ajoutée', stage = 'Qualifié', estimated_value = 12000
     where id = ${historique.id}
  `;
  log.ok("une modification ordinaire passe, les déclencheurs ne gênent pas");
} catch (error) {
  log.ko("une modification ordinaire est refusée", error.message);
}

try {
  await sql`update public.commercial_opportunities set source = 'Prospect Site' where id = ${historique.id}`;
  log.ok("changer le libellé affiché reste possible");
} catch (error) {
  log.ko("changer le libellé affiché est refusé", error.message);
}

// ---------------------------------------------------------------------------
log.titre("6. L'origine structurée ne se requalifie pas");
// ---------------------------------------------------------------------------

const publicitaire = await creer({
  source: "Prospect GG Ads",
  canal: "web_ingest",
  categorie: "google_ads",
  nom: "Fiche publicitaire",
});

// Le déclencheur d'origine n'est posé qu'en modification : à la création, la
// date vient de l'application, qui l'écrit dans app/lib/web-lead-consumer.js.
// Une insertion qui l'omet laisse donc la date vide, et c'est le comportement
// attendu ici puisque ce script insère en direct sans passer par le CRM.
if (publicitaire.origin_set_at === null) {
  log.ok("à la création, la date d'origine vient de l'application, pas du déclencheur");
} else {
  log.ko("une date d'origine a été posée alors qu'aucune n'était fournie");
}

// En revanche, qualifier une fiche qui n'avait pas d'origine doit horodater
// le changement sans que l'application ait à y penser.
const sansOrigine = await creer({ source: "Prospection terrain", nom: "À qualifier plus tard" });
// Le canal d'une prospection terrain est `crm_manual` : `prospection` est une
// catégorie, pas un canal. La contrainte refuse les couples incohérents, ce
// qui est exactement son rôle.
await sql`
  update public.commercial_opportunities
     set origin_channel = 'crm_manual', origin_category = 'prospection'
   where id = ${sansOrigine.id}
`;
const [qualifiee] = await sql`
  select origin_set_at from public.commercial_opportunities where id = ${sansOrigine.id}
`;
if (qualifiee.origin_set_at) {
  log.ok("qualifier une fiche sans origine horodate le changement");
} else {
  log.ko("la qualification n'a pas été horodatée");
}

try {
  await sql`
    update public.commercial_opportunities set origin_category = 'prospection' where id = ${publicitaire.id}
  `;
  log.ko("un prospect publicitaire a pu devenir un prospect terrain");
} catch (error) {
  if (String(error.message).includes("ORIGIN_IMMUTABLE")) {
    log.ok("un prospect publicitaire ne peut pas devenir un prospect terrain");
  } else {
    log.ko("refus pour une autre raison", error.message);
  }
}

// Le seul affinage permis : préciser une origine restée « à qualifier »,
// à l'intérieur du même canal.
const aQualifier = await creer({
  source: "À qualifier",
  canal: "web_ingest",
  categorie: "a_qualifier",
  nom: "Fiche à qualifier",
});
try {
  await sql`
    update public.commercial_opportunities set origin_category = 'site_web' where id = ${aQualifier.id}
  `;
  log.ok("une origine « à qualifier » peut être précisée dans son canal");
} catch (error) {
  log.ko("l'affinage d'une origine à qualifier est refusé", error.message);
}

// ---------------------------------------------------------------------------
log.titre("7. Durcissement effectif des dix fonctions du module");
// ---------------------------------------------------------------------------

/**
 * Dix fonctions, et non onze : `lead_origin_history_append_only` est un nom de
 * déclencheur, qui réutilise la fonction `lead_attribution_append_only`. Les
 * deux tables en ajout seul partagent donc le même garde-fou.
 *
 * La valeur dit si `security definer` est attendu. Il ne l'est que si la
 * fonction atteint une table qu'un rôle applicatif ne peut pas atteindre :
 * ailleurs, ce serait un privilège sans emploi.
 */
const ATTENDUES = {
  lead_attribution_append_only: true,
  commercial_opportunities_origin_guard: true,
  commercial_opportunities_source_guard: true,
  google_oauth_states_guard: false,
  purge_google_oauth_states: true,
  enqueue_web_lead: true,
  reserve_web_leads: true,
  settle_web_lead: true,
  requeue_web_lead: true,
  purge_web_lead_payloads: true,
};

const fonctions = await sql`
  select p.proname, p.prosecdef as definer, coalesce(p.proconfig, '{}'::text[]) as config
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any(${Object.keys(ATTENDUES)})
   order by 1
`;

if (fonctions.length === Object.keys(ATTENDUES).length) {
  log.ok(`les ${fonctions.length} fonctions du module sont présentes`);
} else {
  log.ko(`${fonctions.length} fonctions trouvées sur ${Object.keys(ATTENDUES).length}`);
}

const nonDurcies = fonctions.filter(
  row => !row.config.includes("search_path=pg_catalog, public, pg_temp")
);
if (nonDurcies.length === 0) {
  log.ok("toutes portent search_path = pg_catalog, public, pg_temp");
} else {
  log.ko(
    `${nonDurcies.length} fonction(s) non durcie(s)`,
    nonDurcies.map(row => `${row.proname} → ${row.config.join(",") || "aucun"}`).join(" ; ")
  );
}

const ecarts = fonctions.filter(row => row.definer !== ATTENDUES[row.proname]);
if (ecarts.length === 0) {
  log.ok("le réglage security definer est conforme pour chaque fonction");
} else {
  log.ko(
    `${ecarts.length} écart(s) sur security definer`,
    ecarts.map(row => `${row.proname} : ${row.definer ? "présent" : "absent"}`).join(" ; ")
  );
}

// Le déclencheur partagé par les deux tables en ajout seul doit bien être le
// même : deux copies divergeraient à la première correction.
const partage = await sql`
  select tgrelid::regclass::text as table_cible
    from pg_trigger
   where tgfoid = 'public.lead_attribution_append_only()'::regprocedure
     and not tgisinternal
   order by 1
`;
if (partage.length === 2) {
  log.ok(`le garde-fou en ajout seul couvre les deux tables : ${partage.map(r => r.table_cible).join(", ")}`);
} else {
  log.ko(`${partage.length} table(s) couverte(s) au lieu de 2`);
}

// ---------------------------------------------------------------------------
log.titre("8. Droits effectifs, et non simples instructions revoke");
// ---------------------------------------------------------------------------

/**
 * Un `revoke` réussit même s'il porte sur un droit jamais accordé. Lire les
 * privilèges effectifs est donc le seul contrôle qui prouve quelque chose.
 */
const DROITS_ATTENDUS = {
  lead_attribution: "INSERT, SELECT",
  lead_origin_history: "INSERT, SELECT",
  web_lead_submissions: "SELECT",
  web_lead_events: "SELECT",
  google_oauth_states: "INSERT, SELECT, UPDATE",
};

for (const [table, attendu] of Object.entries(DROITS_ATTENDUS)) {
  const [{ liste }] = await sql`
    select coalesce(string_agg(distinct privilege_type, ', ' order by privilege_type), 'aucun') as liste
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = ${table} and grantee = 'service_role'
  `;
  if (liste === attendu) log.ok(`${table} : service_role a ${liste}`);
  else log.ko(`${table} : service_role a ${liste}, attendu ${attendu}`);
}

for (const table of Object.keys(DROITS_ATTENDUS)) {
  for (const role of ["anon", "authenticated"]) {
    const [{ liste }] = await sql`
      select coalesce(string_agg(distinct privilege_type, ', ' order by privilege_type), 'aucun') as liste
        from information_schema.role_table_grants
       where table_schema = 'public' and table_name = ${table} and grantee = ${role}
    `;
    if (liste !== "aucun") log.ko(`${table} : ${role} a ${liste}`);
  }
}
log.ok("aucun rôle du navigateur n'a de droit sur les tables du module");

// Les tables en ajout seul ne doivent pas recevoir de droit de modification,
// sinon le déclencheur serait le seul rempart.
for (const table of ["lead_attribution", "lead_origin_history"]) {
  const [{ liste }] = await sql`
    select coalesce(string_agg(distinct privilege_type, ', ' order by privilege_type), '') as liste
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = ${table} and grantee = 'service_role'
  `;
  if (!/UPDATE|DELETE/.test(liste)) log.ok(`${table} : ni UPDATE ni DELETE`);
  else log.ko(`${table} : droit de modification accordé (${liste})`);
}

// ---------------------------------------------------------------------------
log.titre("9. Doublons : les quatre index uniques restent en place");
// ---------------------------------------------------------------------------

const index = await sql`
  select indexname, indexdef from pg_indexes
   where schemaname = 'public'
     and indexname in ('commercial_opportunities_web_lead_idx',
                       'commercial_appointments_web_lead_idx',
                       'lead_attribution_submission_idx',
                       'web_lead_submissions_submission_idx')
   order by 1
`;
if (index.length === 4 && index.every(row => /UNIQUE/i.test(row.indexdef))) {
  log.ok("les quatre index uniques anti-doublons sont présents");
} else {
  log.ko(`${index.length} index trouvés sur 4`);
}

// Et ils mordent encore, après le durcissement des fonctions.
const SOUMISSION = "lead-apres-durcissement-1";
await sql`
  insert into public.commercial_opportunities (organization_id, name, phone, stage, source, extra)
  values (${ORG}, 'Demande du site', '0612345678', 'Nouveau', 'Prospect GG Ads',
          ${sql.json({ webLead: { submissionId: SOUMISSION } })})
`;
try {
  await sql`
    insert into public.commercial_opportunities (organization_id, name, phone, stage, source, extra)
    values (${ORG}, 'Demande du site', '0612345678', 'Nouveau', 'Prospect GG Ads',
            ${sql.json({ webLead: { submissionId: SOUMISSION } })})
  `;
  log.ko("un doublon a été accepté après le durcissement");
} catch (error) {
  if (error.code === "23505") log.ok("un doublon est toujours refusé après le durcissement");
  else log.ko("refus pour une autre raison", `${error.code} ${error.message}`);
}

await sql`delete from public.lead_attribution`;
await sql`delete from public.lead_origin_history`;
await sql`delete from public.commercial_opportunities`;

await sql.end();
process.exitCode = log.bilan() ? 0 : 1;
