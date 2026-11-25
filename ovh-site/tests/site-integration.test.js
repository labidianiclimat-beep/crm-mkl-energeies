import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import {
  CONSENT_STORAGE_KEY,
  consentFromBanner,
  consentFromDataLayer,
  durableAllowed,
} from "../lib/attribution-capture.mjs";

/**
 * Raccordement de l'attribution au véritable site mkl-energies.fr.
 *
 * Les fichiers de `site-public/` sont les ressources publiques récupérées en
 * HTTPS le 5 novembre 2026, puis modifiées localement. Ces contrôles portent
 * sur le code réel, pas sur une reconstitution : c'est la seule façon de
 * vérifier que le raccordement se trouve bien aux deux endroits qui envoient,
 * et nulle part ailleurs.
 *
 * Ils échoueront si le site est remanié en amont. C'est voulu : il faudra
 * alors reprendre la récupération et relire les points d'envoi, plutôt que de
 * déployer un raccordement qui ne s'applique plus.
 */

const SITE = new URL("../site-public/", import.meta.url);
const APP = readFileSync(new URL("app.js", SITE), "utf8");
const BANNER = readFileSync(new URL("consent-banner.js", SITE), "utf8");
const INDEX = readFileSync(new URL("index.html", SITE), "utf8");
const PAGES = readdirSync(SITE).filter(name => name.endsWith(".html"));

// ---------------------------------------------------------------------------
// Les points d'envoi
// ---------------------------------------------------------------------------

/** Appels POST aux deux routes de dépôt, avec leur contexte amont. */
function envois(endpoint) {
  const found = [];
  const marker = `await fetch("${endpoint}", {`;
  let at = APP.indexOf(marker);
  while (at !== -1) {
    found.push({ at, amont: APP.slice(Math.max(0, at - 400), at) });
    at = APP.indexOf(marker, at + 1);
  }
  return found;
}

test("le site n'a que deux points d'envoi de demandes, et ils sont connus", () => {
  // S'il en apparaissait un troisième, le raccordement serait incomplet sans
  // que rien ne le signale.
  assert.equal(envois("/api/leads").length, 1, "un seul formulaire dépose une demande d’étude");
  assert.equal(envois("/api/appointments").length, 1, "un seul formulaire dépose un rendez-vous");
});

test("chaque envoi renseigne la provenance juste avant de partir", () => {
  for (const endpoint of ["/api/leads", "/api/appointments"]) {
    const [envoi] = envois(endpoint);
    assert.match(
      envoi.amont,
      /Object\.assign\(payload, attribution\.fields\(\)\);\s*const res = $/,
      `${endpoint} doit recevoir la provenance immédiatement avant l’envoi`
    );
  }
});

test("la provenance est relevée une fois, au chargement du script", () => {
  assert.match(APP, /import \{ install as installAttribution \} from "\.\/lib\/attribution-capture\.mjs";/);
  assert.match(APP, /const attribution = installAttribution\(\);/);
  assert.equal(
    APP.split("installAttribution()").length - 1,
    1,
    "une seule installation, au chargement du script"
  );
});

