import { normalizeRoleLabel } from "./roles.js";

/**
 * Suivi des demandes du site qui n'ont pas abouti.
 *
 * Une demande acceptée par le site est une personne qui attend un rappel. Si
 * son intégration échoue, elle ne doit pas se perdre dans une table que
 * personne ne regarde : d'où cet écran, et d'où le refus de purger une demande
 * en échec sans l'avoir signalée.
 *
 * Deux contraintes gouvernent la projection ci-dessous :
 *
 *   - l'écran sert à débloquer un traitement, pas à consulter un fichier de
 *     prospects. Les coordonnées sont donc masquées : assez pour reconnaître
 *     une personne qu'on a au téléphone, pas assez pour constituer une liste ;
 *   - le motif de blocage est un code technique court. Il est affiché tel quel
 *     parce que l'administrateur en a besoin, et il est produit à partir du
 *     seul message d'erreur, jamais du contenu de la demande.
 */

/** Rôles autorisés à voir et débloquer les demandes du site. */
export const WEB_LEAD_ADMIN_ROLES = [
  "Admin VIP",
  "Superadmin",
  "Direction",
  "Responsable prospection",
];

/**
 * Le responsable commercial est volontairement absent : les demandes du site
 * arrivent sans commercial et leur attribution appartient au responsable
 * prospection et à la direction. C'est la même règle que sur le tableau de
 * dispatch, et elle doit rester cohérente entre les deux écrans.
 */
export function canReviewWebLeads(profile) {
  return WEB_LEAD_ADMIN_ROLES.includes(normalizeRoleLabel(profile?.role));
}

export const WEB_LEAD_STATUS_LABELS = {
  pending: "En attente de traitement",
  processing: "Traitement en cours",
  done: "Intégrée",
  failed: "En échec",
  review: "Doublon à vérifier",
  discarded: "Écartée",
};

/** États qui appellent une intervention humaine. */
export const WEB_LEAD_BLOCKED_STATUSES = ["failed", "review"];

/** Motifs connus, traduits. Un motif inconnu reste affiché tel quel. */
export const WEB_LEAD_ERROR_LABELS = {
  PAYLOAD_PURGE: "Contenu de la demande effacé : relance impossible.",
  WEB_LEAD_PAYLOAD_PURGED: "Contenu de la demande effacé : relance impossible.",
  PROSPECT_SANS_IDENTIFIANT: "La fiche a été refusée par la base sans renvoyer d'identifiant.",
  WEB_LEAD_ALREADY_INTEGRATED: "La demande est déjà rattachée à une autre fiche.",
  SERVICE_ROLE_NOT_CONFIGURED: "Clé de service absente : le serveur ne peut pas écrire.",
  ENQUEUE_SANS_ACCUSE: "La mise en file n'a pas renvoyé d'accusé de réception.",
};

export function webLeadErrorLabel(code) {
  const clean = String(code || "").trim();
  if (!clean) return "";
  return WEB_LEAD_ERROR_LABELS[clean] || "Erreur technique non répertoriée.";
}

/**
 * Téléphone masqué : les deux premiers et les deux derniers chiffres.
 *
 * Assez pour rapprocher la demande d'un appel reçu, pas assez pour rappeler
 * quelqu'un depuis cet écran. Le numéro complet reste sur la fiche prospect,
 * là où les habilitations du CRM s'appliquent déjà.
 */
export function maskPhone(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.length < 6) return "•".repeat(digits.length);
  return `${digits.slice(0, 2)} ${"•".repeat(digits.length - 4)} ${digits.slice(-2)}`;
}

/** E-mail masqué : première lettre et domaine. */
export function maskEmail(value) {
  const clean = String(value || "").trim().toLowerCase();
  const at = clean.indexOf("@");
  if (at < 1) return clean ? "•••" : "";
  return `${clean[0]}•••${clean.slice(at)}`;
}

