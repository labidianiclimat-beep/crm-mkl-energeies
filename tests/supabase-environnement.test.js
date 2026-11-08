/**
 * Cloisonnement des environnements de déploiement, et crons sans secret d'URL.
 *
 * Les valeurs employées ici sont fabriquées. Aucune référence de projet ni
 * aucune clé réelle n'apparaît dans ce fichier.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  ENVIRONMENT_REJECTIONS,
  environmentRejectionMessage,
  environmentVerdict,
  projectRefFromKey,
  projectRefFromUrl,
} from "../app/lib/supabase-environment.js";
import { cronAuthorized } from "../app/lib/cron-auth.js";

const racine = fileURLToPath(new URL("..", import.meta.url));
const lire = nom => readFileSync(new URL(`../${nom}`, import.meta.url), "utf8");

const REF_PROD = "abcdefghijklmnop";
const REF_TEST = "qrstuvwxyz123456";
const URL_PROD = `https://${REF_PROD}.supabase.co`;
const URL_TEST = `https://${REF_TEST}.supabase.co`;

/** Fabrique une clé de la forme historique, dont la charge porte `ref`. */
function cleJwt(ref) {
  const encode = objet => Buffer.from(JSON.stringify(objet)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iss: "supabase", ref, role: "service_role" })}.signature`;
}

// ---------------------------------------------------------------------------
// Lecture des références
// ---------------------------------------------------------------------------

test("la référence de projet se lit dans l'URL, et seulement là où elle existe", () => {
  assert.equal(projectRefFromUrl(URL_PROD), REF_PROD);
  assert.equal(projectRefFromUrl(`${URL_PROD}/`), REF_PROD);
  assert.equal(projectRefFromUrl(`HTTPS://${REF_PROD.toUpperCase()}.SUPABASE.CO`), REF_PROD);

  for (const absente of ["", null, "pas-une-url", "https://exemple.test", "https://supabase.co", "https://trop-court.supabase.co"]) {
    assert.equal(projectRefFromUrl(absente), null, `${absente} ne devrait pas donner de référence`);
  }
});

test("la référence se lit dans une clé historique, pas dans une clé récente", () => {
  assert.equal(projectRefFromKey(cleJwt(REF_PROD)), REF_PROD);

  // Les clés récentes ne sont pas des JWT. Renvoyer `null` rend le contrôle
  // inapplicable, ce qui vaut mieux qu'un faux sentiment de vérification.
  assert.equal(projectRefFromKey("sb_secret_valeurquelconque"), null);
  assert.equal(projectRefFromKey("sb_publishable_valeurquelconque"), null);
  for (const invalide of ["", null, "deux.parties", "a.b.c.d", "pas.du.base64url!!"]) {
    assert.equal(projectRefFromKey(invalide), null);
  }
});

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

