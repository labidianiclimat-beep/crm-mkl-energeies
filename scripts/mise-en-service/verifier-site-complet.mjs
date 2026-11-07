/**
 * Refuse un déploiement du site OVH dont l'arbre serait incomplet.
 *
 *   node scripts/mise-en-service/verifier-site-complet.mjs
 *
 * Pourquoi ce contrôle existe : `deploy.sh` synchronise avec `rsync --delete`.
 * Un module importé par le code mais absent du dépôt ne provoque donc pas une
 * simple omission — il est SUPPRIMÉ du serveur. Le site ne redémarre plus, et
 * la cause est invisible dans le journal du déploiement, qui ne signale que
 * des suppressions parmi des centaines de lignes.
 *
 * Le contrôle distingue deux familles de chemins, et c'est tout son intérêt :
 *
 *   — les imports résolus sur le DISQUE, par Node, au démarrage du serveur. Un
 *     manque ici empêche le site de démarrer.
 *   — les imports résolus par HTTP, dans le navigateur. `site-public/app.js`
 *     écrit « ./lib/attribution-capture.mjs », que le serveur sert depuis
 *     « ovh-site/lib/ » grâce à la liste blanche de public-static.mjs. Ces
 *     chemins n'ont pas à exister sous site-public, et les signaler serait une
 *     fausse alerte.
 *
 * Aucune écriture, aucun accès réseau.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = fileURLToPath(new URL("../..", import.meta.url));
const SITE = path.join(RACINE, "ovh-site");
const PUBLIC = path.join(SITE, "site-public");

const resultats = [];
function noter(intitule, ok, detail = "") {
  resultats.push({ ok, intitule });
  console.log(`  ${ok ? "✓" : "✗"} ${intitule}`);
  if (detail) console.log(`      ${detail}`);
}

function sources(dossier) {
  const trouves = [];
  for (const entree of readdirSync(dossier)) {
    if (entree === "node_modules" || entree === ".git") continue;
    const complet = path.join(dossier, entree);
    if (statSync(complet).isDirectory()) trouves.push(...sources(complet));
    else if (/\.(mjs|js)$/.test(entree)) trouves.push(complet);
  }
  return trouves;
}

// Les chemins que le serveur sert au navigateur depuis un autre dossier que
// celui du fichier qui les importe. Lus dans public-static.mjs plutôt que
// recopiés : si la liste blanche change, ce contrôle suit.
function cheminsServis() {
  const source = readFileSync(path.join(SITE, "lib", "public-static.mjs"), "utf8");
  const servis = new Set();
  for (const m of source.matchAll(/"(\/(?:lib|data)\/[^"]+)"/g)) servis.add(m[1]);
  return servis;
}

const SERVIS = cheminsServis();
const fichiers = sources(SITE);

const manquantsDisque = new Map();
const servisAbsents = new Map();

for (const fichier of fichiers) {
  const source = readFileSync(fichier, "utf8");
  for (const m of source.matchAll(/from\s+"(\.[^"]+)"/g)) {
    const brut = m[1];
    const cible = path.resolve(path.dirname(fichier), brut);
    if (existsSync(cible)) continue;

    const relatif = path.relative(RACINE, cible);

    // Un import de site-public qui désigne /lib/… ou /data/… est résolu par le
    // serveur HTTP. Ce qui doit alors exister, c'est le fichier servi.
    if (fichier.startsWith(PUBLIC)) {
      const urlEquivalente = "/" + path.relative(PUBLIC, cible).replace(/\\/g, "/");
      if (SERVIS.has(urlEquivalente)) {
        const servi = path.join(SITE, urlEquivalente);
        if (!existsSync(servi)) {
          servisAbsents.set(urlEquivalente, path.relative(RACINE, fichier));
        }
        continue;
      }
    }

    if (!manquantsDisque.has(relatif)) manquantsDisque.set(relatif, []);
    manquantsDisque.get(relatif).push(path.relative(RACINE, fichier));
  }
}

console.log("\n  Complétude de l'arbre du site OVH\n");
console.log(`  ${fichiers.length} fichiers source examinés, ${SERVIS.size} chemins publics déclarés\n`);

// Rassurant, et il faut le dire avant le reste : deploy.sh exige index.html et
// app.js à la racine du site. Ici ils sont sous site-public/. Le script refuse
// donc déjà de partir de ce dépôt, et aucun manque relevé plus bas ne peut, à
// lui seul, casser le site en ligne par un rsync --delete accidentel.
const deployable = existsSync(path.join(SITE, "index.html")) && existsSync(path.join(SITE, "app.js"));
console.log(deployable
  ? "  Cet arbre satisfait le critère de deploy.sh : il EST déployable.\n"
  : "  Cet arbre ne satisfait pas le critère de deploy.sh (index.html et app.js\n"
    + "  à la racine) : le déploiement depuis ce dépôt est refusé d'emblée.\n"
    + "  C'est une copie de travail, pas la source de déploiement.\n");

noter(
  "tout module importé au démarrage existe sur le disque",
  manquantsDisque.size === 0,
  manquantsDisque.size === 0
    ? "le serveur peut démarrer depuis ce dépôt"
    : [...manquantsDisque].map(([cible, par]) =>
        `${cible} — importé par ${[...new Set(par)].join(", ")}`).join("\n      "),
);

noter(
  "tout module servi au navigateur existe sur le disque",
  servisAbsents.size === 0,
  servisAbsents.size === 0
    ? "les pages peuvent charger leurs modules"
    : [...servisAbsents].map(([url, par]) =>
        `${url} — attendu par ${par}, absent de ovh-site`).join("\n      "),
);

// Les substituts écrits pour la recette ne doivent jamais partir sur le serveur.
// rsync synchronise l'arbre de travail et ignore .gitignore : seule une
// exclusion explicite dans deploy.sh les retient.
const deploiement = readFileSync(path.join(SITE, "deploy", "ovh", "deploy.sh"), "utf8");
const aProteger = ["data/slots.js", "data/realisations.js"];
const nonExclus = aProteger.filter(f => !deploiement.includes(`--exclude '${f}'`));

noter(
  "les fichiers appartenant au serveur sont exclus du déploiement",
  nonExclus.length === 0,
  nonExclus.length === 0
    ? "rsync ne les écrasera pas"
    : `absents des exclusions de deploy.sh : ${nonExclus.join(", ")}`,
);

const echecs = resultats.filter(r => !r.ok).length;
console.log(`\n  ${resultats.length - echecs} contrôle(s) passé(s), ${echecs} en échec\n`);

if (echecs && deployable) {
  console.log("  Arbre déployable ET incomplet : danger immédiat. rsync --delete");
  console.log("  retirerait du serveur les modules manquants ici, et le site ne");
  console.log("  redémarrerait pas. Ne déployez pas avant d'avoir corrigé.\n");
} else if (echecs) {
  console.log("  Aucun risque immédiat pour le site en ligne, puisque le");
  console.log("  déploiement depuis cet arbre est refusé. Mais ces manques");
  console.log("  empêchent de démarrer le serveur du site en local, donc");
  console.log("  d'éprouver l'intégration autrement que pièce par pièce.\n");
}

process.exit(echecs === 0 ? 0 : 1);