function text(value, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * Ligne affichable d'une demande bloquée.
 *
 * Construite depuis la ligne de file et, quand il existe, le contenu brut.
 * Si le contenu a été purgé, la ligne reste affichable : c'est précisément le
 * cas où il faut prévenir que la relance n'est plus possible.
 */
export function webLeadBacklogRow(submission = {}, { candidates = [] } = {}) {
  const payload = submission.payload && typeof submission.payload === "object" ? submission.payload : null;
  const status = text(submission.status, 20);

  return {
    id: text(submission.id, 64),
    submissionId: text(submission.submission_id, 128),
    kind: text(submission.kind, 20),
    status,
    statusLabel: WEB_LEAD_STATUS_LABELS[status] || status,
    receivedAt: text(submission.received_at, 40),
    attempts: Number(submission.attempts) || 0,
    errorCode: text(submission.last_error_code, 64),
    errorLabel: webLeadErrorLabel(submission.last_error_code),
    dedupDecision: text(submission.dedup_decision, 20),
    opportunityId: text(submission.opportunity_id, 64) || null,
    // Vrai quand une tentative a déjà créé la fiche : la relance reprendra
    // l'attribution et le rendez-vous, elle ne recréera pas de fiche.
    prospectCreated: Boolean(submission.opportunity_id),
    payloadPurged: !payload,
    payloadPurgeAfter: text(submission.payload_purge_after, 40),
    retentionAlertAt: text(submission.retention_alert_at, 40) || null,
    canRequeue: WEB_LEAD_BLOCKED_STATUSES.includes(status) && Boolean(payload),
    canLink: WEB_LEAD_BLOCKED_STATUSES.includes(status),
    canDiscard: WEB_LEAD_BLOCKED_STATUSES.includes(status) && !submission.opportunity_id,
    // Indices de reconnaissance, volontairement incomplets.
    hint: payload
      ? {
          phone: maskPhone(payload.phone),
          email: maskEmail(payload.email),
          postalCode: text(payload.postalCode, 10),
          projects: Array.isArray(payload.projects) ? payload.projects.slice(0, 6) : [],
          intent: text(payload.intent, 40),
        }
      : null,
    candidates: (candidates || []).map(candidate => ({
      id: text(candidate.id, 64),
      name: text(candidate.name, 160),
      createdAt: text(candidate.created_at || candidate.createdAt, 40),
    })),
  };
}

export const WEB_LEAD_ACTIONS = ["relancer", "rattacher", "ecarter"];

/**
 * Traduit une action de l'écran en appel de fonction.
 *
 * La validation est ici, en un seul endroit, pour que la route ne puisse pas
 * appeler une fonction d'écriture sans avoir vérifié ses conditions.
 */
export function planWebLeadAction({ action, submissionId, opportunityId = "", reason = "", authorId = null }) {
  const name = String(action || "").trim();
  if (!WEB_LEAD_ACTIONS.includes(name)) {
    return { ok: false, error: "Action inconnue." };
  }
  if (!submissionId) {
    return { ok: false, error: "Demande non précisée." };
  }

  if (name === "relancer") {
    return {
      ok: true,
      rpc: "requeue_web_lead",
      body: { p_id: submissionId, p_author_id: authorId },
    };
  }

  if (name === "rattacher") {
    if (!opportunityId) {
      return { ok: false, error: "Fiche de rattachement non précisée." };
    }
    return {
      ok: true,
      rpc: "link_web_lead_to_opportunity",
      body: { p_id: submissionId, p_opportunity_id: opportunityId, p_author_id: authorId },
    };
  }

  return {
    ok: true,
    rpc: "discard_web_lead",
    body: { p_id: submissionId, p_author_id: authorId, p_reason: text(reason, 64) || null },
  };
}

/** Motifs d'historique, traduits pour l'écran. */
export const WEB_LEAD_EVENT_LABELS = {
  received: "Demande reçue",
  duplicate_ignored: "Rejeu ignoré",
  reserved: "Prise en traitement",
  succeeded: "Intégrée",
  retry_scheduled: "Nouvelle tentative programmée",
  failed: "Abandon après sept tentatives",
  sent_to_review: "Envoyée en vérification de doublon",
  requeued: "Relancée manuellement",
  discarded: "Écartée",
  payload_purged: "Contenu effacé",
  opportunity_attached: "Fiche prospect rattachée",
  linked_manually: "Rapprochée manuellement",
  retention_warned: "Fin de conservation signalée",
};

export function webLeadEventRow(event = {}) {
  const kind = text(event.kind, 40);
  return {
    id: text(event.id, 64),
    kind,
    label: WEB_LEAD_EVENT_LABELS[kind] || kind,
    attempt: Number(event.attempt) || 0,
    errorCode: text(event.error_code, 64),
    createdAt: text(event.created_at, 40),
    authorId: text(event.author_id, 64) || null,
  };
}
