/** Parc automobile MKL Énergies — règles métier, droits et calculs. */

export const FLEET_MODULE = "Parc automobile";
export const FLEET_DOCUMENTS_BUCKET = "fleet-documents";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FLEET_GARAGE_DRIVER_ID = "garage";
export const FLEET_GARAGE_LABEL = "Garage automobile";

export const VEHICLE_STATUSES = [
  { id: "available", label: "Disponible" },
  { id: "assigned", label: "Affecté" },
  { id: "maintenance", label: "En entretien" },
  { id: "immobilized", label: "Immobilisé" },
  { id: "archived", label: "Archivé" },
];

export const HOLDING_MODES = [
  { id: "propriete", label: "Propriété" },
  { id: "credit", label: "Crédit" },
  { id: "loa", label: "LOA" },
  { id: "lld", label: "LLD" },
  { id: "autre", label: "Autre" },
];

export const ENERGY_TYPES = [
  { id: "essence", label: "Essence" },
  { id: "diesel", label: "Diesel" },
  { id: "hybride", label: "Hybride" },
  { id: "electrique", label: "Électrique" },
  { id: "gpl", label: "GPL" },
  { id: "autre", label: "Autre" },
];

export const VEHICLE_CATEGORIES = [
  { id: "direction", label: "Véhicule de direction" },
  { id: "commercial", label: "Véhicule commercial" },
  { id: "installation", label: "Camionnette d’installation" },
  { id: "utilitaire_entretien", label: "Utilitaire entretien" },
];

const LEGACY_VEHICLE_CATEGORIES = [
  { id: "vp", label: "Véhicule particulier" },
  { id: "utilitaire", label: "Utilitaire" },
  { id: "fourgon", label: "Fourgon" },
  { id: "camionnette", label: "Camionnette" },
  { id: "autre", label: "Autre" },
];

export const EXPENSE_CATEGORIES = [
  { id: "carburant", label: "Carburant / recharge" },
  { id: "peage", label: "Péages et stationnement" },
  { id: "assurance", label: "Assurance" },
  { id: "financement", label: "Loyer, crédit ou financement" },
  { id: "entretien", label: "Entretien et révisions" },
  { id: "pneus", label: "Pneus" },
  { id: "reparation", label: "Réparations" },
  { id: "lavage", label: "Lavage" },
  { id: "autre", label: "Autres frais" },
];

export const INCIDENT_KINDS = [
  { id: "panne", label: "Panne" },
  { id: "voyant", label: "Voyant" },
  { id: "accident", label: "Accident" },
  { id: "dommage", label: "Dommage" },
];

export const INCIDENT_STATUSES = [
  { id: "nouveau", label: "Nouveau" },
  { id: "a_qualifier", label: "À qualifier" },
  { id: "rdv_pris", label: "Rendez-vous pris" },
  { id: "en_cours", label: "En cours" },
  { id: "en_attente", label: "En attente" },
  { id: "resolu", label: "Résolu" },
  { id: "cloture", label: "Clôturé" },
];

export const URGENCY_LEVELS = [
  { id: "basse", label: "Basse" },
  { id: "normale", label: "Normale" },
  { id: "haute", label: "Haute" },
  { id: "critique", label: "Critique" },
];

export const DEADLINE_KINDS = [
  { id: "entretien", label: "Entretien" },
  { id: "vidange", label: "Vidange" },
  { id: "controle", label: "Contrôle technique" },
  { id: "assurance", label: "Assurance" },
  { id: "contrat", label: "Contrat" },
  { id: "restitution", label: "Restitution" },
  { id: "autre", label: "Autre" },
];

export const DOCUMENT_KINDS = [
  { id: "carte_grise", label: "Carte grise" },
  { id: "assurance", label: "Assurance" },
  { id: "controle", label: "Contrôle technique" },
  { id: "critair", label: "Certificat Crit’Air" },
  { id: "facture_achat", label: "Facture d’achat" },
  { id: "contrat_location", label: "Contrat de location / LOA" },
  { id: "mandat", label: "Mandat / procuration" },
  { id: "contrat", label: "Contrat" },
  { id: "justificatif", label: "Justificatif de dépense" },
  { id: "compteur", label: "Photo compteur" },
  { id: "photo_vehicule", label: "Photo véhicule" },
  { id: "photo_remise", label: "Photo état des lieux" },
  { id: "photo_incident", label: "Photo incident" },
  { id: "fiche_remise", label: "Fiche de remise" },
  { id: "autre", label: "Autre" },
];

export const CORE_VEHICLE_DOC_KINDS = ["carte_grise", "assurance", "controle", "critair"];

export const DECLARATION_STATUSES = [
  { id: "pending", label: "En attente de validation" },
  { id: "validated", label: "Validé" },
  { id: "rejected", label: "Rejeté" },
];

export const ASSIGNMENT_STATUSES = [
  { id: "pending", label: "En attente de validation" },
  { id: "active", label: "Active" },
  { id: "closed", label: "Clôturée" },
  { id: "rejected", label: "Rejetée" },
];

export const ALERT_STATUSES = [
  { id: "open", label: "À traiter" },
  { id: "in_progress", label: "En cours" },
  { id: "done", label: "Traité" },
];

