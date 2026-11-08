/**
 * Capture navigateur : lecture à l'arrivée, mémorisation, envoi.
 *
 * Le module est injectable, ce qui permet de rejouer ici un parcours complet
 * de visiteur sans navigateur : arrivée sur une annonce, navigation interne,
 * retour direct plus tard, puis envoi du formulaire.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CLICK_IDS,
  FIRST_TOUCH_MAX_AGE_MS,
  LAST_TOUCH_MAX_AGE_MS,
  UTM_FIELDS,
  attributionBody,
  consentFromDataLayer,
  createCapture,
  durableAllowed,
  hasSignal,
  install,
  installAutoAttach,
  isAttachTarget,
  isOwnHost,
  mergeAttributionIntoBody,
  mergeFirstTouch,
  mergeLastTouch,
  readParams,
  safeStorage,
  touchFromArrival,
} from "../lib/attribution-capture.mjs";
import {
  CLICK_IDS as SERVER_CLICK_IDS,
  UTM_FIELDS as SERVER_UTM_FIELDS,
  parseAttribution,
} from "../lib/lead-attribution.mjs";
import { isDeniedPublicPath } from "../lib/public-static.mjs";

const OWN_HOST = "www.mkl-energies.fr";
const DAY = 24 * 60 * 60 * 1000;

function fakeStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    size: () => map.size,
  };
}

/**
 * Visiteur simulé. `durable` et `visite` sont deux stockages distincts, comme
 * `localStorage` et `sessionStorage` dans un navigateur. Chaque page recrée une
 * capture, puisqu'un chargement de page réinstancie le module.
 */
function visitor({ durable = fakeStorage(), visite = fakeStorage(), consent = false } = {}) {
  let clock = Date.parse("2026-11-05T09:00:00.000Z");
  const page = (location, referrer) => createCapture({
    storage: durable,
    sessionStorage: visite,
    location,
    referrer,
    ownHost: OWN_HOST,
    consent,
    now: () => clock,
  });
  return {
    durable,
    visite,
    arrive(pathname, search = "", referrer = "") {
      return page({ search, pathname, hostname: OWN_HOST }, referrer).capture();
    },
    /** Nouvelle session : la mémoire de visite est perdue, le durable reste. */
    nouvelleSession() {
      visite = fakeStorage();
    },
    wait(days) { clock += days * DAY; },
    fields: () => page({ search: "", pathname: "/", hostname: OWN_HOST }, "").fields(),
    refresh: () => page({ search: "", pathname: "/", hostname: OWN_HOST }, "").refresh(),
  };
}

test("les listes de champs sont identiques côté serveur", () => {
  assert.deepEqual(CLICK_IDS, SERVER_CLICK_IDS);
  assert.deepEqual(UTM_FIELDS, SERVER_UTM_FIELDS);
});

test("le module est bien servi aux pages publiques", () => {
  assert.equal(isDeniedPublicPath("/lib/attribution-capture.mjs"), false);
  assert.equal(isDeniedPublicPath("/lib/lead-attribution.mjs"), true);
  assert.equal(isDeniedPublicPath("/lib/crm-sync.mjs"), true);
});

test("seuls les paramètres connus sont lus", () => {
  const found = readParams("?gclid=Cj0KCQabcdef&utm_source=google&secret=motdepasse&email=a@b.test");
  assert.deepEqual(found, { gclid: "Cj0KCQabcdef", utm_source: "google" });
});

test("un identifiant de clic trop court est rejeté, pas raccourci", () => {
  assert.deepEqual(readParams("?gclid=abc"), {});
  assert.deepEqual(readParams(`?gclid=${"a".repeat(201)}`), {});
  assert.equal(readParams(`?gclid=${"a".repeat(200)}`).gclid.length, 200);
});

test("une visite sans aucune trace ne produit rien", () => {
  assert.equal(touchFromArrival({ pathname: "/index.html", ownHost: OWN_HOST }), null);
});

test("le référent interne est ignoré", () => {
  const touch = touchFromArrival({
    pathname: "/contact.html",
    referrer: "https://www.mkl-energies.fr/pompe-a-chaleur.html",
    ownHost: OWN_HOST,
  });
  assert.equal(touch, null, "une navigation interne n'est pas une provenance");
});

test("du référent externe seul le domaine est conservé", () => {
  const touch = touchFromArrival({
    pathname: "/pompe-a-chaleur.html",
    referrer: "https://www.google.com/search?q=pompe+a+chaleur+prix+avis",
    ownHost: OWN_HOST,
  });
  assert.equal(touch.referrerHost, "www.google.com");
  assert.equal(touch.referrer, "https://www.google.com");
  assert.equal(touch.referrer.includes("pompe"), false, "la requête tapée ne doit pas sortir");
});