test("un Preview visant la production est refusé", () => {
  const verdict = environmentVerdict({
    deploymentEnv: "preview",
    projectUrl: URL_PROD,
    serviceRoleKey: cleJwt(REF_PROD),
    productionRef: REF_PROD,
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, ENVIRONMENT_REJECTIONS.PRODUCTION_FROM_PREVIEW);
});

test("un Preview visant son propre projet est accepté", () => {
  const verdict = environmentVerdict({
    deploymentEnv: "preview",
    projectUrl: URL_TEST,
    serviceRoleKey: cleJwt(REF_TEST),
    productionRef: REF_PROD,
  });
  assert.equal(verdict.ok, true);
});

test("la production visant la production est acceptée", () => {
  const verdict = environmentVerdict({
    deploymentEnv: "production",
    projectUrl: URL_PROD,
    serviceRoleKey: cleJwt(REF_PROD),
    productionRef: REF_PROD,
  });
  assert.equal(verdict.ok, true);
});

test("hors production, une clé qui désigne un autre projet que l'URL est refusée", () => {
  // Le cas le plus dangereux : la clé service de la production avec l'URL d'un
  // projet de test. Les écritures partiraient vers la production sans que
  // l'URL affichée ne le laisse voir.
  for (const environnement of ["preview", "development", ""]) {
    for (const [url, cle] of [
      [URL_TEST, cleJwt(REF_PROD)],
      [URL_PROD, cleJwt(REF_TEST)],
    ]) {
      const verdict = environmentVerdict({ deploymentEnv: environnement, projectUrl: url, serviceRoleKey: cle });
      assert.equal(verdict.ok, false, `${environnement || "local"} devrait refuser`);
      assert.equal(verdict.reason, ENVIRONMENT_REJECTIONS.KEY_PROJECT_MISMATCH);
    }
  }
});

test("en production, la même incohérence est signalée sans bloquer", () => {
  // Décision assumée : un refus couperait le CRM entier, pour une condition
  // qu'on ne peut pas éprouver avant le déploiement, les deux valeurs étant
  // de type Secret chez Vercel et donc illisibles même par la ligne de
  // commande. Le signalement part dans les journaux, le service continue.
  const verdict = environmentVerdict({
    deploymentEnv: "production",
    projectUrl: URL_PROD,
    serviceRoleKey: cleJwt(REF_TEST),
  });
  assert.equal(verdict.ok, true, "la production ne doit pas être coupée");
  assert.equal(verdict.reason, null);
  assert.equal(verdict.warning, ENVIRONMENT_REJECTIONS.KEY_PROJECT_MISMATCH);
  assert.match(environmentRejectionMessage(verdict), /clé service/);
});

test("en Preview, viser la production reste refusé même si la clé est cohérente", () => {
  // Le rempart qui protège vraiment ne dépend d'aucune incohérence de clé :
  // il reste bloquant, c'est lui qui porte la protection.
  const verdict = environmentVerdict({
    deploymentEnv: "preview",
    projectUrl: URL_PROD,
    serviceRoleKey: cleJwt(REF_PROD),
    productionRef: REF_PROD,
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, ENVIRONMENT_REJECTIONS.PRODUCTION_FROM_PREVIEW);
});

test("un verdict sain ne porte aucun signalement", () => {
  const verdict = environmentVerdict({
    deploymentEnv: "production",
    projectUrl: URL_PROD,
    serviceRoleKey: cleJwt(REF_PROD),
    productionRef: REF_PROD,
  });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.warning, null);
  assert.equal(environmentRejectionMessage(verdict), "");
});

test("ce contrôle de cohérence ne demande aucune variable supplémentaire", () => {
  // Sans `productionRef`, le second contrôle est inapplicable, mais le premier
  // doit continuer de mordre hors production : c'est ce qui le rend utile
  // immédiatement.
  const verdict = environmentVerdict({
    deploymentEnv: "preview",
    projectUrl: URL_TEST,
    serviceRoleKey: cleJwt(REF_PROD),
    productionRef: "",
  });
  assert.equal(verdict.reason, ENVIRONMENT_REJECTIONS.KEY_PROJECT_MISMATCH);
});

test("en production, seul un projet étranger déclaré refuse ; tout le reste passe", () => {
  // Cette exigence remplace une version plus large, qui demandait qu'aucune
  // combinaison ne refuse en production. Elle était trop forte : elle laissait
  // passer le cas d'un déploiement Preview promu en production, où l'URL reste
  // figée sur la recette alors que la clé devient celle de la production. Le
  // CRM fonctionnait, sur la mauvaise base, sans que rien ne le signale.
  //
  // La règle retenue est la plus étroite qui ferme ce cas : en production, un
  // refus n'a lieu que si l'URL désigne un projet **et** que la référence de
  // production est renseignée **et** que les deux diffèrent. Toute autre
  // combinaison reste acceptée, y compris une référence absente, de sorte que
  // l'ajout de ce contrôle ne peut pas interrompre un CRM déjà en ligne.
  const urls = [URL_PROD, URL_TEST, "", "https://exemple.test"];
  const cles = [cleJwt(REF_PROD), cleJwt(REF_TEST), "sb_secret_quelconque", ""];
  const refs = [REF_PROD, REF_TEST, ""];
  let refus = 0;
  let acceptations = 0;
  for (const projectUrl of urls) {
    for (const serviceRoleKey of cles) {
      for (const productionRef of refs) {
        const verdict = environmentVerdict({ deploymentEnv: "production", projectUrl, serviceRoleKey, productionRef });
        const refUrl = projectRefFromUrl(projectUrl);
        const etranger = Boolean(refUrl && productionRef && refUrl !== productionRef);
        assert.equal(
          verdict.ok, !etranger,
          `verdict inattendu en production pour ${projectUrl || "sans URL"} / ${productionRef || "sans référence"}`
        );
        if (etranger) {
          assert.equal(verdict.reason, ENVIRONMENT_REJECTIONS.PRODUCTION_REF_MISMATCH);
          refus += 1;
        } else {
          acceptations += 1;
        }
      }
    }
  }
  assert.equal(refus + acceptations, urls.length * cles.length * refs.length);
  // La part refusée doit rester minoritaire : le garde-fou est étroit, et une
  // dérive qui le rendrait majoritaire menacerait la production.
  assert.ok(refus > 0, "le garde-fou ne refuse jamais rien");
  assert.ok(acceptations > refus, "le garde-fou refuse plus qu'il n'accepte en production");
});

test("sans SUPABASE_PRODUCTION_REF, un Preview vers la production passe inaperçu", () => {
  // Constat assumé, et c'est pourquoi le contrôle de build le signale.
  const verdict = environmentVerdict({
    deploymentEnv: "preview",
    projectUrl: URL_PROD,
    serviceRoleKey: cleJwt(REF_PROD),
    productionRef: "",
  });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.productionRef, null);
});

