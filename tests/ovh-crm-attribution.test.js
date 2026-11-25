/**
 * Accord du site OVH et du CRM sur le format de l'attribution.
 *
 * Ce fichier comble un angle mort. Les tests du site vérifient le site, ceux
 * du CRM vérifient le CRM, et rien ne vérifiait que le format produit d'un
 * côté est bien celui lu de l'autre. Un désaccord ne casse rien : la demande
 * arrive, la fiche se crée, et l'origine est simplement fausse. Le symptôme
 * observé en recette était « Prospect Site · Accès direct » pour un clic
 * Google Ads, sans aucune attribution enregistrée.
 *
 * La chaîne est donc reconstituée en entier, avec les fonctions réelles des
 * deux côtés et aucune charge écrite à la main :
 *
 *   arrivée sur le site → capture navigateur → envoi HTTP → lecture serveur
 *   OVH → charge transmise au CRM → lecture du CRM → classement de l'origine
 *
 * Aucune valeur réelle n'apparaît : les identifiants de clic sont inventés.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  attributionBody,
  mergeFirstTouch,
  mergeLastTouch,
  touchFromArrival,
} from "../ovh-site/lib/attribution-capture.mjs";
import { parseAttribution, parseFirstAttribution } from "../ovh-site/lib/lead-attribution.mjs";
import { parseWebLeadPayload } from "../app/lib/web-lead-ingest.js";
import { classifyWebLead } from "../app/lib/origin-taxonomy.js";
import {
  attributionTouchesFromWebLead,
  webLeadFirstOrigin,
  webLeadOrigin,
} from "../app/lib/web-lead-consumer.js";

const HOTE = "www.mkl-energies.fr";

/**
 * Reconstitue le trajet complet d'un visiteur, de son arrivée sur le site
 * jusqu'au classement de son origine par le CRM.
 *
 * `arrivees` est la suite des pages d'entrée, dans l'ordre : une seule pour
 * un visiteur venu une fois, plusieurs pour celui qui revient par un autre
 * chemin. C'est ce second cas qui produit un premier et un dernier contact.
 */
function parcours(arrivees, { contact = {} } = {}) {
  let dernier = null;
  let premier = null;
  let horloge = Date.UTC(2026, 10, 1);

  for (const arrivee of arrivees) {
    horloge += 36e5;
    const touche = touchFromArrival({
      search: arrivee.search || "",
      referrer: arrivee.referrer || "",
      path: arrivee.path || "/",
      ownHost: HOTE,
      now: horloge,
    });
    dernier = mergeLastTouch(dernier, touche, horloge);
    premier = mergeFirstTouch(premier, touche, horloge);
  }

  // Ce que le navigateur place dans le corps du formulaire.
  const corpsNavigateur = attributionBody(dernier, premier);

  // Ce que le serveur OVH en retient avant de le transmettre au CRM.
  const options = { ownHost: HOTE, now: horloge, pagePath: "/contact" };
  const transmis = {
    submissionId: "essai-accord-des-deux-bords",
    kind: "lead",
    phone: "0600000000",
    ...contact,
    attribution: parseAttribution(corpsNavigateur.attribution || {}, options),
    attributionFirst: parseFirstAttribution(corpsNavigateur.attributionFirst, options),
  };

  // Ce que le CRM accepte, puis ce qu'il en déduit.
  const lu = parseWebLeadPayload(JSON.stringify(transmis));
  assert.equal(lu.ok, true, `le CRM a refusé la charge : ${lu.reason}`);

  return {
    corpsNavigateur,
    transmis,
    charge: lu.value,
    dernierContact: webLeadOrigin(lu.value),
    premierContact: webLeadFirstOrigin(lu.value),
    // Les lignes que le CRM écrirait réellement dans `lead_attribution`.
    // C'est le résultat observable en base, et donc celui qui compte.
    contacts: attributionTouchesFromWebLead({
      payload: lu.value,
      organizationId: "00000000-0000-0000-0000-000000000001",
      opportunityId: "00000000-0000-0000-0000-0000000000aa",
      now: new Date(horloge),
    }),
  };
}

