/**
 * Test réseau réel, à exécuter DEPUIS le VPS OVH vers le CRM RECETTE.
 *
 *   node test-reseau-ovh.mjs
 *   node test-reseau-ovh.mjs --module /chemin/vers/ovh-site/lib/crm-sync.mjs
 *
 * Ce que les tests locaux ne peuvent pas démontrer : la résolution du nom
 * depuis le VPS, la sortie réseau effective, la poignée de main TLS, et le
 * comportement d'un éventuel intermédiaire sur le chemin. Tout cela se joue
 * entre la machine OVH et Vercel, et aucune exécution sur un poste de travail
 * n'en dit quoi que ce soit.
 *
 * Ce script n'écrit aucun fichier et ne touche pas au site en ligne. Il se
 * copie dans /tmp, s'exécute, et peut être supprimé ensuite. Il ne lit aucune
 * configuration privée : les trois valeurs dont il a besoin sont passées par
 * l'environnement, et le secret peut être saisi à l'écran masqué.
 *
 *   CRM_SYNC_URL       adresse complète de la route d'ingestion du CRM RECETTE
 *   CRM_SYNC_KEY_ID    identifiant de clé déclaré dans WEB_LEAD_KEYRING
 *   CRM_SYNC_SECRET    secret correspondant, jamais affiché
 *   CRM_SYNC_BYPASS    facultatif, jeton de contournement de la protection
 *                      Vercel. Nécessaire quand « Vercel Authentication »
 *                      est active : elle intercepte la requête avant la route
 *                      d'ingestion et rend 401 sans jamais lire la signature.
 *
 * Avec `--module`, la signature est produite par le module du site lui-même,
 * ce qui éprouve le code qui tournera réellement. Sans lui, une signature
 * équivalente est calculée ici, à partir de la même chaîne canonique.
 *
 * Les données envoyées sont fictives : domaine `.test`, réservé par la norme,
 * et numéro non attribuable.
 */