test("un poste local n'est pas entravé", () => {
  // `VERCEL_ENV` est absent hors plateforme. Le cloisonnement visé est celui
  // des déploiements, pas celui des machines de travail.
  const verdict = environmentVerdict({
    deploymentEnv: "",
    projectUrl: URL_PROD,
    serviceRoleKey: cleJwt(REF_PROD),
    productionRef: REF_PROD,
  });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.deploymentEnv, "local");
});

test("les clés récentes laissent le second contrôle opérer seul", () => {
  const refuse = environmentVerdict({
    deploymentEnv: "preview",
    projectUrl: URL_PROD,
    serviceRoleKey: "sb_secret_valeurquelconque",
    productionRef: REF_PROD,
  });
  assert.equal(refuse.reason, ENVIRONMENT_REJECTIONS.PRODUCTION_FROM_PREVIEW);
});

test("aucun message de refus ne contient de clé", () => {
  const cle = cleJwt(REF_PROD);
  for (const reason of Object.values(ENVIRONMENT_REJECTIONS)) {
    const message = environmentRejectionMessage({ ok: false, reason });
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, new RegExp(cle.slice(0, 24)));
    assert.doesNotMatch(message, /eyJ/);
  }
  assert.equal(environmentRejectionMessage({ ok: true }), "");
});

// ---------------------------------------------------------------------------
// Effet réel sur le serveur et sur le build
// ---------------------------------------------------------------------------

function scenario(env, code) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: racine,
    env: { PATH: process.env.PATH || "", ...env },
    encoding: "utf8",
  });
}