export const PAYMENT_METHODS = [
  { id: "cb", label: "Carte bancaire" },
  { id: "espece", label: "Espèces" },
  { id: "virement", label: "Virement" },
  { id: "prelevement", label: "Prélèvement" },
  { id: "autre", label: "Autre" },
];

export const DEFAULT_FLEET_SETTINGS = {
  deadlineLeadDays: 30,
  documentLeadDays: 30,
  mileageRequestDay: 1,
  kmJumpThreshold: 5000,
};

export const IMPORT_COLUMN_ALIASES = {
  identifiant_interne: ["identifiant_interne", "identifiant", "code", "numero", "n_interne", "internal_code"],
  immatriculation: ["immatriculation", "plaque", "plate", "immat"],
  marque: ["marque", "brand"],
  modele: ["modele", "modèle", "model"],
  categorie: ["categorie", "catégorie", "category"],
  annee: ["annee", "année", "year"],
  energie: ["energie", "énergie", "energy", "carburant"],
  date_entree: ["date_entree", "date_entrée", "entree", "entry_date"],
  detention: ["detention", "détention", "mode_detention", "holding"],
  kilometrage: ["kilometrage", "kilométrage", "km", "mileage"],
  statut: ["statut", "status", "etat"],
  email_conducteur: ["email_conducteur", "conducteur", "driver", "driver_email", "salarie"],
  date_affectation: ["date_affectation", "affectation", "remise"],
  entretien_le: ["entretien_le", "entretien", "revision"],
  controle_le: ["controle_le", "controle", "contrôle"],
  assurance_le: ["assurance_le", "assurance"],
  contrat_le: ["contrat_le", "contrat", "restitution"],
  loyer_mensuel: ["loyer_mensuel", "loyer", "mensualite"],
  assurance_annuelle: ["assurance_annuelle", "cout_assurance"],
};

export const FLEET_ACTIVITY_ACTIONS = {
  VEHICLE_CREATE: "fleet.vehicle_create",
  VEHICLE_UPDATE: "fleet.vehicle_update",
  VEHICLE_ARCHIVE: "fleet.vehicle_archive",
  VEHICLE_STATUS: "fleet.vehicle_status",
  ASSIGNMENT_PREPARE: "fleet.assignment_prepare",
  ASSIGNMENT_VALIDATE: "fleet.assignment_validate",
  ASSIGNMENT_REJECT: "fleet.assignment_reject",
  ASSIGNMENT_CHANGE: "fleet.assignment_change",
  ASSIGNMENT_RELEASE: "fleet.assignment_release",
  MILEAGE_SUBMIT: "fleet.mileage_submit",
  MILEAGE_VALIDATE: "fleet.mileage_validate",
  MILEAGE_REJECT: "fleet.mileage_reject",
  EXPENSE_CREATE: "fleet.expense_create",
  EXPENSE_VALIDATE: "fleet.expense_validate",
  EXPENSE_REJECT: "fleet.expense_reject",
  INCIDENT_CREATE: "fleet.incident_create",
  INCIDENT_UPDATE: "fleet.incident_update",
  INCIDENT_CLOSE: "fleet.incident_close",
  DOCUMENT_UPLOAD: "fleet.document_upload",
  DOCUMENT_DELETE: "fleet.document_delete",
};

export const FLEET_ACTIVITY_LABELS = {
  "fleet.vehicle_create": "Création véhicule",
  "fleet.vehicle_update": "Modification véhicule",
  "fleet.vehicle_archive": "Archivage véhicule",
  "fleet.vehicle_status": "Changement de statut véhicule",
  "fleet.assignment_prepare": "Préparation d’affectation",
  "fleet.assignment_validate": "Validation d’affectation",
  "fleet.assignment_reject": "Rejet d’affectation",
  "fleet.assignment_change": "Changement de conducteur",
  "fleet.assignment_release": "Voiture rendue disponible",
  "fleet.mileage_submit": "Relevé kilométrique",
  "fleet.mileage_validate": "Validation kilométrage",
  "fleet.mileage_reject": "Rejet kilométrage",
  "fleet.expense_create": "Dépense véhicule",
  "fleet.expense_validate": "Validation dépense",
  "fleet.expense_reject": "Rejet dépense",
  "fleet.incident_create": "Déclaration d’incident",
  "fleet.incident_update": "Suivi d’incident",
  "fleet.incident_close": "Clôture d’incident",
  "fleet.document_upload": "Document véhicule ajouté",
  "fleet.document_delete": "Document véhicule supprimé",
};

const ID_SETS = {
  status: VEHICLE_STATUSES,
  holding: HOLDING_MODES,
  energy: ENERGY_TYPES,
  category: VEHICLE_CATEGORIES,
  expense: EXPENSE_CATEGORIES,
  incidentKind: INCIDENT_KINDS,
  incidentStatus: INCIDENT_STATUSES,
  urgency: URGENCY_LEVELS,
  deadline: DEADLINE_KINDS,
  document: DOCUMENT_KINDS,
  declaration: DECLARATION_STATUSES,
  assignment: ASSIGNMENT_STATUSES,
  alert: ALERT_STATUSES,
  payment: PAYMENT_METHODS,
};