test("le chemin d'arrivée perd sa chaîne de requête", () => {
  const touch = touchFromArrival({
    pathname: "/pompe-a-chaleur.html",
    search: "?gclid=Cj0KCQabcdef",
    ownHost: OWN_HOST,
  });
  assert.equal(touch.landingPath, "/pompe-a-chaleur.html");
  assert.equal(touch.gclid, "Cj0KCQabcdef");
});

test("un référent illisible est ignoré sans casser la capture", () => {
  const touch = touchFromArrival({
    pathname: "/x.html",
    search: "?utm_source=newsletter",
    referrer: "pas-une-url",
    ownHost: OWN_HOST,
  });
  assert.equal(touch.utm_source, "newsletter");
  assert.equal(touch.referrerHost, undefined);
});

test("un référent en javascript: est refusé", () => {
  assert.equal(
    touchFromArrival({ pathname: "/x.html", referrer: "javascript:alert(1)", ownHost: OWN_HOST }),
    null
  );
});

test("un domaine du site est reconnu malgré le port et le www", () => {
  assert.equal(isOwnHost("mkl-energies.fr", "www.mkl-energies.fr:443"), true);
  assert.equal(isOwnHost("www.google.com", OWN_HOST), false);
});

/**
 * La règle la plus importante : un retour direct sur le site ne doit pas
 * effacer le clic publicitaire qui a fait découvrir MKL.
 */
test("une visite sans trace n'écrase pas la trace mémorisée", () => {
  const ads = { gclid: "Cj0KCQabcdef", capturedAt: "2026-11-05T09:00:00.000Z" };
  const now = Date.parse("2026-11-10T09:00:00.000Z");
  assert.deepEqual(mergeLastTouch(ads, null, now), ads);
});

test("une trace mémorisée expirée est abandonnée", () => {
  const ads = { gclid: "Cj0KCQabcdef", capturedAt: "2026-01-01T09:00:00.000Z" };
  const now = Date.parse("2026-01-01T09:00:00.000Z") + LAST_TOUCH_MAX_AGE_MS + 1000;
  assert.equal(mergeLastTouch(ads, null, now), null);
});

test("une nouvelle trace remplace le dernier contact", () => {
  const ads = { gclid: "Cj0KCQabcdef", capturedAt: "2026-11-05T09:00:00.000Z" };
  const meta = { fbclid: "IwAR0exemple", capturedAt: "2026-11-07T09:00:00.000Z" };
  assert.deepEqual(mergeLastTouch(ads, meta, Date.parse("2026-11-07T09:00:00.000Z")), meta);
});

test("le premier contact n'est jamais remplacé", () => {
  const ads = { gclid: "Cj0KCQabcdef", capturedAt: "2026-11-05T09:00:00.000Z" };
  const meta = { fbclid: "IwAR0exemple", capturedAt: "2026-11-07T09:00:00.000Z" };
  assert.deepEqual(mergeFirstTouch(ads, meta, Date.parse("2026-11-07T09:00:00.000Z")), ads);
});

test("le premier contact expire plus tard que le dernier", () => {
  assert.ok(FIRST_TOUCH_MAX_AGE_MS > LAST_TOUCH_MAX_AGE_MS);
  const ads = { gclid: "Cj0KCQabcdef", capturedAt: "2026-01-01T09:00:00.000Z" };
  const entre = Date.parse("2026-01-01T09:00:00.000Z") + LAST_TOUCH_MAX_AGE_MS + DAY;
  assert.deepEqual(mergeFirstTouch(ads, null, entre), ads, "encore valide en premier contact");
  assert.equal(mergeLastTouch(ads, null, entre), null, "déjà expiré en dernier contact");
});

/** Parcours réel : clic sur annonce, navigation, formulaire sur une autre page. */
test("le paramètre survit à la navigation jusqu'au formulaire", () => {
  const session = visitor();
  session.arrive("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef&utm_source=google&utm_medium=cpc");
  session.arrive("/nos-realisations.html", "", "https://www.mkl-energies.fr/pompe-a-chaleur.html");
  session.arrive("/contact.html", "", "https://www.mkl-energies.fr/nos-realisations.html");

  const body = session.fields();
  assert.equal(body.attribution.gclid, "Cj0KCQabcdef");
  assert.equal(body.attribution.utm_medium, "cpc");
  assert.equal(body.attribution.landingPath, "/pompe-a-chaleur.html");
  assert.equal(body.attributionFirst.gclid, "Cj0KCQabcdef");
});

