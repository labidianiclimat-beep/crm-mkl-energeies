/** Parcours devis : Catégorie → Sous-catégorie → Marque → Article. */

import { matchesArticleSearch, resolvedCatalogTax } from "./articles.js";
import { findBrandLogo } from "./brands.js";
import {
  isTaxonomyActive,
  normalizeCatalogName,
  taxonomyNamesEqual,
  uncategorizedSubcategory,
  UNCATEGORIZED_SUBCATEGORY_ID,
} from "./article-taxonomy.js";

export const PICKER_ICONS = ["Snowflake", "Flame", "Heater", "Home", "Droplets", "Sun", "Wind", "Package", "Waves"];

/** Ordre commercial du premier écran « Ajouter un article » (devis et facture). */
export const PICKER_FAMILIES = [
  {
    name: "Chauffage",
    description: "PAC, radiateurs, chaudières gaz et autres",
    icon: "Flame",
    aliases: ["Chauffage", "Chauffage électrique", "Pompe à chaleur", "Pompe à chaleur Duo", "Radiateur électrique", "Radiateur", "Poêle"],
  },
  {
    name: "Climatisation",
    description: "Splits, unités, consoles, fournitures et installation",
    icon: "Snowflake",
    aliases: ["Climatisation"],
  },
  {
    name: "Ballon d’eau chaude",
    description: "Ballons thermodynamiques et électriques",
    icon: "Droplets",
    aliases: ["Ballon d’eau chaude", "Ballon d'eau chaude", "Ballon thermodynamique", "Ballon électrique"],
  },
  {
    name: "Photovoltaïque",
    description: "Panneaux, onduleurs, optimiseurs et pose PV",
    icon: "Sun",
    aliases: ["Photovoltaïque", "Panneaux photovoltaïques"],
  },
  {
    name: "VMC",
    description: "Ventilation mécanique contrôlée",
    icon: "Wind",
    aliases: ["VMC"],
  },
  {
    name: "Isolation",
    description: "Combles, rampants, murs et plancher bas",
    icon: "Home",
    aliases: ["Isolation", "Isolation extérieure", "Isolation intérieure", "Isolation des combles", "Isolation des rampants", "Isolation du plancher bas", "Plancher bas"],
  },
  {
    name: "Autre",
    description: "Autres familles de produits",
    icon: "Package",
    aliases: ["Autre"],
    catchAll: true,
  },
];

function namesMatchAny(value, names = []) {
  return names.some(name => taxonomyNamesEqual(value, name));
}

function familyMatchNames(family) {
  return [family?.name, ...(family?.aliases || [])].filter(Boolean);
}

export function findPickerFamily(name) {
  const named = PICKER_FAMILIES.find(family => !family.catchAll && namesMatchAny(name, familyMatchNames(family)));
  if (named) return named;
  return PICKER_FAMILIES.find(family => family.catchAll) || null;
}