export function fleetLabel(list, id) {
  return (list || []).find(item => item.id === id)?.label || id || "—";
}

export function vehicleCategoryLabel(id) {
  return fleetLabel([...VEHICLE_CATEGORIES, ...LEGACY_VEHICLE_CATEGORIES], id);
}

export function groupVehiclesByCategory(vehicles = []) {
  const buckets = new Map(VEHICLE_CATEGORIES.map(item => [item.id, []]));
  const rest = [];
  for (const vehicle of vehicles) {
    const bucket = buckets.get(vehicle.category);
    if (bucket) bucket.push(vehicle);
    else rest.push(vehicle);
  }
  const groups = VEHICLE_CATEGORIES.map(item => ({
    id: item.id,
    label: item.label,
    vehicles: buckets.get(item.id),
  }));
  if (rest.length) groups.push({ id: "a_classer", label: "À classer", vehicles: rest });
  return groups;
}

export function isUuid(value) {
  return UUID_RE.test(String(value || "").trim());
}

export function normalizePlate(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function displayPlate(value) {
  const raw = String(value || "").trim().toUpperCase();
  const compact = normalizePlate(raw);
  if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(compact)) {
    return `${compact.slice(0, 2)}-${compact.slice(2, 5)}-${compact.slice(5)}`;
  }
  return raw || compact;
}

export function todayIsoDate(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function monthKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 7);
}

export function inDateRange(value, from, to) {
  const day = String(value || "").slice(0, 10);
  if (!day) return false;
  if (from && day < String(from).slice(0, 10)) return false;
  if (to && day > String(to).slice(0, 10)) return false;
  return true;
}

function pickVehicleCategory(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return VEHICLE_CATEGORIES[0].id;
  const known = [...VEHICLE_CATEGORIES, ...LEGACY_VEHICLE_CATEGORIES];
  const found = known.find(item => item.id === raw || item.label.toLowerCase() === raw);
  return found ? found.id : raw;
}

function pickId(list, value, fallback) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  const found = list.find(item => item.id === raw || item.label.toLowerCase() === raw);
  if (found) return found.id;
  const alias = {
    disponible: "available",
    affecte: "assigned",
    "affecté": "assigned",
    entretien: "maintenance",
    immobilise: "immobilized",
    "immobilisé": "immobilized",
    archive: "archived",
    "archivé": "archived",
  };
  return alias[raw] || fallback;
}

const VEHICLE_PATCH_FIELDS = ["brand", "model", "category", "year", "energy", "entryDate", "holdingMode", "notes", "plate", "currentKm"];

export function parseVehicleKm(value, { empty = null } = {}) {
  if (value == null || value === "") return empty;
  const km = Number(value);
  if (!Number.isFinite(km) || km < 0) throw new Error("Le kilométrage est incorrect.");
  return Math.round(km);
}

export function vehiclePatchHasFields(body = {}) {
  return VEHICLE_PATCH_FIELDS.some(key => Object.prototype.hasOwnProperty.call(body, key));
}

export function sanitizeVehiclePatch(body = {}) {
  const patch = {};
  if (body.brand !== undefined) patch.brand = String(body.brand ?? "");
  if (body.model !== undefined) patch.model = String(body.model ?? "");
  if (body.category !== undefined) patch.category = pickVehicleCategory(body.category);
  if (body.year !== undefined) {
    if (body.year == null || body.year === "") patch.year = null;
    else {
      const year = Number(body.year);
      if (!Number.isFinite(year) || year < 1980 || year > new Date().getFullYear() + 1) {
        throw new Error("L’année du véhicule est incorrecte.");
      }
      patch.year = year;
    }
  }
  if (body.energy !== undefined) patch.energy = pickId(ENERGY_TYPES, body.energy, "diesel");
  if (body.holdingMode !== undefined) patch.holding_mode = pickId(HOLDING_MODES, body.holdingMode, "propriete");
  if (body.notes !== undefined) patch.notes = body.notes == null ? "" : String(body.notes);
  if (body.status !== undefined && body.status !== "archived") {
    patch.status = pickId(VEHICLE_STATUSES, body.status, "available");
  }
  if (body.entryDate !== undefined) {
    const day = String(body.entryDate || "").slice(0, 10);
    patch.entry_date = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  }
  if (body.currentKm !== undefined && body.currentKm !== "" && body.currentKm != null) {
    patch.current_km = parseVehicleKm(body.currentKm);
  }
  return patch;
}

export function nextInternalCode(existing = []) {
  const numbers = (existing || [])
    .map(item => String(item.internalCode || item.internal_code || ""))
    .map(code => Number((code.match(/(\d+)\s*$/) || [])[1]))
    .filter(value => Number.isFinite(value));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `VH-${String(next).padStart(3, "0")}`;
}