test("un second clic publicitaire distingue premier et dernier contact", () => {
  const session = visitor();
  session.arrive("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef");
  session.wait(10);
  session.arrive("/climatisation.html", "?fbclid=IwAR0exemple");

  const body = session.fields();
  assert.equal(body.attributionFirst.gclid, "Cj0KCQabcdef");
  assert.equal(body.attribution.fbclid, "IwAR0exemple");
  assert.equal(body.attribution.gclid, undefined);
});

test("un retour direct deux semaines plus tard garde le clic d'origine", () => {
  const session = visitor();
  session.arrive("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef");
  session.wait(14);
  session.arrive("/contact.html");

  const body = session.fields();
  assert.equal(body.attribution.gclid, "Cj0KCQabcdef");
});

test("au-delà de la fenêtre, plus rien n'est transmis", () => {
  const session = visitor();
  session.arrive("/pompe-a-chaleur.html", "?gclid=Cj0KCQabcdef");
  session.wait(100);
  assert.deepEqual(session.fields(), {});
});

test("sans consentement, rien n'est écrit dans le stockage durable", () => {
  const session = visitor();
  session.arrive("/a.html", "?gclid=Cj0KCQabcdef");
  assert.equal(session.durable.size(), 0, "aucune écriture durable sans consentement");
  assert.ok(session.visite.size() > 0, "la visite en cours reste mesurée");
});

test("avec consentement, la mémorisation devient durable", () => {
  const session = visitor({ consent: true });
  session.arrive("/a.html", "?gclid=Cj0KCQabcdef");
  assert.ok(session.durable.size() > 0);
  assert.equal(session.visite.size(), 0);
});

test("un stockage refusé ne casse pas la capture", () => {
  const refuse = {
    getItem() { throw new Error("refusé"); },
    setItem() { throw new Error("refusé"); },
    removeItem() { throw new Error("refusé"); },
  };
  const page = () => createCapture({
    storage: refuse,
    sessionStorage: refuse,
    location: { search: "?gclid=Cj0KCQabcdef", pathname: "/a.html", hostname: OWN_HOST },
    ownHost: OWN_HOST,
  });

  // Dans la page d'arrivée, la mesure fonctionne : le stockage refusé est
  // remplacé par une mémoire de page. Un visiteur qui clique sur une annonce
  // et envoie le formulaire sans changer de page reste donc mesuré.
  const arrivee = page();
  const result = arrivee.capture();
  assert.equal(result.last.gclid, "Cj0KCQabcdef");
  assert.equal(arrivee.fields().attribution.gclid, "Cj0KCQabcdef");

  // La page suivante repart d'une mémoire vide : c'est la seule perte.
  assert.deepEqual(page().fields(), {}, "sans stockage, rien ne survit à la navigation");
});

test("un stockage illisible est traité comme vide", () => {
  const storage = fakeStorage();
  storage.setItem("mkl.attribution.dernier", "ceci n'est pas du json");
  const capture = createCapture({
    storage,
    sessionStorage: storage,
    location: { search: "", pathname: "/a.html", hostname: OWN_HOST },
    ownHost: OWN_HOST,
  });
  assert.deepEqual(capture.fields(), {});
});

test("safeStorage retombe en mémoire plutôt que d'échouer", () => {
  const store = safeStorage(null);
  store.setItem("a", "1");
  assert.equal(store.getItem("a"), "1");
});

test("un corps vide ne porte aucune clé", () => {
  assert.deepEqual(attributionBody(null, null), {});
  assert.deepEqual(attributionBody({ capturedAt: "x" }, null), {});
});

test("install fonctionne hors navigateur sans planter", () => {
  const capture = install({
    storage: fakeStorage(),
    sessionStorage: fakeStorage(),
    location: { search: "", pathname: "/", hostname: OWN_HOST },
  });
  assert.equal(typeof capture.fields, "function");
});

/**
 * Le serveur doit accepter exactement ce que le navigateur envoie. C'est le
 * test qui attrape un désalignement de noms entre les deux déploiements.
 */