/** Deuxième écran après une famille commerciale. */
export const PICKER_SUBFAMILIES = {
  Chauffage: [
    {
      name: "Pompe à chaleur",
      description: "PAC, Duo, fourniture ou installation",
      icon: "Flame",
      aliases: [
        "Pompe à chaleur",
        "Pompe à chaleur air/eau",
        "Pompe à chaleur air/air",
        "Pompe à chaleur Duo",
        "Air/eau",
        "Air/air",
        "PAC",
        "PAC Duo",
      ],
      variants: [
        {
          name: "Pompe à chaleur",
          description: "PAC simple — une unité",
          icon: "Flame",
          aliases: [
            "Pompe à chaleur",
            "Pompe à chaleur air/eau",
            "Pompe à chaleur air/air",
            "Air/eau",
            "Air/air",
            "PAC",
          ],
        },
        {
          name: "Pompe à chaleur Duo",
          description: "Système Duo",
          icon: "Waves",
          aliases: ["Pompe à chaleur Duo", "PAC Duo"],
        },
        {
          name: "Fourniture",
          description: "Accessoires et fournitures PAC",
          icon: "Package",
          accessory: true,
          aliases: ["Fourniture", "Fournitures"],
        },
        {
          name: "Installation",
          description: "Pose et main-d’œuvre PAC",
          icon: "Wrench",
          accessory: true,
          aliases: ["Installation", "Pose", "Main-d’œuvre PAC"],
        },
      ],
    },
    {
      name: "Radiateur électrique",
      description: "Radiateurs à brique réfractaire Technotherm, plats, bas, hauts et accessoires",
      icon: "Heater",
      aliases: [
        "Radiateur électrique",
        "Radiateur",
        "Convecteur",
        "Inertie",
        "Chauffage électrique",
        "Brique réfractaire partielle standard blanc",
        "Brique réfractaire partielle standard anthracite",
        "Brique réfractaire partielle bas blanc",
        "Brique réfractaire partielle bas anthracite",
        "Brique réfractaire partielle haut blanc",
        "Brique réfractaire partielle haut anthracite",
        "Accumulation partielle standard blanc",
        "Accumulation partielle standard anthracite",
        "Accumulation partielle bas blanc",
        "Accumulation partielle bas anthracite",
        "Accumulation partielle haut blanc",
        "Accumulation partielle haut anthracite",
        "Plat standard blanc",
        "Plat standard anthracite",
        "Plat haut blanc",
        "Plat haut anthracite",
        "Plat bas blanc",
        "Plat bas anthracite",
        "Accessoires",
        "Autres radiateurs",
      ],
      variants: [
        { name: "Brique réfractaire partielle standard blanc", description: "TT-KS standard, blanc, thermostat DSD", icon: "Heater", aliases: ["Brique réfractaire partielle standard blanc", "Accumulation partielle standard blanc"] },
        { name: "Brique réfractaire partielle standard anthracite", description: "TT-KS standard, anthracite, thermostat DSD", icon: "Heater", aliases: ["Brique réfractaire partielle standard anthracite", "Accumulation partielle standard anthracite"] },
        { name: "Brique réfractaire partielle bas blanc", description: "TT-KS bas, blanc, thermostat DSD", icon: "Heater", aliases: ["Brique réfractaire partielle bas blanc", "Accumulation partielle bas blanc"] },
        { name: "Brique réfractaire partielle bas anthracite", description: "TT-KS bas, anthracite, thermostat DSD", icon: "Heater", aliases: ["Brique réfractaire partielle bas anthracite", "Accumulation partielle bas anthracite"] },
        { name: "Brique réfractaire partielle haut blanc", description: "TT-KS haut, blanc, thermostat DSD", icon: "Heater", aliases: ["Brique réfractaire partielle haut blanc", "Accumulation partielle haut blanc"] },
        { name: "Brique réfractaire partielle haut anthracite", description: "TT-KS haut, anthracite, thermostat DSD", icon: "Heater", aliases: ["Brique réfractaire partielle haut anthracite", "Accumulation partielle haut anthracite"] },
        { name: "Plat standard blanc", description: "TT-KS Flat standard, blanc, thermostat DSD", icon: "Heater", aliases: ["Plat standard blanc"] },
        { name: "Plat standard anthracite", description: "TT-KS Flat standard, anthracite, thermostat DSD", icon: "Heater", aliases: ["Plat standard anthracite"] },
        { name: "Plat haut blanc", description: "TT-KS Flat haut, blanc, thermostat DSD", icon: "Heater", aliases: ["Plat haut blanc"] },
        { name: "Plat haut anthracite", description: "TT-KS Flat haut, anthracite, thermostat DSD", icon: "Heater", aliases: ["Plat haut anthracite"] },
        { name: "Plat bas blanc", description: "TT-KS Flat bas, blanc, thermostat DSD", icon: "Heater", aliases: ["Plat bas blanc"] },
        { name: "Plat bas anthracite", description: "TT-KS Flat bas, anthracite, thermostat DSD", icon: "Heater", aliases: ["Plat bas anthracite"] },
        { name: "Accessoires", description: "Pieds, roulettes, teinte RAL et protection IPX4", icon: "Package", aliases: ["Accessoires"] },
        { name: "Autres radiateurs", description: "Radiateurs déjà au catalogue", icon: "Heater", aliases: ["Autres radiateurs", "Radiateur électrique", "Radiateur", "Convecteur", "Inertie", "Chauffage électrique"] },
      ],
    },
    {
      name: "Chaudière gaz",
      description: "Chaudières gaz et circuits associés",
      icon: "Flame",
      aliases: ["Chaudière gaz", "Chaudière à gaz", "Chaudière", "Gaz"],
    },
    {
      name: "Autre",
      description: "Autres équipements de chauffage",
      icon: "Package",
      aliases: ["Autre"],
      catchAll: true,
    },
  ],
  VMC: [
    {
      name: "VMC simple flux",
      description: "Extraction simple flux",
      icon: "Wind",
      aliases: ["VMC simple flux", "Simple flux", "Simple-flux"],
    },
    {
      name: "VMC double flux",
      description: "Double flux avec récupération de chaleur",
      icon: "Wind",
      aliases: ["VMC double flux", "Double flux", "Double-flux"],
    },
  ],
  Isolation: [
    {
      name: "Isolation des combles",
      description: "Combles perdus et aménagés",
      icon: "Home",
      aliases: ["Isolation des combles", "Combles", "Combles perdus"],
    },
    {
      name: "Isolation des rampants",
      description: "Rampants de toiture",
      icon: "Home",
      aliases: ["Isolation des rampants", "Rampants"],
    },
    {
      name: "Isolation extérieure",
      description: "ITE et façades",
      icon: "Home",
      aliases: ["Isolation extérieure", "ITE", "Extérieure"],
    },
    {
      name: "Isolation intérieure",
      description: "ITI et cloisons",
      icon: "Home",
      aliases: ["Isolation intérieure", "ITI", "Intérieure"],
    },
    {
      name: "Isolation du plancher bas",
      description: "Dallages, vides sanitaires et sous-sols",
      icon: "Home",
      aliases: ["Isolation du plancher bas", "Plancher bas", "Plancher", "Vide sanitaire"],
    },
  ],
  Climatisation: [
    {
      name: "Mono-split",
      description: "Un groupe, une unité intérieure",
      icon: "Snowflake",
      aliases: ["Mono-split", "Monosplit", "Mono split"],
    },
    {
      name: "Bi-split",
      description: "Deux unités intérieures",
      icon: "Snowflake",
      aliases: ["Bi-split", "Bisplit", "Bi split"],
    },
    {
      name: "Tri-split",
      description: "Trois unités intérieures",
      icon: "Snowflake",
      aliases: ["Tri-split", "Trisplit", "Tri split"],
    },
    {
      name: "Quadri-split",
      description: "Quatre unités intérieures",
      icon: "Snowflake",
      aliases: ["Quadri-split", "Quadrisplit", "Quadri split"],
    },
    {
      name: "5 unités",
      description: "Cinq unités intérieures",
      icon: "Snowflake",
      aliases: ["5 unités", "5 unites", "Cinq unités", "Penta-split", "Pentasplit", "5 sorties"],
    },
    {
      name: "Unités intérieures",
      description: "Unités intérieures seules",
      icon: "Home",
      aliases: ["Unités intérieures", "Unité intérieure", "Unites interieures", "UI"],
    },
    {
      name: "Console basse",
      description: "Console posée au sol",
      icon: "Heater",
      aliases: ["Console basse", "Console"],
    },
    {
      name: "Gainable",
      description: "Unité gainable",
      icon: "Wind",
      aliases: ["Gainable"],
    },
    {
      name: "Fourniture",
      description: "Accessoires et liaisons climatisation",
      icon: "Package",
      accessory: true,
      kind: "fourniture",
      aliases: ["Fourniture", "Fournitures"],
    },
    {
      name: "Installation",
      description: "Pose et main-d’œuvre climatisation",
      icon: "Wrench",
      accessory: true,
      kind: "installation",
      aliases: ["Installation", "Pose"],
    },
  ],
  "Ballon d’eau chaude": [
    {
      name: "Ballon thermodynamique",
      description: "Ballons thermodynamiques",
      icon: "Droplets",
      aliases: ["Ballon thermodynamique", "Thermodynamique"],
    },
    {
      name: "Ballon électrique",
      description: "Ballons électriques",
      icon: "Droplets",
      aliases: ["Ballon électrique", "Ballon d’eau chaude électrique", "Ballon d'eau chaude électrique"],
    },
  ],
  Photovoltaïque: [
    {
      name: "Panneaux",
      description: "Modules photovoltaïques",
      icon: "Sun",
      aliases: ["Panneaux", "Panneau", "Panneaux photovoltaïques", "Module"],
    },
    {
      name: "Onduleurs",
      description: "Onduleurs string et centraux",
      icon: "Package",
      aliases: ["Onduleurs", "Onduleur"],
      excludeAliases: ["Micro-onduleur", "Micro-onduleurs"],
      excludeMicroInverter: true,
    },
    {
      name: "Micro-onduleur",
      description: "Micro-onduleurs",
      icon: "Sun",
      aliases: ["Micro-onduleur", "Micro-onduleurs", "Micro onduleur", "Microonduleur"],
      requireMicroInverter: true,
    },
    {
      name: "Batteries",
      description: "Stockage photovoltaïque",
      icon: "Droplets",
      aliases: ["Batteries", "Batterie", "Stockage"],
    },
    {
      name: "Optimiseur",
      description: "Optimiseurs photovoltaïques",
      icon: "Sun",
      aliases: ["Optimiseur", "Optimiseurs", "Optimiseur photovoltaïque"],
    },
    {
      name: "Main-d’œuvre",
      description: "Pose et main-d’œuvre photovoltaïque",
      icon: "Wrench",
      aliases: ["Main-d’œuvre", "Main-d'oeuvre", "Pose", "Installation"],
    },
  ],
};

function valueMatchesAliases(value, aliases = []) {
  if (namesMatchAny(value, aliases)) return true;
  const normalized = normalizeCatalogName(value);
  if (!normalized) return false;
  return aliases.some(alias => {
    const target = normalizeCatalogName(alias);
    return target.length >= 4 && normalized.includes(target);
  });
}

function groupedSubfamiliesFor(category) {
  if (!category) return null;
  if (PICKER_SUBFAMILIES[category.name]) return PICKER_SUBFAMILIES[category.name];
  const family = findPickerFamily(category.name);
  const candidates = [category.name, family?.name];
  const key = Object.keys(PICKER_SUBFAMILIES).find(name =>
    candidates.some(candidate => candidate && taxonomyNamesEqual(name, candidate))
  );
  return key ? PICKER_SUBFAMILIES[key] : null;
}

function hasDuoToken(value) {
  return /(?:^|[^a-z0-9])duo(?:[^a-z0-9]|$)/i.test(normalizeCatalogName(value));
}

function articleLooksLikeHeatPumpDuo(article) {
  return hasDuoToken(
    [article?.subcategory, article?.sous_categorie, article?.name, article?.designation, article?.code].join(" ")
  );
}

