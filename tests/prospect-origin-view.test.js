/**
 * Colonne et filtre « Origine » : ce que la liste affiche, ce qu'elle ne
 * confond pas, et ce qu'une modification de fiche ne doit jamais toucher.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ORIGIN_FILTERS,
  ORIGIN_FILTER_ALL,
  matchesOriginFilter,
  originFilterKey,
  originFilterOptions,
  originViewOf,
} from "../app/lib/prospect-origin-view.js";
import {
  PROSPECT_SELECT,
  formToProspectRecord,
  prospectToUi,
} from "../app/lib/prospects.js";

const ORG = "00000000-0000-0000-0000-000000000001";
const OPP = "828c270f-6f7e-4e36-83f2-4c08e7d44b64";

function contact(categorie, touchedAt, extra = {}) {
  return {
    id: `t-${categorie}-${touchedAt}`,
    organization_id: ORG,
    opportunity_id: OPP,
    touched_at: touchedAt,
    created_at: touchedAt,
    origin_channel: "web_ingest",
    origin_category: categorie,
    origin_subtype: "",
    ...extra,
  };
}

test("la colonne demande bien les quatre colonnes d’origine", () => {
  // Sans elles, l'information reste en base : c'est exactement le défaut que
  // cette fonctionnalité corrige, et il ne doit pas pouvoir revenir.
  for (const colonne of ["origin_channel", "origin_category", "origin_subtype", "origin_set_at"]) {
    assert.ok(PROSPECT_SELECT.includes(colonne), `${colonne} absente de PROSPECT_SELECT`);
  }
});

test("la fiche transporte l’origine structurée sans écraser la source libre", () => {
  const ui = prospectToUi({
    id: OPP,
    name: "Essai",
    source: "Prospect GG Ads",
    origin_channel: "web_ingest",
    origin_category: "google_ads",
    origin_subtype: "",
    origin_set_at: "2026-11-07T23:50:44.456Z",
    extra: {},
  });
  assert.equal(ui.source, "Prospect GG Ads");
  assert.equal(ui.originChannel, "web_ingest");
  assert.equal(ui.originCategory, "google_ads");
  assert.equal(ui.originSetAt, "2026-11-07T23:50:44.456Z");
});

test("une demande publicitaire affiche sa campagne et se dit mesurée", () => {
  const vue = originViewOf(
    { id: OPP, origin_category: "google_ads", source: "Prospect GG Ads" },
    [contact("google_ads", "2026-11-07T23:50:42.341Z", {
      campaign_name: "pv-automne-67",
      touch_role: "dernier",
      evidence: "gclid",
      landing_path: "/photovoltaique.html",
    })]
  );
  assert.equal(vue.key, "google_ads");
  assert.equal(vue.label, "Prospect GG Ads");
  assert.equal(vue.campaign, "pv-automne-67");
  assert.equal(vue.mesuree, true);
  assert.equal(vue.deduiteDe, "");
  assert.equal(vue.dernier.landingPath, "/photovoltaique.html");
});

test("un contact unique n’invente pas d’écart entre les deux modèles", () => {
  const vue = originViewOf(
    { id: OPP, origin_category: "site_web" },
    [contact("site_web", "2026-11-07T10:00:00.000Z", { evidence: "utm" })]
  );
  assert.equal(vue.contacts, 1);
  assert.equal(vue.ecart, "");
});

test("deux canaux différents font apparaître l’écart, sans l’arbitrer", () => {
  const vue = originViewOf({ id: OPP, origin_category: "google_ads" }, [
    contact("site_web", "2026-11-02T14:12:00.000Z", { touch_role: "premier", evidence: "utm" }),
    contact("google_ads", "2026-11-07T23:50:42.341Z", {
      touch_role: "dernier",
      evidence: "gclid",
      campaign_name: "pv-automne-67",
    }),
  ]);
  // L'origine affichée est celle du dernier contact : c'est elle qui a
  // déclenché la demande. Le premier reste visible à côté.
  assert.equal(vue.key, "google_ads");
  assert.equal(vue.ecart, "premier contact : Prospect Site");
  assert.equal(vue.premier.label, "Prospect Site");
  assert.equal(vue.dernier.label, "Prospect GG Ads");
});

test("l’historique est traduit à la lecture, et dit qu’il est déduit", () => {
  const vue = originViewOf({ id: OPP, source: "Stand Carrefour" });
  assert.equal(vue.key, "prospection");
  assert.equal(vue.label, "Prospection");
  assert.equal(vue.mesuree, false);
  assert.equal(vue.deduiteDe, "Stand Carrefour");
  assert.equal(vue.contacts, 0);
});

test("le centre d’appels est séparé de la prospection terrain", () => {
  // Call Marrakech est un prestataire extérieur. Le confondre avec les
  // prospecteurs maison rendrait les deux illisibles à la comparaison.
  const vue = originViewOf({ id: OPP, source: "Call Marrakech (Pros)" });
  assert.equal(vue.key, "prospection:centre_appels");
  assert.equal(vue.label, "Centre d’appels");
  assert.equal(originFilterKey({ category: "prospection", subtype: "centre_appels" }), "prospection:centre_appels");
  assert.equal(originFilterKey({ category: "prospection", subtype: "stand" }), "prospection");
});

test("une provenance inconnue tombe sur « À qualifier » plutôt que sur rien", () => {
  assert.equal(originViewOf({ id: OPP, source: "Autre" }).key, "a_qualifier");
  assert.equal(originViewOf({ id: OPP, source: "" }).key, "a_qualifier");
  assert.equal(originViewOf({}).label, "À qualifier");
});

test("le marqueur technique de Google Calendar n’est jamais pris pour une annonce", () => {
  // « google » est la valeur que pose la synchronisation d'agenda. La confondre
  // avec google_ads gonflerait le résultat publicitaire avec des rendez-vous.
  const vue = originViewOf({ id: OPP, source: "google" });
  assert.equal(vue.key, "a_qualifier");
  assert.notEqual(vue.key, "google_ads");
});

test("le filtre laisse tout passer à vide, et ne garde que la clé demandée", () => {
  const liste = [
    { id: "a", origin: { key: "google_ads" } },
    { id: "b", origin: { key: "prospection" } },
    { id: "c", source: "Recommandation" },
  ];
  assert.equal(liste.filter(p => matchesOriginFilter(p, "")).length, 3);
  assert.equal(liste.filter(p => matchesOriginFilter(p, ORIGIN_FILTER_ALL)).length, 3);
  assert.deepEqual(liste.filter(p => matchesOriginFilter(p, "google_ads")).map(p => p.id), ["a"]);
  assert.deepEqual(liste.filter(p => matchesOriginFilter(p, "entrant")).map(p => p.id), ["c"]);
});

test("seules les origines présentes sont proposées, dans l’ordre de la taxonomie", () => {
  const options = originFilterOptions([
    { id: "a", source: "Recommandation" },
    { id: "b", origin: { key: "google_ads" } },
  ]);
  assert.deepEqual(options.map(item => item.key), ["google_ads", "entrant"]);
  assert.deepEqual(
    ORIGIN_FILTERS.map(item => item.key),
    ["google_ads", "meta_ads", "site_web", "prospection", "prospection:centre_appels", "entrant", "a_qualifier"]
  );
});

test("modifier une fiche ne peut pas changer une origine enregistrée", () => {
  // La consigne est explicite : ne pas modifier les origines déjà
  // enregistrées. La garantie ne tient pas à la prudence de l'écran mais au
  // fait que l'enregistrement produit n'a aucune colonne d'origine.
  const record = formToProspectRecord(
    {
      name: "Essai",
      source: "Prospection",
      originCategory: "google_ads",
      originChannel: "web_ingest",
      origin: { key: "google_ads", label: "Prospect GG Ads" },
    },
    { organizationId: ORG }
  );
  for (const champ of Object.keys(record)) {
    assert.ok(!champ.startsWith("origin"), `${champ} ne devrait pas être écrit`);
  }
  for (const champ of Object.keys(record.extra)) {
    assert.ok(!champ.startsWith("origin"), `extra.${champ} ne devrait pas être écrit`);
  }
});

test("la lecture des contacts ne fait pas voyager de marqueur publicitaire", () => {
  const source = fs.readFileSync(
    new URL("../app/lib/prospect-origin-server.js", import.meta.url),
    "utf8"
  );
  const select = source.match(/ATTRIBUTION_SELECT\s*=\s*\n?\s*"([^"]+)"/)?.[1] || "";
  assert.ok(select.includes("campaign_name"), "la campagne est demandée");
  assert.ok(select.includes("landing_path"), "la page d’arrivée est demandée");
  for (const interdit of ["click_id", "referrer_host", "ad_id", "adset_id", "keyword"]) {
    assert.ok(!select.includes(interdit), `${interdit} ne doit pas remonter au navigateur`);
  }
});

test("les contacts ne sont lus qu’après le cloisonnement", () => {
  // Lire l'attribution avant le filtrage ferait voyager celle de prospects
  // qu'un commercial n'a pas le droit de voir : un seul oubli de filtre
  // suffirait alors à l'afficher.
  const route = fs.readFileSync(new URL("../app/api/prospects/route.js", import.meta.url), "utf8");
  const posVisible = route.indexOf("visibleProspects(");
  const posOrigines = route.indexOf("attachProspectOrigins(");
  assert.ok(posVisible > 0 && posOrigines > 0);
  assert.ok(posVisible < posOrigines, "l’origine est attachée avant le cloisonnement");
});

test("les deux listes partagent la même cellule d’origine", () => {
  // Les deux listes sont exclusives : personne ne voit les deux, donc rien ne
  // signalerait qu'elles divergent.
  for (const fichier of ["../app/page.js", "../app/components/prospect-dispatch-board.js"]) {
    const source = fs.readFileSync(new URL(fichier, import.meta.url), "utf8");
    assert.match(source, /ProspectOriginCell/, `${fichier} n’utilise pas la cellule partagée`);
    assert.match(source, /matchesOriginFilter/, `${fichier} n’applique pas le filtre`);
    assert.match(source, /<span>ORIGINE<\/span>/, `${fichier} n’a pas la colonne`);
  }
});

test("la source libre n’est plus affichée deux fois", () => {
  // Elle est désormais portée par la colonne « Origine », traduite. La laisser
  // aussi dans la cellule d'adresse ou de projet afficherait la même
  // information brute à côté de son interprétation.
  const page = fs.readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const board = fs.readFileSync(
    new URL("../app/components/prospect-dispatch-board.js", import.meta.url),
    "utf8"
  );
  assert.equal(page.includes("${p.source}`"), false);
  assert.equal(board.includes("[prospect.source, outcome]"), false);
});

test("la grille compte autant de colonnes que l’en-tête", () => {
  const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const liste = css.match(/\.prospect-table\.is-rdv-status \.data-row\{grid-template-columns:([^}]+)\}/)?.[1] || "";
  const dispatch = css.match(/\.prospect-table\.dispatch-table \.data-row\{grid-template-columns:([^;]+);/)?.[1] || "";
  // Une colonne de plus que l'en-tête et tout le tableau se décale d'un cran,
  // silencieusement : les valeurs passent sous le mauvais intitulé.
  assert.equal(liste.trim().split(/\s+/).length, 11, "liste commerciale : 11 colonnes attendues");
  assert.equal(dispatch.match(/minmax\(/g)?.length, 8);
  assert.ok(dispatch.startsWith("132px"), "la première colonne reste le numéro");
});
