/**
 * Préparation des migrations pour la PRODUCTION. N'applique rien, ne se
 * connecte à rien.
 *
 * Le problème que ce script résout : on ne sait pas quelles migrations la
 * production a déjà reçues. Elle n'a pas de table d'historique tenue par un
 * outil — son schéma a été posé à la main, par l'éditeur SQL. Rejouer les
 * soixante-quinze fichiers y échouerait donc partout sur des « already
 * exists », et deviner lesquels sauter serait pire.
 *
 * La sortie est donc double. D'abord un classement : tous les fichiers du
 * dossier des migrations n'en sont pas. Trois sont des scripts d'exploitation
 * gardés, dont un explicitement réservé à la recette ; les lancer en
 * production est soit impossible, soit une faute. Ensuite une requête
 * d'inventaire en lecture seule, qui demande à la base quels objets elle
 * possède déjà. C'est elle, et non une supposition, qui dira ce qui reste à
 * appliquer.
 *
 *   node scripts/mise-en-service/preparer-migrations-production.mjs
 *   node scripts/mise-en-service/preparer-migrations-production.mjs --inventaire > /tmp/inventaire.sql
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DOSSIER = resolve(RACINE, "supabase/migrations");

// Les deux projets, pour reconnaître un fichier qui en nomme un. Ce ne sont
// pas des secrets : ces références voyagent déjà dans les pages servies.
const REF_RECETTE = "xqbjfytrssslnsxxdrou";
const REF_PRODUCTION = "rzkwmwtjnwnmmcexwoov";

function fichiers() {
  return readdirSync(DOSSIER).filter(nom => nom.endsWith(".sql")).sort();
}

/**
 * Un fichier est « manuel » s'il refuse de s'exécuter seul.
 *
 * Trois formes se présentent, et chacune a sa raison. Le garde-fou en tête,
 * qui lève une exception parce que le script a été retiré. Le jeton de
 * confirmation à remplacer à la main, qui interdit un import involontaire. Et
 * la dépendance à des données du catalogue, qui fait échouer le script sur une
 * base neuve sans rien dire de son bien-fondé en production.
 */
function classer(nom, sql) {
  const tete = sql.split("\n").slice(0, 14).join("\n");
  if (/raise exception/i.test(tete) && /retir/i.test(tete)) {
    return { genre: "retiré", motif: "le script annonce lui-même qu'il n'insère plus rien" };
  }
  if (/EN-ATTENTE/.test(sql)) {
    return { genre: "manuel", motif: "exige qu'un jeton de confirmation soit remplacé à la main" };
  }
  if (sql.includes(REF_RECETTE)) {
    return { genre: "recette seule", motif: "nomme le projet de recette comme seule cible autorisée" };
  }
  if (sql.includes(REF_PRODUCTION)) {
    return { genre: "à relire", motif: "nomme le projet de production" };
  }
  // Un contrôle de prérequis plus loin dans le fichier dit autre chose qu'un
  // retrait : le script vérifie que des données existent avant d'agir, et
  // s'arrête sinon. Sur une base neuve il échoue donc toujours, sans que cela
  // le condamne en production, où ces données existent peut-être. La
  // distinction compte : classé « automatique », il ferait croire à un échec
  // de migration ; classé « retiré », on ne l'appliquerait jamais.
  const prerequis = [...sql.matchAll(/raise exception '([^']{4,120})'/gi)]
    .map(m => m[1])
    .filter(texte => /introuvable|manquant|absent|inexistant/i.test(texte));
  if (prerequis.length) {
    return { genre: "conditionnel", motif: `s'arrête si un prérequis manque — « ${prerequis[0]} »` };
  }
  return { genre: "automatique", motif: "" };
}