function articleLooksLikeHeatPump(article) {
  const hay = normalizeCatalogName(articleHaystack(article));
  if (/pompe a chaleur|\bpac\b|excellia|alfea|altherma|aquarea/.test(hay)) return true;
  return articleLooksLikeHeatPumpDuo(article) && /pompe|pac|excellia|alfea|altherma|aquarea|atlantic/.test(hay);
}

function articleLooksLikeMicroInverter(article) {
  return /micro[-\s]?ondul/.test(normalizeCatalogName(articleHaystack(article)));
}

const PAC_ACCESSORY_NAMES = ["Fourniture", "Fournitures", "Installation", "Pose"];

export const ACCESSORY_VARIANTS = [
  {
    name: "Fourniture",
    description: "Accessoires et fournitures",
    icon: "Package",
    accessory: true,
    kind: "fourniture",
    aliases: ["Fourniture", "Fournitures"],
  },
  {
    name: "Installation",
    description: "Pose et main-d’œuvre",
    icon: "Wrench",
    accessory: true,
    kind: "installation",
    aliases: ["Installation", "Pose", "Main-d’œuvre"],
  },
];

export function accessoryKindFromName(name) {
  if (taxonomyNamesEqual(name, "Installation") || taxonomyNamesEqual(name, "Pose") || taxonomyNamesEqual(name, "Main-d’œuvre")) {
    return "installation";
  }
  if (taxonomyNamesEqual(name, "Fourniture") || taxonomyNamesEqual(name, "Fournitures")) return "fourniture";
  return "";
}

export function pickerAccessoryKind(value) {
  const ref = String(value?.sourceReference || value?.source_reference || value || "")
    .trim()
    .toLowerCase();
  if (ref === "picker:installation") return "installation";
  if (ref === "picker:fourniture") return "fourniture";
  if (value && typeof value === "object") return accessoryKindFromName(value.subcategory || value.sous_categorie || value.name);
  return accessoryKindFromName(value);
}

export function isPacAccessoryName(name) {
  return PAC_ACCESSORY_NAMES.some(alias => taxonomyNamesEqual(name, alias));
}

export function isPacAccessoryVariant(subcategory) {
  if (taxonomyNamesEqual(subcategory?.parentFamily, "Photovoltaïque")) return false;
  return Boolean(subcategory?.accessory) || Boolean(accessoryKindFromName(subcategory?.name));
}

export function persistPickerSubcategory(subcategory, variant) {
  if (variant?.accessory) return subcategory || null;
  return variant || subcategory || null;
}

function withAccessoryVariants(defs = [], subcategory) {
  const list = [...(defs || [])];
  if (
    isClimatisationFamilyName(subcategory?.parentFamily)
    || isClimatisationFamilyName(subcategory?.name)
  ) {
    return list;
  }
  if (!isHeatPumpSubfamily(subcategory) && !taxonomyNamesEqual(subcategory?.name, "Pompe à chaleur")) {
    return list;
  }
  if (!list.length && subcategory?.name) {
    list.push({
      name: subcategory.name,
      description: subcategory.description || "",
      icon: subcategory.icon || "Package",
      aliases: subcategory.aliases || [subcategory.name],
    });
  }
  for (const accessory of ACCESSORY_VARIANTS) {
    if (!list.some(item => (item.kind || accessoryKindFromName(item.name)) === accessory.kind)) {
      list.push(accessory);
    }
  }
  return list;
}

function isHeatPumpSubfamily(subcategory) {
  return taxonomyNamesEqual(subcategory?.name, "Pompe à chaleur")
    || taxonomyNamesEqual(subcategory?.parentSubfamily, "Pompe à chaleur")
    || taxonomyNamesEqual(subcategory?.name, "Pompe à chaleur Duo");
}

function isClimatisationFamilyName(name) {
  const normalized = normalizeCatalogName(name);
  return taxonomyNamesEqual(name, "Climatisation") || normalized.startsWith("climatis");
}

function climatisationAliases() {
  return [
    "Climatisation",
    ...(PICKER_SUBFAMILIES.Climatisation || [])
      .filter(item => !item.accessory)
      .flatMap(item => item.aliases || [item.name]),
  ];
}

function articleLooksLikeClimatisation(article) {
  if (!article) return false;
  if (articleLooksLikeHeatPump(article) || articleMatchesHeatPumpLabels(article)) return false;
  const category = article.category || article.categorie || "";
  const subcategory = article.subcategory || article.sous_categorie || "";
  if (isClimatisationFamilyName(category)) return true;
  if (valueMatchesAliases(subcategory, climatisationAliases())) return true;
  return isPacAccessoryName(subcategory) && isClimatisationFamilyName(category);
}

function articleBelongsToParentSubfamily(article, accessoryCard) {
  const parentName = accessoryCard?.parentSubfamily || "";
  const parentFamily = accessoryCard?.parentFamily || "";
  const parentAliases = accessoryCard?.parentAliases || (parentName ? [parentName] : []);
  const sourceIds = (accessoryCard?.sourceIds || []).map(String).filter(Boolean);
  const subName = article?.subcategory || article?.sous_categorie || "";
  if (isClimatisationFamilyName(parentFamily) || valueMatchesAliases(parentName, climatisationAliases())) {
    return articleLooksLikeClimatisation(article);
  }
  if (article?.subcategoryId && sourceIds.includes(String(article.subcategoryId))) return true;
  if (parentAliases.length && valueMatchesAliases(subName, parentAliases)) return true;
  if (isPacAccessoryName(subName) && taxonomyNamesEqual(parentName, "Pompe à chaleur")) return true;
  if (isHeatPumpSubfamily({ name: parentName }) && (articleLooksLikeHeatPump(article) || articleMatchesHeatPumpLabels(article))) {
    return true;
  }
  return false;
}

function articleMatchesGroupedSubfamily(article, subcategory) {
  if (!article || !subcategory) return false;
  const sourceIds = (subcategory.sourceIds || []).map(String).filter(Boolean);
  const aliases = subcategory.aliases || [subcategory.name];
  const subName = article.subcategory || article.sous_categorie || "";
  const articleKind = pickerAccessoryKind(article);
  if (isPacAccessoryVariant(subcategory)) {
    const wanted = subcategory.kind || accessoryKindFromName(subcategory.name);
    if (articleKind !== wanted) return false;
    return articleBelongsToParentSubfamily(article, subcategory);
  }
  if (articleKind && subcategory.variant) return false;
  if (isPacAccessoryName(subName)) {
    return Boolean(subcategory.group && !subcategory.variant && taxonomyNamesEqual(subcategory.name, "Pompe à chaleur"));
  }
  if (subcategory.requireDuo) {
    return articleLooksLikeHeatPumpDuo(article) && (articleLooksLikeHeatPump(article) || articleMatchesHeatPumpLabels(article));
  }
  if (subcategory.excludeDuo && articleLooksLikeHeatPumpDuo(article) && isHeatPumpSubfamily(subcategory)) {
    return false;
  }
  if ((subcategory.excludeAliases || []).some(alias => taxonomyNamesEqual(subName, alias) || valueMatchesAliases(subName, [alias]))) {
    return false;
  }
  if (subcategory.excludeMicroInverter && articleLooksLikeMicroInverter(article)) return false;
  if (article.subcategoryId && sourceIds.includes(String(article.subcategoryId))) {
    if (subcategory.requireMicroInverter && !articleLooksLikeMicroInverter(article) && !valueMatchesAliases(subName, aliases)) {
      return false;
    }
    return true;
  }
  if (subcategory.requireMicroInverter) {
    return articleLooksLikeMicroInverter(article) || valueMatchesAliases(subName, aliases);
  }
  if (valueMatchesAliases(subName, aliases)) return true;
  if (subcategory.catchAll) return false;
  const articleCategory = article.category || article.categorie || "";
  if (isHeatPumpSubfamily(subcategory) && articleLooksLikeHeatPump(article)) return true;
  if (subcategory.parentFamily && taxonomyNamesEqual(articleCategory, subcategory.parentFamily)) return false;
  return valueMatchesAliases(articleCategory, aliases);
}

