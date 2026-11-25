/**
 * Vérifie qu'une sauvegarde est exploitable, en la restaurant pour de vrai.
 *
 * Une archive qu'on n'a jamais restaurée n'est pas une sauvegarde : c'est un
 * fichier dont on espère quelque chose. Ce script la restaure dans la base
 * PostgreSQL de test du dépôt, puis recompte les lignes et compare à
 * l'inventaire relevé sur la production au moment de la sauvegarde.
 *
 * La production n'est jamais sollicitée ici : seule l'archive est lue.
 *
 *   bash scripts/pg-test/install.sh      # si ce n'est pas déjà fait
 *   node scripts/backup/verifier-sauvegarde.mjs ~/MKL-sauvegardes/public-....dump
 */

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { CONNEXION, journal, recreerBase } from "../pg-test/lib.mjs";

const executer = promisify(execFile);
const log = journal();

const OUTILS = join(process.env.PG_OUTILS_HOME || join(homedir(), ".mkl-pgtools"), "bin");
const archive = process.argv[2];

if (!archive) {
  console.error("Usage : node scripts/backup/verifier-sauvegarde.mjs <archive.dump>");
  process.exit(1);
}
const chemin = resolve(archive.replace(/^~/, homedir()));
if (!existsSync(chemin)) {
  console.error(`Archive introuvable : ${chemin}`);
  process.exit(1);
}
if (!existsSync(join(OUTILS, "pg_restore"))) {
  console.error(`pg_restore introuvable dans ${OUTILS}
Lancez d'abord : bash scripts/backup/installer-outils-pg.sh`);
  process.exit(1);
}

log.titre("Vérification de la sauvegarde, sans toucher à la production");
log.info(basename(chemin));

// ---------------------------------------------------------------------------
log.titre("1. L'archive est lisible et complète");
// ---------------------------------------------------------------------------

let sommaire;
try {
  const { stdout } = await executer(join(OUTILS, "pg_restore"), ["--list", chemin], {
    maxBuffer: 64 * 1024 * 1024,
  });
  sommaire = stdout;
  log.ok("pg_restore lit le sommaire : l'archive n'est pas tronquée");
} catch (error) {
  log.ko("l'archive est illisible ou corrompue", String(error.stderr || error.message).slice(0, 300));
  process.exitCode = 1;
  log.bilan();
  process.exit(1);
}

const entrees = sommaire.split("\n").filter(ligne => /^\d+;/.test(ligne));
const tables = new Set();
for (const ligne of entrees) {
  const trouve = /TABLE DATA \S+ (\S+)/.exec(ligne);
  if (trouve) tables.add(trouve[1]);
}
log.info(`${entrees.length} objets, dont ${tables.size} tables avec données`);

if (tables.size > 0) log.ok("l'archive contient bien des données, et pas seulement un schéma");
else log.ko("aucune donnée de table dans l'archive");

// ---------------------------------------------------------------------------
log.titre("2. La restauration aboutit sur une base neuve");
// ---------------------------------------------------------------------------

const BASE = process.env.PG_TEST_DB_VERIF || "mkl_verif_sauvegarde";
const sql = await recreerBase(BASE);

// Les rôles de Supabase n'existent pas sur une base nue. Ils sont créés avant
// la restauration : sans eux, chaque instruction `grant` échouerait et
// gonflerait le compte d'erreurs sans que rien ne soit réellement en cause.
await sql.unsafe(`
  do $$
  begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin superuser; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit; end if;
  end $$;
  create schema if not exists auth;
  create schema if not exists extensions;
  create extension if not exists pgcrypto with schema extensions;
`);
log.ok("base neuve préparée avec les rôles et schémas que Supabase suppose");

const environnement = {
  ...process.env,
  PGPASSWORD: CONNEXION.password,
};

let restauration;
try {
  restauration = await executer(
    join(OUTILS, "pg_restore"),
    [
      "--host", CONNEXION.host,
      "--port", String(CONNEXION.port),
      "--username", CONNEXION.user,
      "--dbname", BASE,
      // Les propriétaires et les droits sont écartés ici, et seulement ici :
      // l'archive les conserve pour une restauration fidèle vers Supabase,
      // mais localement ils désignent des rôles qui n'ont pas de sens.
      "--no-owner",
      "--no-privileges",
      "--no-comments",
      chemin,
    ],
    { env: environnement, maxBuffer: 64 * 1024 * 1024 }
  );
  log.ok("la restauration s'est terminée sans erreur");
} catch (error) {
  // pg_restore sort en erreur même pour des avertissements bénins. On regarde
  // ce qu'il reproche vraiment avant de conclure.
  const bruit = String(error.stderr || "");
  const graves = bruit
    .split("\n")
    .filter(ligne => /^pg_restore: error:/.test(ligne))
    .filter(ligne => !/already exists|does not exist|must be owner/.test(ligne));
  if (graves.length === 0) {
    log.ok("la restauration aboutit, avec seulement des avertissements bénins");
  } else {
    log.ko(`${graves.length} erreur(s) de restauration`, graves.slice(0, 3).join(" | ").slice(0, 400));
  }
}