export function normalizeVehicleInput(input = {}, { existing = [] } = {}) {
  const plate = displayPlate(input.plate || input.immatriculation);
  const compact = normalizePlate(plate);
  if (compact.length < 4) throw new Error("Indiquez une immatriculation valide.");
  const duplicate = existing.find(item => {
    if (input.id && String(item.id) === String(input.id)) return false;
    return normalizePlate(item.plate || item.immatriculation) === compact
      || (input.internalCode && String(item.internalCode || item.internal_code) === String(input.internalCode).trim());
  });
  if (duplicate) throw new Error("Cette immatriculation ou cet identifiant existe déjà.");
  const year = input.year == null || input.year === "" ? null : Number(input.year);
  if (year != null && (!Number.isFinite(year) || year < 1980 || year > new Date().getFullYear() + 1)) {
    throw new Error("L’année du véhicule est incorrecte.");
  }
  return {
    internalCode: String(input.internalCode || input.internal_code || "").trim() || nextInternalCode(existing),
    plate,
    plateKey: compact,
    brand: String(input.brand || input.marque || "").trim(),
    model: String(input.model || input.modele || "").trim(),
    category: pickVehicleCategory(input.category || input.categorie),
    year,
    energy: pickId(ENERGY_TYPES, input.energy || input.energie, "diesel"),
    entryDate: String(input.entryDate || input.entry_date || input.date_entree || "").slice(0, 10) || todayIsoDate(),
    holdingMode: pickId(HOLDING_MODES, input.holdingMode || input.holding_mode || input.detention, "propriete"),
    currentKm: parseVehicleKm(input.currentKm ?? input.current_km ?? input.kilometrage, { empty: 0 }) ?? 0,
    lastValidatedReadingAt: input.lastValidatedReadingAt || input.last_validated_reading_at || null,
    status: pickId(VEHICLE_STATUSES, input.status || input.statut, "available"),
    notes: String(input.notes || "").trim(),
  };
}

export function fleetCapabilities(profile, { assignedVehicleId = null, assignedVehicleIds = [] } = {}) {
  const role = String(profile?.role || "");
  const vip = role === "Admin VIP";
  const opsAdmin = role === "Superadmin";
  const prospectingLead = role === "Responsable prospection";
  const hasModule = Array.isArray(profile?.modules)
    ? profile.modules.includes(FLEET_MODULE)
    : false;
  const assignedIds = assignedVehicleIds.length
    ? assignedVehicleIds
    : (assignedVehicleId ? [assignedVehicleId] : []);
  const isDriver = assignedIds.length > 0;
  const canViewAll = vip || opsAdmin || hasModule || role === "Direction" || prospectingLead;
  return {
    canEnter: Boolean(vip || opsAdmin || hasModule || role === "Direction" || prospectingLead || isDriver),
    canViewAll,
    canManage: vip || opsAdmin,
    canCreateVehicle: vip || prospectingLead,
    canArchive: vip,
    canAssign: vip || opsAdmin || prospectingLead,
    canPrepareAssign: vip || opsAdmin || prospectingLead,
    canValidate: vip,
    canOperate: vip || opsAdmin || prospectingLead,
    canReadOnly: canViewAll && !vip && !opsAdmin && !prospectingLead,
    isDriver,
    assignedVehicleId: assignedIds[0] || null,
    assignedVehicleIds: assignedIds,
    isVip: vip,
    isAdmin: opsAdmin,
  };
}

export function canViewVehicle(caps, vehicle) {
  if (!caps?.canEnter || !vehicle) return false;
  if (caps.canViewAll) return true;
  return caps.assignedVehicleIds.includes(vehicle.id);
}

export function canEditVehicle(caps, vehicle) {
  if (!canViewVehicle(caps, vehicle)) return false;
  return Boolean(caps.canOperate && vehicle.status !== "archived");
}

export function driverCanDeclareOn(caps, vehicle) {
  return Boolean(caps?.isDriver && vehicle && caps.assignedVehicleIds.includes(vehicle.id) && vehicle.status !== "archived");
}

export function activeAssignmentForVehicle(assignments = [], vehicleId) {
  return (assignments || []).find(item => item.vehicleId === vehicleId && item.status === "active") || null;
}

export function isGarageHolder(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === FLEET_GARAGE_DRIVER_ID || text === FLEET_GARAGE_LABEL.toLowerCase();
}

export function resolveAssignmentHolder(body = {}) {
  const raw = body.driverId ?? body.driver_id ?? "";
  const label = body.holderLabel ?? body.holder_label ?? "";
  if (isGarageHolder(raw) || isGarageHolder(label)) {
    return { driverId: null, holderLabel: FLEET_GARAGE_LABEL, garage: true };
  }
  const driverId = String(raw || "").trim();
  if (!UUID_RE.test(driverId)) {
    throw new Error("Choisissez le conducteur.");
  }
  return { driverId, holderLabel: "", garage: false };
}

export function vehicleStatusAfterHolder(currentStatus, garage) {
  if (garage) return currentStatus === "assigned" ? "available" : (currentStatus || "available");
  return currentStatus === "available" ? "assigned" : currentStatus;
}

export function vehicleStatusAfterRelease(currentStatus) {
  if (currentStatus === "assigned" || !currentStatus) return "available";
  return currentStatus;
}

export function planAssignmentRelease({ current, returnInspection } = {}) {
  if (!current || current.status !== "active") {
    throw new Error("Aucune affectation active à clôturer.");
  }
  if (!returnInspection?.date || returnInspection.km == null || returnInspection.km === "") {
    throw new Error("Indiquez la date et le kilométrage pour rendre le véhicule disponible.");
  }
  return {
    closed: {
      ...current,
      status: "closed",
      endedOn: returnInspection.date,
      endKm: Number(returnInspection.km),
    },
    status: vehicleStatusAfterRelease(current.vehicleStatus || "assigned"),
  };
}