function articleMatchesHeatPumpLabels(article) {
  const pacAliases = ["Pompe à chaleur", "Pompe à chaleur Duo", "PAC", "PAC Duo", "Chauffage"];
  const subName = article?.subcategory || article?.sous_categorie || "";
  const articleCategory = article?.category || article?.categorie || "";
  return valueMatchesAliases(subName, pacAliases) || valueMatchesAliases(articleCategory, pacAliases);
}

function familySourceCategories(family, taxonomyCategories = []) {
  return (taxonomyCategories || []).filter(item => {
    if (family.catchAll) {
      return !PICKER_FAMILIES.some(
        other => !other.catchAll && namesMatchAny(item.name, familyMatchNames(other))
      );
    }
    return namesMatchAny(item.name, familyMatchNames(family));
  });
}

export function articleHaystack(article = {}) {
  return [
    article.category || article.categorie || "",
    article.subcategory || article.sous_categorie || "",
    article.name || article.designation || "",
    article.code || article.reference || "",
    article.brand || article.marque || "",
  ].join(" ");
}

export function isArticleActive(article) {
  if (!article) return false;
  if (article.active === false || article.actif === false) return false;
  if (article.status === "Inactif") return false;
  return true;
}

export function filterActiveArticles(articles = [], { includeInactive = false } = {}) {
  if (includeInactive) return [...articles];
  return articles.filter(isArticleActive);
}

export function articleMatchesCategory(article, category) {
  if (!article || !category) return false;
  const sourceIds = (category.sourceIds || []).map(String).filter(Boolean);
  if (category.id && !String(category.id).startsWith("family:")) sourceIds.push(String(category.id));
  if (article.categoryId && sourceIds.includes(String(article.categoryId))) return true;

  const articleName = article.category || article.categorie;
  if (category.catchAll) {
    if (namesMatchAny(articleName, familyMatchNames(category))) return true;
    return !PICKER_FAMILIES.some(
      family => !family.catchAll && namesMatchAny(articleName, familyMatchNames(family))
    );
  }
  if (namesMatchAny(articleName, familyMatchNames(category))) return true;
  if (taxonomyNamesEqual(category.name, "Chauffage") && articleLooksLikeHeatPump(article)) return true;
  return false;
}

export function articleMatchesSubcategory(article, subcategory) {
  if (!article || !subcategory) return false;
  const subName = article.subcategory || article.sous_categorie || "";
  if (subcategory.group) {
    if (subcategory.catchAll) {
      const named =
        subcategory.siblings?.length
          ? subcategory.siblings
          : (PICKER_SUBFAMILIES[subcategory.parentFamily] || [])
              .filter(item => !item.catchAll)
              .map(item => ({ ...item, group: true, aliases: familyMatchNames(item) }));
      return !named.some(other => articleMatchesGroupedSubfamily(article, other));
    }
    return articleMatchesGroupedSubfamily(article, subcategory);
  }
  if (subcategory.derivedFromCategory) {
    const matchesParent =
      (article.categoryId && subcategory.id && String(article.categoryId) === String(subcategory.id)) ||
      taxonomyNamesEqual(article.category || article.categorie, subcategory.name);
    return Boolean(matchesParent) && !String(subName).trim();
  }
  if (subcategory.empty || subcategory.virtual || subcategory.id === UNCATEGORIZED_SUBCATEGORY_ID) {
    return !String(subName).trim();
  }
  if (article.subcategoryId && subcategory.id && String(article.subcategoryId) === String(subcategory.id)) {
    return true;
  }
  return taxonomyNamesEqual(subName, subcategory.name);
}

export function articleBrandName(article) {
  return String(article?.brand || article?.marque || "").trim() || "Autres";
}

function sortByLabel(a, b) {
  return String(a.name || a.label || "").localeCompare(String(b.name || b.label || ""), "fr");
}

export function deriveCategoriesFromArticles(articles = [], { includeInactive = false } = {}) {
  const map = new Map();
  for (const article of filterActiveArticles(articles, { includeInactive })) {
    const name = String(article.category || article.categorie || "").trim();
    if (!name) continue;
    const existing = [...map.values()].find(item => taxonomyNamesEqual(item.name, name));
    if (existing) {
      existing.count += 1;
      continue;
    }
    map.set(article.categoryId || name, {
      id: article.categoryId || name,
      name,
      description: "",
      icon: "Package",
      sortOrder: 80,
      active: true,
      derived: true,
      count: 1,
    });
  }
  return [...map.values()].sort((a, b) => a.sortOrder - b.sortOrder || sortByLabel(a, b));
}

export function pickerCategories(taxonomyCategories = [], articles = [], { includeInactive = false } = {}) {
  const fromDb = (taxonomyCategories || []).filter(item => includeInactive || isTaxonomyActive(item));
  const activeArticles = filterActiveArticles(articles, { includeInactive });
  return PICKER_FAMILIES.map((family, index) => {
    const sources = familySourceCategories(family, fromDb);
    const primary =
      sources.find(item => taxonomyNamesEqual(item.name, family.name)) || sources[0] || null;
    const card = {
      id: primary?.id || `family:${family.name}`,
      name: family.name,
      description: primary?.description || family.description,
      icon: primary?.icon || family.icon,
      sortOrder: (index + 1) * 10,
      active: true,
      family: true,
      catchAll: Boolean(family.catchAll),
      aliases: familyMatchNames(family),
      sourceIds: [...new Set(sources.map(item => item.id).filter(Boolean))],
    };
    card.count = activeArticles.filter(article => articleMatchesCategory(article, card)).length;
    return card;
  });
}

export function articlesForCategory(articles = [], category, { includeInactive = false } = {}) {
  if (!category) return [];
  return filterActiveArticles(articles, { includeInactive }).filter(article =>
    articleMatchesCategory(article, category)
  );
}

export function variantsForSubfamily(subcategory) {
  if (!subcategory) return [];
  let defs = [];
  if (Array.isArray(subcategory.variants) && subcategory.variants.length) {
    defs = subcategory.variants;
  } else {
    const grouped = groupedSubfamiliesFor({ name: subcategory.parentFamily || subcategory.name }) || [];
    const parent =
      grouped.find(item => taxonomyNamesEqual(item.name, subcategory.name)) ||
      grouped.find(item => namesMatchAny(subcategory.name, familyMatchNames(item)));
    defs = parent?.variants || [];
  }
  return withAccessoryVariants(defs, subcategory);
}

export function subfamilyHasVariants(subcategory) {
  return variantsForSubfamily(subcategory).length > 0;
}

