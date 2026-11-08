import { parisWallTimeToIso } from "./agenda.js";
import { DEDUP_NEW, DEDUP_REPLAY, DEDUP_REVIEW, decideLeadDedup } from "./lead-dedup.js";
import { classifyWebLead, mirrorSourceLabel } from "./origin-taxonomy.js";
import { formToAppointmentRecord, formToProspectRecord } from "./prospects.js";

/**
 * Intégration des demandes du site dans le module Prospects.
 *
 * Le classement de l'origine et l'arbitrage des doublons se font ici, pas à la
 * réception : une demande déjà acceptée ne doit jamais être perdue parce que
 * cette étape échoue.
 *
 * Deux règles qui ne se discutent pas :
 *   - le canal est `web_ingest`, donc l'origine ne peut jamais être une
 *     prospection terrain, même si la demande ressemble à un rappel ;
 *   - aucun rapprochement n'est automatique. Un doublon probable part en revue
 *     et attend un humain.
 */

export const WEB_LEAD_CHANNEL = "web_ingest";

/**
 * Toutes les preuves que `classifyWebLead` peut produire.
 *
 * La chaîne vide en fait partie, et il faut la distinguer de « inconnu » : la
 * première dit qu'il n'y avait rien à citer, le visiteur étant arrivé en
 * direct ; la seconde dit que le canal n'a pas pu être classé. Les confondre
 * mélangerait des accès directs avec des demandes à qualifier.
 */
export const WEB_LEAD_EVIDENCE = [
  "", "gclid", "gbraid", "wbraid", "fbclid", "utm", "paid_inconnu", "referrer", "inconnu",
];

const CLICK_KINDS = ["gclid", "gbraid", "wbraid", "fbclid"];

