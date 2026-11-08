/**
 * Assemble le schéma de recette en un seul fichier, puis le vérifie.
 *
 * L'ordre des noms de fichiers n'étant pas celui des dépendances, appliquer
 * les migrations une par une contre une base distante obligerait à redécouvrir
 * l'ordre sur place, par essais et erreurs. L'ordre a déjà été résolu en local
 * par `ordre-migrations.mjs` : il suffit de concaténer dans cet ordre.
 *
 * Le fichier produit est ensuite éprouvé sur une base locale neuve, en une
 * seule passe. S'il passe, il passera sur la recette.
 *
 * Six migrations du dépôt sont volontairement écartées : ce sont des
 * migrations de données catalogue qui refusent de s'exécuter sur une base
 * vide, par un message explicite. Elles ne concernent pas le module marketing.
 *
 * Rien n'est appliqué à Supabase par ce script.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { RACINE, fichierSql, migrations, recreerBase } from "../pg-test/lib.mjs";

const ORDRE = resolve(RACINE, "scripts/recette/ordre-applique.txt");
const SORTIE = resolve(RACINE, "scripts/recette/schema-recette.sql");

/**
 * Les cinq migrations du module marketing sont volontairement exclues du
 * socle, dans l'ordre exact que la procédure de mise en production annonce.
 *
 * C'est tout l'intérêt de la recette : elle doit partir de l'état où se
 * trouve la production aujourd'hui, puis recevoir ces cinq migrations une par
 * une, avec contrôle après chacune. Les inclure dans le socle reviendrait à
 * répéter l'arrivée en sautant l'étape que l'on veut justement éprouver.
 */
const CINQ = [
  "20261102_google_oauth_states.sql",
  "20261102_web_lead_ingest.sql",
  "20261105_web_lead_idempotence.sql",
  "20261102_lead_attribution.sql",
  "20261105_search_path_hardening.sql",
];

const noms = readFileSync(ORDRE, "utf8")
  .split("\n")
  .map(ligne => ligne.trim())
  .filter(ligne => ligne && !ligne.startsWith("#"))
  .filter(nom => !CINQ.includes(nom));

const toutes = new Map(migrations().map(item => [item.nom, item.sql]));
const absentes = noms.filter(nom => !toutes.has(nom));
if (absentes.length) {
  throw new Error(`migrations introuvables : ${absentes.join(", ")}`);
}

const ecartees = [...toutes.keys()].filter(nom => !noms.includes(nom) && !CINQ.includes(nom));

const morceaux = [
  "-- Socle de MKL CRM RECETTE, avant le module marketing.",
  "--",
  "-- Fichier assemblé par scripts/recette/construire-schema.mjs.",
  "-- Ne pas éditer à la main : il est régénéré à partir des migrations.",
  "--",
  `-- ${noms.length} migrations, dans l'ordre de dépendance résolu en local.`,
  "--",
  "-- Les cinq migrations du module marketing ne sont PAS ici : elles seront",
  "-- appliquées ensuite une par une, pour répéter la mise en production.",
  ...CINQ.map((nom, index) => `--   ${index + 1}. ${nom}`),
  "--",
  `-- ${ecartees.length} migrations de données catalogue écartées, car elles`,
  "-- refusent de s'exécuter sur une base vide, par un message explicite :",
  ...ecartees.map(nom => `--   ${nom}`),
  "",
];

for (const [index, nom] of noms.entries()) {
  morceaux.push(
    "",
    `-- ${"=".repeat(72)}`,
    `-- ${String(index + 1).padStart(2, "0")}/${noms.length}  ${nom}`,
    `-- ${"=".repeat(72)}`,
    "",
    toutes.get(nom).trimEnd(),
    ""
  );
}

writeFileSync(SORTIE, `${morceaux.join("\n")}\n`);

const taille = (readFileSync(SORTIE, "utf8").length / 1024).toFixed(0);
console.log(`Assemblé : ${noms.length} migrations, ${taille} Ko`);
console.log(`Écartées : ${ecartees.length} migrations de données catalogue`);

// --------------------------------------------------------------------------
// Vérification : une seule passe doit suffire sur une base neuve.
// --------------------------------------------------------------------------

const sql = await recreerBase("mkl_schema_recette");
await sql.unsafe(fichierSql("scripts/pg-test/supabase-shim.sql"));

try {
  await sql.unsafe(readFileSync(SORTIE, "utf8"));
  console.log("\nAppliqué en une seule passe sur une base locale neuve.");
} catch (error) {
  console.error(`\nÉCHEC en une passe : ${error.message.split("\n")[0]}`);
  await sql.end();
  process.exit(1);
}

const [compte] = await sql`
  select
    (select count(*)::int from pg_tables where schemaname = 'public') as tables,
    (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public') as fonctions,
    (select count(*)::int from pg_class where relkind = 'i' and relnamespace = 'public'::regnamespace) as index
`;
console.log(`  ${compte.tables} tables, ${compte.fonctions} fonctions, ${compte.index} index`);

// Le socle ne doit surtout PAS contenir les objets du module marketing :
// c'est la condition pour que les cinq migrations soient réellement éprouvées
// ensuite. Noms relevés dans les migrations elles-mêmes, non supposés : la
// file des demandes web s'appelle `web_lead_submissions`, avec son journal
// `web_lead_events`.
const DU_MODULE = [
  "lead_attribution",
  "lead_origin_history",
  "google_oauth_states",
  "web_lead_submissions",
  "web_lead_events",
];
const [presence] = await sql`
  select count(*)::int as trouvees
    from pg_tables
   where schemaname = 'public' and tablename = any(${DU_MODULE})
`;
console.log(`  tables du module marketing : ${presence.trouvees}/${DU_MODULE.length} (0 attendu)`);

if (presence.trouvees !== 0) {
  console.error("\nLe socle contient déjà le module marketing : rien ne serait éprouvé.");
  await sql.end();
  process.exit(1);
}

// --------------------------------------------------------------------------
// Répétition : les cinq migrations s'appliquent-elles sur ce socle, une par
// une, dans l'ordre annoncé par la procédure de mise en production ?
// --------------------------------------------------------------------------

console.log("\nRépétition des cinq migrations sur ce socle :");
for (const [index, nom] of CINQ.entries()) {
  try {
    await sql.begin(tx => tx.unsafe(toutes.get(nom)));
    console.log(`  ${index + 1}. ${nom.padEnd(38)} appliquée`);
  } catch (error) {
    console.error(`  ${index + 1}. ${nom.padEnd(38)} ÉCHEC : ${error.message.split("\n")[0]}`);
    await sql.end();
    process.exit(1);
  }
}

const [apres] = await sql`
  select
    (select count(*)::int from pg_tables
      where schemaname = 'public' and tablename = any(${DU_MODULE})) as tables_module,
    (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f'
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) as c(opt)
                         where c.opt like 'search_path=%')) as sans_search_path
`;
console.log(`\n  tables du module après les cinq : ${apres.tables_module}/${DU_MODULE.length}`);
console.log(`  fonctions sans search_path      : ${apres.sans_search_path}`);

await sql.end();

if (apres.tables_module !== DU_MODULE.length) {
  console.error("\nLe module reste incomplet après les cinq migrations.");
  process.exit(1);
}
console.log(`\nPrêt. Socle : ${SORTIE.replace(RACINE, ".")}`);