test("le serveur retient tout ce que le navigateur transmet", () => {
  const session = visitor();
  session.arrive(
    "/pompe-a-chaleur.html",
    "?gclid=Cj0KCQabcdef&gbraid=Abcdef123&utm_source=google&utm_medium=cpc&utm_campaign=pac-hiver",
    "https://www.google.com/search?q=pompe+a+chaleur"
  );
  const body = session.fields();
  const parsed = parseAttribution(body.attribution, {
    headerReferer: "https://www.mkl-energies.fr/contact.html",
    pagePath: "/contact.html",
    ownHost: OWN_HOST,
  });
  assert.equal(parsed.gclid, "Cj0KCQabcdef");
  assert.equal(parsed.gbraid, "Abcdef123");
  assert.equal(parsed.utm_source, "google");
  assert.equal(parsed.utm_campaign, "pac-hiver");
  assert.equal(parsed.referrerHost, "www.google.com");
  assert.equal(
    parsed.landingPath,
    "/pompe-a-chaleur.html",
    "le chemin d'arrivée doit primer sur la page du formulaire"
  );
});

test("aucune saisie du visiteur ne peut entrer dans la provenance", () => {
  const session = visitor();
  session.arrive(
    "/contact.html",
    "?gclid=Cj0KCQabcdef&email=jean@example.test&phone=0612345678&name=Jean+Dupont"
  );
  const dump = JSON.stringify(session.fields());
  for (const leak of ["jean@example.test", "0612345678", "Jean", "Dupont"]) {
    assert.equal(dump.includes(leak), false, `la provenance ne doit pas contenir ${leak}`);
  }
});

test("hasSignal distingue une trace utile d'un simple chemin", () => {
  assert.equal(hasSignal({ landingPath: "/a.html" }), false);
  assert.equal(hasSignal({ landingPath: "/a.html", gclid: "x" }), true);
  assert.equal(hasSignal({ referrerHost: "www.google.com" }), true);
  assert.equal(hasSignal(null), false);
});

// ---------------------------------------------------------------------------
// Consent Mode v2
// ---------------------------------------------------------------------------

/** gtag pousse des objets `arguments`, pas des tableaux. */
function gtagEntry(...args) {
  return args;
}

test("l’état de consentement est lu dans dataLayer", () => {
  const dataLayer = [
    gtagEntry("js", new Date()),
    gtagEntry("consent", "default", { ad_storage: "denied", analytics_storage: "denied" }),
    gtagEntry("config", "AW-000"),
  ];
  assert.deepEqual(consentFromDataLayer(dataLayer), {
    ad_storage: "denied",
    analytics_storage: "denied",
  });
});

test("une mise à jour prime sur la valeur par défaut", () => {
  const dataLayer = [
    gtagEntry("consent", "default", { ad_storage: "denied" }),
    gtagEntry("consent", "update", { ad_storage: "granted" }),
  ];
  assert.equal(consentFromDataLayer(dataLayer).ad_storage, "granted");
});

/** Un défaut restreint à des régions ne dit rien du visiteur courant. */
test("un défaut régional est ignoré", () => {
  const dataLayer = [
    gtagEntry("consent", "default", { region: ["ES"], ad_storage: "granted" }),
  ];
  assert.deepEqual(consentFromDataLayer(dataLayer), {});
});

test("une valeur inconnue n’est pas prise pour un accord", () => {
  const dataLayer = [gtagEntry("consent", "update", { ad_storage: "peut-être" })];
  assert.deepEqual(consentFromDataLayer(dataLayer), {});
});

test("un dataLayer absent ou étrange ne fait rien échouer", () => {
  assert.deepEqual(consentFromDataLayer(undefined), {});
  assert.deepEqual(consentFromDataLayer([null, "x", [1, 2]]), {});
});

test("un identifiant de clic exige ad_storage", () => {
  const touch = { gclid: "Cj0KCQabcdef" };
  assert.equal(durableAllowed({ analytics_storage: "granted" }, touch), false);
  assert.equal(durableAllowed({ ad_storage: "granted" }, touch), true);
});

test("une campagne sans clic relève de analytics_storage", () => {
  const touch = { utm_source: "newsletter" };
  assert.equal(durableAllowed({ ad_storage: "granted" }, touch), false);
  assert.equal(durableAllowed({ analytics_storage: "granted" }, touch), true);
});

test("sans aucun signal, rien n’est conservé durablement", () => {
  assert.equal(durableAllowed({}, { gclid: "x" }), false);
  assert.equal(durableAllowed(undefined, { gclid: "x" }), false);
});