// ---------------------------------------------------------------------------
log.titre("3. Les comptes de lignes correspondent à la production");
// ---------------------------------------------------------------------------

const inventaire = join(dirname(chemin), basename(chemin).replace(/^public-/, "inventaire-").replace(/\.dump$/, ".txt"));

const restaure = new Map();
const lignes = await sql`
  select table_schema || '.' || table_name as nom,
         (xpath('/row/c/text()',
                query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name),
                             false, true, '')))[1]::text::bigint as lignes
    from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE'
   order by 1
`;
for (const row of lignes) restaure.set(row.nom, Number(row.lignes));
log.info(`${restaure.size} tables restaurées localement`);

if (!existsSync(inventaire)) {
  log.ko(`inventaire de production introuvable : ${basename(inventaire)}`);
  log.info("sans lui, la restauration est prouvée mais pas la fidélité du contenu");
} else {
  const attendu = new Map();
  for (const ligne of readFileSync(inventaire, "utf8").split("\n")) {
    const [nom, compte] = ligne.split("|");
    if (nom && compte !== undefined) attendu.set(nom.trim(), Number(compte.trim()));
  }
  log.info(`${attendu.size} tables dans l'inventaire de production`);

  const manquantes = [...attendu.keys()].filter(nom => !restaure.has(nom));
  const ecarts = [...attendu.entries()].filter(
    ([nom, compte]) => restaure.has(nom) && restaure.get(nom) !== compte
  );
  const totalProduction = [...attendu.values()].reduce((a, b) => a + b, 0);
  const totalRestaure = [...restaure.values()].reduce((a, b) => a + b, 0);

  if (manquantes.length === 0) log.ok("aucune table de production ne manque dans la restauration");
  else log.ko(`${manquantes.length} table(s) manquante(s)`, manquantes.slice(0, 8).join(", "));

  if (ecarts.length === 0) {
    log.ok(`chaque table a le compte exact attendu (${totalProduction} lignes au total)`);
  } else {
    log.ko(
      `${ecarts.length} table(s) avec un écart`,
      ecarts.slice(0, 5).map(([nom, attendu]) => `${nom}: ${restaure.get(nom)} au lieu de ${attendu}`).join(" | ")
    );
  }

  if (totalProduction !== totalRestaure) {
    log.info(`total restauré ${totalRestaure}, total production ${totalProduction}`);
  }
}

// ---------------------------------------------------------------------------
log.titre("4. Les tables que les migrations vont toucher sont bien là");
// ---------------------------------------------------------------------------

for (const table of ["commercial_opportunities", "commercial_appointments", "clients", "devis", "profiles"]) {
  if (restaure.has(`public.${table}`)) {
    log.ok(`${table} restaurée, ${restaure.get(`public.${table}`)} ligne(s)`);
  } else {
    log.ko(`${table} absente de la restauration`);
  }
}

// ---------------------------------------------------------------------------
log.titre("5. Le contenu se relit, et pas seulement les métadonnées");
// ---------------------------------------------------------------------------

// Une restauration peut créer les tables et échouer sur les données sans le
// dire clairement. Une lecture réelle lève le doute.
try {
  const [controle] = await sql`
    select count(*)::int as fiches,
           count(distinct organization_id)::int as organisations
      from public.commercial_opportunities
  `;
  log.ok(`lecture effective : ${controle.fiches} fiche(s) sur ${controle.organisations} organisation(s)`);
} catch (error) {
  log.ko("les données ne se relisent pas", error.message);
}

// Encodage. Un aller-retour mal configuré ne perd aucune ligne : il remplace
// « é » par « Ã© », et le compte reste juste. Les comptes seuls ne verraient
// donc rien. On cherche les suites caractéristiques de cette double
// interprétation dans les colonnes de texte les plus porteuses d'accents.
try {
  const [encodage] = await sql`
    select count(*)::int as suspectes
      from public.commercial_opportunities
     where name ~ '(Ã.|Â.|â€)' or coalesce(notes, '') ~ '(Ã.|Â.|â€)'
  `;
  const [accentuees] = await sql`
    select count(*)::int as avec_accents
      from public.commercial_opportunities
     where name ~ '[À-ÿŒœ]' or coalesce(notes, '') ~ '[À-ÿŒœ]'
  `;
  if (encodage.suspectes > 0) {
    log.ko(`${encodage.suspectes} ligne(s) portent des traces de double encodage`);
  } else if (accentuees.avec_accents > 0) {
    log.ok(`${accentuees.avec_accents} ligne(s) accentuée(s) intactes, aucune trace de double encodage`);
  } else {
    log.info("aucun texte accentué à contrôler dans cet échantillon");
  }
} catch (error) {
  log.ko("le contrôle d'encodage n'a pas pu s'exécuter", error.message);
}

await sql.end();

console.log("");
console.log(`Base de contrôle conservée sous « ${BASE} » si vous voulez l'inspecter.`);
console.log("Elle est locale et sera écrasée à la prochaine vérification.");

process.exitCode = log.bilan() ? 0 : 1;
