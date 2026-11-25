import { housingFromPerson } from "./housing.js";

export const TOWN_HALL_STATUSES = [
  "À préparer",
  "Déposée",
  "En instruction",
  "Pièce complémentaire demandée",
  "Acceptée",
  "Refusée",
];

export const GRID_STATUSES = [
  "À préparer",
  "Demande transmise",
  "Proposition reçue",
  "Convention signée",
  "Travaux programmés",
  "Raccordement validé",
];

export const TOWN_HALL_PROCEDURES = [
  { id: "dp-maison", label: "Déclaration préalable — maison individuelle", cerfa: "CERFA 13404" },
  { id: "dp-autre", label: "Déclaration préalable — autres constructions", cerfa: "CERFA 13703" },
  { id: "permis", label: "Permis de construire", cerfa: "CERFA 13406 / 13409" },
  { id: "non-soumis", label: "Non soumis (à confirmer en mairie)", cerfa: "" },
];

export const TOWN_HALL_PIECES = [
  { id: "cerfa", label: "CERFA officiel signé", hint: "Imprimé Cerfa + signature du demandeur. Ce CRM prépare le dossier, pas le formulaire Cerfa." },
  { id: "notice", label: "Notice descriptive des travaux", hint: "Générée automatiquement à partir de l’étude." },
  { id: "mandat", label: "Mandat démarches en mairie", hint: "Pouvoir donné à MKL — déjà joint au devis photovoltaïque." },
  { id: "plan-situation", label: "Plan de situation (DP1)", hint: "Extrait cadastral de la parcelle." },
  { id: "plan-masse", label: "Plan de masse (DP2)", hint: "Implantation du bâtiment et accès." },
  { id: "plan-toiture", label: "Plans de toiture existant / projet (DP4)", hint: "Calepinage des panneaux." },
  { id: "photos-proche", label: "Photos de près", hint: "Façades et toiture concernées." },
  { id: "photos-loin", label: "Photos de loin", hint: "Insertion dans le voisinage." },
  { id: "insertion", label: "Insertion paysagère", hint: "Photomontage avant / après." },
  { id: "copro", label: "Autorisation de copropriété", hint: "Si appartement ou parties communes." },
  { id: "owner", label: "Accord du propriétaire", hint: "Si l’occupant est locataire." },
  { id: "abf", label: "Pièces Architecte des Bâtiments de France", hint: "Si abords de monument ou site patrimonial." },
];

const ALWAYS_PIECES = [
  "cerfa",
  "notice",
  "mandat",
  "plan-situation",
  "plan-masse",
  "plan-toiture",
  "photos-proche",
  "photos-loin",
  "insertion",
];

function text(value) {
  return String(value ?? "").trim();
}

function extraBag(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {};
}

export function procedureById(id) {
  return TOWN_HALL_PROCEDURES.find(item => item.id === id) || TOWN_HALL_PROCEDURES[0];
}

export function defaultProcedureId(person = {}) {
  const housing = housingFromPerson(person);
  if (housing.housingType === "Appartement" || housing.housingType === "Local professionnel") return "dp-autre";
  return "dp-maison";
}

export function emptyTownHall(input = {}) {
  const person = input.person || input;
  const housing = housingFromPerson(person);
  return {
    procedure: defaultProcedureId(person),
    abf: "inconnu",
    copro: housing.housingType === "Appartement" ? "oui" : "non",
    depositedAt: "",
    instructionUntil: "",
    reference: "",
    appearance: "Surimposition, modules sombres, cadre aluminium",
    roofKind: "Toiture existante",
    notes: "",
    pieces: {},
    urbanisme: null,
  };
}

export function normalizeTownHall(value, person = {}) {
  const base = emptyTownHall({ person });
  const raw = extraBag(value);
  const pieces = extraBag(raw.pieces);
  return {
    ...base,
    ...raw,
    procedure: TOWN_HALL_PROCEDURES.some(item => item.id === raw.procedure) ? raw.procedure : base.procedure,
    abf: ["oui", "non", "inconnu"].includes(raw.abf) ? raw.abf : base.abf,
    copro: ["oui", "non"].includes(raw.copro) ? raw.copro : base.copro,
    depositedAt: text(raw.depositedAt),
    instructionUntil: text(raw.instructionUntil),
    reference: text(raw.reference),
    appearance: text(raw.appearance) || base.appearance,
    roofKind: text(raw.roofKind) || base.roofKind,
    notes: text(raw.notes),
    pieces: Object.fromEntries(
      TOWN_HALL_PIECES.map(piece => [piece.id, Boolean(pieces[piece.id])])
    ),
    urbanisme: raw.urbanisme && typeof raw.urbanisme === "object" ? raw.urbanisme : null,
  };
}

