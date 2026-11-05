const CONTACT_SHEET_STAGES = new Set(["", "Nouveau", "À contacter", "Rendez-vous planifié"]);

export function isContactSheetProspect(prospect = {}, appointment = null) {
  const desired = String(prospect?.desiredKind || "").trim().toLowerCase();
  const booked = String(appointment?.kind || "").trim().toLowerCase();
  const kind = desired || booked;
  if (!kind.includes("rappel")) return false;
  return CONTACT_SHEET_STAGES.has(String(prospect?.stage || "").trim());
}

export const PROSPECT_STAGES = [
  "Nouveau",
  "À contacter",
  "Qualifié",
  "Rendez-vous planifié",
  "Étude",
  "Devis envoyé",
  "Négociation",
  "Gagné",
  "Perdu",
];

export const PROJECT_TYPES = [
  "Pompe à chaleur",
  "Climatisation",
  "Photovoltaïque",
  "Isolation extérieure",
  "Isolation intérieure",
  "Ballon thermodynamique",
  "VMC",
  "Radiateur électrique",
  "Adoucisseur d’eau",
  "Ombrière",
  "PAC + solaire",
  "Autre",
];

export const PROSPECT_SOURCES = [
  "Prospection",
  "Appel entrant",
  "Site internet",
  "Recommandation",
  "Partenaire",
  "Salon",
  "Stand Carrefour",
  "Call Marrakech (Pros)",
  "Autre",
];

export const PROSPECTOR_ROLES = [
  "Prospecteur terrain",
  "Responsable prospection",
];

export const PROSPECT_SCOPE_COLUMNS = ["commercial_id", "created_by", "extra->>prospectorId"];

export function parseProjectTypes(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(item => String(item || "").trim()).filter(Boolean))];
  }
  return String(value || "")
    .split(/\s*(?:·|,|;|\||\/)\s*/)
    .map(item => item.trim())
    .filter(Boolean);
}

export function formatProjectTypes(types) {
  return parseProjectTypes(types).join(" · ");
}

export function isProspectorRole(role) {
  return PROSPECTOR_ROLES.includes(normalizeRoleLabel(role));
}

export function prospectorUsers(users = []) {
  return (users || []).filter(user => user && user.active !== false && isProspectorRole(user.role));
}

export function prospectorIdOf(row) {
  const extra = extraOf(row);
  const value = row?.prospectorId || row?.prospector_id || extra.prospectorId || extra.prospector_id || "";
  return isUuid(value) ? String(value) : "";
}

import { completeAddressErrors, formatFullAddress } from "./address.js";
import { APPOINTMENT_STATUSES, normalizeAgendaStatus } from "./appointment-status.js";
import { isPhoneNumber } from "./clients.js";
import { resolveProspectorChoice } from "./prospector-choice.js";
import { normalizeRoleLabel } from "./roles.js";

export { APPOINTMENT_STATUSES } from "./appointment-status.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_RE.test(String(value || ""));
}

