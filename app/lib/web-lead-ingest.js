import { parseKeyring } from "./web-lead-hmac.js";

/**
 * Validation des demandes reçues du site.
 *
 * La route d'arrivée ne crée aucun prospect : elle valide, met en file et
 * accuse réception. Le classement et la détection de doublon se font au
 * traitement, pour qu'une indisponibilité de ces étapes ne fasse jamais perdre
 * une demande déjà reçue.
 */

export const WEB_LEAD_KINDS = ["lead", "appointment"];

/** Organisation par défaut du schéma, voir les migrations de cloisonnement. */
const DEFAULT_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const INGEST_REJECTIONS = {
  INVALID_JSON: "corps_illisible",
  MISSING_SUBMISSION_ID: "identifiant_de_soumission_absent",
  INVALID_SUBMISSION_ID: "identifiant_de_soumission_invalide",
  INVALID_KIND: "type_de_demande_inconnu",
  NO_CONTACT: "aucune_coordonnee_exploitable",
};

function text(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * La contrainte `submission_id` de la table impose 8 à 128 caractères. La
 * vérifier ici évite de transformer une erreur du site en erreur 502.
 */
function validSubmissionId(value) {
  return /^[A-Za-z0-9:_-]{8,128}$/.test(value);
}

export function parseWebLeadPayload(raw) {
  let data;
  try {
    data = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { ok: false, reason: INGEST_REJECTIONS.INVALID_JSON };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: INGEST_REJECTIONS.INVALID_JSON };
  }

  // Pas de troncature : un identifiant raccourci ne correspondrait plus à la
  // tâche du site, et deux soumissions distinctes pourraient se confondre.
  const submissionId = text(data.submissionId, 300);
  if (!submissionId) return { ok: false, reason: INGEST_REJECTIONS.MISSING_SUBMISSION_ID };
  if (!validSubmissionId(submissionId)) {
    return { ok: false, reason: INGEST_REJECTIONS.INVALID_SUBMISSION_ID };
  }

  const kind = text(data.kind, 20);
  if (!WEB_LEAD_KINDS.includes(kind)) {
    return { ok: false, reason: INGEST_REJECTIONS.INVALID_KIND };
  }

  const phone = text(data.phone, 30);
  const email = text(data.email, 160);
  if (!phone && !email) {
    return { ok: false, reason: INGEST_REJECTIONS.NO_CONTACT };
  }

  const value = {
    submissionId,
    kind,
    receivedAt: text(data.receivedAt, 40) || null,
    intent: text(data.intent, 40),
    projects: Array.isArray(data.projects)
      ? data.projects.map(item => text(item, 60)).filter(Boolean).slice(0, 12)
      : [],
    postalCode: text(data.postalCode, 10),
    housing: text(data.housing, 60),
    firstName: text(data.firstName, 80),
    lastName: text(data.lastName, 80),
    name: text(data.name, 160),
    phone,
    email,
    message: text(data.message, 2000),
    attribution: data.attribution && typeof data.attribution === "object" && !Array.isArray(data.attribution)
      ? data.attribution
      : {},
    // Premier contact mémorisé par le navigateur. Vide quand la première
    // visite est aussi celle de la demande.
    attributionFirst:
      data.attributionFirst && typeof data.attributionFirst === "object" && !Array.isArray(data.attributionFirst)
        ? data.attributionFirst
        : {},
  };

  if (kind === "appointment") {
    value.date = text(data.date, 20);
    value.time = text(data.time, 10);
    value.appointmentStatus = text(data.appointmentStatus, 40);
  }

  return { ok: true, value };
}

export function webLeadConfig(env = process.env) {
  const organizationId = String(env.WEB_LEAD_ORGANIZATION_ID || "").trim();
  return {
    keyring: parseKeyring(env.WEB_LEAD_KEYRING),
    organizationId: UUID_PATTERN.test(organizationId) ? organizationId : DEFAULT_ORGANIZATION_ID,
    retentionDays: Math.min(Math.max(Number(env.WEB_LEAD_RETENTION_DAYS) || 30, 1), 365),
  };
}

/** La réception reste inerte tant qu'aucune clé n'est configurée. */
export function webLeadIngestConfigured(env = process.env) {
  return webLeadConfig(env).keyring.size > 0;
}