test("en Preview vers la production, le serveur ne contacte pas Supabase", () => {
  const resultat = scenario(
    {
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_SUPABASE_URL: URL_PROD,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "cle-publishable-de-test",
      SUPABASE_SERVICE_ROLE_KEY: cleJwt(REF_PROD),
      SUPABASE_PRODUCTION_REF: REF_PROD,
    },
    `
    let reseau = false;
    globalThis.fetch = async () => { reseau = true; return new Response("[]", { status: 200 }); };
    const mod = await import("./app/lib/supabase-server.js");
    if (mod.supabaseConfigured()) process.exit(2);
    if (mod.serviceRoleConfigured()) process.exit(3);
    if (mod.supabaseEnvironment().reason !== ${JSON.stringify(ENVIRONMENT_REJECTIONS.PRODUCTION_FROM_PREVIEW)}) process.exit(4);

    // Chemin 1 : serviceRequest refuse en amont, avec son erreur existante.
    try {
      await mod.serviceRequest("/rest/v1/clients?select=id");
      process.exit(5);
    } catch (error) {
      if (error.message !== "SERVICE_ROLE_NOT_CONFIGURED") process.exit(6);
    }

    // Chemin 2 : une requête passant par le jeton utilisateur refuse aussi,
    // en 503 et en portant le motif du cloisonnement.
    try {
      await mod.getProfileByUserId("utilisateur", "jeton");
      process.exit(7);
    } catch (error) {
      if (error.status !== 503) process.exit(8);
      if (error.code !== ${JSON.stringify(ENVIRONMENT_REJECTIONS.PRODUCTION_FROM_PREVIEW)}) process.exit(9);
    }

    // Aucun des deux chemins n'a touché le réseau.
    if (reseau) process.exit(10);
    console.log("OK");
  `
  );
  assert.equal(resultat.status, 0, resultat.stderr || resultat.stdout);
  assert.match(resultat.stdout, /OK/);
  // Le motif est journalisé, la clé jamais.
  assert.match(resultat.stderr, /SUPABASE_PRODUCTION_FROM_PREVIEW/);
  assert.doesNotMatch(`${resultat.stdout}\n${resultat.stderr}`, /eyJ/);
});

test("en production, le même code contacte bien le projet indiqué", () => {
  const resultat = scenario(
    {
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: URL_PROD,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "cle-publishable-de-test",
      SUPABASE_SERVICE_ROLE_KEY: cleJwt(REF_PROD),
      SUPABASE_PRODUCTION_REF: REF_PROD,
    },
    `
    let vu = null;
    globalThis.fetch = async (url) => { vu = String(url); return new Response("[]", { status: 200 }); };
    const mod = await import("./app/lib/supabase-server.js");
    if (!mod.serviceRoleConfigured()) process.exit(2);
    await mod.serviceRequest("/rest/v1/clients?select=id");
    if (!vu.startsWith(${JSON.stringify(URL_PROD)})) process.exit(3);
    console.log("OK");
  `
  );
  assert.equal(resultat.status, 0, resultat.stderr || resultat.stdout);
  assert.match(resultat.stdout, /OK/);
});

test("le build d'un Preview visant la production échoue", () => {
  const script = new URL("../scripts/verifier-config-supabase.mjs", import.meta.url).pathname;
  const commun = {
    PATH: process.env.PATH || "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "cle-publishable-de-test",
    SUPABASE_PRODUCTION_REF: REF_PROD,
  };

  const echoue = spawnSync(process.execPath, [script], {
    cwd: racine,
    env: { ...commun, VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: URL_PROD },
    encoding: "utf8",
  });
  assert.equal(echoue.status, 1, echoue.stdout);
  assert.match(echoue.stderr, /SUPABASE_PRODUCTION_FROM_PREVIEW/);

  const passe = spawnSync(process.execPath, [script], {
    cwd: racine,
    env: { ...commun, VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: URL_TEST },
    encoding: "utf8",
  });
  assert.equal(passe.status, 0, passe.stderr);

  // Sans la référence de production, le build passe mais prévient.
  const previent = spawnSync(process.execPath, [script], {
    cwd: racine,
    env: {
      PATH: process.env.PATH || "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "cle-publishable-de-test",
      NEXT_PUBLIC_SUPABASE_URL: URL_PROD,
      VERCEL_ENV: "preview",
    },
    encoding: "utf8",
  });
  assert.equal(previent.status, 0, previent.stderr);
  assert.match(previent.stderr, /SUPABASE_PRODUCTION_REF/);
});

// ---------------------------------------------------------------------------
// Crons : plus aucun secret accepté par l'URL
// ---------------------------------------------------------------------------

