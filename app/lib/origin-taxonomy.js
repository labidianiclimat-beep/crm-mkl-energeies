/**
 * Origine des prospects — codes stables et libellés d’affichage.
 *
 * Le code est stocké, le libellé est affiché. Renommer un libellé ne doit
 * jamais casser un agrégat.
 *
 * La catégorie découle du canal de création, qui est immuable. Un prospect
 * saisi dans le CRM ne peut donc jamais devenir un prospect publicitaire, et un
 * prospect venu du site ne peut jamais être attribué à un prospecteur terrain.
 */

/** Marqueur technique des événements synchronisés depuis Google Calendar. */
export const RESERVED_SOURCE_VALUES = ["google"];

export const ORIGIN_CHANNELS = ["crm_manual", "web_ingest", "import"];

export const ORIGIN_CATEGORIES = [
  {
    code: "google_ads",
    label: "Prospect GG Ads",
    channels: ["web_ingest"],
    subtypes: [],
    performance: true,
  },
  {
    code: "meta_ads",
    label: "Prospect Face",
    channels: ["web_ingest"],
    subtypes: ["facebook", "instagram"],
    performance: true,
  },
  {
    code: "site_web",
    label: "Prospect Site",
    channels: ["web_ingest", "import"],
    subtypes: ["seo", "direct", "referral"],
    performance: true,
  },
  {
    code: "prospection",
    label: "Prospection",
    channels: ["crm_manual", "import"],
    subtypes: ["porte_a_porte", "stand", "foire_salon", "centre_appels", "autre_terrain"],
    performance: true,
  },
  {
    code: "entrant",
    label: "Entrant & relationnel",
    channels: ["crm_manual", "import"],
    subtypes: ["appel_entrant", "recommandation", "partenaire"],
    performance: true,
  },
  {
    code: "a_qualifier",
    label: "À qualifier",
    channels: ORIGIN_CHANNELS,
    subtypes: [],
    performance: false,
  },
];

const SUBTYPE_LABELS = {
  facebook: "Facebook",
  instagram: "Instagram",
  seo: "Référencement naturel",
  direct: "Accès direct",
  referral: "Site référent",
  porte_a_porte: "Porte-à-porte",
  stand: "Stand commercial",
  foire_salon: "Foire ou salon",
  centre_appels: "Centre d’appels",
  autre_terrain: "Autre prospection terrain",
  appel_entrant: "Appel entrant",
  recommandation: "Recommandation",
  partenaire: "Partenaire",
};

function definitionOf(category) {
  const code = String(category || "").trim();
  return ORIGIN_CATEGORIES.find(item => item.code === code) || null;
}

export function isKnownOriginCategory(category) {
  return Boolean(definitionOf(category));
}

export function isKnownOriginChannel(channel) {
  return ORIGIN_CHANNELS.includes(String(channel || "").trim());
}

export function categoriesForChannel(channel) {
  const value = String(channel || "").trim();
  return ORIGIN_CATEGORIES.filter(item => item.channels.includes(value)).map(item => item.code);
}

export function channelAllowsCategory(channel, category) {
  const definition = definitionOf(category);
  if (!definition) return false;
  return definition.channels.includes(String(channel || "").trim());
}

export function subtypesForCategory(category) {
  return definitionOf(category)?.subtypes ? [...definitionOf(category).subtypes] : [];
}

export function categoryAllowsSubtype(category, subtype) {
  const value = String(subtype || "").trim();
  if (!value) return true;
  return subtypesForCategory(category).includes(value);
}

/** « À qualifier » n’entre dans aucun classement de performance d’acquisition. */
export function isPerformanceCategory(category) {
  return Boolean(definitionOf(category)?.performance);
}

export function categoryLabel(category) {
  return definitionOf(category)?.label || "";
}

export function subtypeLabel(subtype) {
  return SUBTYPE_LABELS[String(subtype || "").trim()] || "";
}

/**
 * Libellé écrit en miroir dans la colonne `source` des nouvelles fiches. Les
 * écrans existants agrègent sur cette valeur brute : ils doivent recevoir un
 * libellé lisible et jamais un code.
 */
export function mirrorSourceLabel(category, subtype) {
  const base = categoryLabel(category);
  if (!base) return "";
  const detail = subtypeLabel(subtype);
  return detail ? `${base} · ${detail}` : base;
}

/**
 * Un affinage reste possible à l’intérieur d’un canal. Il est refusé entre
 * familles, car le canal de création ne change jamais.
 */
export function canRefineOrigin(channel, fromCategory, toCategory) {
  if (!isKnownOriginChannel(channel)) return false;
  if (!channelAllowsCategory(channel, fromCategory)) return false;
  return channelAllowsCategory(channel, toCategory);
}

const GOOGLE_CLICK_KEYS = ["gclid", "gbraid", "wbraid"];
const GOOGLE_SOURCES = ["google", "googleads", "google_ads", "adwords"];
const META_SOURCES = ["facebook", "fb", "instagram", "ig", "meta"];
const PAID_MEDIUMS = ["cpc", "ppc", "paid", "paidsearch", "paid_search", "paidsocial", "paid_social"];
const ORGANIC_MEDIUMS = ["organic", "seo", "none", ""];