/** Résumé lisible des lignes d'attribution : « rôle|preuve », dans l'ordre. */
function resume(contacts) {
  return contacts
    .map(c => `${c.touch_role || "unique"}|${c.evidence}`)
    .join(",");
}

test("un clic Google Ads traverse les deux bords et ressort en google_ads", () => {
  const vu = parcours([
    { search: "?gclid=essai-clic-google-inexistant&utm_source=google&utm_medium=cpc&utm_campaign=PAC%20hiver", path: "/pompe-a-chaleur.html" },
  ]);

  // Le nom du champ compte autant que sa valeur : à la racine de la charge,
  // le CRM ne le lit pas.
  assert.equal(vu.charge.attribution.gclid, "essai-clic-google-inexistant");
  assert.equal(vu.charge.gclid, undefined);

  assert.equal(vu.dernierContact.category, "google_ads");
  assert.equal(vu.dernierContact.evidence, "gclid");
  assert.equal(vu.dernierContact.subtype, "");

  // Une seule visite : le premier contact existe, mais il est identique au
  // dernier. Le CRM les replie alors en une seule ligne, dont le rôle reste
  // vide. C'est exactement ce que la recette a montré : « unique|gclid », et
  // non deux lignes « premier » et « dernier » qui feraient compter ce
  // prospect deux fois dans les rapports.
  assert.equal(vu.premierContact.category, "google_ads");
  assert.equal(resume(vu.contacts), "unique|gclid");
});

test("un clic Facebook ressort en meta_ads, avec le placement conservé", () => {
  const vu = parcours([
    { search: "?fbclid=essai-clic-facebook-inexistant&utm_source=facebook&utm_medium=paid_social", path: "/photovoltaique.html" },
  ]);
  assert.equal(vu.charge.attribution.fbclid, "essai-clic-facebook-inexistant");
  assert.equal(vu.dernierContact.category, "meta_ads");
  assert.equal(vu.dernierContact.evidence, "fbclid");
  assert.equal(vu.dernierContact.subtype, "facebook");
});

test("un clic Instagram se distingue de Facebook", () => {
  const vu = parcours([
    { search: "?fbclid=essai-clic-instagram-inexistant&utm_source=instagram&utm_medium=paid_social", path: "/climatisation.html" },
  ]);
  assert.equal(vu.dernierContact.category, "meta_ads");
  assert.equal(vu.dernierContact.subtype, "instagram");
});

test("une visite venue d'un moteur de recherche ressort en site_web", () => {
  const vu = parcours([
    { referrer: "https://www.google.com/search?q=pompe+a+chaleur", path: "/pompe-a-chaleur.html" },
  ]);
  assert.equal(vu.charge.attribution.referrerHost, "www.google.com");
  assert.equal(vu.dernierContact.category, "site_web");
  assert.equal(vu.dernierContact.subtype, "referral");
  assert.equal(vu.dernierContact.evidence, "referrer");
});

test("une navigation interne ne compte pas comme un site référent", () => {
  // Sans cette exclusion, chaque page vue depuis une autre page du site
  // produirait une origine « site référent » et écraserait le vrai premier
  // contact du visiteur.
  const vu = parcours([
    { referrer: `https://${HOTE}/pompe-a-chaleur.html`, path: "/contact.html" },
  ]);
  assert.equal(vu.charge.attribution.referrerHost, undefined);
  assert.notEqual(vu.dernierContact.subtype, "referral");
});