export function pickerVariants(subcategory, articles = [], { includeInactive = false } = {}) {
  const defs = variantsForSubfamily(subcategory);
  if (!defs.length) return [];
  const scoped = filterActiveArticles(articles, { includeInactive }).filter(article =>
    articleMatchesSubcategory(article, subcategory)
  );
  const climPool = isClimatisationFamilyName(subcategory.parentFamily || subcategory.name)
    ? filterActiveArticles(articles, { includeInactive }).filter(articleLooksLikeClimatisation)
    : null;
  return defs.map((variant, index) => {
    const aliases = familyMatchNames(variant);
    const others = defs.filter(item => item.name !== variant.name).flatMap(item => familyMatchNames(item));
    const card = {
      id: `variant:${subcategory.name}:${variant.name}`,
      categoryId: subcategory.categoryId || "",
      name: variant.name,
      description: variant.description,
      icon: variant.icon || subcategory.icon || "Flame",
      sortOrder: (index + 1) * 10,
      active: true,
      group: true,
      variant: true,
      parentFamily: subcategory.parentFamily || "Chauffage",
      parentSubfamily: subcategory.name,
      aliases,
      excludeAliases: others,
      requireDuo: hasDuoToken(variant.name),
      excludeDuo: !variant.accessory && !hasDuoToken(variant.name),
      accessory: Boolean(variant.accessory),
      kind: variant.kind || accessoryKindFromName(variant.name),
      parentAliases: subcategory.aliases || [subcategory.name],
      sourceIds: subcategory.sourceIds || [],
    };
    const pool = card.accessory && climPool ? climPool : scoped;
    return {
      ...card,
      count: pool.filter(article => articleMatchesSubcategory(article, card)).length,
    };
  });
}

export function pickerSubcategories(category, taxonomySubcategories = [], articles = [], { includeInactive = false } = {}) {
  if (!category) return [];
  const scopedArticles = articlesForCategory(articles, category, { includeInactive });
  const grouped = groupedSubfamiliesFor(category);
  const sourceIds = new Set((category.sourceIds || []).map(String).filter(Boolean));
  if (category.id && !String(category.id).startsWith("family:")) sourceIds.add(String(category.id));
  const fromDb = (taxonomySubcategories || [])
    .filter(item => includeInactive || isTaxonomyActive(item))
    .filter(
      item =>
        sourceIds.has(String(item.categoryId)) ||
        namesMatchAny(item.categoryName, familyMatchNames(category))
    )
    .sort((a, b) => Number(a.sortOrder ?? 100) - Number(b.sortOrder ?? 100) || sortByLabel(a, b));

  if (grouped) {
    const named = grouped.filter(item => !item.catchAll);
    const parentFamily =
      Object.keys(PICKER_SUBFAMILIES).find(name => PICKER_SUBFAMILIES[name] === grouped) || category.name;
    const cards = grouped.map((subfamily, index) => {
      const aliases = familyMatchNames(subfamily);
      const sources = fromDb.filter(item => {
        if (subfamily.catchAll) {
          return !named.some(other => valueMatchesAliases(item.name, familyMatchNames(other)));
        }
        if ((subfamily.excludeAliases || []).some(alias => (
          taxonomyNamesEqual(item.name, alias) || valueMatchesAliases(item.name, [alias])
        ))) {
          return false;
        }
        return valueMatchesAliases(item.name, aliases);
      });
      const primary = sources.find(item => taxonomyNamesEqual(item.name, subfamily.name)) || sources[0] || null;
      return {
        id: primary?.id || `subfamily:${category.name}:${subfamily.name}`,
        categoryId: category.id || "",
        name: subfamily.name,
        description: primary?.description || subfamily.description,
        icon: subfamily.icon,
        sortOrder: (index + 1) * 10,
        active: true,
        group: true,
        catchAll: Boolean(subfamily.catchAll),
        accessory: Boolean(subfamily.accessory),
        kind: subfamily.kind || accessoryKindFromName(subfamily.name),
        parentFamily,
        aliases,
        excludeAliases: subfamily.excludeAliases || [],
        excludeMicroInverter: Boolean(subfamily.excludeMicroInverter),
        requireMicroInverter: Boolean(subfamily.requireMicroInverter),
        sourceIds: [...new Set(sources.map(item => item.id).filter(Boolean))],
      };
    });
    const siblings = cards.filter(item => !item.catchAll);
    return cards.map(card => {
      const resolved = card.catchAll ? { ...card, siblings } : card;
      return {
        ...resolved,
        count: scopedArticles.filter(article => articleMatchesSubcategory(article, resolved)).length,
      };
    });
  }

  const derivedNames = [
    ...new Set(
      scopedArticles
        .map(article => String(article.subcategory || article.sous_categorie || "").trim())
        .filter(Boolean)
    ),
  ];
  const list = fromDb.length
    ? [...fromDb]
    : derivedNames
        .sort((a, b) => a.localeCompare(b, "fr"))
        .map(name => ({
          id: `${category.id || category.name}:${name}`,
          categoryId: category.id || "",
          name,
          derived: true,
          active: true,
          sortOrder: 80,
        }));

  if (fromDb.length) {
    for (const name of derivedNames.sort((a, b) => a.localeCompare(b, "fr"))) {
      if (!list.some(item => taxonomyNamesEqual(item.name, name))) {
        list.push({
          id: `${category.id || category.name}:${name}`,
          categoryId: category.id || "",
          name,
          derived: true,
          active: true,
          sortOrder: 90,
        });
      }
    }
  }

  if (category.catchAll) {
    for (const sourceName of [...new Set(
      scopedArticles
        .map(article => String(article.category || article.categorie || "").trim())
        .filter(name => name && !taxonomyNamesEqual(name, "Autre"))
    )].sort((a, b) => a.localeCompare(b, "fr"))) {
      if (!list.some(item => taxonomyNamesEqual(item.name, sourceName))) {
        const sourceId =
          (category.sourceIds || []).find(id =>
            scopedArticles.some(
              article => String(article.categoryId) === String(id) && taxonomyNamesEqual(article.category, sourceName)
            )
          ) || `${category.id || category.name}:${sourceName}`;
        list.push({
          id: sourceId,
          categoryId: category.id || "",
          name: sourceName,
          derived: true,
          derivedFromCategory: true,
          active: true,
          sortOrder: 85,
        });
      }
    }
  }

  const unmatched = scopedArticles.filter(
    article => !list.some(subcategory => articleMatchesSubcategory(article, subcategory))
  );
  if (unmatched.length) list.push(uncategorizedSubcategory(category));

  return list.map(subcategory => ({
    ...subcategory,
    count: scopedArticles.filter(article => articleMatchesSubcategory(article, subcategory)).length,
  }));
}

export function articlesForPath(
  articles = [],
  { category, subcategory, brand } = {},
  { includeInactive = false, query = "", sort = "name" } = {}
) {
  let list = articlesForCategory(articles, category, { includeInactive });
  if (subcategory) list = list.filter(article => articleMatchesSubcategory(article, subcategory));
  if (brand) {
    const wanted = String(brand).trim() || "Autres";
    list = list.filter(article => taxonomyNamesEqual(articleBrandName(article), wanted));
  }
  if (query) list = list.filter(article => matchesArticleSearch(article, query));
  const sorted = [...list];
  if (sort === "code") {
    sorted.sort((a, b) => String(a.code || "").localeCompare(String(b.code || ""), "fr"));
  } else if (sort === "price") {
    sorted.sort((a, b) => Number(a.sell || 0) - Number(b.sell || 0));
  } else {
    sorted.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr"));
  }
  return sorted;
}

export function searchArticlesByReference(articles = [], query, { includeInactive = false, limit = 12 } = {}) {
  const needle = String(query || "").trim();
  if (needle.length < 2) return [];
  const normalized = needle.toLowerCase();
  const exact = [];
  const prefix = [];
  const rest = [];
  for (const article of filterActiveArticles(articles, { includeInactive })) {
    if (!matchesArticleSearch(article, needle)) continue;
    const code = String(article.code || article.reference || "").trim().toLowerCase();
    if (code === normalized) exact.push(article);
    else if (code.startsWith(normalized)) prefix.push(article);
    else rest.push(article);
  }
  return [...exact, ...prefix, ...rest].slice(0, limit);
}

