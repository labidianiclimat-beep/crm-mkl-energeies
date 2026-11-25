/**
 * Décision de rapprochement d’une demande entrante.
 *
 * Aucune fusion automatique. La seule déduplication sans intervention humaine
 * est celle d’une soumission strictement rejouée, identifiée par son
 * identifiant de soumission. Toute autre ressemblance est proposée à un
 * opérateur.
 */
import { identityKeys } from "./lead-identity.js";

export const DEDUP_NEW = "new";
export const DEDUP_REPLAY = "replay";
export const DEDUP_REVIEW = "review";

/** Au-delà de ce partage, un numéro est un standard et non une personne. */
export const SHARED_PHONE_THRESHOLD = 4;

/** Fenêtre de rapprochement proposé, en jours. */
export const REVIEW_WINDOW_DAYS = 90;

function daysBetween(a, b) {
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.POSITIVE_INFINITY;
  return Math.abs(left - right) / 86400000;
}

/**
 * @param incoming        demande normalisée, avec `submissionId`
 * @param knownSubmissionIds identifiants déjà reçus pour cette source
 * @param candidates      prospects existants { id, phone, email, createdAt }
 */
export function decideLeadDedup({
  incoming = {},
  knownSubmissionIds = [],
  candidates = [],
  now = new Date(),
  windowDays = REVIEW_WINDOW_DAYS,
  sharedPhoneThreshold = SHARED_PHONE_THRESHOLD,
} = {}) {
  const submissionId = String(incoming.submissionId || "").trim();
  if (submissionId && knownSubmissionIds.map(String).includes(submissionId)) {
    return { decision: DEDUP_REPLAY, reason: "submission_id_deja_recu", candidateIds: [] };
  }

  const keys = identityKeys(incoming);
  if (!keys.phone && !keys.email) {
    return { decision: DEDUP_NEW, reason: "aucune_identite_exploitable", candidateIds: [] };
  }

  // Un candidat dont la date de création est inexploitable reste dans la
  // fenêtre. L'écarter en silence ferait créer un doublon alors qu'un rapprochement
  // existe : entre un doublon et une mise en revue, la revue est préférable.
  const inWindow = (candidates || []).filter(item => {
    const createdAt = String(item?.createdAt ?? "").trim();
    if (!createdAt) return true;
    const age = daysBetween(createdAt, now);
    return !Number.isFinite(age) || age <= windowDays;
  });

  const byPhone = keys.phone
    ? inWindow.filter(item => identityKeys(item).phone === keys.phone)
    : [];
  const byEmail = keys.email
    ? inWindow.filter(item => identityKeys(item).email === keys.email)
    : [];

  if (keys.phone && byPhone.length >= sharedPhoneThreshold) {
    return {
      decision: DEDUP_NEW,
      reason: "telephone_partage_probable_standard",
      candidateIds: [],
    };
  }

  const matched = [...new Map([...byPhone, ...byEmail].map(item => [String(item.id), item])).values()];
  if (!matched.length) {
    return { decision: DEDUP_NEW, reason: "aucune_correspondance", candidateIds: [] };
  }

  return {
    decision: DEDUP_REVIEW,
    reason: byPhone.length ? "correspondance_telephone" : "correspondance_email",
    candidateIds: matched.map(item => String(item.id)),
  };
}