export function assignmentHolderName(row, profileName = "") {
  const label = String(row?.holder_label || row?.holderLabel || "").trim();
  if (label) return label;
  return profileName || "";
}

export function assertSingleActiveAssignment(assignments = [], vehicleId, ignoreId = null) {
  const actives = (assignments || []).filter(item => (
    item.vehicleId === vehicleId
    && item.status === "active"
    && (!ignoreId || String(item.id) !== String(ignoreId))
  ));
  if (actives.length > 1) {
    throw new Error("Ce véhicule a plusieurs affectations actives.");
  }
  if (actives.length === 1) {
    throw new Error("Ce véhicule a déjà une affectation active. Clôturez-la avant d’en ouvrir une autre.");
  }
  return true;
}

export function planDriverChange({ current, next, returnInspection }) {
  if (!current || current.status !== "active") {
    throw new Error("Aucune affectation active à clôturer.");
  }
  if (!returnInspection?.date || returnInspection.km == null || returnInspection.km === "") {
    throw new Error("L’état des lieux de restitution est obligatoire pour changer de conducteur.");
  }
  const closed = {
    ...current,
    status: "closed",
    endedOn: returnInspection.date,
    endKm: Number(returnInspection.km),
    returnHandover: returnInspection,
  };
  const opened = {
    ...next,
    status: next.status || "active",
    startedOn: next.startedOn || returnInspection.date,
    startKm: next.startKm == null ? Number(returnInspection.km) : Number(next.startKm),
  };
  return {
    closed,
    opened,
    history: [closed, opened],
    handovers: [current.handover || current.startHandover, returnInspection, next.handover].filter(Boolean),
  };
}

export function mileageFlags(km, lastValidatedKm, { jumpThreshold = DEFAULT_FLEET_SETTINGS.kmJumpThreshold } = {}) {
  const value = Number(km);
  const last = lastValidatedKm == null || lastValidatedKm === "" ? null : Number(lastValidatedKm);
  const flags = { low: false, incoherent: false };
  if (!Number.isFinite(value) || value < 0) {
    flags.incoherent = true;
    return flags;
  }
  if (last != null && Number.isFinite(last)) {
    if (value < last) flags.low = true;
    if (value - last > Number(jumpThreshold || DEFAULT_FLEET_SETTINGS.kmJumpThreshold)) flags.incoherent = true;
  }
  return flags;
}

export function applyValidatedMileage(vehicle, reading) {
  if (!vehicle || !reading || reading.status !== "validated") return vehicle;
  return {
    ...vehicle,
    currentKm: Number(reading.km),
    lastValidatedReadingAt: reading.readingDate || reading.reading_date || todayIsoDate(),
  };
}

export function officialExpenses(expenses = []) {
  return (expenses || []).filter(item => item.status === "validated");
}

export function pendingExpenses(expenses = []) {
  return (expenses || []).filter(item => item.status === "pending");
}