/**
 * Objets qu'un fichier crée, pour pouvoir demander à la base si elle les a.
 *
 * L'analyse reste volontairement littérale : on ne cherche pas à comprendre le
 * SQL, seulement à relever des noms. Un relevé incomplet se verrait à
 * l'inventaire, qui signalerait un objet absent alors qu'il existe ; l'inverse
 * n'est pas possible, puisqu'on ne relève que ce qui est écrit.
 */
function objets(sql) {
  // Le SQL dynamique est écarté. Une migration qui construit ses noms par
  // « format('create index if not exists %I', …) » ne nomme aucun objet de
  // façon lisible : l'inventaire ne peut rien demander à son sujet. Les y
  // laisser produisait un objet fantôme appelé « if », et un objet fantôme
  // signalé absent en production aurait fait croire à un travail restant.
  const propre = sql.replace(/--[^\n]*/g, "").replace(/do\s+\$\$[\s\S]*?\$\$\s*;/gi, "");
  const trouve = { tables: [], colonnes: [], index: [], fonctions: [], contraintes: [] };
  for (const m of propre.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.("?[\w]+"?)/gi)) {
    trouve.tables.push(m[1].replace(/"/g, ""));
  }
  for (const m of propre.matchAll(/alter\s+table\s+public\.("?[\w]+"?)([\s\S]*?);/gi)) {
    const table = m[1].replace(/"/g, "");
    for (const c of m[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?("?[\w]+"?)/gi)) {
      trouve.colonnes.push(`${table}.${c[1].replace(/"/g, "")}`);
    }
    for (const c of m[2].matchAll(/add\s+constraint\s+("?[\w]+"?)/gi)) {
      trouve.contraintes.push(c[1].replace(/"/g, ""));
    }
  }
  for (const m of propre.matchAll(/create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?("?[\w]+"?)/gi)) {
    trouve.index.push(m[1].replace(/"/g, ""));
  }
  for (const m of propre.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.("?[\w]+"?)/gi)) {
    trouve.fonctions.push(m[1].replace(/"/g, ""));
  }
  return trouve;
}

/**
 * Une création sans garde échouerait sur un objet déjà présent.
 *
 * C'est le risque principal ici : la production possède déjà la plus grande
 * partie de ce schéma. Un `create table` sans `if not exists` interrompt la
 * migration, et une migration interrompue laisse un état partiel.
 */
function creationsNonGardees(sql) {
  // Les blocs « do $$ … $$ » sont retirés de l'analyse. Ce qu'ils contiennent
  // peut être gardé par une condition que ce script ne sait pas lire : une
  // création y figurant n'a donc rien d'alarmant, et la signaler ferait crier
  // au loup. C'était le cas de la semence des organisations, qui se déclare
  // elle-même rejouable.
  const propre = sql.replace(/--[^\n]*/g, "").replace(/do\s+\$\$[\s\S]*?\$\$\s*;/gi, "");
  const cas = [];
  for (const m of propre.matchAll(/create\s+table\s+(?!if\s+not\s+exists)(public\.[\w"]+)/gi)) cas.push(`table ${m[1]}`);
  for (const m of propre.matchAll(/create\s+(?:unique\s+)?index\s+(?!concurrently|if\s+not\s+exists)([\w"]+)/gi)) cas.push(`index ${m[1]}`);
  for (const m of propre.matchAll(/create\s+function\s+(public\.[\w"]+)/gi)) cas.push(`fonction ${m[1]} (sans « or replace »)`);
  return cas;
}

const tous = fichiers().map(nom => {
  const sql = readFileSync(resolve(DOSSIER, nom), "utf8");
  return { nom, sql, ...classer(nom, sql), objets: objets(sql), nonGardees: creationsNonGardees(sql) };
});

if (process.argv.includes("--inventaire")) {
  const auto = tous.filter(f => f.genre === "automatique");
  const uniq = cle => [...new Set(auto.flatMap(f => f.objets[cle]))].sort();
  const liste = valeurs => valeurs.map(v => `    ('${v}')`).join(",\n");
  process.stdout.write(`-- Inventaire de la PRODUCTION, en LECTURE SEULE.
--
-- Cette requête ne crée, ne modifie et ne supprime rien. Elle répond à une
-- seule question : parmi les objets que les migrations du dépôt créent,
-- lesquels la base possède-t-elle déjà ? Les lignes « absent » sont le travail
-- qui reste. Les lignes « présent » disent quelles migrations ont déjà été
-- jouées, ce qu'aucun historique ne consigne ici.
--
-- Produite par scripts/mise-en-service/preparer-migrations-production.mjs,
-- à partir de ${auto.length} migrations automatiques.

with attendu(genre, nom) as (
  select 'table', nom from (values
${liste(uniq("tables"))}
  ) as t(nom)
  union all select 'colonne', nom from (values
${liste(uniq("colonnes"))}
  ) as t(nom)
  union all select 'index', nom from (values
${liste(uniq("index"))}
  ) as t(nom)
  union all select 'fonction', nom from (values
${liste(uniq("fonctions"))}
  ) as t(nom)
)
select
  a.genre,
  a.nom,
  case
    when a.genre = 'table' then exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = a.nom)
    when a.genre = 'colonne' then exists (
      select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = split_part(a.nom, '.', 1)
         and column_name = split_part(a.nom, '.', 2))
    when a.genre = 'index' then exists (
      select 1 from pg_indexes where schemaname = 'public' and indexname = a.nom)
    when a.genre = 'fonction' then exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = a.nom)
  end as present
from attendu a
order by present, a.genre, a.nom;
`);
  process.exit(0);
}

const par = genre => tous.filter(f => f.genre === genre);
const bloc = (titre, items, ligne) => {
  console.log(`\n  ${titre}`);
  console.log(`  ${"─".repeat(titre.length)}`);
  if (!items.length) { console.log("    aucun"); return; }
  for (const f of items) console.log(ligne(f));
};

console.log(`\n  ${tous.length} fichiers dans supabase/migrations.\n`);

bloc("À appliquer en production, dans l'ordre des noms", par("automatique"),
  f => `    ${f.nom}`);

bloc("À ne pas appliquer en production", [...par("retiré"), ...par("manuel"), ...par("recette seule"), ...par("à relire")],
  f => `    ${f.nom}\n      ${f.genre} — ${f.motif}`);

bloc("À appliquer seulement si le prérequis est là", par("conditionnel"),
  f => `    ${f.nom}\n      ${f.motif}`);

const risques = par("automatique").filter(f => f.nonGardees.length);
bloc("Créations sans garde, qui échoueraient sur un objet déjà présent", risques,
  f => `    ${f.nom}\n      ${f.nonGardees.join("\n      ")}`);

const auto = par("automatique");
console.log(`
  Objets créés par les ${auto.length} migrations automatiques
  ${"─".repeat(46)}
    ${[...new Set(auto.flatMap(f => f.objets.tables))].length} table(s)
    ${[...new Set(auto.flatMap(f => f.objets.colonnes))].length} colonne(s) ajoutée(s)
    ${[...new Set(auto.flatMap(f => f.objets.index))].length} index
    ${[...new Set(auto.flatMap(f => f.objets.fonctions))].length} fonction(s)

  ${tous.filter(f => /do\s+\$\$[\s\S]*?(create|alter)\s/i.test(f.sql)).length} migration(s) créent des objets depuis un bloc « do $$ », parfois en
  construisant leurs noms. L'inventaire ne peut rien dire de ceux-là : il
  n'est donc pas exhaustif, et ne doit pas être lu comme tel.

  Étape suivante, en lecture seule, sans rien appliquer :
    node scripts/mise-en-service/preparer-migrations-production.mjs --inventaire

  La requête produite dit ce que la production possède déjà. Les lignes
  « absent » sont le seul travail restant.
`);

if (risques.length) process.exitCode = 1;