export function brandsForPath(
  articles = [],
  { category, subcategory } = {},
  { includeInactive = false, brandCatalog = [] } = {}
) {
  const list = articlesForPath(articles, { category, subcategory }, { includeInactive });
  const map = new Map();
  for (const article of list) {
    const brand = articleBrandName(article);
    const existing = [...map.values()].find(item => taxonomyNamesEqual(item.name, brand));
    if (existing) {
      existing.count += 1;
      continue;
    }
    map.set(brand, { name: brand, count: 1, logoUrl: "" });
  }
  for (const entry of map.values()) {
    entry.logoUrl = findBrandLogo(brandCatalog, entry.name);
  }
  return [...map.values()].sort((a, b) => {
    if (a.name === "Autres") return 1;
    if (b.name === "Autres") return -1;
    return a.name.localeCompare(b.name, "fr");
  });
}

export function isPersistedTaxonomyId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ""));
}

export function catalogPathIds(category, subcategory) {
  const categoryId =
    [category?.id, ...(category?.sourceIds || [])].find(isPersistedTaxonomyId) || "";
  const subcategoryId =
    [subcategory?.id, ...(subcategory?.sourceIds || [])].find(isPersistedTaxonomyId) || "";
  return { categoryId, subcategoryId };
}

function pushFormSubcategory(list, option) {
  const name = String(option?.name || "").trim();
  if (!name) return list;
  if (list.some(item => taxonomyNamesEqual(item.name, name))) return list;
  list.push({
    id: option.id || `name:${name}`,
    name,
    categoryId: option.categoryId || "",
    persisted: isPersistedTaxonomyId(option.id),
  });
  return list;
}

/** Sous-catégories du formulaire article : parcours catalogue + valeur déjà enregistrée. */
export function articleFormSubcategories(category, taxonomySubcategories = [], article = {}) {
  const options = [];
  if (category) {
    const cards = pickerSubcategories(category, taxonomySubcategories, [], { includeInactive: true });
    for (const card of cards) {
      const variants = pickerVariants(card, []);
      if (variants.length) {
        for (const variant of variants) {
          if (variant.accessory) continue;
          const persisted = (card.sourceIds || []).find(id => isPersistedTaxonomyId(id));
          const named = (taxonomySubcategories || []).find(item =>
            String(item.categoryId) === String(category.id) && taxonomyNamesEqual(item.name, variant.name)
          );
          pushFormSubcategory(options, {
            id: named?.id || persisted || variant.id,
            name: variant.name,
            categoryId: category.id,
          });
        }
      } else {
        if (card.accessory) continue;
        pushFormSubcategory(options, card);
      }
    }
    for (const item of taxonomySubcategories || []) {
      if (String(item.categoryId) !== String(category.id)) continue;
      if (item.active === false || item.status === "Inactif") continue;
      pushFormSubcategory(options, item);
    }
  }
  pushFormSubcategory(options, {
    id: article?.subcategoryId,
    name: article?.subcategory,
    categoryId: category?.id || article?.categoryId,
  });
  return options;
}

export function brandsForCreate(
  articles = [],
  { category, subcategory } = {},
  { includeInactive = false, brandCatalog = [] } = {}
) {
  const used = brandsForPath(articles, { category, subcategory }, { includeInactive, brandCatalog });
  const list = used.map(item => ({ ...item }));
  for (const brand of brandCatalog || []) {
    if (!includeInactive && (brand.active === false || brand.status === "Inactif")) continue;
    const name = String(brand.name || "").trim();
    if (!name) continue;
    const existing = list.find(item => taxonomyNamesEqual(item.name, name));
    if (existing) {
      existing.id = existing.id || brand.id;
      existing.logoUrl = existing.logoUrl || brand.logoUrl || findBrandLogo(brandCatalog, name);
      continue;
    }
    list.push({
      id: brand.id,
      name,
      count: 0,
      logoUrl: brand.logoUrl || findBrandLogo(brandCatalog, name),
    });
  }
  return list.sort((a, b) => {
    if (a.name === "Autres") return 1;
    if (b.name === "Autres") return -1;
    return a.name.localeCompare(b.name, "fr");
  });
}

export function findPickerVariant(name) {
  if (!name) return null;
  for (const [familyName, subs] of Object.entries(PICKER_SUBFAMILIES)) {
    for (const sub of subs) {
      for (const variant of sub.variants || []) {
        if (namesMatchAny(name, familyMatchNames(variant))) {
          return { ...variant, parentFamily: familyName, parentSubfamily: sub.name };
        }
      }
    }
  }
  return null;
}

export function resolveBundlePath(bundle = {}) {
  const rawCategory = String(bundle.category || "").trim();
  const rawSubcategory = String(bundle.subcategory || "").trim();
  const rawFamily = String(bundle.family || "").trim();
  const variant = findPickerVariant(rawSubcategory) || findPickerVariant(rawFamily);
  const family = (rawCategory && findPickerFamily(rawCategory)) || (rawFamily && findPickerFamily(rawFamily));
  const familyName = family?.name || rawCategory || "";
  if (variant) {
    return {
      category: familyName || variant.parentFamily || rawCategory || rawFamily,
      subcategory: variant.name,
      brand: String(bundle.brand || "").trim(),
    };
  }
  const subList = groupedSubfamiliesFor({ name: familyName || rawFamily || rawCategory }) || [];
  const matchSub = name => {
    if (!name) return "";
    const hit = subList.find(item => namesMatchAny(name, familyMatchNames(item)));
    return hit?.name || "";
  };
  return {
    category: familyName || rawCategory || rawFamily,
    subcategory: matchSub(rawSubcategory) || matchSub(rawFamily) || rawSubcategory,
    brand: String(bundle.brand || "").trim(),
  };
}

function bundleSubcategoryFits(pathSubcategory, selected) {
  if (!selected?.name || !pathSubcategory) return !selected?.name;
  if (taxonomyNamesEqual(pathSubcategory, selected.name)) return true;
  if (selected.variant) return false;
  return variantsForSubfamily(selected).some(variant => namesMatchAny(pathSubcategory, familyMatchNames(variant)));
}

export function bundleMatchesPath(bundle, { category, subcategory, brand } = {}) {
  if (!bundle || !category) return false;
  const path = resolveBundlePath(bundle);
  const selectedFamily = findPickerFamily(category.name);
  const bundleFamily = findPickerFamily(path.category);
  if (
    path.category &&
    selectedFamily &&
    bundleFamily &&
    selectedFamily.name !== bundleFamily.name &&
    !taxonomyNamesEqual(path.category, category.name)
  ) {
    return false;
  }
  if (path.subcategory && subcategory?.name && !bundleSubcategoryFits(path.subcategory, subcategory)) {
    return false;
  }
  if (path.brand && brand && !taxonomyNamesEqual(path.brand, brand)) return false;
  return true;
}

export function isBundleActive(bundle) {
  if (!bundle) return false;
  if (bundle.active === false || bundle.actif === false) return false;
  if (bundle.status === "Inactif") return false;
  return true;
}

export function bundlesForPath(bundles = [], path = {}, { includeInactive = false } = {}) {
  return (bundles || []).filter(bundle => {
    if (!includeInactive && !isBundleActive(bundle)) return false;
    return bundleMatchesPath(bundle, path);
  });
}

function firstFiniteAmount(...values) {
  for (const value of values) {
    if (value === "" || value == null) continue;
    const amount = Number(value);
    if (Number.isFinite(amount)) return amount;
  }
  return 0;
}

export function bundleItemSellPrice(item = {}) {
  return firstFiniteAmount(item.sell, item.price);
}

export function bundleLineTotal(item = {}) {
  return Number(item.qty || 1) * bundleItemSellPrice(item);
}