test("aucune route cron n'accepte de secret en paramètre d'URL", () => {
  const routes = [
    "app/api/cron/agenda-reminders/route.js",
    "app/api/cron/fleet-alerts/route.js",
    "app/api/cron/entretien-calendar/route.js",
    "app/api/cron/web-leads/route.js",
    "app/api/cron/web-lead-retention/route.js",
  ];
  for (const nom of routes) {
    const source = lire(nom);
    // Le secret dans une URL se retrouve dans les journaux d'accès des deux
    // côtés, dans l'historique du navigateur et dans les en-têtes Referer.
    assert.doesNotMatch(source, /searchParams/, `${nom} lit encore les paramètres d'URL`);
    assert.doesNotMatch(source, /CRON_SECRET/, `${nom} relit le secret au lieu d'appeler cron-auth`);
    assert.match(source, /cronAuthorized\(request\)/, `${nom} ne passe pas par cron-auth`);
    assert.match(source, /status: 401/, `${nom} ne refuse pas explicitement`);
  }
});

test("la comparaison du secret est à durée constante, et l'en-tête seul compte", () => {
  const source = lire("app/lib/cron-auth.js");
  assert.match(source, /timingSafeEqual/);
  assert.doesNotMatch(source, /searchParams/);

  const avant = process.env.CRON_SECRET;
  try {
    process.env.CRON_SECRET = "secret-de-test-suffisamment-long";
    const entete = valeur => ({ headers: { get: () => valeur } });

    assert.equal(cronAuthorized(entete("Bearer secret-de-test-suffisamment-long")), true);
    assert.equal(cronAuthorized(entete("Bearer mauvais")), false);
    assert.equal(cronAuthorized(entete("secret-de-test-suffisamment-long")), false, "sans le préfixe Bearer");
    assert.equal(cronAuthorized(entete("")), false);
    assert.equal(cronAuthorized({ headers: { get: () => null } }), false);
    assert.equal(cronAuthorized({}), false);

    // Un secret non configuré refuse tout, au lieu de tout accepter.
    process.env.CRON_SECRET = "";
    assert.equal(cronAuthorized(entete("Bearer ")), false);
    assert.equal(cronAuthorized(entete("Bearer quoi-que-ce-soit")), false);
  } finally {
    if (avant === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = avant;
  }
});

test("aucune documentation ne propose encore le secret en paramètre d'URL", () => {
  for (const nom of ["docs/PLAN-DEPLOIEMENT-MARKETING.md", "ovh-site/deploy/mkl-crm-queue.sh", ".env.example"]) {
    let source;
    try {
      source = lire(nom);
    } catch {
      continue;
    }
    assert.doesNotMatch(source, /[?&]secret=/, `${nom} propose encore un secret dans une URL`);
  }
});

test("un déploiement de production visant un autre projet est refusé", () => {
  // Cas concret : un déploiement Preview promu en production. Promouvoir ne
  // reconstruit rien, donc `NEXT_PUBLIC_SUPABASE_URL` reste figée sur la
  // recette, tandis que la clé service devient celle de la production. Sans ce
  // refus, le CRM fonctionnerait en écrivant dans la base de recette.
  const verdict = environmentVerdict({
    deploymentEnv: "production",
    projectUrl: URL_TEST,
    productionRef: REF_PROD,
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, ENVIRONMENT_REJECTIONS.PRODUCTION_REF_MISMATCH);
  assert.match(environmentRejectionMessage(verdict), /recompilez au lieu de promouvoir/i);
});

test("la production conforme reste acceptée", () => {
  const verdict = environmentVerdict({
    deploymentEnv: "production",
    projectUrl: URL_PROD,
    productionRef: REF_PROD,
  });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.reason, null);
});

test("sans SUPABASE_PRODUCTION_REF le nouveau refus ne peut pas couper la production", () => {
  // Le contrôle doit rester sans effet quand la référence n'est pas renseignée,
  // faute de quoi l'ajouter suffirait à faire tomber un CRM déjà en ligne.
  const verdict = environmentVerdict({
    deploymentEnv: "production",
    projectUrl: URL_TEST,
    productionRef: "",
  });
  assert.equal(verdict.ok, true);
});

test("le refus porté par Preview reste prioritaire", () => {
  const verdict = environmentVerdict({
    deploymentEnv: "preview",
    projectUrl: URL_PROD,
    productionRef: REF_PROD,
  });
  assert.equal(verdict.reason, ENVIRONMENT_REJECTIONS.PRODUCTION_FROM_PREVIEW);
});
