export const HOUSING_TYPES = ["Maison", "Appartement", "Local professionnel", "Autre"];

export const OCCUPANCY_TYPES = ["Propriétaire", "Locataire"];

function extraBag(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function housingFromPerson(person = {}) {
  const extra = extraBag(person?.extra);
  return {
    housingType: String(person?.housingType || person?.housing_type || extra.housingType || extra.housing_type || "").trim(),
    constructionYear: String(person?.constructionYear || person?.construction_year || extra.constructionYear || extra.construction_year || "").trim(),
    occupancy: String(person?.occupancy || extra.occupancy || "").trim(),
  };
}

export function hasHousingInfo(person = {}) {
  const housing = housingFromPerson(person);
  return Boolean(housing.housingType || housing.constructionYear || housing.occupancy);
}

const HOUSING_NOTE = /\n?\[\[logement\]\](\{.*\})\s*$/;

export function splitHousingNotes(notes) {
  const raw = String(notes || "");
  const match = raw.match(HOUSING_NOTE);
  let housing = {};
  if (match) {
    try { housing = JSON.parse(match[1]); } catch { housing = {}; }
  }
  return {
    notes: raw.replace(HOUSING_NOTE, "").trimEnd(),
    housing: housingFromPerson(housing),
    prospector: String(housing.prospector || "").trim(),
    prospectorId: String(housing.prospectorId || housing.prospector_id || "").trim(),
  };
}

export function mergeHousingNotes(notes, housing) {
  const clean = String(notes || "").replace(HOUSING_NOTE, "").trimEnd();
  const info = housingFromPerson(housing);
  const bag = {};
  if (info.housingType) bag.housingType = info.housingType;
  if (info.constructionYear) bag.constructionYear = info.constructionYear;
  if (info.occupancy) bag.occupancy = info.occupancy;
  const prospector = String(housing?.prospector || "").trim();
  const prospectorId = String(housing?.prospectorId || housing?.prospector_id || "").trim();
  if (prospector) bag.prospector = prospector;
  if (prospectorId) bag.prospectorId = prospectorId;
  if (!Object.keys(bag).length) return clean || null;
  return `${clean}${clean ? "\n" : ""}[[logement]]${JSON.stringify(bag)}`;
}