export function bundleTotalHt(bundle) {
  return (bundle?.items || []).reduce((sum, item) => sum + bundleLineTotal(item), 0);
}

export const BUNDLE_ROLE_LABELS = {
  principal: "Matériel principal",
  supply: "Fournitures",
  labor: "Main-d’œuvre",
};

export function articleBundleRole(article = {}) {
  const hay = normalizeCatalogName(
    [article.category, article.subcategory, article.name, article.code, article.unit].join(" ")
  );
  const laborHints = ["installation", "main d oeuvre", "pose ", " pose", "mise en service", "raccordement", "depose", "depose"];
  const supplyHints = ["petite fourniture", "fourniture", "accessoire", "raccord", "support", "consommable", "kit hydraulique"];
  if (laborHints.some(token => hay.includes(token)) || article.unit === "Heure") {
    if (!supplyHints.some(token => hay.includes(token))) return "labor";
  }
  if (supplyHints.some(token => hay.includes(token))) return "supply";
  return "principal";
}

export function buildBundleItemFromArticle(article, { role, qty = 1 } = {}) {
  return {
    articleId: article?.id || null,
    code: article?.code || "",
    name: article?.name || "",
    description: article?.description || "",
    category: article?.category || "",
    subcategory: article?.subcategory || "",
    brand: article?.brand || "",
    brandId: article?.brandId || article?.brand_id || "",
    sourceReference: article?.sourceReference || article?.source_reference || "",
    qty: Math.max(0.01, Number(qty || 1)),
    price: bundleItemSellPrice(article),
    buy: Number(article?.buy || 0),
    tax: resolvedCatalogTax(article),
    unit: article?.unit || "Unité",
    role: role || articleBundleRole(article),
  };
}

export function normalizeBundle(bundle = {}) {
  const path = resolveBundlePath(bundle);
  const items = (bundle.items || []).map(item => ({
    articleId: item.articleId || null,
    code: item.code || "",
    name: item.name || "",
    description: item.description || "",
    category: item.category || "",
    subcategory: item.subcategory || "",
    brand: item.brand || "",
    brandId: item.brandId || item.brand_id || "",
    sourceReference: item.sourceReference || item.source_reference || "",
    qty: Math.max(0.01, Number(item.qty || 1)),
    price: bundleItemSellPrice(item),
    buy: Number(item.buy || 0),
    tax: resolvedCatalogTax([item, bundle]),
    unit: item.unit || "Unité",
    role: item.role || articleBundleRole(item),
  }));
  const active = isBundleActive(bundle);
  return {
    ...bundle,
    name: String(bundle.name || "").trim(),
    category: path.category,
    subcategory: path.subcategory,
    brand: path.brand,
    family: bundle.family || path.subcategory || path.category,
    items,
    active,
    status: active ? "Actif" : "Inactif",
  };
}

export function articleMatchesBundleItem(article, item) {
  if (!article || !item) return false;
  const articleId = article.id != null ? String(article.id) : "";
  const itemId = item.articleId != null ? String(item.articleId) : "";
  if (articleId && itemId && articleId === itemId) return true;
  const articleCode = String(article.code || "").trim().toLowerCase();
  const itemCode = String(item.code || "").trim().toLowerCase();
  return Boolean(articleCode && itemCode && articleCode === itemCode);
}

export function bundlesContainingArticle(article, bundles = []) {
  return (bundles || []).filter(bundle =>
    (bundle?.items || []).some(item => articleMatchesBundleItem(article, item))
  );
}

export function applyArticlePriceToBundleItem(item, article) {
  if (!articleMatchesBundleItem(article, item)) return item;
  const price = bundleItemSellPrice(article);
  const buy = Number(article.buy || 0);
  const tax = Number(article.tax ?? item.tax ?? 20);
  if (Number(item.price) === price && Number(item.buy || 0) === buy && Number(item.tax ?? 20) === tax) {
    return item;
  }
  return { ...item, price, buy, tax };
}

export function syncArticlePriceIntoBundles(article, bundles = []) {
  if (!article) return [];
  return (bundles || []).flatMap(bundle => {
    const current = bundle?.items || [];
    const items = current.map(item => applyArticlePriceToBundleItem(item, article));
    const changed = items.some((item, index) => item !== current[index]);
    return changed ? [normalizeBundle({ ...bundle, items })] : [];
  });
}

export function articleIsInBundles(article, bundles = []) {
  return bundlesContainingArticle(article, bundles).length > 0;
}

export function itemsByRole(items = []) {
  return {
    principal: items.filter(item => (item.role || "principal") === "principal"),
    supply: items.filter(item => item.role === "supply"),
    labor: items.filter(item => item.role === "labor"),
  };
}

export function moveBundleItems(items = [], index, direction) {
  const list = Array.isArray(items) ? [...items] : [];
  const from = Number(index);
  const target = from + Number(direction);
  if (!Number.isInteger(from) || from < 0 || target < 0 || target >= list.length) return list;
  [list[from], list[target]] = [list[target], list[from]];
  return list;
}

export function suggestBundleName(bundle = {}) {
  const grouped = itemsByRole(bundle.items || []);
  const first = grouped.principal[0] || (bundle.items || [])[0];
  const brand = bundle.brand || first?.brand || "";
  if (!first) return "Nouveau groupe";
  return [brand, first.name].filter(Boolean).join(" — ") || first.name;
}

export function articlesForBundleRole(
  articles = [],
  role = "principal",
  { category, subcategory, brand } = {},
  { includeInactive = false, query = "", excludeIds = [] } = {}
) {
  const excluded = new Set((excludeIds || []).map(String));
  if (role === "principal") {
    return articlesForPath(articles, { category, subcategory, brand }, { includeInactive, query }).filter(
      article => !excluded.has(String(article.id))
    );
  }
  let list = filterActiveArticles(articles, { includeInactive }).filter(article => !excluded.has(String(article.id)));
  if (role === "labor") {
    list = list.filter(article => articleBundleRole(article) === "labor");
  } else {
    const supplies = list.filter(article => articleBundleRole(article) === "supply");
    const familyExtras = category
      ? list.filter(article => articleMatchesCategory(article, category) && articleBundleRole(article) !== "labor")
      : [];
    const map = new Map();
    for (const article of [...supplies, ...familyExtras]) map.set(article.id || article.code, article);
    list = [...map.values()];
  }
  if (query) list = list.filter(article => matchesArticleSearch(article, query));
  return list.sort((a, b) => {
    const aMatch = category && articleMatchesCategory(a, category) ? 0 : 1;
    const bMatch = category && articleMatchesCategory(b, category) ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return String(a.name || "").localeCompare(String(b.name || ""), "fr");
  });
}

export function hydratePickerPath(bundle, categories = [], subcategories = [], articles = []) {
  const path = resolveBundlePath(bundle || {});
  const category = pickerCategories(categories, articles).find(item => taxonomyNamesEqual(item.name, path.category)) || null;
  const subcategoryCards = category ? pickerSubcategories(category, subcategories, articles) : [];
  const exactSub = subcategoryCards.find(item => taxonomyNamesEqual(item.name, path.subcategory)) || null;
  if (exactSub) {
    return { category, subcategory: exactSub, variant: null, brand: path.brand || "" };
  }
  for (const parent of subcategoryCards) {
    const variant = pickerVariants(parent, articles).find(item => taxonomyNamesEqual(item.name, path.subcategory));
    if (variant) return { category, subcategory: parent, variant, brand: path.brand || "" };
  }
  return { category, subcategory: null, variant: null, brand: path.brand || "" };
}

