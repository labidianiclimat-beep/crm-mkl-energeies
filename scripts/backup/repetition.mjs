/**
 * Répétition de la sauvegarde, sur la base de test et non sur la production.
 *
 * Reproduit exactement ce que fera `sauvegarder-production.sh` : la requête
 * d'inventaire, les options de pg_dump, puis la vérification. La seule
 * différence est la base visée.
 *
 * Son intérêt : si cette répétition passe, la procédure du jour J ne découvre
 * pas un problème d'outillage au moment où il coûte le plus cher. Les options
 * de pg_dump, la requête d'inventaire et le script de vérification sont les
 * mêmes, lus depuis les mêmes fichiers pour qu'ils ne puissent pas divergar.
 *
 *   bash scripts/pg-test/install.sh
 *   bash scripts/backup/installer-outils-pg.sh
 *   node scripts/backup/repetition.mjs
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { CONNEXION, ORG, journal, preparerBase } from "../pg-test/lib.mjs";

const executer = promisify(execFile);
const log = journal();
const OUTILS = join(process.env.PG_OUTILS_HOME || join(homedir(), ".mkl-pgtools"), "bin");
const SORTIE = join(tmpdir(), "mkl-repetition");
const SCRIPT = new URL("./sauvegarder-production.sh", import.meta.url);

log.titre("Répétition de la sauvegarde, sur la base de test");

if (!existsSync(join(OUTILS, "pg_dump"))) {
  log.ko(`pg_dump introuvable dans ${OUTILS}`);
  log.info("Lancez d'abord : bash scripts/backup/installer-outils-pg.sh");
  log.bilan();
  process.exit(1);
}

mkdirSync(SORTIE, { recursive: true });

// ---------------------------------------------------------------------------
log.titre("1. Les options employées sont bien celles du script de production");
// ---------------------------------------------------------------------------

/**
 * Les options sont relues dans le script, et non recopiées ici. Une copie
 * diverge en silence dès la première retouche, et la répétition cesserait
 * alors de répéter quoi que ce soit.
 */
const source = readFileSync(SCRIPT, "utf8");

// La fin du bloc est cherchée *après* son début : `2>>"$JOURNAL"` apparaît
// aussi dans la fonction de choix de connexion, plus haut dans le fichier, et
// une recherche depuis le début donnait un intervalle vide. Les options
// étaient alors silencieusement absentes, et la sauvegarde sortait en texte
// brut au lieu du format personnalisé.
const debut = source.indexOf('"$OUTILS/pg_dump" \\');
const bloc = source.slice(debut, source.indexOf('2>>"$JOURNAL"', debut));
if (debut === -1 || bloc.length === 0) {
  log.ko("l'appel à pg_dump n'a pas été retrouvé dans le script de production");
  log.bilan();
  process.exit(1);
}
const OPTIONS = bloc
  .split("\n")
  .map(ligne => ligne.trim().replace(/\\$/, "").trim())
  .filter(ligne => ligne.startsWith("--"))
  .filter(ligne => !ligne.startsWith("--file"));

for (const attendue of ["--format=custom", "--compress=9", "--verbose"]) {
  if (OPTIONS.includes(attendue)) log.ok(`option reprise du script : ${attendue}`);
  else log.ko(`option absente du script de production : ${attendue}`);
}

const requete = source.slice(source.indexOf("select table_schema"), source.indexOf("order by 1;") + 11);
if (requete.includes("query_to_xml") && !requete.includes("n_live_tup")) {
  log.ok("l'inventaire compte exactement, sans estimation d'autovacuum");
} else {
  log.ko("la requête d'inventaire n'est pas celle attendue");
}

// ---------------------------------------------------------------------------
log.titre("2. Une base ressemblant à la production");
// ---------------------------------------------------------------------------

const { sql } = await preparerBase("mkl_repetition");
await sql`insert into public.organizations (id, name) values (${ORG}, 'MKL Essai') on conflict (id) do nothing`;