export function expenseAmount(item) {
  const value = Number(item?.amountTtc ?? item?.amount_ttc ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function expenseTotals(expenses = [], { from, to, validatedOnly = true } = {}) {
  const rows = (validatedOnly ? officialExpenses(expenses) : expenses).filter(item => {
    const day = item.occurredOn || item.occurred_on;
    if (from || to) return inDateRange(day, from, to);
    return true;
  });
  const byCategory = {};
  let total = 0;
  for (const item of rows) {
    const amount = expenseAmount(item);
    total += amount;
    const category = item.category || "autre";
    byCategory[category] = (byCategory[category] || 0) + amount;
  }
  return { total, byCategory, count: rows.length, pendingTotal: pendingExpenses(expenses).reduce((sum, item) => sum + expenseAmount(item), 0) };
}

export function costPerKm({ total, startKm, endKm, from, to }) {
  const km = Number(endKm) - Number(startKm);
  if (!Number.isFinite(km) || km <= 0 || !Number.isFinite(Number(total))) return null;
  return { amount: Number(total) / km, km, from: from || null, to: to || null };
}

export function findExpenseDuplicate(expenses = [], candidate = {}) {
  const amount = Number(candidate.amountTtc ?? candidate.amount_ttc);
  const day = String(candidate.occurredOn || candidate.occurred_on || "").slice(0, 10);
  const supplier = String(candidate.supplier || "").trim().toLowerCase();
  const vehicleId = candidate.vehicleId || candidate.vehicle_id;
  return (expenses || []).find(item => {
    if (candidate.id && String(item.id) === String(candidate.id)) return false;
    if ((item.vehicleId || item.vehicle_id) !== vehicleId) return false;
    if (String(item.occurredOn || item.occurred_on || "").slice(0, 10) !== day) return false;
    if (Number(item.amountTtc ?? item.amount_ttc) !== amount) return false;
    return String(item.supplier || "").trim().toLowerCase() === supplier;
  }) || null;
}

export function canCloseIncident(status) {
  return status === "cloture";
}

export function assertIncidentClose({ previousStatus, nextStatus, explicit }) {
  if (nextStatus !== "cloture") return true;
  if (!explicit) throw new Error("La clôture d’un incident exige une action explicite.");
  if (previousStatus === "cloture") throw new Error("Cet incident est déjà clôturé.");
  return true;
}

export function formatFrenchDate(value) {
  const day = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  return new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR");
}

/** Pastille verte au-delà de deux mois, rouge dès que l’échéance est à deux mois ou déjà passée. */
export function controleTechniquePill(dueOn, now = new Date()) {
  const label = formatFrenchDate(dueOn);
  if (!label) return { label: "", tone: "" };
  const day = String(dueOn).slice(0, 10);
  const [year, month, datePart] = day.split("-").map(Number);
  const due = Date.UTC(year, month - 1, datePart);
  const start = now instanceof Date ? now : new Date(now);
  const limit = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12);
  limit.setMonth(limit.getMonth() + 2);
  const horizon = Date.UTC(limit.getFullYear(), limit.getMonth(), limit.getDate());
  return { label, tone: due <= horizon ? "due" : "ok" };
}

export const VIDANGE_INTERVAL_KM = 30000;
export const VIDANGE_ALERT_KM = 10000;

export function vidangeKmFromDeadline(deadline) {
  if (!deadline || (deadline.status && deadline.status !== "open")) return null;
  const raw = String(deadline.notes ?? "").trim();
  if (raw) {
    const noted = Number(raw);
    if (Number.isFinite(noted) && noted >= 0) return Math.round(noted);
  }
  const due = Number(deadline.dueKm ?? deadline.due_km);
  if (Number.isFinite(due) && due >= VIDANGE_INTERVAL_KM) return Math.round(due - VIDANGE_INTERVAL_KM);
  return null;
}

/** Rouge quand il reste moins de 10 000 km avant la vidange des 30 000 km, ou qu’elle est dépassée. */
export function vidangeMileageTone(currentKm, lastVidangeKm) {
  if (lastVidangeKm == null || lastVidangeKm === "") return "";
  const last = Number(lastVidangeKm);
  const current = Number(currentKm);
  if (!Number.isFinite(last) || last < 0 || !Number.isFinite(current)) return "";
  const remaining = last + VIDANGE_INTERVAL_KM - current;
  return remaining < VIDANGE_ALERT_KM ? "due" : "";
}

export function daysUntil(date, now = new Date()) {
  const day = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [year, month, datePart] = day.split("-").map(Number);
  const start = now instanceof Date ? now : new Date(now);
  const targetUtc = Date.UTC(year, month - 1, datePart);
  const nowUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  return Math.round((targetUtc - nowUtc) / 86400000);
}

export function deadlineInput({ kind, title, dueOn, dueKm } = {}) {
  const known = DEADLINE_KINDS.find(item => item.id === kind);
  const resolvedKind = known?.id || "autre";
  const label = known?.label || "Échéance";
  const km = dueKm == null || dueKm === "" ? null : Number(dueKm);
  return {
    kind: resolvedKind,
    title: String(title || "").trim() || label,
    due_on: String(dueOn || "").slice(0, 10) || null,
    due_km: Number.isFinite(km) ? km : null,
  };
}

export function openDeadline(deadlines, kind) {
  return (deadlines || [])
    .filter(item => item.kind === kind && (item.status || "open") === "open" && (item.dueOn || item.due_on))
    .sort((a, b) => String(a.dueOn || a.due_on).localeCompare(String(b.dueOn || b.due_on)))[0] || null;
}

export function alertDedupeKey({ kind, sourceId, month } = {}) {
  return [kind, sourceId, month].filter(Boolean).join(":");
}

export function buildFleetAlerts({
  vehicles = [],
  deadlines = [],
  documents = [],
  incidents = [],
  readings = [],
  assignments = [],
  settings = DEFAULT_FLEET_SETTINGS,
  now = new Date(),
} = {}) {
  const leadDays = Number(settings.deadlineLeadDays ?? settings.deadline_lead_days ?? DEFAULT_FLEET_SETTINGS.deadlineLeadDays);
  const documentLead = Number(settings.documentLeadDays ?? settings.document_lead_days ?? DEFAULT_FLEET_SETTINGS.documentLeadDays);
  const month = monthKey(now);
  const today = todayIsoDate(now);
  const alerts = [];

  for (const vehicle of vehicles) {
    if (vehicle.status === "archived") continue;
    if (vehicle.status === "immobilized") {
      alerts.push({
        kind: "immobilized",
        vehicleId: vehicle.id,
        title: `${vehicle.plate || vehicle.internalCode} est immobilisé`,
        dueOn: today,
        dedupeKey: alertDedupeKey({ kind: "immobilized", sourceId: vehicle.id }),
      });
    }
  }

  for (const deadline of deadlines) {
    if (deadline.status && deadline.status !== "open") continue;
    const due = deadline.dueOn || deadline.due_on;
    const remaining = daysUntil(due, now);
    if (remaining != null && remaining <= leadDays) {
      alerts.push({
        kind: remaining < 0 ? "deadline_overdue" : "deadline_soon",
        vehicleId: deadline.vehicleId || deadline.vehicle_id,
        title: [deadline.title || fleetLabel(DEADLINE_KINDS, deadline.kind), formatFrenchDate(due)].filter(Boolean).join(" · "),
        dueOn: due,
        sourceType: "deadline",
        sourceId: deadline.id,
        dedupeKey: alertDedupeKey({ kind: "deadline", sourceId: deadline.id }),
      });
    }
    const dueKm = deadline.dueKm ?? deadline.due_km;
    const vehicle = vehicles.find(item => item.id === (deadline.vehicleId || deadline.vehicle_id));
    if (dueKm != null && vehicle && Number(vehicle.currentKm) >= Number(dueKm)) {
      alerts.push({
        kind: "deadline_km",
        vehicleId: vehicle.id,
        title: `${deadline.title || "Entretien"} — seuil ${dueKm} km atteint`,
        dueOn: today,
        sourceType: "deadline",
        sourceId: deadline.id,
        dedupeKey: alertDedupeKey({ kind: "deadline_km", sourceId: deadline.id }),
      });
    }
  }

  for (const document of documents) {
    const expires = document.expiresOn || document.expires_on;
    if (!expires) continue;
    const remaining = daysUntil(expires, now);
    if (remaining == null || remaining > documentLead) continue;
    alerts.push({
      kind: remaining < 0 ? "document_expired" : "document_soon",
      vehicleId: document.vehicleId || document.vehicle_id,
      title: `${document.title || document.kind} arrive à échéance`,
      dueOn: expires,
      sourceType: "document",
      sourceId: document.id,
      dedupeKey: alertDedupeKey({ kind: "document", sourceId: document.id }),
    });
  }

  for (const incident of incidents) {
    if (incident.status === "cloture") continue;
    if (!incident.ownerId && !incident.owner_id) {
      alerts.push({
        kind: "incident_unassigned",
        vehicleId: incident.vehicleId || incident.vehicle_id,
        title: "Incident sans responsable",
        dueOn: incident.dueOn || incident.due_on || today,
        sourceType: "incident",
        sourceId: incident.id,
        dedupeKey: alertDedupeKey({ kind: "incident_unassigned", sourceId: incident.id }),
      });
    }
    if (["haute", "critique"].includes(incident.urgency)) {
      alerts.push({
        kind: "incident_urgent",
        vehicleId: incident.vehicleId || incident.vehicle_id,
        title: "Incident urgent",
        dueOn: incident.dueOn || incident.due_on || today,
        sourceType: "incident",
        sourceId: incident.id,
        dedupeKey: alertDedupeKey({ kind: "incident_urgent", sourceId: incident.id }),
      });
    }
  }

  for (const vehicle of vehicles) {
    if (vehicle.status === "archived" || vehicle.status === "available") continue;
    const assignment = activeAssignmentForVehicle(assignments, vehicle.id);
    if (!assignment) continue;
    const hasReading = (readings || []).some(item => (
      item.vehicleId === vehicle.id
      && monthKey(item.readingDate || item.reading_date) === month
      && item.status !== "rejected"
    ));
    if (!hasReading) {
      alerts.push({
        kind: "mileage_missing",
        vehicleId: vehicle.id,
        title: `Relevé kilométrique manquant — ${month}`,
        dueOn: `${month}-28`,
        sourceType: "vehicle",
        sourceId: vehicle.id,
        dedupeKey: alertDedupeKey({ kind: "mileage_missing", sourceId: vehicle.id, month }),
      });
    }
  }

  const unique = new Map();
  for (const alert of alerts) {
    if (!unique.has(alert.dedupeKey)) unique.set(alert.dedupeKey, { ...alert, status: "open" });
  }
  return [...unique.values()];
}

export function mergeAlerts(existing = [], next = []) {
  const kept = new Map((existing || []).map(item => [item.dedupeKey || item.dedupe_key, item]));
  const created = [];
  for (const alert of next) {
    if (kept.has(alert.dedupeKey)) continue;
    created.push(alert);
  }
  return { created, existing: [...kept.values()] };
}

export function searchVehicles(vehicles = [], query = "") {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return vehicles;
  return vehicles.filter(vehicle => {
    const hay = [
      vehicle.internalCode,
      vehicle.internal_code,
      vehicle.plate,
      vehicle.brand,
      vehicle.model,
      vehicle.driverName,
      vehicle.driver_name,
      vehicle.status,
    ].join(" ").toLowerCase();
    return hay.includes(needle);
  });
}

export function parseDelimitedTable(text = "") {
  const raw = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!raw) return { headers: [], rows: [] };
  const first = raw.split("\n")[0] || "";
  const delimiter = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ";" : ",";
  const lines = raw.split("\n").map(line => line.trim()).filter(Boolean);
  const headers = splitCsvLine(lines[0], delimiter).map(normalizeHeader);
  const rows = lines.slice(1).map(line => {
    const cells = splitCsvLine(line, delimiter);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] || "";
    });
    return row;
  });
  return { headers, rows, delimiter };
}