function clean(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Classe une demande arrivée par le site. Ne renvoie jamais une catégorie de la
 * famille naturelle : une demande web n’est pas le travail d’un prospecteur.
 */
export function classifyWebLead(input = {}) {
  for (const key of GOOGLE_CLICK_KEYS) {
    if (clean(input[key])) return { category: "google_ads", subtype: "", evidence: key };
  }
  const source = clean(input.utm_source || input.utmSource);
  const medium = clean(input.utm_medium || input.utmMedium);

  if (clean(input.fbclid)) {
    // L'identifiant de clic ne dit pas si l'annonce était sur Facebook ou sur
    // Instagram. Quand la campagne le précise, l'information est conservée :
    // c'est la distinction que les rapports doivent pouvoir faire.
    const placement = META_SOURCES.includes(source)
      ? (["instagram", "ig"].includes(source) ? "instagram" : "facebook")
      : "";
    return { category: "meta_ads", subtype: placement, evidence: "fbclid" };
  }

  const paid = PAID_MEDIUMS.includes(medium);

  if (paid && GOOGLE_SOURCES.includes(source)) {
    return { category: "google_ads", subtype: "", evidence: "utm" };
  }
  if (paid && META_SOURCES.includes(source)) {
    const subtype = ["instagram", "ig"].includes(source) ? "instagram" : "facebook";
    return { category: "meta_ads", subtype, evidence: "utm" };
  }
  if (paid) {
    return { category: "a_qualifier", subtype: "", evidence: "paid_inconnu" };
  }
  // `referrerHost` est le champ transmis par le site, qui ne conserve que le
  // domaine du référent et écarte déjà son propre domaine.
  const referrer = clean(input.referrerHost || input.referrer);
  if (medium === "referral" || (!medium && referrer)) {
    return { category: "site_web", subtype: "referral", evidence: "referrer" };
  }
  if (ORGANIC_MEDIUMS.includes(medium)) {
    // `evidence` dit sur quoi repose le classement, et sert d'où vient cette
    // ligne lors d'un contrôle. Un accès direct n'a aucun paramètre : annoncer
    // « utm » laisserait croire à une preuve qui n'existe pas, et fausserait
    // tout décompte des demandes classées grâce aux UTM. La chaîne vide, déjà
    // admise par la contrainte en base, dit la seule chose vraie : rien à citer.
    const direct = medium === "";
    return {
      category: "site_web",
      subtype: direct ? "direct" : "seo",
      evidence: direct ? "" : "utm",
    };
  }
  return { category: "a_qualifier", subtype: "", evidence: "inconnu" };
}

/**
 * Correspondance de lecture entre les provenances historiques et la taxonomie.
 * Aucune valeur stockée n’est modifiée : cette table sert à rendre l’historique
 * comparable au moment de la lecture.
 *
 * `ambiguous` signale une valeur qui mélange plusieurs canaux réels et qui ne
 * peut donc pas alimenter une comparaison de performance publicitaire.
 */
const LEGACY_SOURCE_MAP = {
  "prospection": { category: "prospection", subtype: "" },
  "appel entrant": { category: "entrant", subtype: "appel_entrant" },
  "site internet": { category: "site_web", subtype: "", ambiguous: true },
  "recommandation": { category: "entrant", subtype: "recommandation" },
  "partenaire": { category: "entrant", subtype: "partenaire" },
  "salon": { category: "prospection", subtype: "foire_salon" },
  "stand carrefour": { category: "prospection", subtype: "stand" },
  "call marrakech (pros)": { category: "prospection", subtype: "centre_appels" },
  "autre": { category: "a_qualifier", subtype: "" },
};

export function legacySourceToOrigin(source) {
  const raw = clean(source);
  if (RESERVED_SOURCE_VALUES.includes(raw)) {
    return { category: "a_qualifier", subtype: "", ambiguous: true, reserved: true };
  }
  const mapped = LEGACY_SOURCE_MAP[raw];
  if (!mapped) {
    return { category: "a_qualifier", subtype: "", ambiguous: true, reserved: false };
  }
  return {
    category: mapped.category,
    subtype: mapped.subtype,
    ambiguous: Boolean(mapped.ambiguous),
    reserved: false,
  };
}

/**
 * Axe de comparaison des rapports. La prospection se décline en sous-origine,
 * afin que le centre d’appels soit mesuré séparément des prospecteurs terrain.
 */
export function comparisonAxis({ category, subtype, prospectorId } = {}) {
  const code = String(category || "").trim();
  if (code !== "prospection") {
    return { key: code || "a_qualifier", label: categoryLabel(code) || "À qualifier" };
  }
  if (String(subtype || "").trim() === "centre_appels") {
    return { key: "prospection:centre_appels", label: "Centre d’appels" };
  }
  const id = String(prospectorId || "").trim();
  if (id) return { key: `prospecteur:${id}`, label: "" };
  return { key: "prospection:sans_prospecteur", label: "Prospection sans prospecteur" };
}