test("aucun nouveau formulaire n'a été ajouté au site", () => {
  // La consigne est de se raccorder à l'existant. Le nombre de routes d'envoi
  // appelées par le site ne doit donc pas bouger.
  const routes = [...APP.matchAll(/await fetch\("(\/api\/[a-z-]+)"/g)].map(match => match[1]);
  assert.deepEqual([...new Set(routes)].sort(), ["/api/appointments", "/api/leads"]);
});

// ---------------------------------------------------------------------------
// Les conversions Google Ads ne sont pas touchées
// ---------------------------------------------------------------------------

test("les événements de conversion restent après la réponse du serveur", () => {
  for (const [endpoint, evenement] of [
    ["/api/leads", "generate_lead"],
    ["/api/appointments", "book_appointment"],
  ]) {
    const [envoi] = envois(endpoint);
    const apres = APP.indexOf(`pushConversionEvent(\n        "${evenement}"`, envoi.at);
    assert.notEqual(apres, -1, `${evenement} doit être poussé après l’envoi`);
    assert.ok(
      apres > envoi.at,
      `${evenement} ne doit pas précéder l’envoi : le raccordement serait en aval de la conversion`
    );
  }
});

test("la provenance est posée en amont de la conversion, jamais entre les deux", () => {
  // Si `Object.assign` tombait entre l'envoi et la conversion, il ne servirait
  // plus à rien : la demande serait déjà partie sans provenance.
  for (const endpoint of ["/api/leads", "/api/appointments"]) {
    const [envoi] = envois(endpoint);
    const pose = APP.lastIndexOf("Object.assign(payload, attribution.fields());", envoi.at);
    assert.ok(pose !== -1 && pose < envoi.at);
  }
});

test("le nombre d'événements de conversion poussés est inchangé", () => {
  // La définition de la fonction est exclue : seuls les appels comptent.
  const appels = APP.match(/pushConversionEvent\(\s*\n\s*"/g) || [];
  assert.equal(appels.length, 2, "exactement deux conversions : une demande, un rendez-vous");
  assert.equal((APP.match(/function pushConversionEvent\(/g) || []).length, 1);
});

// ---------------------------------------------------------------------------
// Le consentement réel
// ---------------------------------------------------------------------------

test("la bannière du site enregistre son choix sous la clé que nous lisons", () => {
  assert.match(BANNER, new RegExp(`STORAGE_KEY = "${CONSENT_STORAGE_KEY}"`));
  assert.equal(CONSENT_STORAGE_KEY, "mkl_consent_v1");
});

test("la bannière enregistre bien deux booléens, analytics et ads", () => {
  assert.match(BANNER, /analytics: !!choice\.analytics/);
  assert.match(BANNER, /ads: !!choice\.ads/);
});

test("toutes les pages refusent la publicité par défaut avant tout chargement de tag", () => {
  for (const page of PAGES) {
    const html = readFileSync(new URL(page, SITE), "utf8");
    const defaut = html.indexOf('gtag("consent", "default"');
    if (defaut === -1) continue;
    const gtm = html.indexOf("googletagmanager.com/gtm.js");
    assert.ok(defaut < gtm, `${page} : la valeur par défaut doit précéder le chargement de GTM`);
    const bloc = html.slice(defaut, defaut + 400);
    for (const signal of ["ad_storage", "ad_user_data", "ad_personalization", "analytics_storage"]) {
      assert.match(bloc, new RegExp(`${signal}: "denied"`), `${page} : ${signal} doit être refusé par défaut`);
    }
  }
});

test("le choix mémorisé est réappliqué à chaque chargement de page", () => {
  // Sans cela, un visiteur ayant accepté serait traité comme refusant à sa
  // deuxième visite. La bannière seule ne le fait pas : c'est le script en
  // tête de page qui s'en charge, avant GTM.
  const republie = INDEX.indexOf(`localStorage.getItem("${CONSENT_STORAGE_KEY}")`);
  assert.notEqual(republie, -1, "le choix mémorisé doit être relu dans la page");
  const update = INDEX.indexOf('gtag("consent", "update"', republie);
  const gtm = INDEX.indexOf("googletagmanager.com/gtm.js");
  assert.notEqual(update, -1);
  assert.ok(update < gtm, "la republication doit précéder le chargement de GTM");
});

test("le consentement se lit à sa source, pas seulement dans dataLayer", () => {
  const accepte = JSON.stringify({ analytics: true, ads: true, updatedAt: "2026-11-05T00:00:00.000Z" });
  const etat = consentFromBanner({ getItem: () => accepte });
  assert.equal(etat.ad_storage, "granted");
  assert.equal(etat.analytics_storage, "granted");
  assert.equal(etat.ad_user_data, "granted");
  assert.equal(etat.ad_personalization, "granted");
});

test("un refus de la publicité laisse la mesure d'audience intacte, et inversement", () => {
  const refusPub = JSON.stringify({ analytics: true, ads: false });
  const etat = consentFromBanner({ getItem: () => refusPub });
  assert.equal(etat.ad_storage, "denied");
  assert.equal(etat.analytics_storage, "granted");

  // Une trace issue d'un clic publicitaire dépend de `ad_storage`, pas de la
  // mesure d'audience : accepter l'audience seule ne l'autorise pas.
  assert.equal(durableAllowed(etat, { gclid: "abc" }), false);
  assert.equal(durableAllowed(etat, { utm_source: "newsletter" }), true);
});

test("aucun choix enregistré n'autorise aucune conservation durable", () => {
  for (const brut of [null, "", "null", "{}", '{"analytics":"oui"}', "pas-du-json"]) {
    const etat = consentFromBanner({ getItem: () => brut });
    assert.deepEqual(etat, {}, `« ${brut} » ne doit rien autoriser`);
    assert.equal(durableAllowed(etat, { gclid: "abc" }), false);
    assert.equal(durableAllowed(etat, { utm_source: "newsletter" }), false);
  }
});

test("un stockage inaccessible ne fait pas présumer le consentement", () => {
  const casse = {
    getItem() {
      throw new Error("stockage refusé");
    },
  };
  assert.deepEqual(consentFromBanner(casse), {});
  assert.equal(durableAllowed(consentFromBanner(casse), { gclid: "abc" }), false);
});

test("la lecture de dataLayer reste un recours, et donne le même résultat", () => {
  // Le script en tête de page republie le choix dans dataLayer : les deux
  // sources doivent concorder, sinon l'une des deux est mal lue.
  const dataLayer = [
    (function () { return arguments; })("consent", "default", {
      ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied",
    }),
    (function () { return arguments; })("consent", "update", {
      ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted", analytics_storage: "granted",
    }),
  ];
  const parEcho = consentFromDataLayer(dataLayer);
  const parSource = consentFromBanner({ getItem: () => JSON.stringify({ analytics: true, ads: true }) });
  assert.deepEqual(parEcho, parSource);
});

// ---------------------------------------------------------------------------
// Le module doit être joignable par le navigateur
// ---------------------------------------------------------------------------

test("le module de capture est servi comme les deux autres modules publics", () => {
  // `app.js` importe déjà deux modules de /lib/. Le troisième doit être exposé
  // de la même façon, sinon l'import échoue et tout le script s'arrête.
  const importes = [...APP.matchAll(/from "\.\/lib\/([a-z-]+\.mjs)"/g)].map(match => match[1]);
  assert.ok(importes.includes("attribution-capture.mjs"));
  assert.deepEqual(
    importes.sort(),
    ["attribution-capture.mjs", "conversion-datalayer.mjs", "form-legal-copy.mjs"]
  );
});

test("la configuration Nginx de référence expose ce module et rien de plus", () => {
  const nginx = readFileSync(new URL("../deploy/ovh/nginx.conf", import.meta.url), "utf8");
  const exposes = [...nginx.matchAll(/location = \/lib\/([a-z-]+\.mjs)/g)].map(match => match[1]);
  assert.deepEqual(
    [...new Set(exposes)].sort(),
    ["attribution-capture.mjs", "conversion-datalayer.mjs", "form-legal-copy.mjs"],
    "les modules exposés doivent être exactement ceux qu’importe app.js"
  );
  assert.match(nginx, /location \^~ \/lib\/ \{[^}]*return 404/s, "le refus général sur /lib/ doit rester");
});
