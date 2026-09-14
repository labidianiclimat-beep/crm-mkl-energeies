import { canViewOrgWideCommercialData, canViewTeamCommercialData } from "./scoping.js";

export const CLIENT_STATUSES = [
  "Prospect",
  "À contacter",
  "Rendez-vous pris",
  "Devis en cours",
  "Client",
  "Perdu",
  "Inactif",
];

export const CLIENT_TYPES = [
  "Particulier",
  "Entreprise",
  "SCI",
  "Collectivité",
  "Association",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}$/;
const POSTAL_RE = /^\d{5}$/;

export function normalizePhone(value) {
  return String(value || "").replace(/[\s.-]/g, "");
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function displayClientName(client) {
  if (!client) return "Client";
  if (client.type_client !== "Particulier" && client.raison_sociale) return client.raison_sociale;
  const full = `${client.prenom || ""} ${client.nom || ""}`.trim();
  if (full) return full;
  return client.raison_sociale || client.email || "Client";
}

export function clientToUi(row) {
  if (!row) return null;
  const name = displayClientName(row);
  return {
    id: row.id,
    customerType: row.type_client || "Particulier",
    civilite: row.civilite || "",
    firstName: row.prenom || "",
    lastName: row.nom || "",
    company: row.raison_sociale || "",
    name,
    contact: `${row.prenom || ""} ${row.nom || ""}`.trim() || row.raison_sociale || "",
    address: row.adresse || "",
    addressComplement: row.complement_adresse || "",
    postalCode: row.code_postal || "",
    city: row.ville || "",
    phone: row.telephone || "",
    mobile: row.telephone_secondaire || "",
    email: row.email || "",
    source: row.origine_lead || "",
    status: row.statut || "Prospect",
    commercialId: row.commercial_id || "",
    owner: row.commercial_name || "",
    notes: row.notes || "",
    projectType: row.project_type || "",
    install: row.install || "",
    consent: Boolean(row.consent),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

export function formToClientRecord(input, { organizationId, createdBy, defaultCommercialId } = {}) {
  const typeClient = String(input.type_client || input.customerType || "Particulier").trim();
  const isPro = typeClient !== "Particulier";
  const commercialId = input.commercial_id || input.commercialId || defaultCommercialId || null;
  return {
    organization_id: organizationId,
    type_client: typeClient,
    civilite: String(input.civilite || "").trim() || null,
    nom: String(input.nom || input.lastName || "").trim() || null,
    prenom: String(input.prenom || input.firstName || "").trim() || null,
    raison_sociale: String(input.raison_sociale || input.company || "").trim() || null,
    adresse: String(input.adresse || input.address || "").trim() || null,
    complement_adresse: String(input.complement_adresse || input.addressComplement || "").trim() || null,
    code_postal: String(input.code_postal || input.postalCode || "").trim() || null,
    ville: String(input.ville || input.city || "").trim() || null,
    telephone: String(input.telephone || input.phone || "").trim() || null,
    telephone_secondaire: String(input.telephone_secondaire || input.mobile || "").trim() || null,
    email: normalizeEmail(input.email) || null,
    origine_lead: String(input.origine_lead || input.source || "").trim() || null,
    statut: String(input.statut || input.status || "Prospect").trim(),
    commercial_id: commercialId || null,
    notes: String(input.notes || "").trim() || null,
    project_type: String(input.project_type || input.projectType || "").trim() || null,
    install: String(input.install || "").trim() || null,
    consent: Boolean(input.consent === true || input.consent === "on" || input.consent === "true"),
    created_by: createdBy || null,
    updated_at: new Date().toISOString(),
  };
}

export function validateClientPayload(record, { isPro } = {}) {
  const errors = [];
  const type = record.type_client || "Particulier";
  const pro = isPro ?? type !== "Particulier";

  if (!CLIENT_TYPES.includes(type)) errors.push("Type de client invalide.");
  if (!CLIENT_STATUSES.includes(record.statut)) errors.push("Statut client invalide.");

  if (pro) {
    if (!record.raison_sociale) errors.push("La raison sociale est obligatoire pour un professionnel.");
  } else {
    if (!record.nom) errors.push("Le nom est obligatoire.");
    if (!record.prenom) errors.push("Le prénom est obligatoire pour un particulier.");
  }

  if (!record.telephone && !record.telephone_secondaire && !record.email) {
    errors.push("Renseignez au moins un téléphone ou un email.");
  }
  if (record.email && !EMAIL_RE.test(record.email)) {
    errors.push("Format email invalide.");
  }
  if (record.telephone && !PHONE_RE.test(record.telephone)) {
    errors.push("Format téléphone fixe invalide.");
  }
  if (record.telephone_secondaire && !PHONE_RE.test(record.telephone_secondaire)) {
    errors.push("Format téléphone mobile invalide.");
  }
  if (record.code_postal && !POSTAL_RE.test(record.code_postal)) {
    errors.push("Le code postal doit contenir 5 chiffres.");
  }
  if (!record.adresse) errors.push("L’adresse est obligatoire.");
  if (!record.ville) errors.push("La ville est obligatoire.");
  if (!record.code_postal) errors.push("Le code postal est obligatoire.");

  return errors;
}

export function findClientDuplicates(candidates, record, { excludeId } = {}) {
  const email = normalizeEmail(record.email);
  const phoneA = normalizePhone(record.telephone);
  const phoneB = normalizePhone(record.telephone_secondaire);
  const identity = normalizeText(`${record.nom || ""} ${record.prenom || ""} ${record.code_postal || ""}`);
  const company = normalizeText(record.raison_sociale);

  return (candidates || []).filter(row => {
    if (excludeId && row.id === excludeId) return false;
    const reasons = [];
    if (email && normalizeEmail(row.email) === email) reasons.push("email");
    const rowPhoneA = normalizePhone(row.telephone);
    const rowPhoneB = normalizePhone(row.telephone_secondaire);
    if (phoneA && (phoneA === rowPhoneA || phoneA === rowPhoneB)) reasons.push("téléphone");
    if (phoneB && (phoneB === rowPhoneA || phoneB === rowPhoneB)) reasons.push("téléphone secondaire");
    const rowIdentity = normalizeText(`${row.nom || ""} ${row.prenom || ""} ${row.code_postal || ""}`);
    if (identity && identity.length > 4 && identity === rowIdentity) reasons.push("nom + prénom + code postal");
    if (company && company === normalizeText(row.raison_sociale)) reasons.push("raison sociale");
    if (!reasons.length) return false;
    row._duplicateReasons = reasons;
    return true;
  });
}


export function canViewAllClients(profile) {
  return canViewOrgWideCommercialData(profile);
}

/** Peut attribuer un commercial (org) ou un membre d’équipe (responsable). */
export function canAssignClientCommercial(profile) {
  return canViewOrgWideCommercialData(profile) || canViewTeamCommercialData(profile);
}
