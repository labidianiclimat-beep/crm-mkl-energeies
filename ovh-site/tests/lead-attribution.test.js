import assert from "node:assert/strict";
import test from "node:test";
import {
  CLICK_IDS,
  UTM_FIELDS,
  hasClickId,
  isOwnHost,
  landingPath,
  parseAttribution,
  parseFirstAttribution,
  referrerHost,
} from "../lib/lead-attribution.mjs";

test("les identifiants de clic sont conservés tels quels", () => {
  const result = parseAttribution({ gclid: "Cj0KCQiA-abc_123.XYZ" });
  assert.equal(result.gclid, "Cj0KCQiA-abc_123.XYZ");
  assert.equal(hasClickId(result), true);
  assert.notEqual(result.capturedAt, undefined);
});

test("les quatre identifiants de clic sont reconnus", () => {
  assert.deepEqual(CLICK_IDS, ["gclid", "gbraid", "wbraid", "fbclid"]);
  for (const key of CLICK_IDS) {
    const result = parseAttribution({ [key]: "identifiant-de-clic-valide" });
    assert.equal(result[key], "identifiant-de-clic-valide", key);
  }
});

test("un identifiant de clic douteux est écarté", () => {
  for (const valeur of ["", "court", "avec espace dedans", "<script>alert(1)</script>", "x".repeat(201)]) {
    const result = parseAttribution({ gclid: valeur });
    assert.equal(result.gclid, undefined, JSON.stringify(valeur));
  }
});

test("les cinq champs UTM sont captés et bornés", () => {
  const result = parseAttribution({
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "pac-hiver-2026",
    utm_term: "pompe a chaleur strasbourg",
    utm_content: "annonce-b",
  });
  for (const key of UTM_FIELDS) {
    assert.notEqual(result[key], undefined, key);
  }
  const long = parseAttribution({ utm_campaign: "c".repeat(300) });
  assert.equal(long.utm_campaign.length, 120);
});

test("les caractères de contrôle sont neutralisés", () => {
  const result = parseAttribution({ utm_campaign: "campagne\u0000\u001fsuspecte\n" });
  assert.ok(!/[\u0000-\u001f]/.test(result.utm_campaign));
});

test("le chemin d’arrivée perd sa chaîne de requête et son ancre", () => {
  assert.equal(landingPath("/pompe-a-chaleur?gclid=abc&utm_source=google"), "/pompe-a-chaleur");
  assert.equal(landingPath("https://mkl-energies.fr/climatisation?x=1#devis"), "/climatisation");
  assert.equal(landingPath("pas-un-chemin"), "");
  assert.equal(landingPath(""), "");
});

test("du référent, seul le domaine est conservé", () => {
  assert.equal(referrerHost("https://www.Google.FR/search?q=pompe+a+chaleur+prix"), "www.google.fr");
  assert.equal(referrerHost("javascript:alert(1)"), "");
  assert.equal(referrerHost("pas-une-url"), "");
  assert.equal(referrerHost(""), "");
});

test("la requête tapée par le visiteur n’est jamais enregistrée", () => {
  const result = parseAttribution(
    { referrer: "https://www.google.fr/search?q=divorce+et+chauffage" },
    { ownHost: "mkl-energies.fr" }
  );
  assert.equal(result.referrerHost, "www.google.fr");
  assert.ok(!JSON.stringify(result).includes("divorce"));
});

/**
 * L’en-tête Referer d’une soumission désigne la page du formulaire, donc notre
 * propre domaine. Sans filtre, toute demande paraîtrait venir d’un référent.
 */
test("notre propre domaine n’est jamais compté comme référent", () => {
  const result = parseAttribution(
    { utm_campaign: "pour-avoir-un-bloc" },
    { headerReferer: "https://www.mkl-energies.fr/rdv.html", ownHost: "mkl-energies.fr" }
  );
  assert.equal(result.referrerHost, undefined);
});