export function buildQuoteLinesFromBundle(bundle, articles = [], { tax = 20, idBase = Date.now() } = {}) {
  if (!bundle) return [];
  return (bundle.items || []).map((item, index) => {
    const article = (articles || []).find(row =>
      (item.articleId && String(row.id) === String(item.articleId))
      || (item.code && row.code === item.code)
    );
    return {
      id: idBase + index,
      articleId: item.articleId || article?.id || null,
      code: item.code || "",
      name: item.name || article?.name || "",
      description: article?.description || item.description || "",
      category: item.category || article?.category || "",
      subcategory: item.subcategory || article?.subcategory || "",
      qty: Math.max(0.01, Number(item.qty || 1)),
      unit: firstFiniteAmount(item.price, item.sell, article?.sell, article?.price),
      tax: resolvedCatalogTax([article, item, bundle], tax),
      discountType: "percent",
      discountValue: 0,
      bundleId: bundle.id,
      bundleName: bundle.name,
    };
  });
}

export function mergeBrandsWithBundles(articleBrands = [], bundles = [], path = {}, brandCatalog = [], { includeInactive = false } = {}) {
  const list = (articleBrands || []).map(item => ({ ...item }));
  for (const bundle of bundlesForPath(bundles, path, { includeInactive })) {
    const brand = resolveBundlePath(bundle).brand;
    if (!brand) continue;
    const existing = list.find(item => taxonomyNamesEqual(item.name, brand));
    if (existing) {
      existing.bundleCount = (existing.bundleCount || 0) + 1;
      continue;
    }
    list.push({
      name: brand,
      count: 0,
      bundleCount: 1,
      logoUrl: findBrandLogo(brandCatalog, brand),
    });
  }
  return list.sort((a, b) => {
    if (a.name === "Autres") return 1;
    if (b.name === "Autres") return -1;
    return a.name.localeCompare(b.name, "fr");
  });
}

export function brandsForPickerIntent({
  articles = [],
  bundles = [],
  category,
  subcategory,
  intent = "articles",
  includeInactive = false,
  brandCatalog = [],
} = {}) {
  if (!category || !subcategory) return [];
  const opts = { includeInactive, brandCatalog };
  if (intent === "groups") {
    const pathBundles = bundlesForPath(bundles, { category, subcategory }, { includeInactive });
    const branded = mergeBrandsWithBundles([], pathBundles, { category, subcategory }, brandCatalog, { includeInactive })
      .filter(brand => Number(brand.bundleCount || 0) > 0);
    const hasUnbranded = pathBundles.some(bundle => !resolveBundlePath(bundle).brand);
    if (!hasUnbranded) return branded;
    return mergeBrandsWithBundles(
      brandsForPath(articles, { category, subcategory }, opts),
      pathBundles,
      { category, subcategory },
      brandCatalog,
      { includeInactive }
    ).filter(brand => Number(brand.bundleCount || 0) > 0 || Number(brand.count || 0) > 0);
  }
  return brandsForPath(articles, { category, subcategory }, opts).filter(brand => Number(brand.count || 0) > 0);
}

export function buildPickerCrumbs({ category, subcategory, variant, brand, step } = {}) {
  const crumbs = [{ id: "catalogue", label: "Catalogue", step: "categories" }];
  const hasVariants = Boolean(variant) || step === "variants" || subfamilyHasVariants(subcategory);
  if (category && step !== "categories") {
    crumbs.push({ id: "category", label: category.name || category.label, step: "subcategories" });
  }
  if (subcategory && !["categories", "subcategories"].includes(step)) {
    crumbs.push({
      id: "subcategory",
      label: subcategory.name,
      step: hasVariants ? "variants" : (isPacAccessoryVariant(subcategory) ? "subcategories" : "brands"),
    });
  }
  if (variant && !["categories", "subcategories", "variants"].includes(step)) {
    crumbs.push({
      id: "variant",
      label: variant.name,
      step: variant.accessory ? "variants" : "brands",
    });
  }
  if (brand && !variant?.accessory && !["categories", "subcategories", "variants", "brands"].includes(step)) {
    crumbs.push({ id: "brand", label: brand, step: step === "form" ? "brands" : "articles" });
  }
  if (step === "articles") {
    crumbs.push({ id: "articles", label: "Articles", step: "articles", current: true });
  }
  if (step === "form") {
    crumbs.push({ id: "form", label: "Fiche article", step: "form", current: true });
  }
  if (step === "principal") {
    crumbs.push({ id: "principal", label: "Articles", step: "principal", current: true });
  }
  if (step === "review") {
    crumbs.push({ id: "review", label: "Récapitulatif", step: "review", current: true });
  }
  if (crumbs.length) crumbs[crumbs.length - 1] = { ...crumbs[crumbs.length - 1], current: true };
  return crumbs;
}

export function formatArticlePower(article) {
  const watts = Number(article?.powerW ?? article?.power_w);
  if (!watts) return "";
  if (watts >= 1000 && watts % 1000 === 0) return `${watts / 1000} kW`;
  if (watts >= 1000) return `${(watts / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} kW`;
  return `${watts} W`;
}

export function buildQuoteLineFromArticle(article, overrides = {}, defaults = {}) {
  const tax = resolvedCatalogTax(
    [{ ...article, tax: overrides.tax ?? article?.tax ?? article?.taux_tva }],
    defaults.tax ?? 20
  );
  const qty = Math.max(0.01, Number(overrides.qty ?? 1));
  const unit = Number(overrides.unit ?? article.sell ?? 0);
  return {
    id: overrides.id || Date.now() + Math.floor(Math.random() * 1000),
    articleId: article.id,
    code: article.code || "",
    name: String(overrides.name ?? article.name ?? "").trim() || article.name,
    description: String(overrides.description ?? article.description ?? "").trim(),
    category: article.category || "",
    subcategory: article.subcategory || "",
    brand: article.brand || "",
    qty,
    unit,
    tax,
    discountType: overrides.discountType || "percent",
    discountValue: Number(overrides.discountValue || 0),
  };
}

export function priceTtc(ht, tax) {
  return Number(ht || 0) * (1 + Number(tax || 0) / 100);
}

export function roundPrice(value) {
  return Number(Number(value || 0).toFixed(2));
}

export function priceHtFromTtc(ttc, tax) {
  const rate = 1 + Number(tax || 0) / 100;
  if (!rate) return 0;
  return Number(ttc || 0) / rate;
}

export function sellHtFromInput(amount, tax, mode = "ht") {
  const value = Number(amount || 0);
  return roundPrice(mode === "ttc" ? priceHtFromTtc(value, tax) : value);
}

/** @deprecated Conservé pour d’anciens tests — préfère brandsForPath. */
export function brandsForCategory(articles = [], categoryCodeOrName, opts = {}) {
  const category = { id: categoryCodeOrName, name: String(categoryCodeOrName || "") };
  if (typeof categoryCodeOrName === "string" && categoryCodeOrName.includes("-")) {
    category.name = categoryCodeOrName.replace(/-/g, " ");
  }
  return brandsForPath(articles, { category: { name: humanizePickerCode(categoryCodeOrName) } }, opts);
}

function humanizePickerCode(code) {
  const map = {
    climatisation: "Climatisation",
    chauffage: "Chauffage",
    "radiateur-electrique": "Radiateur électrique",
    "isolation-exterieure": "Isolation extérieure",
    "ballon-thermodynamique": "Ballon thermodynamique",
    "adoucisseur-eau": "Adoucisseur d’eau",
    vmc: "VMC",
    photovoltaique: "Photovoltaïque",
  };
  return map[code] || String(code || "");
}