export function townHallFromProject(project = {}, person = {}) {
  return normalizeTownHall(project.townHall, person);
}

export function requiredPieceIds(townHall = {}, person = {}) {
  const dossier = normalizeTownHall(townHall, person);
  const housing = housingFromPerson(person);
  const ids = [...ALWAYS_PIECES];
  if (dossier.copro === "oui" || housing.housingType === "Appartement") ids.push("copro");
  if (housing.occupancy === "Locataire") ids.push("owner");
  if (dossier.abf === "oui") ids.push("abf");
  return [...new Set(ids)];
}

export function requiredPieces(townHall = {}, person = {}) {
  const ids = requiredPieceIds(townHall, person);
  return TOWN_HALL_PIECES.filter(piece => ids.includes(piece.id));
}

export function townHallPieceProgress(townHall = {}, person = {}) {
  const dossier = normalizeTownHall(townHall, person);
  const required = requiredPieceIds(dossier, person);
  const done = required.filter(id => dossier.pieces[id]).length;
  return { done, total: required.length, ready: required.length > 0 && done === required.length };
}

export function addMonthsIso(iso, months) {
  const raw = text(iso);
  if (!raw) return "";
  const date = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setMonth(date.getMonth() + Number(months || 0));
  return date.toISOString().slice(0, 10);
}

export function instructionDelayMonths(townHall = {}) {
  return normalizeTownHall(townHall).abf === "oui" ? 2 : 1;
}

export function applyTownHallStatus(project = {}, status, person = {}) {
  const nextStatus = TOWN_HALL_STATUSES.includes(status) ? status : project.townHallStatus || "À préparer";
  const townHall = townHallFromProject(project, person);
  const today = new Date().toISOString().slice(0, 10);
  if (nextStatus === "Déposée" || nextStatus === "En instruction") {
    if (!townHall.depositedAt) townHall.depositedAt = today;
    if (!townHall.instructionUntil) {
      townHall.instructionUntil = addMonthsIso(townHall.depositedAt, instructionDelayMonths(townHall));
    }
  }
  return {
    ...project,
    townHallStatus: nextStatus,
    townHall,
  };
}

export function siteAddressFromProject(project = {}, person = {}) {
  const line = [
    text(project.address) || text(person.address),
    text(project.addressComplement) || text(person.addressComplement),
    [text(project.postcode) || text(person.postalCode), text(project.city) || text(person.city)].filter(Boolean).join(" "),
  ].filter(Boolean);
  return line.join(", ");
}

export function buildTownHallNotice(project = {}, person = {}, townHall = {}) {
  const dossier = normalizeTownHall(townHall, person);
  const housing = housingFromPerson(person);
  const power = Number(project.powerKwp || 0);
  const panels = Number(project.panels || 0);
  const panelPower = Number(project.panelPower || 0);
  const production = Number(project.estimatedProduction || 0);
  const address = siteAddressFromProject(project, person) || "adresse à confirmer";
  const type = housing.housingType ? housing.housingType.toLowerCase() : "bâtiment";
  const year = housing.constructionYear ? ` construit en ${housing.constructionYear}` : "";
  const occupant = housing.occupancy ? ` Occupant : ${housing.occupancy.toLowerCase()}.` : "";
  const procedure = procedureById(dossier.procedure);
  const parts = [
    `Demande de ${procedure.label.toLowerCase()} pour la pose d’une installation photovoltaïque en toiture.`,
    `Le projet concerne un ${type}${year} situé ${address}.${occupant}`,
    panels
      ? `Pose de ${panels} module${panels > 1 ? "s" : ""} photovoltaïque${panels > 1 ? "s" : ""}${panelPower ? ` de ${panelPower} Wc` : ""}${power ? `, soit ${power.toLocaleString("fr-FR")} kWc` : ""}.`
      : power
        ? `Puissance crête prévue : ${power.toLocaleString("fr-FR")} kWc.`
        : "La puissance sera confirmée après visite technique.",
    `Mode de pose : ${dossier.roofKind.toLowerCase()}. Aspect : ${dossier.appearance.toLowerCase()}.`,
    production
      ? `Production estimée : ${production.toLocaleString("fr-FR")} kWh/an (étude interne, hors visite).`
      : "",
    "Les travaux ne créent pas de surface de plancher. Ils modifient l’aspect extérieur de la toiture.",
  ];
  return parts.filter(Boolean).join(" ");
}

export function parcelLabel(urbanisme = {}) {
  const section = text(urbanisme?.section);
  const numero = text(urbanisme?.numero);
  if (!section && !numero) return "";
  return [text(urbanisme.prefixe) && text(urbanisme.prefixe) !== "000" ? urbanisme.prefixe : "", section, numero]
    .filter(Boolean)
    .join(" ");
}