test("la comparaison de domaine ignore le port et le préfixe www", () => {
  assert.equal(isOwnHost("www.mkl-energies.fr", "mkl-energies.fr:443"), true);
  assert.equal(isOwnHost("mkl-energies.fr", "www.mkl-energies.fr"), true);
  assert.equal(isOwnHost("preprod.mkl-energies.fr", "mkl-energies.fr"), true);
  assert.equal(isOwnHost("google.fr", "mkl-energies.fr"), false);
  assert.equal(isOwnHost("", "mkl-energies.fr"), false);
});

test("l’en-tête sert de recours quand la page ne transmet rien", () => {
  const result = parseAttribution({}, {
    headerReferer: "https://partenaire.example/annuaire",
    ownHost: "mkl-energies.fr",
  });
  assert.equal(result.referrerHost, "partenaire.example");
});

test("une valeur transmise par la page prime sur l’en-tête", () => {
  const result = parseAttribution(
    { referrer: "https://www.bing.com/search" },
    { headerReferer: "https://partenaire.example/annuaire", ownHost: "mkl-energies.fr" }
  );
  assert.equal(result.referrerHost, "www.bing.com");
});

test("une demande sans aucune trace ne crée pas de bloc vide bruité", () => {
  assert.deepEqual(parseAttribution({}), {});
  assert.deepEqual(parseAttribution(null), {});
  assert.deepEqual(parseAttribution("texte"), {});
  assert.equal(hasClickId({}), false);
  assert.equal(hasClickId(null), false);
});

test("les champs à plat sont acceptés comme les champs groupés", () => {
  const plat = parseAttribution({ gclid: "identifiant-de-clic", name: "Ada", phone: "0612345678" });
  assert.equal(plat.gclid, "identifiant-de-clic");
  assert.equal(plat.name, undefined, "seuls les champs de provenance sont retenus");
  assert.equal(plat.phone, undefined, "aucune coordonnée ne passe par la provenance");
});

test("le chemin de la page sert de chemin d’arrivée par défaut", () => {
  const result = parseAttribution({ utm_source: "newsletter" }, { pagePath: "/rdv.html?x=1" });
  assert.equal(result.landingPath, "/rdv.html");
});

/**
 * La date annoncée par le navigateur doit survivre au passage par le serveur.
 * Si le serveur la remplace systématiquement par sa propre heure, le premier
 * contact porte la même date que le dernier et la lecture par chronologie ne
 * peut plus les distinguer.
 */
test("une date de capture plausible est conservée", () => {
  const now = Date.parse("2026-11-11T10:00:00.000Z");
  const result = parseAttribution(
    { gclid: "Cj0KCQabcdef", capturedAt: "2026-11-05T09:00:00.000Z" },
    { now }
  );
  assert.equal(result.capturedAt, "2026-11-05T09:00:00.000Z");
});

test("une date de capture future est remplacée par l’heure du serveur", () => {
  const now = Date.parse("2026-11-11T10:00:00.000Z");
  const result = parseAttribution({ gclid: "Cj0KCQabcdef", capturedAt: "2099-01-01T00:00:00.000Z" }, { now });
  assert.equal(result.capturedAt, "2026-11-11T10:00:00.000Z");
});

test("une date de capture illisible est remplacée sans faire échouer la capture", () => {
  const now = Date.parse("2026-11-11T10:00:00.000Z");
  const result = parseAttribution({ gclid: "Cj0KCQabcdef", capturedAt: "hier" }, { now });
  assert.equal(result.capturedAt, "2026-11-11T10:00:00.000Z");
  assert.equal(result.gclid, "Cj0KCQabcdef");
});

/** Le premier contact ne doit recevoir aucun recours tiré de la requête. */
test("le premier contact n’emprunte rien à la page du formulaire", () => {
  const result = parseFirstAttribution(
    { gclid: "Cj0KCQabcdef", landingPath: "/pompe-a-chaleur.html" },
    { ownHost: "www.mkl-energies.fr" }
  );
  assert.equal(result.landingPath, "/pompe-a-chaleur.html");
  assert.equal(result.referrerHost, undefined);
});

test("un premier contact absent ne fabrique rien", () => {
  assert.deepEqual(parseFirstAttribution(undefined, { ownHost: "www.mkl-energies.fr" }), {});
  assert.deepEqual(parseFirstAttribution({}, { ownHost: "www.mkl-energies.fr" }), {});
});