function splitCsvLine(line, delimiter) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function resolveImportMapping(headers = [], mapping = {}) {
  const resolved = {};
  for (const [field, aliases] of Object.entries(IMPORT_COLUMN_ALIASES)) {
    if (mapping[field] && headers.includes(mapping[field])) {
      resolved[field] = mapping[field];
      continue;
    }
    resolved[field] = headers.find(header => aliases.includes(header)) || "";
  }
  return resolved;
}

export function mapImportRow(row = {}, mapping = {}) {
  const value = field => String(row[mapping[field] || ""] || row[field] || "").trim();
  const number = field => {
    const raw = value(field).replace(/\s/g, "").replace(",", ".");
    if (!raw) return "";
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : "";
  };
  return {
    internalCode: value("identifiant_interne"),
    plate: value("immatriculation"),
    brand: value("marque"),
    model: value("modele"),
    category: value("categorie"),
    year: number("annee"),
    energy: value("energie"),
    entryDate: value("date_entree"),
    holdingMode: value("detention"),
    currentKm: number("kilometrage"),
    status: value("statut"),
    driverEmail: value("email_conducteur").toLowerCase(),
    assignmentDate: value("date_affectation"),
    entretienOn: value("entretien_le"),
    controleOn: value("controle_le"),
    assuranceOn: value("assurance_le"),
    contratOn: value("contrat_le"),
    monthlyRent: number("loyer_mensuel"),
    yearlyInsurance: number("assurance_annuelle"),
  };
}