import { createHash, createHmac, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { connect } from "node:tls";
import { createInterface } from "node:readline";

const REF_PRODUCTION = "rzkwmwtjnwnmmcexwoov";
// La marque contient celle du test HTTP, afin que le nettoyage déjà écrit
// ramasse aussi les demandes créées par ce script.
const MARQUE = "essai-http-ovh-reseau";

const resultats = [];
function noter(intitule, attendu, obtenu, detail = "") {
  const verdict = String(attendu) === String(obtenu) ? "réussi" : "ÉCHOUÉ";
  resultats.push({ verdict });
  console.log(`  ${intitule.padEnd(46)} ${String(attendu).padEnd(14)} ${String(obtenu).padEnd(14)} ${verdict}`);
  if (detail) console.log(`      ${detail}`);
}
function info(intitule, valeur) {
  console.log(`  ${intitule.padEnd(46)} ${valeur}`);
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Le chemin du module peut arriver par l'environnement plutôt que par la ligne
// de commande : exécuté à distance, ce script est transmis par l'entrée
// standard, et n'a donc ni fichier sur le disque ni arguments à lui.
const argModule = (() => {
  const i = process.argv.indexOf("--module");
  if (i > 0 && process.argv[i + 1]) return process.argv[i + 1];
  return String(process.env.CRM_SYNC_MODULE || "").trim();
})();

const url = String(process.env.CRM_SYNC_URL || "").trim();
const keyId = String(process.env.CRM_SYNC_KEY_ID || "").trim();

if (!url || !keyId) {
  console.error("\n  Il manque CRM_SYNC_URL ou CRM_SYNC_KEY_ID.\n");
  console.error("  Exemple :");
  console.error("    export CRM_SYNC_URL='https://<deploiement-recette>.vercel.app/api/web-leads'");
  console.error("    export CRM_SYNC_KEY_ID='ovh-recette'\n");
  process.exit(2);
}

// Le refus porte sur l'identifiant de projet et sur le domaine de production.
// Un test réseau qui atteindrait la production enverrait un faux prospect dans
// les fiches réelles : c'est exactement ce qu'il ne doit jamais faire.
if (url.includes(REF_PRODUCTION)) {
  console.error("\n  L'adresse visée porte l'identifiant du projet de PRODUCTION : arrêt.\n");
  process.exit(2);
}

let cible;
try {
  cible = new URL(url);
} catch {
  console.error("\n  CRM_SYNC_URL n'est pas une adresse valide : arrêt.\n");
  process.exit(2);
}
// HTTPS est exigé partout, sauf sur l'interface locale. L'exception n'est pas
// un confort : elle permet d'éprouver ce script contre un CRM lancé sur le
// poste de travail avant de le copier sur le VPS. Du trafic qui ne quitte pas
// la machine ne peut pas être écouté sur le réseau.
const boucleLocale = ["127.0.0.1", "::1", "localhost", "[::1]"].includes(cible.hostname);
if (cible.protocol !== "https:" && !boucleLocale) {
  console.error("\n  Seul HTTPS est accepté hors de l'interface locale : la signature");
  console.error("  authentifie l'émetteur, elle ne chiffre pas le contenu.\n");
  process.exit(2);
}
if (!cible.pathname.endsWith("/api/web-leads")) {
  console.error(`\n  Le chemin « ${cible.pathname} » n'est pas la route d'ingestion : arrêt.\n`);
  process.exit(2);
}

async function demanderSecret() {
  const dejaLa = String(process.env.CRM_SYNC_SECRET || "");
  if (dejaLa) return dejaLa;
  if (!process.stdin.isTTY) {
    console.error("\n  CRM_SYNC_SECRET absent, et aucun terminal pour le saisir.\n");
    process.exit(2);
  }
  const lecture = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  process.stdout.write("  Secret partagé (saisie invisible) : ");
  // L'écho est coupé le temps de la frappe : la valeur ne doit apparaître ni
  // à l'écran, ni dans l'historique du shell.
  lecture.output.write = () => {};
  const valeur = await new Promise(r => lecture.question("", reponse => { lecture.close(); r(reponse); }));
  process.stdout.write("\n\n");
  return String(valeur).trim();
}

const secret = await demanderSecret();
if (secret.length < 32) {
  console.error("\n  Le secret fait moins de 32 caractères : le CRM le refusera.\n");
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Signature : celle du site quand son module est fourni, sinon la même chaîne
// canonique recalculée ici.
// ---------------------------------------------------------------------------

let signerCanonique = (cle, canonique) =>
  createHmac("sha256", cle).update(canonique, "utf8").digest("hex");
let chaineCanonique = ({ method, path, timestamp, nonce, rawBody }) =>
  ["v1", method, path, String(timestamp), String(nonce),
    createHash("sha256").update(rawBody ?? "", "utf8").digest("hex")].join("\n");
let origineSignature = "recalculée par ce script";

if (argModule) {
  try {
    const module = await import(argModule.startsWith("/") ? argModule : `${process.cwd()}/${argModule}`);
    if (typeof module.canonicalString === "function" && typeof module.signCanonical === "function") {
      chaineCanonique = module.canonicalString;
      signerCanonique = module.signCanonical;
      origineSignature = "module du site";
    } else {
      origineSignature = "module du site inutilisable, repli sur le calcul local";
    }
  } catch (erreur) {
    origineSignature = `module du site illisible (${erreur.code || erreur.message}), repli local`;
  }
}

const bypass = String(process.env.CRM_SYNC_BYPASS || "").trim();

function entetes({ corps, horodatage = Date.now(), nonce = randomUUID(), falsifier = false }) {
  const canonique = chaineCanonique({
    method: "POST", path: cible.pathname, timestamp: horodatage, nonce, rawBody: corps,
  });
  let signature = signerCanonique(secret, canonique);
  if (falsifier) {
    // Un seul caractère changé suffit, et vaut mieux qu'une signature inventée :
    // la longueur et l'alphabet restent exacts, seul le contenu diffère.
    const dernier = signature.slice(-1) === "a" ? "b" : "a";
    signature = signature.slice(0, -1) + dernier;
  }
  return {
    "content-type": "application/json",
    "x-mkl-key-id": keyId,
    "x-mkl-timestamp": String(horodatage),
    "x-mkl-nonce": nonce,
    "x-mkl-signature": `v1=${signature}`,
    ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
  };
}

async function envoyer(corps, enTetes, limiteMs = 20_000) {
  const debut = Date.now();
  try {
    const reponse = await fetch(url, {
      method: "POST", headers: enTetes, body: corps,
      signal: AbortSignal.timeout(limiteMs), redirect: "error",
    });
    let charge = null;
    try { charge = await reponse.json(); } catch { /* corps non JSON */ }
    return { statut: reponse.status, charge, duree: Date.now() - debut };
  } catch (erreur) {
    return {
      statut: 0,
      charge: { error: erreur?.cause?.code || erreur?.name || erreur.message },
      duree: Date.now() - debut,
    };
  }
}

// ---------------------------------------------------------------------------

console.log(`\n  Test réseau OVH → CRM RECETTE\n`);
info("Hôte visé", cible.hostname);
info("Chemin", cible.pathname);
info("Identifiant de clé", keyId);
info("Secret", `${secret.length} caractères, jamais affiché`);
info("Signature", origineSignature);
info("Contournement Vercel", bypass ? `${bypass.length} caractères, jamais affiché` : "aucun jeton fourni");
console.log("");

// 1. Résolution du nom depuis cette machine.
try {
  const adresses = await lookup(cible.hostname, { all: true });
  noter("le nom se résout depuis le VPS", "oui", adresses.length ? "oui" : "non",
    adresses.map(a => `IPv${a.family} ${a.address}`).join(", "));
} catch (erreur) {
  noter("le nom se résout depuis le VPS", "oui", "non", `échec DNS : ${erreur.code || erreur.message}`);
}

// 2. Poignée de main TLS, avant toute requête : un pare-feu sortant ou un
//    intermédiaire qui réécrit le certificat se voit ici, et nulle part ailleurs.
//    Sans chiffrement sur l'interface locale, il n'y a rien à vérifier.
if (cible.protocol !== "https:") {
  info("poignée de main TLS", "sans objet sur l'interface locale");
} else await new Promise(resoudre => {
  const prise = connect(
    { host: cible.hostname, port: Number(cible.port || 443), servername: cible.hostname, timeout: 15_000 },
    () => {
      const certificat = prise.getPeerCertificate();
      noter("la poignée de main TLS aboutit", "oui", prise.authorized ? "oui" : "non vérifiée",
        `${prise.getProtocol()}, délivré par ${certificat?.issuer?.O || "émetteur inconnu"}, ` +
        `valable jusqu'au ${certificat?.valid_to || "?"}`);
      prise.end();
      resoudre();
    },
  );
  prise.on("timeout", () => { noter("la poignée de main TLS aboutit", "oui", "délai dépassé"); prise.destroy(); resoudre(); });
  prise.on("error", erreur => { noter("la poignée de main TLS aboutit", "oui", "non", erreur.code || erreur.message); resoudre(); });
});

const soumission = `${MARQUE}-${randomUUID().slice(0, 8)}`;
const corps = JSON.stringify({
  submissionId: soumission,
  kind: "lead",
  name: "Essai Reseau Fictif",
  phone: "0600000009",
  email: "essai-reseau@exemple.test",
  message: "Test reseau OVH vers recette, donnees fictives.",
  attribution: {
    gclid: `${MARQUE}-clic-inexistant`,
    utm_source: "google", utm_medium: "cpc", utm_campaign: "Essai reseau",
    landingPath: "/pompe-a-chaleur.html",
  },
  attributionFirst: {},
});

// 3. Sans signature : prouve que la route atteinte est bien l'ingestion, et
//    que le contrôle HMAC est actif de l'autre côté.
{
  const r = await envoyer(corps, {
    "content-type": "application/json",
    ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
  });
  // Le message distingue les deux 401 possibles, qui n'ont rien à voir : celui
  // de Vercel, qui n'a pas laissé passer la requête, et celui du CRM, qui l'a
  // bien reçue et a refusé la signature. Les confondre ferait croire que
  // l'étage HMAC fonctionne alors que la requête n'arrive même pas.
  const deVercel = /Vercel Authentication/i.test(JSON.stringify(r.charge || {}));
  noter("une requête sans signature est refusée par le CRM", 401, r.statut,
    deVercel
      ? "ATTENTION : refus de Vercel, pas du CRM. La requête n'atteint pas la route."
      : `${r.charge?.error || ""} — ${r.duree} ms aller-retour`);
  if (deVercel) {
    console.log("      Fournissez CRM_SYNC_BYPASS, ou ouvrez la protection du déploiement.");
  }
}

// 4. Signature falsifiée d'un caractère.
{
  const r = await envoyer(corps, entetes({ corps, falsifier: true }));
  noter("une signature falsifiée est refusée", 401, r.statut, r.charge?.error || "");
}

// 5. Horodatage hors fenêtre : met aussi en évidence une horloge du VPS
//    décalée, qui ferait échouer tous les envois réels.
{
  const r = await envoyer(corps, entetes({ corps, horodatage: Date.now() - 10 * 60_000 }));
  noter("un horodatage de dix minutes est refusé", 401, r.statut, r.charge?.error || "");
}

// 6. Envoi valide.
let premiere = null;
{
  const r = await envoyer(corps, entetes({ corps }));
  premiere = r;
  noter("l'envoi signé est accepté", 201, r.statut,
    `identifiant ${r.charge?.id || "absent"}, ${r.duree} ms aller-retour`);
  noter("la demande est tenue pour neuve", "false", String(r.charge?.duplicate));
}

// 7. Relance : même identifiant de soumission, signature neuve.
if (premiere?.statut === 201) {
  const r = await envoyer(corps, entetes({ corps }));
  noter("la relance ne crée pas de doublon", 200, r.statut, `identifiant ${r.charge?.id || "absent"}`);
  noter("la relance est signalée comme connue", "true", String(r.charge?.duplicate));
  noter("la relance porte le même identifiant", premiere.charge?.id, r.charge?.id,
    "le CRM a reconnu la demande au lieu d'en créer une seconde");
}

// ---------------------------------------------------------------------------

const echecs = resultats.filter(r => r.verdict !== "réussi").length;
console.log(`\n  ${resultats.length - echecs} réussi(s), ${echecs} échoué(s)`);
console.log(`\n  Demande fictive créée : ${soumission}`);
console.log("  Nettoyage, depuis le poste de travail :");
console.log("    node scripts/recette/test-http-ovh.mjs --nettoyer\n");
console.log("  Ce script n'a écrit aucun fichier sur le VPS et n'a pas touché au site.\n");
process.exit(echecs === 0 ? 0 : 1);
