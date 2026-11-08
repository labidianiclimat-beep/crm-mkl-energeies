import { completeAddressErrors } from "./address.js";
import { housingFromPerson, mergeHousingNotes, splitHousingNotes } from "./housing.js";
import { resolveProspectorChoice } from "./prospector-choice.js";
import { canAccessScopedRow, canViewOrgWideCommercialData, canViewTeamCommercialData } from "./scoping.js";

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

export const CIVILITIES = ["M.", "Mme", "Mr & Mme", "Mlle", "Monsieur", "Madame"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^\+?[0-9][0-9\s().-]{5,22}$/;
export const PHONE_PATTERN = "\\+?[0-9][0-9\\s().-]{5,22}";
export const PHONE_PLACEHOLDER = "06 12 34 56 78 ou +32 470 12 34 56";
export const PHONE_TITLE = "Numéro français ou international";

export function isPhoneNumber(value) {
  const raw = String(value || "").trim();
  if (!PHONE_RE.test(raw)) return false;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return false;
  if (/^0+$/.test(digits)) return false;
  if (raw.startsWith("+") || digits.startsWith("00")) return true;
  if (/^0[1-9]\d{8}$/.test(digits)) return true;
  return /^[1-9]\d{7,14}$/.test(digits);
}

const CLIENT_STATUS_ALIASES = {
  actif: "Client",
  active: "Client",
  client: "Client",
  inactif: "Inactif",
  inactive: "Inactif",
  perdu: "Perdu",
  prospect: "Prospect",
  "a contacter": "À contacter",
  "rdv pris": "Rendez-vous pris",
  "rendez-vous pris": "Rendez-vous pris",
  "devis en cours": "Devis en cours",
};

export function normalizeClientStatus(value) {
  const raw = String(value || "").trim();
  if (CLIENT_STATUSES.includes(raw)) return raw;
  const key = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return CLIENT_STATUS_ALIASES[key] || "Prospect";
}

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
  const storedHousing = splitHousingNotes(row.notes);
  return {
    id: row.id,
    clientNumber: Number(row.client_number) > 0 ? Number(row.client_number) : null,
    prospectNumber: Number(row.origin_prospect_number) > 0 ? Number(row.origin_prospect_number) : null,
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
    notes: storedHousing.notes,
    prospector: storedHousing.prospector || "",
    prospectorId: storedHousing.prospectorId || "",
    projectType: row.project_type || "",
    install: row.install || "",
    consent: Boolean(row.consent),
    ...housingFromPerson(row),
    ...Object.fromEntries(Object.entries(storedHousing.housing).filter(([, value]) => value)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

export function formToClientRecord(input, { organizationId, createdBy, defaultCommercialId } = {}) {
  const typeClient = String(input.type_client || input.customerType || "Particulier").trim();
  const isPro = typeClient !== "Particulier";
  const commercialId = input.commercial_id || input.commercialId || defaultCommercialId || null;
  const housing = housingFromPerson(input);
  const choice = resolveProspectorChoice(input);
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
    statut: normalizeClientStatus(input.statut || input.status),
    commercial_id: commercialId || null,
    notes: mergeHousingNotes(input.notes, {
      ...housing,
      prospector: choice.prospector,
      prospectorId: choice.prospectorId,
    }),
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
  if (record.telephone && !isPhoneNumber(record.telephone)) {
    errors.push("Format téléphone fixe invalide. Saisissez un numéro français ou international.");
  }
  if (record.telephone_secondaire && !isPhoneNumber(record.telephone_secondaire)) {
    errors.push("Format téléphone mobile invalide. Saisissez un numéro français ou international.");
  }
  errors.push(...completeAddressErrors({
    address: record.adresse,
    postalCode: record.code_postal,
    city: record.ville,
  }));

  return errors;
}

function clientIdentityName(record) {
  const type = record.type_client || record.customerType || "Particulier";
  if (type !== "Particulier" && (record.raison_sociale || record.company)) {
    return normalizeText(record.raison_sociale || record.company);
  }
  return normalizeText(`${record.prenom || record.firstName || ""} ${record.nom || record.lastName || ""}`);
}

function clientIdentityAddress(record) {
  return normalizeText([
    record.adresse || record.address,
    record.code_postal || record.postalCode,
    record.ville || record.city,
  ].filter(Boolean).join(" "));
}

export function sameClientNameAndAddress(row, record) {
  const name = clientIdentityName(record);
  const address = clientIdentityAddress(record);
  if (!name || name.length < 3 || !address || address.length < 8) return false;
  return name === clientIdentityName(row) && address === clientIdentityAddress(row);
}

export function findClientDuplicates(candidates, record, { excludeId } = {}) {
  const email = normalizeEmail(record.email);
  const phoneA = normalizePhone(record.telephone);
  const phoneB = normalizePhone(record.telephone_secondaire);
  const identity = normalizeText(`${record.nom || ""} ${record.prenom || ""} ${record.code_postal || ""}`);
  const company = normalizeText(record.raison_sociale);

  return (candidates || []).filter(row => {
    if (excludeId && String(row.id) === String(excludeId)) return false;
    const reasons = [];
    if (sameClientNameAndAddress(row, record)) reasons.push("nom et adresse");
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

export function blockedNameAddressRows(duplicates) {
  return (duplicates || []).filter(row => (row._duplicateReasons || []).includes("nom et adresse"));
}

export function blockedNameAddressConflict(visible = []) {
  if (visible.length) {
    return {
      error: "Un client avec le même nom et la même adresse existe déjà.",
      blocked: true,
      duplicates: visible.map(row => ({
        id: row.id,
        name: `${row.prenom || ""} ${row.nom || ""}`.trim() || row.raison_sociale || row.email,
        email: row.email,
        telephone: row.telephone || row.telephone_secondaire,
        reasons: row._duplicateReasons,
      })),
    };
  }
  return {
    error: "Une fiche existe déjà pour ce nom et cette adresse. Demandez au secrétariat de vous l’affecter.",
    blocked: true,
    duplicates: [],
  };
}

export function splitScopedDuplicates(duplicates, profile, userId, teamIds = []) {
  const visible = [];
  const hidden = [];
  for (const row of duplicates || []) {
    if (canAccessScopedRow(profile, userId, row, teamIds || [])) visible.push(row);
    else hidden.push(row);
  }
  return { visible, hidden };
}

export function clientDuplicateConflict(visible = []) {
  if (visible.length) {
    return {
      error: "Doublon potentiel détecté.",
      duplicates: visible.map(row => ({
        id: row.id,
        name: `${row.prenom || ""} ${row.nom || ""}`.trim() || row.raison_sociale || row.email,
        email: row.email,
        telephone: row.telephone || row.telephone_secondaire,
        reasons: row._duplicateReasons,
      })),
    };
  }
  return {
    error: "Une fiche existe déjà pour ce contact. Demandez au secrétariat de vous l’affecter.",
    duplicates: [],
  };
}


export function canViewAllClients(profile) {
  if (profile && String(profile.role || "").includes("prospection")) return false;
  return canViewOrgWideCommercialData(profile);
}

/** Peut attribuer un commercial (org) ou un membre d’équipe (responsable). */
export function canAssignClientCommercial(profile) {
  return canViewOrgWideCommercialData(profile) || canViewTeamCommercialData(profile);
}