export function previewImport(rows = [], { existing = [], mapping = {}, users = [] } = {}) {
  const resolved = resolveImportMapping(
    rows[0] ? Object.keys(rows[0]) : Object.keys(IMPORT_COLUMN_ALIASES),
    mapping
  );
  const seenPlates = new Set();
  const seenCodes = new Set();
  const items = rows.map((row, index) => {
    const mapped = mapImportRow(row, resolved);
    const errors = [];
    const plateKey = normalizePlate(mapped.plate);
    if (!plateKey) errors.push("Immatriculation manquante.");
    if (plateKey && seenPlates.has(plateKey)) errors.push("Immatriculation en double dans le fichier.");
    if (plateKey) seenPlates.add(plateKey);
    if (mapped.internalCode && seenCodes.has(mapped.internalCode.toLowerCase())) {
      errors.push("Identifiant interne en double dans le fichier.");
    }
    if (mapped.internalCode) seenCodes.add(mapped.internalCode.toLowerCase());
    const duplicate = existing.find(item => (
      normalizePlate(item.plate) === plateKey
      || (mapped.internalCode && String(item.internalCode || "").toLowerCase() === mapped.internalCode.toLowerCase())
    ));
    const driver = mapped.driverEmail
      ? users.find(user => String(user.email || "").toLowerCase() === mapped.driverEmail)
      : null;
    if (mapped.driverEmail && !driver) errors.push("Conducteur introuvable.");
    return {
      index: index + 2,
      mapped,
      duplicate: Boolean(duplicate),
      driverId: driver?.id || null,
      errors,
      ok: errors.length === 0,
    };
  });
  return {
    mapping: resolved,
    items,
    okCount: items.filter(item => item.ok && !item.duplicate).length,
    duplicateCount: items.filter(item => item.duplicate).length,
    errorCount: items.filter(item => !item.ok).length,
  };
}

export function importTemplateCsv() {
  const headers = [
    "identifiant_interne",
    "immatriculation",
    "marque",
    "modele",
    "categorie",
    "annee",
    "energie",
    "date_entree",
    "detention",
    "kilometrage",
    "statut",
    "email_conducteur",
    "date_affectation",
    "entretien_le",
    "controle_le",
    "assurance_le",
    "contrat_le",
    "loyer_mensuel",
    "assurance_annuelle",
  ];
  const sample = [
    "VH-001",
    "AB-123-CD",
    "Renault",
    "Kangoo",
    "Utilitaire",
    "2022",
    "diesel",
    "2022-03-01",
    "lld",
    "45200",
    "affecte",
    "jean.dupont@mkl-energies.fr",
    "2022-03-15",
    "2026-11-01",
    "2026-08-12",
    "2026-12-31",
    "2027-03-01",
    "289",
    "840",
  ];
  return `${headers.join(";")}\n${sample.join(";")}\n`;
}

export function expensesToCsv(expenses = [], vehicles = []) {
  const header = ["Date", "Véhicule", "Immatriculation", "Catégorie", "Libellé", "Montant TTC", "Fournisseur", "Statut", "Auteur"];
  const lines = [header.join(";")];
  for (const item of expenses) {
    const vehicle = vehicles.find(row => row.id === (item.vehicleId || item.vehicle_id)) || {};
    lines.push([
      item.occurredOn || item.occurred_on || "",
      vehicle.internalCode || "",
      vehicle.plate || "",
      fleetLabel(EXPENSE_CATEGORIES, item.category),
      item.otherLabel || item.other_label || "",
      String(expenseAmount(item)).replace(".", ","),
      item.supplier || "",
      fleetLabel(DECLARATION_STATUSES, item.status),
      item.authorName || item.created_by_name || "",
    ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(";"));
  }
  return lines.join("\n");
}

export function vehicleTrackedFields() {
  return [
    "internal_code",
    "plate",
    "brand",
    "model",
    "category",
    "year",
    "energy",
    "entry_date",
    "holding_mode",
    "current_km",
    "status",
    "notes",
  ];
}

export function idList() {
  return ID_SETS;
}