function text(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function nullable(value, max = 200) {
  return text(value, max) || null;
}

function attributionObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** Origine d'une demande du site. Toujours dans le canal web. */
export function webLeadOrigin(payload = {}) {
  const { category, subtype, evidence } = classifyWebLead(attributionObject(payload.attribution));
  return { channel: WEB_LEAD_CHANNEL, category, subtype, evidence };
}

/**
 * Origine du premier contact. Classée depuis sa propre trace : sans cela les
 * deux modèles d'attribution désigneraient toujours le même canal, et la
 * comparaison demandée n'aurait aucun intérêt.
 */
export function webLeadFirstOrigin(payload = {}) {
  const attribution = attributionObject(payload.attributionFirst);
  if (!Object.keys(attribution).length) return null;
  const { category, subtype, evidence } = classifyWebLead(attribution);
  return { channel: WEB_LEAD_CHANNEL, category, subtype, evidence };
}

/**
 * Entrée du mappeur existant du module Prospects. Réutiliser
 * `formToProspectRecord` garantit que la fiche créée a exactement la forme
 * d'une fiche saisie à la main.
 */
export function webLeadProspectInput(payload = {}, origin = webLeadOrigin(payload)) {
  const firstName = text(payload.firstName, 80);
  const lastName = text(payload.lastName, 80);
  const name = text(payload.name, 160) || `${firstName} ${lastName}`.trim();
  const intent = text(payload.intent, 40);
  return {
    name,
    firstName,
    lastName,
    phone: text(payload.phone, 30),
    email: text(payload.email, 160).toLowerCase(),
    postalCode: text(payload.postalCode, 10),
    types: Array.isArray(payload.projects) ? payload.projects : [],
    housingType: text(payload.housing, 60),
    notes: text(payload.message, 2000),
    // Libellé lisible attendu par les écrans existants, jamais un code.
    source: mirrorSourceLabel(origin.category, origin.subtype),
    stage: "Nouveau",
    desiredKind: intent === "rappel" ? "rappel" : "",
    extra: {
      webLead: {
        submissionId: text(payload.submissionId, 128),
        kind: text(payload.kind, 20),
        intent,
        receivedAt: text(payload.receivedAt, 40),
      },
    },
  };
}

/**
 * Fiche prospect prête à écrire. `commercial_id` reste vide : une demande du
 * site doit passer par le dispatch, elle n'est affectée par personne.
 */
export function prospectRowFromWebLead({ payload, origin = webLeadOrigin(payload), organizationId, now = new Date() }) {
  const row = formToProspectRecord(webLeadProspectInput(payload, origin), { organizationId });
  return {
    ...row,
    origin_channel: origin.channel,
    origin_category: origin.category,
    origin_subtype: origin.subtype || null,
    origin_set_at: now.toISOString(),
  };
}

/** Rendez-vous pris en ligne. L'heure du site est une heure civile française. */
export function appointmentRowFromWebLead({ payload, organizationId, opportunityId }) {
  const date = text(payload.date, 20);
  const time = text(payload.time, 10);
  const startsAt = date && time ? parisWallTimeToIso(`${date}T${time}`) : "";
  if (!startsAt) return null;
  return formToAppointmentRecord(
    {
      prospectId: opportunityId,
      start: startsAt,
      prospectName: text(payload.name, 160),
      kind: "rendez-vous",
      duration: 60,
      extra: {
        webLead: { submissionId: text(payload.submissionId, 128) },
        phone: text(payload.phone, 30),
      },
    },
    { organizationId }
  );
}

/** Contact à l'origine du prospect, une ligne par demande. */
/** Âge maximal admis pour un contact annoncé par le navigateur : 90 jours. */
const MAX_TOUCH_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Date d'un contact. `capturedAt` vient du navigateur, dont l'horloge peut
 * être fausse ou manipulée : une date future ou trop ancienne est remplacée
 * par la date de réception, qui est, elle, constatée par le site.
 */
function touchedAtFrom(attribution, receivedAt) {
  const reference = Date.parse(receivedAt);
  const fallback = Number.isNaN(reference) ? Date.now() : reference;
  const captured = Date.parse(text(attribution.capturedAt, 40));
  if (Number.isNaN(captured)) return new Date(fallback).toISOString();
  if (captured > fallback) return new Date(fallback).toISOString();
  if (fallback - captured > MAX_TOUCH_AGE_MS) return new Date(fallback).toISOString();
  return new Date(captured).toISOString();
}

export function attributionTouchFromWebLead({
  payload,
  origin = webLeadOrigin(payload),
  organizationId,
  opportunityId,
  attribution = attributionObject(payload.attribution),
  touchedAt = "",
  now = new Date(),
}) {
  const receivedAt = text(payload.receivedAt, 40) || now.toISOString();
  const clickKind = CLICK_KINDS.find(key => text(attribution[key], 400));
  return {
    organization_id: organizationId,
    opportunity_id: opportunityId,
    touched_at: touchedAt || touchedAtFrom(attribution, receivedAt),
    origin_channel: origin.channel,
    origin_category: origin.category,
    origin_subtype: origin.subtype || null,
    prospector_id: null,
    campaign_name: nullable(attribution.utm_campaign, 120),
    adset_name: nullable(attribution.utm_content, 120),
    keyword: nullable(attribution.utm_term, 120),
    click_kind: clickKind || null,
    click_id: clickKind ? text(attribution[clickKind], 400) : null,
    landing_path: nullable(attribution.landingPath, 200),
    referrer_host: nullable(attribution.referrerHost, 120),
    submission_id: nullable(payload.submissionId, 128),
    touch_role: null,
    evidence: WEB_LEAD_EVIDENCE.includes(origin.evidence) ? origin.evidence : "inconnu",
  };
}

/**
 * Contacts à enregistrer pour une demande : un seul, ou deux quand le premier
 * contact diffère du dernier.
 *
 * Les deux modèles d'attribution se lisent ensuite par la chronologie, le
 * premier contact étant simplement la ligne la plus ancienne. Un premier
 * contact identique au dernier ne produit pas de seconde ligne : il gonflerait
 * le nombre de contacts sans rien apprendre.
 */
export function attributionTouchesFromWebLead({
  payload,
  organizationId,
  opportunityId,
  now = new Date(),
}) {
  const receivedAt = text(payload.receivedAt, 40) || now.toISOString();
  const lastOrigin = webLeadOrigin(payload);
  const last = attributionTouchFromWebLead({
    payload,
    origin: lastOrigin,
    organizationId,
    opportunityId,
    now,
  });

  const firstOrigin = webLeadFirstOrigin(payload);
  if (!firstOrigin) return [last];

  const firstAttribution = attributionObject(payload.attributionFirst);
  const first = attributionTouchFromWebLead({
    payload,
    origin: firstOrigin,
    organizationId,
    opportunityId,
    attribution: firstAttribution,
    touchedAt: touchedAtFrom(firstAttribution, receivedAt),
    now,
  });

  const sameOrigin = first.origin_category === last.origin_category
    && first.origin_subtype === last.origin_subtype
    && first.click_id === last.click_id;
  if (sameOrigin) return [last];

  // Le rôle entre dans la clé d'unicité : les deux lignes portent le même
  // identifiant de soumission et seraient refusées sans lui.
  first.touch_role = "premier";
  last.touch_role = "dernier";

  // Deux contacts à la même date, ou inversés, rendraient la lecture par
  // chronologie arbitraire. Le premier contact est reculé d'une milliseconde
  // pour que l'ordre reste strict.
  if (Date.parse(first.touched_at) >= Date.parse(last.touched_at)) {
    first.touched_at = new Date(Date.parse(last.touched_at) - 1).toISOString();
  }
  return [first, last];
}

/**
 * Décide du sort d'une demande.
 *
 * `candidates` sont les prospects existants partageant le téléphone ou
 * l'e-mail. Seule l'absence de correspondance autorise une création.
 */
export function planWebLeadIntegration({ payload, candidates = [], now = new Date() }) {
  const origin = webLeadOrigin(payload);
  const decision = decideLeadDedup({
    incoming: {
      submissionId: text(payload.submissionId, 128),
      phone: text(payload.phone, 30),
      email: text(payload.email, 160),
      name: text(payload.name, 160),
    },
    candidates,
    now,
  });

  if (decision.decision === DEDUP_NEW) {
    return { outcome: "succeeded", origin, decision: "new", reason: decision.reason, candidateIds: [] };
  }
  if (decision.decision === DEDUP_REPLAY) {
    // Ne devrait pas survenir : la réception rejette déjà les rejeux. Par
    // prudence on ne crée rien plutôt que de risquer un doublon.
    return { outcome: "review", origin, decision: "replay", reason: decision.reason, candidateIds: [] };
  }
  return {
    outcome: "review",
    origin,
    decision: "review",
    reason: decision.reason,
    candidateIds: decision.candidateIds,
  };
}

export { DEDUP_NEW, DEDUP_REVIEW };