test("venu par un référent puis revenu par une annonce, les deux contacts coexistent", () => {
  // Le cas qui justifie les deux modèles : le premier contact revient au
  // référencement, le dernier à Google Ads. Les deux doivent survivre au
  // passage par les deux bords, sans se confondre.
  const vu = parcours([
    { referrer: "https://www.bing.com/search", path: "/" },
    { search: "?gclid=essai-second-clic-inexistant&utm_source=google&utm_medium=cpc", path: "/pompe-a-chaleur.html" },
  ]);

  assert.equal(vu.premierContact.category, "site_web");
  assert.equal(vu.premierContact.evidence, "referrer");
  assert.equal(vu.dernierContact.category, "google_ads");
  assert.equal(vu.dernierContact.evidence, "gclid");

  // Deux origines distinctes : le CRM écrit bien deux lignes, et les nomme.
  assert.equal(resume(vu.contacts), "premier|referrer,dernier|gclid");

  // Le premier contact porte sa propre date, antérieure : sans cela la lecture
  // par chronologie ne pourrait plus les ordonner.
  assert.ok(vu.charge.attributionFirst.capturedAt);
  assert.ok(
    new Date(vu.charge.attributionFirst.capturedAt) <= new Date(vu.charge.attribution.capturedAt),
    "le premier contact n'est pas antérieur au dernier"
  );
});

test("une visite sans aucun signal ne fabrique pas d'origine publicitaire", () => {
  // Exigence posée dès le départ : un prospect naturel ne devient jamais un
  // prospect publicitaire. Une arrivée directe doit rester indécidable plutôt
  // que d'être rattachée à une régie.
  const vu = parcours([{ path: "/" }]);

  // Le navigateur ne mémorise rien : il n'y avait aucun signal à retenir.
  assert.deepEqual(vu.corpsNavigateur, {});

  // Le serveur OVH ajoute tout de même la page de dépôt et l'horodatage. Ce
  // sont des informations de contexte, pas des marqueurs publicitaires, et il
  // est utile de savoir d'où part une demande. L'exigence n'est donc pas que
  // l'attribution soit vide, mais qu'elle ne contienne aucun marqueur de régie.
  for (const cle of ["gclid", "gbraid", "wbraid", "fbclid", "utm_source", "utm_medium"]) {
    assert.equal(vu.charge.attribution[cle], undefined, `marqueur ${cle} fabriqué de toutes pièces`);
  }
  assert.notEqual(vu.dernierContact.category, "google_ads");
  assert.notEqual(vu.dernierContact.category, "meta_ads");
});

test("les clés transmises sont toutes des clés que le CRM sait lire", () => {
  // Contrôle de contrat, et non de comportement : une clé ajoutée d'un côté
  // sans être lue de l'autre passerait inaperçue dans les tests ci-dessus.
  const CONNUES = new Set([
    "gclid", "gbraid", "wbraid", "fbclid",
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "landingPath", "referrerHost", "referrer", "capturedAt",
  ]);
  const vu = parcours([
    { search: "?gclid=essai&utm_source=google&utm_medium=cpc&utm_campaign=c&utm_term=t&utm_content=co", referrer: "https://www.bing.com/", path: "/pompe-a-chaleur.html" },
  ]);
  for (const bloc of [vu.charge.attribution, vu.charge.attributionFirst]) {
    for (const cle of Object.keys(bloc)) {
      assert.ok(CONNUES.has(cle), `clé « ${cle} » transmise mais absente du contrat`);
    }
  }
});

test("le classement du CRM accepte exactement ce que le site produit", () => {
  // Dernier filet : les objets transmis sont donnés directement au classeur
  // du CRM, sans passer par la lecture de charge, pour vérifier qu'aucune
  // normalisation intermédiaire n'était indispensable.
  const vu = parcours([
    { search: "?fbclid=essai-direct&utm_source=facebook&utm_medium=paid_social", path: "/photovoltaique.html" },
  ]);
  const direct = classifyWebLead(vu.transmis.attribution);
  assert.equal(direct.category, "meta_ads");
  assert.equal(direct.evidence, "fbclid");
});