export function extraOf(row) {
  const extra = row?.extra;
  if (extra && typeof extra === "object" && !Array.isArray(extra)) return extra;
  if (typeof extra === "string") {
    try {
      const parsed = JSON.parse(extra);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function latestRdvStatusForProspect(prospectId, appointments = []) {
  const id = String(prospectId || "");
  if (!id) return "";
  const related = (appointments || []).filter(item => {
    const extra = extraOf(item);
    return String(item.prospectId || item.opportunity_id || extra.prospectId || "") === id;
  });
  if (!related.length) return "";
  related.sort((left, right) => {
    const rightAt = new Date(right.start || right.starts_at || right.updated_at || 0).getTime() || 0;
    const leftAt = new Date(left.start || left.starts_at || left.updated_at || 0).getTime() || 0;
    return rightAt - leftAt;
  });
  const latest = related[0];
  return normalizeAgendaStatus(latest.status || extraOf(latest).status);
}

export function withProspectRdvStatuses(prospects, appointments) {
  return (prospects || []).map(prospect => ({
    ...prospect,
    rdvStatus: latestRdvStatusForProspect(prospect.id, appointments),
  }));
}

export function prospectToUi(row, names = {}) {
  if (!row) return null;
  const extra = extraOf(row);
  const commercialId = row.commercial_id || "";
  const prospectorId = prospectorIdOf({ ...row, extra });
  const types = parseProjectTypes(extra.types?.length ? extra.types : (row.project_type || extra.type || ""));
  const fullName = row.name || "";
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  const firstName = extra.firstName || extra.prenom || (parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] || "");
  const lastName = extra.lastName || extra.nom || (parts.length > 1 ? parts.at(-1) : "");
  return {
    id: row.id,
    prospectNumber: Number(row.prospect_number) > 0 ? Number(row.prospect_number) : null,
    name: fullName,
    firstName,
    lastName,
    phone: row.phone || extra.phone || "",
    landline: extra.landline || extra.telephone_fixe || "",
    email: row.email || extra.email || "",
    city: row.city || extra.city || "",
    address: extra.address || extra.adresse || "",
    addressComplement: extra.addressComplement || extra.complement_adresse || "",
    postalCode: extra.postalCode || extra.code_postal || "",
    type: formatProjectTypes(types) || "Photovoltaïque",
    types: types.length ? types : ["Photovoltaïque"],
    value: Number(row.estimated_value || extra.value || 0),
    power: extra.power || "À définir",
    source: row.source || extra.source || "",
    stage: row.stage || "Nouveau",
    rdvStatus: row.rdvStatus || extra.rdvStatus || "",
    commercialId,
    owner: names[commercialId] || extra.owner || "Non affecté",
    prospectorId,
    prospector: names[prospectorId] || extra.prospector || "",
    notes: row.notes || extra.notes || "",
    color: extra.color || "#405fae",
    clientId: extra.clientId || extra.client_id || "",
    convertedAt: extra.convertedAt || "",
    priority: extra.priority || "normale",
    desiredAt: extra.desiredAt || extra.desired_at || "",
    desiredKind: extra.desiredKind || extra.desired_kind || "",
    desiredDuration: Number(extra.desiredDuration || extra.desired_duration || 60),
    dispatchOutcome: extra.dispatchOutcome || "",
    housingType: extra.housingType || extra.housing_type || "",
    constructionYear: extra.constructionYear || extra.construction_year || "",
    occupancy: extra.occupancy || "",
    civilite: extra.civilite || "",
    created: row.created_at,
    updated: row.updated_at,
    createdBy: row.created_by,
    creator: names[row.created_by] || extra.creator || "",
  };
}

export function appointmentToUi(row, names = {}) {
  if (!row) return null;
  const extra = extraOf(row);
  const commercialId = row.commercial_id || "";
  const managerId = row.manager_id || "";
  const isGoogle = extra.source === "google";
  const occupancy = isGoogle || extra.private === true || extra.kind === "busy";
  const storedKind = String(extra.kind || extra.actionKind || "").trim().toLowerCase();
  const kind = occupancy
    ? "busy"
    : storedKind.includes("rappel")
      ? "rappel"
      : storedKind === "formation" || storedKind === "accompagnement" || storedKind === "autre"
        ? storedKind
        : "rendez-vous";
  const status = normalizeAgendaStatus(extra.status || row.status || "Non statué");
  return {
    id: row.id,
    prospectId: row.opportunity_id || extra.prospectId || "",
    prospectName: row.prospect_name || extra.prospectName || (isGoogle ? "Sans titre" : ""),
    city: row.city || extra.city || "",
    postalCode: extra.postalCode || extra.code_postal || "",
    type: row.project_type || extra.type || "",
    start: row.starts_at || extra.start || "",
    duration: Number(row.duration_minutes || extra.duration || 60),
    commercialId,
    commercial: names[commercialId] || extra.commercial || "",
    managerId,
    manager: names[managerId] || extra.manager || "",
    status,
    notes: row.notes || extra.notes || "",
    appointmentType: extra.appointmentType || extra.appointment_type || (kind === "rappel" ? "Appel téléphonique" : "Visite commerciale"),
    kind,
    subject: extra.subject || extra.objet || (isGoogle ? (row.prospect_name || "Sans titre") : ""),
    address: extra.address || extra.adresse || "",
    phone: extra.phone || extra.telephone || "",
    priority: extra.priority || "normale",
    meetingMode: extra.meetingMode || extra.meeting_mode || (kind === "rappel" ? "téléphone" : ""),
    reminderOffsets: Array.isArray(extra.reminderOffsets) ? extra.reminderOffsets : [1440, 120, 30],
    notifyCrm: extra.notifyCrm !== false,
    notifyEmail: extra.notifyEmail !== false,
    notifyGoogle: extra.notifyGoogle !== false,
    source: extra.source || "",
    private: Boolean(extra.private) && extra.source !== "google",
    allDay: Boolean(extra.allDay),
    googleEventId: extra.googleEventId || "",
    googleCalendarId: extra.googleCalendarId || "primary",
    googleCalendarSummary: extra.googleCalendarSummary || "",
    syncStatus: extra.syncStatus || "none",
    syncError: extra.syncError || "",
    lastSyncedAt: extra.lastSyncedAt || "",
    notifiedAt: extra.notifiedAt && typeof extra.notifiedAt === "object" ? extra.notifiedAt : {},
    created: row.created_at,
    updated: row.updated_at,
    createdBy: row.created_by,
  };
}

export function formToProspectRecord(input, { organizationId, createdBy, defaultCommercialId } = {}) {
  const extra = extraOf(input);
  const types = parseProjectTypes(input.types || input.type || input.project_type || extra.types || extra.type);
  const address = String(input.address || extra.address || extra.adresse || "").trim();
  const addressComplement = String(input.addressComplement || extra.addressComplement || extra.complement_adresse || "").trim();
  const postalCode = String(input.postalCode || input.code_postal || extra.postalCode || extra.code_postal || "").trim();
  const commercialId = isUuid(input.commercialId || input.commercial_id)
    ? String(input.commercialId || input.commercial_id)
    : isUuid(defaultCommercialId)
      ? String(defaultCommercialId)
      : null;
  const choice = resolveProspectorChoice(input);
  const prospectorId = choice.prospectorId;
  return {
    organization_id: organizationId,
    name: String(input.name || "").trim(),
    phone: String(input.phone || "").trim() || null,
    email: String(input.email || "").trim().toLowerCase() || null,
    city: String(input.city || "").trim() || null,
    project_type: formatProjectTypes(types) || null,
    estimated_value: Number(input.value ?? input.estimated_value ?? 0) || 0,
    source: String(input.source || "").trim() || null,
    stage: String(input.stage || "Nouveau").trim() || "Nouveau",
    commercial_id: commercialId,
    notes: String(input.notes || "").trim() || null,
    extra: {
      ...extra,
      power: String(input.power || extra.power || "À définir"),
      color: String(input.color || extra.color || "#405fae"),
      owner: String(input.owner || extra.owner || ""),
      prospectorId,
      prospector: prospectorId ? "" : choice.prospector,
      types,
      address,
      addressComplement,
      postalCode,
      firstName: String(input.firstName || extra.firstName || "").trim(),
      lastName: String(input.lastName || extra.lastName || "").trim(),
      priority: String(input.priority || extra.priority || "normale"),
      desiredAt: String(input.desiredAt || extra.desiredAt || "").trim(),
      desiredKind: String(input.desiredKind || extra.desiredKind || "").trim(),
      desiredDuration: Number(input.desiredDuration || extra.desiredDuration || 60) || 60,
      dispatchOutcome: extra.dispatchOutcome || "",
      housingType: String(input.housingType || extra.housingType || "").trim(),
      constructionYear: String(input.constructionYear || extra.constructionYear || "").trim(),
      occupancy: String(input.occupancy || extra.occupancy || "").trim(),
      civilite: String(input.civilite !== undefined ? input.civilite : (extra.civilite || "")).trim(),
      landline: String(input.landline !== undefined ? input.landline : (extra.landline || "")).trim(),
    },
    updated_at: new Date().toISOString(),
    created_by: createdBy || null,
  };
}

export function formToAppointmentRecord(input, { organizationId, createdBy } = {}) {
  const extra = extraOf(input);
  const start = String(input.start || input.starts_at || input.appointmentAt || "").trim();
  const commercialId = isUuid(input.commercialId || input.commercial_id)
    ? String(input.commercialId || input.commercial_id)
    : null;
  const managerId = isUuid(input.managerId || input.manager_id)
    ? String(input.managerId || input.manager_id)
    : null;
  const opportunityId = isUuid(input.prospectId || input.opportunity_id)
    ? String(input.prospectId || input.opportunity_id)
    : null;
  const rawKind = String(input.kind || input.actionKind || extra.kind || extra.actionKind || "").trim().toLowerCase();
  const kind = rawKind.includes("rappel")
    ? "rappel"
    : rawKind === "formation" || rawKind === "accompagnement" || rawKind === "autre"
      ? rawKind
      : "rendez-vous";
  const requestedStatus = String(input.status || extra.status || "").trim();
  const status = normalizeAgendaStatus(
    commercialId && (!requestedStatus || requestedStatus === "À dispatcher" || requestedStatus === "Affecté")
      ? "Non statué"
      : (requestedStatus || "Non statué")
  );
  const reminderOffsets = Array.isArray(input.reminderOffsets)
    ? input.reminderOffsets.map(Number).filter(n => n >= 0)
    : Array.isArray(extra.reminderOffsets)
      ? extra.reminderOffsets
      : [1440, 120, 30];
  return {
    organization_id: organizationId,
    opportunity_id: opportunityId,
    prospect_name: String(input.prospectName || input.prospect_name || input.title || input.name || "").trim() || null,
    city: String(input.city || "").trim() || null,
    project_type: String(input.type || input.project_type || "").trim() || null,
    starts_at: start,
    duration_minutes: Number(input.duration || input.duration_minutes || durationFromInput(input) || 60) || 60,
    commercial_id: commercialId,
    manager_id: managerId,
    status,
    notes: String(input.notes || input.appointmentNotes || extra.notes || "").trim() || null,
    extra: {
      ...extra,
      commercial: String(input.commercial || extra.commercial || ""),
      manager: String(input.manager || extra.manager || ""),
      appointmentType: String(input.appointmentType || extra.appointmentType || extra.appointment_type || (
        kind === "rappel" ? "Appel téléphonique"
          : kind === "formation" ? "Formation"
            : kind === "accompagnement" ? "Accompagnement"
              : kind === "autre" ? "Autre"
                : "Visite commerciale"
      )),
      kind,
      actionKind: kind,
      subject: String(input.subject || extra.subject || "").trim(),
      address: String(input.appointmentAddress || extra.appointmentAddress || "").trim()
        || formatFullAddress({
          address: input.address || extra.address,
          addressComplement: input.addressComplement || extra.addressComplement,
          postalCode: input.postalCode || extra.postalCode,
          city: input.city || extra.city,
        })
        || String(extra.address || extra.adresse || "").trim(),
      phone: String(input.phone || extra.phone || "").trim(),
      priority: String(input.priority || extra.priority || "normale"),
      meetingMode: String(input.meetingMode || extra.meetingMode || (kind === "rappel" ? "téléphone" : "domicile")),
      reminderOffsets,
      notifyCrm: input.notifyCrm !== false && input.notifyCrm !== "off",
      notifyEmail: input.notifyEmail !== false && input.notifyEmail !== "off",
      notifyGoogle: input.notifyGoogle !== false && input.notifyGoogle !== "off",
      googleEventId: extra.googleEventId || "",
      googleCalendarId: extra.googleCalendarId || "primary",
      syncStatus: input.syncStatus || extra.syncStatus || "none",
      syncError: extra.syncError || "",
      lastSyncedAt: extra.lastSyncedAt || "",
      notifiedAt: extra.notifiedAt || {},
    },
    updated_at: new Date().toISOString(),
    created_by: createdBy || null,
  };
}

function durationFromInput(input) {
  const start = String(input.start || input.starts_at || input.appointmentAt || "").trim();
  const end = String(input.end || input.endsAt || "").trim();
  if (!start || !end) return Number(input.duration || input.duration_minutes || 60) || 60;
  const from = new Date(start);
  const to = new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return Number(input.duration || 60) || 60;
  }
  return Math.max(15, Math.round((to.getTime() - from.getTime()) / 60000));
}

export function validateProspectPayload(record) {
  const errors = [];
  const extra = extraOf(record);
  if (!record?.name) errors.push("Le nom du prospect est obligatoire.");
  errors.push(...completeAddressErrors({
    address: extra.address || extra.adresse,
    postalCode: extra.postalCode || extra.code_postal,
    city: record?.city,
  }));
  const landline = String(record.landline || extra.landline || "").trim();
  const phone = String(record.phone || "").trim();
  if (!phone && !landline) errors.push("Renseignez un téléphone mobile ou un téléphone fixe.");
  if (phone && !isPhoneNumber(phone)) errors.push("Format téléphone mobile invalide. Saisissez un numéro français ou international.");
  if (landline && !isPhoneNumber(landline)) errors.push("Format téléphone fixe invalide. Saisissez un numéro français ou international.");
  if (record.email && !EMAIL_RE.test(record.email)) errors.push("Adresse email invalide.");
  if (record.stage && !PROSPECT_STAGES.includes(record.stage)) {
    errors.push("Étape commerciale inconnue.");
  }
  return errors;
}

export function validateAppointmentPayload(record) {
  const errors = [];
  if (!record?.starts_at) errors.push("La date du rendez-vous est obligatoire.");
  if (Number.isNaN(new Date(record.starts_at).getTime())) {
    errors.push("La date du rendez-vous est invalide.");
  }
  if (record.status && !APPOINTMENT_STATUSES.includes(record.status)) {
    errors.push("Statut de rendez-vous inconnu.");
  }
  const storedKind = String(extraOf(record).kind || "").trim().toLowerCase();
  const personal = storedKind === "formation" || storedKind === "accompagnement" || storedKind === "autre";
  if (personal && !record.prospect_name) {
    errors.push("L’intitulé de l’événement est obligatoire.");
  }
  if (!personal && !record.prospect_name && !record.opportunity_id) {
    errors.push("Le rendez-vous doit être rattaché à un prospect.");
  }
  return errors;
}

export function isMissingCommercialTable(error) {
  return /commercial_opportunit|commercial_appointment|relation|does not exist/i.test(String(error?.message || error || ""));
}

export const MISSING_TABLE_MESSAGE =
  "Tables commerciales absentes. Appliquez la migration 20260323_rls_commercial_scoping.sql dans Supabase.";

export const PROSPECT_SELECT =
  "id,organization_id,name,phone,email,city,project_type,estimated_value,source,stage,commercial_id,notes,extra,created_at,updated_at,created_by";

export const APPOINTMENT_SELECT =
  "id,organization_id,opportunity_id,prospect_name,city,project_type,starts_at,duration_minutes,commercial_id,manager_id,status,notes,extra,created_at,updated_at,created_by";
