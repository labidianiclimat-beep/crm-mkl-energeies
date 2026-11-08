/**
 * Origine d'un prospect, telle qu'elle s'affiche.
 *
 * Trois décisions de lecture sont câblées ici, et aucune n'écrit quoi que ce
 * soit en base.
 *
 * 1. Une origine mesurée et une origine déduite ne se confondent pas. Les
 *    fiches antérieures au module marketing n'ont pas de catégorie : leur
 *    provenance se devine depuis l'ancienne source libre, ce qui est utile
 *    pour trier mais ne vaut pas une preuve. Le drapeau `mesuree` porte la
 *    différence jusqu'à l'écran, afin qu'un futur coût par vente ne mélange
 *    jamais un `gclid` avec un « Stand Carrefour » interprété.
 *
 * 2. La clé de filtre n'est pas l'axe de comparaison des rapports.
 *    `comparisonAxis` éclate la prospection par prospecteur, ce qui est juste
 *    pour un tableau de performance et ingérable dans une liste déroulante —
 *    le prospecteur a déjà sa propre colonne et son propre filtre. Le filtre
 *    s'arrête donc à la catégorie, en isolant seulement le centre d'appels.
 *
 * 3. Les deux modèles d'attribution sont rapportés tels quels. Quand ils
 *    divergent, l'écart est annoncé au lieu d'être arbitré : c'est le cas qui
 *    dira si la publicité apporte des affaires ou facture celles que le site
 *    apportait déjà.
 */
import {
  categoryLabel,
  legacySourceToOrigin,
  subtypeLabel,
} from "./origin-taxonomy.js";
import { attributionOf } from "./marketing-attribution.js";

/** Ordre d'affichage du filtre : les canaux payants d'abord, le reste ensuite. */
export const ORIGIN_FILTERS = [
  { key: "google_ads", label: "Prospect GG Ads" },
  { key: "meta_ads", label: "Prospect Face" },
  { key: "site_web", label: "Prospect Site" },
  { key: "prospection", label: "Prospection" },
  { key: "prospection:centre_appels", label: "Centre d’appels" },
  { key: "entrant", label: "Entrant & relationnel" },
  { key: "a_qualifier", label: "À qualifier" },
];

export const ORIGIN_FILTER_ALL = "all";

function text(value) {
  return String(value ?? "").trim();
}

/**
 * Clé de filtre. Le centre d'appels est séparé de la prospection terrain parce
 * que c'est un prestataire extérieur : le confondre avec les prospecteurs
 * maison rendrait les deux illisibles.
 */
export function originFilterKey({ category, subtype } = {}) {
  const code = text(category);
  if (!code) return "a_qualifier";
  if (code === "prospection" && text(subtype) === "centre_appels") {
    return "prospection:centre_appels";
  }
  return code;
}

export function originFilterLabel(key) {
  return ORIGIN_FILTERS.find(item => item.key === key)?.label || "À qualifier";
}

function touchView(touch) {
  if (!touch) return null;
  const category = text(touch.category);
  return {
    label: categoryLabel(category) || "À qualifier",
    sublabel: subtypeLabel(text(touch.subtype)),
    campaign: text(touch.campaignName),
    evidence: text(touch.evidence),
    touchedAt: text(touch.touchedAt),
    landingPath: text(touch.landingPath),
  };
}

/**
 * Origine affichable d'une fiche, contacts fournis à part.
 *
 * `touches` vient de la table d'attribution et reste vide pour tout
 * l'historique : la fonction doit donc rester juste sans elle.
 */
export function originViewOf(prospect = {}, touches = []) {
  const attribution = attributionOf(prospect, touches);
  const premier = attribution.premier_contact;
  const dernier = attribution.dernier_contact;

  // Le dernier contact porte l'origine affichée : c'est celui qui a déclenché
  // la demande, donc celui que le commercial doit voir en ouvrant sa liste.
  const retenue = dernier || premier;

  if (!retenue) {
    // Aucune catégorie, aucun contact : la fiche est antérieure au module.
    // L'ancienne source libre est traduite pour qu'elle reste triable, et le
    // drapeau dit que c'est une lecture, pas une mesure.
    const source = text(prospect.source);
    const deduite = legacySourceToOrigin(source);
    const key = originFilterKey(deduite);
    return {
      key,
      label: originFilterLabel(key),
      sublabel: subtypeLabel(deduite.subtype),
      campaign: "",
      mesuree: false,
      deduiteDe: source,
      ecart: "",
      premier: null,
      dernier: null,
      contacts: 0,
    };
  }

  const key = originFilterKey(retenue);
  const vuePremier = touchView(premier);
  const vueDernier = touchView(dernier);
  // L'écart n'est signalé que si les deux contacts existent vraiment et
  // désignent des catégories différentes. Une fiche à contact unique n'a pas
  // d'écart : l'annoncer serait inventer une divergence.
  const ecart = attribution.touchCount > 1
    && vuePremier
    && vueDernier
    && premier.category !== dernier.category
    ? `premier contact : ${vuePremier.label}`
    : "";

  return {
    key,
    label: originFilterLabel(key),
    sublabel: subtypeLabel(retenue.subtype),
    campaign: text(retenue.campaignName),
    mesuree: true,
    deduiteDe: "",
    ecart,
    premier: vuePremier,
    dernier: vueDernier,
    contacts: attribution.touchCount,
  };
}

/** Filtre de liste. `all` et une valeur vide laissent tout passer. */
export function matchesOriginFilter(prospect, value) {
  const wanted = text(value);
  if (!wanted || wanted === ORIGIN_FILTER_ALL) return true;
  const key = text(prospect?.origin?.key) || originViewOf(prospect).key;
  return key === wanted;
}

/**
 * Options réellement proposées, dans l'ordre de la taxonomie. Une origine
 * absente de la liste chargée n'est pas offerte : un filtre qui ne renvoie
 * jamais rien est un piège, pas une fonctionnalité.
 */
export function originFilterOptions(prospects = []) {
  const present = new Set(
    (prospects || []).map(p => text(p?.origin?.key) || originViewOf(p || {}).key)
  );
  return ORIGIN_FILTERS.filter(item => present.has(item.key));
}
