/** Taxonomie des origines de prospects — codes, canaux et cloisonnement. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ORIGIN_CATEGORIES,
  ORIGIN_CHANNELS,
  RESERVED_SOURCE_VALUES,
  canRefineOrigin,
  categoriesForChannel,
  categoryAllowsSubtype,
  categoryLabel,
  channelAllowsCategory,
  classifyWebLead,
  comparisonAxis,
  isPerformanceCategory,
  legacySourceToOrigin,
  mirrorSourceLabel,
} from "../app/lib/origin-taxonomy.js";

test("les six catégories portent les libellés validés", () => {
  assert.equal(categoryLabel("google_ads"), "Prospect GG Ads");
  assert.equal(categoryLabel("meta_ads"), "Prospect Face");
  assert.equal(categoryLabel("site_web"), "Prospect Site");
  assert.equal(categoryLabel("prospection"), "Prospection");
  assert.equal(categoryLabel("entrant"), "Entrant & relationnel");
  assert.equal(categoryLabel("a_qualifier"), "À qualifier");
  assert.equal(ORIGIN_CATEGORIES.length, 6);
});

test("aucun code de catégorie ne heurte le marqueur réservé google", () => {
  for (const item of ORIGIN_CATEGORIES) {
    assert.ok(!RESERVED_SOURCE_VALUES.includes(item.code));
  }
  assert.ok(RESERVED_SOURCE_VALUES.includes("google"));
});

test("un prospect saisi dans le CRM ne peut jamais être publicitaire", () => {
  assert.equal(channelAllowsCategory("crm_manual", "google_ads"), false);
  assert.equal(channelAllowsCategory("crm_manual", "meta_ads"), false);
  assert.equal(channelAllowsCategory("crm_manual", "site_web"), false);
  assert.equal(channelAllowsCategory("crm_manual", "prospection"), true);
  assert.equal(channelAllowsCategory("crm_manual", "entrant"), true);
});

test("une demande du site ne peut jamais être attribuée au terrain", () => {
  assert.equal(channelAllowsCategory("web_ingest", "prospection"), false);
  assert.equal(channelAllowsCategory("web_ingest", "entrant"), false);
  assert.deepEqual(categoriesForChannel("web_ingest").sort(), [
    "a_qualifier", "google_ads", "meta_ads", "site_web",
  ]);
});

test("un import ne peut pas inventer une preuve de clic publicitaire", () => {
  assert.equal(channelAllowsCategory("import", "google_ads"), false);
  assert.equal(channelAllowsCategory("import", "meta_ads"), false);
});

test("l’affinage reste interne au canal", () => {
  assert.equal(canRefineOrigin("web_ingest", "site_web", "google_ads"), true);
  assert.equal(canRefineOrigin("web_ingest", "a_qualifier", "meta_ads"), true);
  assert.equal(canRefineOrigin("crm_manual", "prospection", "google_ads"), false);
  assert.equal(canRefineOrigin("crm_manual", "a_qualifier", "entrant"), true);
  assert.equal(canRefineOrigin("inconnu", "prospection", "entrant"), false);
});

test("À qualifier n’entre dans aucun classement de performance", () => {
  assert.equal(isPerformanceCategory("a_qualifier"), false);
  assert.equal(isPerformanceCategory("google_ads"), true);
  assert.equal(isPerformanceCategory("prospection"), true);
});

test("les sous-origines sont contraintes par catégorie", () => {
  assert.equal(categoryAllowsSubtype("prospection", "centre_appels"), true);
  assert.equal(categoryAllowsSubtype("prospection", "instagram"), false);
  assert.equal(categoryAllowsSubtype("meta_ads", "instagram"), true);
  assert.equal(categoryAllowsSubtype("google_ads", ""), true);
});

test("le miroir écrit un libellé lisible et jamais un code", () => {
  assert.equal(mirrorSourceLabel("google_ads", ""), "Prospect GG Ads");
  assert.equal(mirrorSourceLabel("meta_ads", "instagram"), "Prospect Face · Instagram");
  assert.equal(mirrorSourceLabel("prospection", "centre_appels"), "Prospection · Centre d’appels");
  assert.equal(mirrorSourceLabel("inconnu", ""), "");
  for (const item of ORIGIN_CATEGORIES) {
    assert.notEqual(mirrorSourceLabel(item.code, ""), item.code);
  }
});

test("une trace de clic l’emporte sur les UTM", () => {
  assert.deepEqual(classifyWebLead({ gclid: "abc", utm_source: "facebook", utm_medium: "cpc" }), {
    category: "google_ads", subtype: "", evidence: "gclid",
  });
  assert.equal(classifyWebLead({ gbraid: "x" }).category, "google_ads");
  assert.equal(classifyWebLead({ wbraid: "x" }).category, "google_ads");
  assert.equal(classifyWebLead({ fbclid: "x" }).category, "meta_ads");
});

test("les UTM payants sont classés par plateforme", () => {
  assert.equal(classifyWebLead({ utm_source: "google", utm_medium: "cpc" }).category, "google_ads");
  assert.deepEqual(classifyWebLead({ utm_source: "instagram", utm_medium: "paid_social" }), {
    category: "meta_ads", subtype: "instagram", evidence: "utm",
  });
  assert.equal(classifyWebLead({ utm_source: "fb", utm_medium: "cpc" }).subtype, "facebook");
});

test("un trafic payant de plateforme inconnue n’est pas deviné", () => {
  const result = classifyWebLead({ utm_source: "tiktok", utm_medium: "cpc" });
  assert.equal(result.category, "a_qualifier");
  assert.equal(result.evidence, "paid_inconnu");
});

test("le trafic naturel ne devient jamais publicitaire", () => {
  assert.deepEqual(classifyWebLead({ utm_source: "google", utm_medium: "organic" }), {
    category: "site_web", subtype: "seo", evidence: "utm",
  });
  assert.equal(classifyWebLead({ referrer: "https://exemple.fr" }).subtype, "referral");
});

test("une demande sans UTM ni référent est un accès direct au site", () => {
  assert.deepEqual(classifyWebLead({}), {
    category: "site_web", subtype: "direct", evidence: "",
  });
});

test("un accès direct ne revendique aucune preuve UTM", () => {
  // Le classement est le même qu'avec des UTM naturels, mais sa justification
  // ne l'est pas : seul le second cas peut être compté comme « classé par UTM ».
  assert.equal(classifyWebLead({}).evidence, "");
  assert.equal(classifyWebLead({ utm_medium: "organic" }).evidence, "utm");
});

test("un canal non publicitaire et non naturel reste à qualifier", () => {
  assert.equal(classifyWebLead({ utm_medium: "email" }).category, "a_qualifier");
  assert.equal(classifyWebLead({ utm_source: "newsletter", utm_medium: "sms" }).category, "a_qualifier");
});

test("classifyWebLead ne renvoie jamais une catégorie de la famille naturelle", () => {
  const entrees = [
    {}, { gclid: "a" }, { fbclid: "b" }, { utm_medium: "organic" },
    { utm_source: "partenaire", utm_medium: "referral" },
    { utm_source: "tiktok", utm_medium: "cpc" },
  ];
  for (const entree of entrees) {
    const { category } = classifyWebLead(entree);
    assert.ok(channelAllowsCategory("web_ingest", category), `${category} interdit pour web_ingest`);
  }
});

test("les neuf provenances historiques sont toutes rattachées", () => {
  assert.deepEqual(legacySourceToOrigin("Prospection"), {
    category: "prospection", subtype: "", ambiguous: false, reserved: false,
  });
  assert.equal(legacySourceToOrigin("Appel entrant").subtype, "appel_entrant");
  assert.equal(legacySourceToOrigin("Recommandation").subtype, "recommandation");
  assert.equal(legacySourceToOrigin("Partenaire").subtype, "partenaire");
  assert.equal(legacySourceToOrigin("Salon").subtype, "foire_salon");
  assert.equal(legacySourceToOrigin("Stand Carrefour").subtype, "stand");
  assert.equal(legacySourceToOrigin("Call Marrakech (Pros)").subtype, "centre_appels");
  assert.equal(legacySourceToOrigin("Autre").category, "a_qualifier");
});

test("« Site internet » historique reste ambigu et jamais publicitaire", () => {
  const mapped = legacySourceToOrigin("Site internet");
  assert.equal(mapped.category, "site_web");
  assert.equal(mapped.ambiguous, true);
});

test("une provenance valant google est isolée et non confondue avec Google Ads", () => {
  const mapped = legacySourceToOrigin("google");
  assert.equal(mapped.category, "a_qualifier");
  assert.equal(mapped.reserved, true);
});

test("le centre d’appels est comparé séparément des prospecteurs terrain", () => {
  assert.equal(
    comparisonAxis({ category: "prospection", subtype: "centre_appels" }).key,
    "prospection:centre_appels"
  );
  assert.equal(
    comparisonAxis({ category: "prospection", subtype: "porte_a_porte", prospectorId: "u-1" }).key,
    "prospecteur:u-1"
  );
  assert.equal(
    comparisonAxis({ category: "prospection", subtype: "stand" }).key,
    "prospection:sans_prospecteur"
  );
  assert.equal(comparisonAxis({ category: "google_ads" }).key, "google_ads");
});

test("tous les canaux déclarés acceptent au moins une catégorie", () => {
  for (const channel of ORIGIN_CHANNELS) {
    assert.ok(categoriesForChannel(channel).length > 0, channel);
  }
});

/**
 * Un identifiant de clic Meta ne dit pas sur quel réseau l’annonce était
 * affichée. Quand la campagne le précise, la distinction doit être conservée :
 * c’est elle qui sépare « Prospect Face · Facebook » de « · Instagram ».
 */
test("le réseau Meta est déduit de la campagne quand elle le précise", () => {
  assert.equal(classifyWebLead({ fbclid: "IwAR0x" }).subtype, "");
  assert.equal(classifyWebLead({ fbclid: "IwAR0x", utm_source: "instagram" }).subtype, "instagram");
  assert.equal(classifyWebLead({ fbclid: "IwAR0x", utm_source: "facebook" }).subtype, "facebook");
  assert.equal(classifyWebLead({ fbclid: "IwAR0x", utm_source: "ig" }).subtype, "instagram");
});

test("un clic Meta reste Meta même si la campagne cite une autre source", () => {
  const result = classifyWebLead({ fbclid: "IwAR0x", utm_source: "google" });
  assert.equal(result.category, "meta_ads");
  assert.equal(result.evidence, "fbclid");
  assert.equal(result.subtype, "", "une source incohérente ne doit pas être devinée");
});

test("le réseau déduit reste une sous-origine autorisée", () => {
  for (const source of ["instagram", "facebook", "ig"]) {
    const result = classifyWebLead({ fbclid: "IwAR0x", utm_source: source });
    assert.equal(categoryAllowsSubtype(result.category, result.subtype), true, source);
  }
});