/** Le visiteur accepte après le chargement : la trace doit en bénéficier. */
test("un consentement accordé après coup promeut la trace mémorisée", () => {
  const durable = fakeStorage();
  const visite = fakeStorage();
  let accord = false;
  const page = () => createCapture({
    storage: durable,
    sessionStorage: visite,
    location: { search: "?gclid=Cj0KCQabcdef", pathname: "/a.html", hostname: OWN_HOST },
    ownHost: OWN_HOST,
    consent: () => (accord ? { ad_storage: "granted" } : {}),
  });

  page().capture();
  assert.equal(durable.size(), 0);

  accord = true;
  page().refresh();
  assert.ok(durable.size() > 0, "la trace doit passer en conservation durable");
  assert.equal(visite.size(), 0, "et quitter la mémoire de visite");
});

test("un consentement retiré purge la conservation durable", () => {
  const durable = fakeStorage();
  const visite = fakeStorage();
  let accord = true;
  const page = () => createCapture({
    storage: durable,
    sessionStorage: visite,
    location: { search: "?gclid=Cj0KCQabcdef", pathname: "/a.html", hostname: OWN_HOST },
    ownHost: OWN_HOST,
    consent: () => (accord ? { ad_storage: "granted" } : {}),
  });

  page().capture();
  assert.ok(durable.size() > 0);

  accord = false;
  page().refresh();
  assert.equal(durable.size(), 0, "le retrait doit effacer sans attendre l’expiration");
  assert.ok(visite.size() > 0, "la visite en cours reste mesurée");
});

// ---------------------------------------------------------------------------
// Raccordement automatique
// ---------------------------------------------------------------------------

test("seules les deux routes de demande sont visées", () => {
  for (const url of ["/api/leads", "/api/appointments", "https://mkl-energies.fr/api/leads?x=1"]) {
    assert.equal(isAttachTarget(url), true, url);
  }
  for (const url of ["/api/newsletter", "/api/leads/export", "/api/admin/leads", ""]) {
    assert.equal(isAttachTarget(url), false, url);
  }
});

test("un corps qui n’est pas du JSON d’objet est rendu intact", () => {
  const fields = { attribution: { gclid: "x" } };
  assert.equal(mergeAttributionIntoBody("pas du json", fields), "pas du json");
  assert.equal(mergeAttributionIntoBody("[1,2]", fields), "[1,2]");
  assert.equal(mergeAttributionIntoBody("null", fields), "null");
  const formData = { append() {} };
  assert.equal(mergeAttributionIntoBody(formData, fields), formData);
});

test("l’interception couvre XMLHttpRequest", () => {
  const envois = [];
  class FauxXhr {
    open(method, url) { this.method = method; this.url = url; }
    send(body) { envois.push(body); }
  }
  const fenetre = { XMLHttpRequest: FauxXhr };
  const capture = createCapture({
    storage: fakeStorage(),
    sessionStorage: fakeStorage(),
    location: { search: "?gclid=Cj0KCQabcdef", pathname: "/a.html", hostname: OWN_HOST },
    ownHost: OWN_HOST,
  });
  capture.capture();
  const restore = installAutoAttach(fenetre, capture);

  const requete = new FauxXhr();
  requete.open("POST", "/api/leads");
  requete.send(JSON.stringify({ phone: "0612345678" }));
  assert.equal(JSON.parse(envois[0]).attribution.gclid, "Cj0KCQabcdef");

  restore();
  const apres = new FauxXhr();
  apres.open("POST", "/api/leads");
  apres.send(JSON.stringify({ phone: "0612345678" }));
  assert.equal(JSON.parse(envois[1]).attribution, undefined, "le retrait doit être complet");
});

test("une seconde installation ne double pas l’interception", () => {
  const fenetre = { fetch: async (_url, init) => init };
  const capture = createCapture({
    storage: fakeStorage(),
    sessionStorage: fakeStorage(),
    location: { search: "?gclid=Cj0KCQabcdef", pathname: "/a.html", hostname: OWN_HOST },
    ownHost: OWN_HOST,
  });
  capture.capture();
  const premier = installAutoAttach(fenetre, capture);
  const second = installAutoAttach(fenetre, capture);
  assert.equal(premier, second);
  premier();
});

test("une méthode GET n’est pas touchée", async () => {
  const fenetre = { fetch: async (_url, init) => init };
  const capture = createCapture({
    storage: fakeStorage(),
    sessionStorage: fakeStorage(),
    location: { search: "?gclid=Cj0KCQabcdef", pathname: "/a.html", hostname: OWN_HOST },
    ownHost: OWN_HOST,
  });
  capture.capture();
  installAutoAttach(fenetre, capture);
  const envoi = await fenetre.fetch("/api/leads", { method: "GET" });
  assert.equal(envoi.body, undefined);
});