// Assez de lignes pour que des comptes faux se voient, et des accents et
// apostrophes pour éprouver l'encodage de bout en bout.
for (let i = 0; i < 40; i += 1) {
  await sql`
    insert into public.commercial_opportunities
      (organization_id, name, phone, stage, source, notes)
    values (${ORG}, ${`Fiche n° ${i} — Prévisite à Mâcon`}, ${`06${String(10000000 + i)}`},
            'Nouveau', ${i % 2 ? "Prospection" : "Appel entrant"},
            ${"Note avec apostrophe d'essai et caractères accentués : œuf, çà, ÿ"})
  `;
}
const [{ fiches }] = await sql`select count(*)::int as fiches from public.commercial_opportunities`;
log.ok(`${fiches} fiches posées, avec accents et apostrophes`);

// ---------------------------------------------------------------------------
log.titre("3. Inventaire puis sauvegarde, avec les options du script");
// ---------------------------------------------------------------------------

const environnement = { ...process.env, PGPASSWORD: CONNEXION.password };
const commun = [
  "--host", CONNEXION.host,
  "--port", String(CONNEXION.port),
  "--username", CONNEXION.user,
  "--dbname", "mkl_repetition",
];

const horodatage = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const archive = join(SORTIE, `public-${horodatage}.dump`);
const inventaire = join(SORTIE, `inventaire-${horodatage}.txt`);

const { stdout: comptes } = await executer(
  join(OUTILS, "psql"),
  [...commun, "-Atq", "-F|", "-c", requete],
  { env: environnement, maxBuffer: 16 * 1024 * 1024 }
);
writeFileSync(inventaire, comptes, { mode: 0o600 });
log.ok(`inventaire relevé : ${comptes.trim().split("\n").length} tables`);

await executer(join(OUTILS, "pg_dump"), [...commun, ...OPTIONS, "--schema=public", `--file=${archive}`], {
  env: environnement,
  maxBuffer: 64 * 1024 * 1024,
});
log.ok("sauvegarde produite avec les options exactes du script de production");

// ---------------------------------------------------------------------------
log.titre("4. La base d'origine n'a pas été modifiée");
// ---------------------------------------------------------------------------

// pg_dump lit dans une transaction et n'écrit rien. On le constate plutôt que
// de l'affirmer : c'est la promesse faite dans la procédure.
const [{ apres }] = await sql`select count(*)::int as apres from public.commercial_opportunities`;
if (apres === fiches) log.ok("le nombre de fiches est inchangé après la sauvegarde");
else log.ko(`le compte a changé : ${apres} au lieu de ${fiches}`);
await sql.end();

// ---------------------------------------------------------------------------
log.titre("5. La vérification, telle que vous la lancerez");
// ---------------------------------------------------------------------------

try {
  const { stdout } = await executer(
    process.execPath,
    [new URL("./verifier-sauvegarde.mjs", import.meta.url).pathname, archive],
    { env: process.env, maxBuffer: 16 * 1024 * 1024 }
  );
  const bilan = stdout.trim().split("\n").filter(l => /vérifications/.test(l)).pop() || "";
  if (/réussies$/.test(bilan)) log.ok(`le script de vérification conclut : ${bilan.trim()}`);
  else log.ko(`vérification en échec : ${bilan.trim()}`);
} catch (error) {
  const sortie = String(error.stdout || "") + String(error.stderr || "");
  const echecs = sortie.split("\n").filter(l => l.includes("✗"));
  log.ko("le script de vérification a échoué", echecs.slice(0, 4).join(" | ").slice(0, 400));
}

console.log("");
console.log(`Fichiers de répétition : ${SORTIE}`);
console.log("Ils ne contiennent aucune donnée réelle et peuvent être supprimés.");

process.exitCode = log.bilan() ? 0 : 1;
