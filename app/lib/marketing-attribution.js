/**
 * Lecture des attributions et agrégats par origine.
 *
 * Deux décisions de gestion sont câblées ici :
 *
 * 1. Les deux modèles d'attribution sont calculés côte à côte. Le premier
 *    contact crédite le canal qui a fait découvrir MKL, le dernier contact
 *    celui qui a déclenché la demande. Aucun des deux n'est « le » bon : un
 *    écart entre les deux est une information, pas une erreur.
 *
 * 2. Le chiffre d'affaires est présenté sur trois niveaux distincts, jamais
 *    additionnés. Ils se recouvrent partiellement — une facture payée est
 *    aussi une vente confirmée — donc les sommer compterait plusieurs fois la
 *    même affaire.
 *
 * Ce module ne produit que des agrégats. Il ne renvoie jamais de nom, de
 * téléphone ni d'adresse e-mail.
 */
import { comparisonAxis, isPerformanceCategory } from "./origin-taxonomy.js";
import { extraOf } from "./prospects.js";

export const ATTRIBUTION_MODELS = ["premier_contact", "dernier_contact"];

export const ATTRIBUTION_MODEL_LABELS = {
  premier_contact: "Premier contact",
  dernier_contact: "Dernier contact",
};

/**
 * Les trois niveaux, du plus précoce au plus certain. L'ordre est celui de
 * l'affichage ; il ne vaut pas inclusion stricte d'un niveau dans le suivant.
 */
export const REVENUE_LEVELS = ["devisAcceptes", "ventesConfirmees", "facturesPayees"];

export const REVENUE_LEVEL_LABELS = {
  devisAcceptes: "Devis acceptés",
  ventesConfirmees: "Ventes confirmées",
  facturesPayees: "Factures payées",
};

/** Une facture encore en brouillon ou annulée ne constate aucune vente. */
const INVOICE_VOID_STATUSES = ["Brouillon", "Annulé"];

function text(value) {
  return String(value ?? "").trim();
}

function amountOf(doc) {
  return {
    ht: Number(doc?.amount ?? doc?.total_ht ?? 0) || 0,
    ttc: Number(doc?.totalTTC ?? doc?.total_ttc ?? 0) || 0,
  };
}

function touchKey(row) {
  return {
    channel: text(row?.origin_channel || row?.originChannel),
    category: text(row?.origin_category || row?.originCategory),
    subtype: text(row?.origin_subtype || row?.originSubtype),
    prospectorId: text(row?.prospector_id || row?.prospectorId),
    campaignId: text(row?.campaign_id || row?.campaignId),
    campaignName: text(row?.campaign_name || row?.campaignName),
    evidence: text(row?.evidence),
    touchedAt: text(row?.touched_at || row?.touchedAt),
  };
}

function touchTime(row) {
  const value = Date.parse(text(row?.touched_at || row?.touchedAt));
  return Number.isNaN(value) ? 0 : value;
}

/**
 * Tri déterministe des contacts. Deux contacts enregistrés à la même seconde
 * doivent toujours ressortir dans le même ordre, sinon le premier et le
 * dernier contact changeraient d'un affichage à l'autre.
 */
export function sortTouches(rows = []) {
  return [...(rows || [])].sort((a, b) => {
    const delta = touchTime(a) - touchTime(b);
    if (delta !== 0) return delta;
    const createdA = Date.parse(text(a?.created_at || a?.createdAt)) || 0;
    const createdB = Date.parse(text(b?.created_at || b?.createdAt)) || 0;
    if (createdA !== createdB) return createdA - createdB;
    return text(a?.id).localeCompare(text(b?.id));
  });
}

/** Contacts d'une fiche, regroupés par opportunité. */
export function touchesByOpportunity(rows = []) {
  const map = new Map();
  for (const row of rows || []) {
    const id = text(row?.opportunity_id || row?.opportunityId);
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  for (const [id, list] of map) map.set(id, sortTouches(list));
  return map;
}

/**
 * Origine portée par la fiche elle-même. Elle sert de contact unique quand
 * aucune ligne d'attribution n'existe, ce qui est le cas des fiches saisies à
 * la main et de tout l'historique antérieur au module marketing.
 */
function originOfProspect(prospect) {
  const category = text(prospect?.origin_category || prospect?.originCategory);
  if (!category) return null;
  return {
    channel: text(prospect?.origin_channel || prospect?.originChannel),
    category,
    subtype: text(prospect?.origin_subtype || prospect?.originSubtype),
    prospectorId: text(extraOf(prospect).prospectorId),
    campaignId: "",
    campaignName: "",
    evidence: "fiche",
    touchedAt: text(prospect?.origin_set_at || prospect?.originSetAt),
  };
}

/**
 * Premier et dernier contact d'une fiche. Les deux sont renvoyés ensemble :
 * l'appelant choisit lequel il affiche, il ne le recalcule pas.
 */
export function attributionOf(prospect, touches = []) {
  const sorted = sortTouches(touches);
  if (!sorted.length) {
    const fallback = originOfProspect(prospect);
    if (!fallback) return { premier_contact: null, dernier_contact: null, touchCount: 0 };
    return { premier_contact: fallback, dernier_contact: fallback, touchCount: 0 };
  }
  // Le rôle, quand il est renseigné, dit explicitement lequel des deux
  // contacts est le premier. La chronologie ne sert que de recours, pour les
  // contacts saisis à la main qui n'en portent pas.
  const role = value => sorted.find(row => text(row?.touch_role || row?.touchRole) === value);
  const premier = role("premier") || sorted[0];
  const dernier = role("dernier") || sorted[sorted.length - 1];
  return {
    premier_contact: touchKey(premier),
    dernier_contact: touchKey(dernier),
    touchCount: sorted.length,
  };
}

/** Un seul contact enregistré : les deux modèles disent la même chose. */
export function modelsAgree(attribution) {
  const first = attribution?.premier_contact;
  const last = attribution?.dernier_contact;
  if (!first || !last) return true;
  return first.category === last.category && first.subtype === last.subtype;
}

/**
 * Niveaux auxquels un document contribue. Un même document peut compter dans
 * deux niveaux, d'où l'interdiction de les additionner.
 */
export function revenueLevelsOfDocument(doc) {
  const kind = text(doc?.kind) || "Devis";
  const status = text(doc?.status || doc?.statut);
  const levels = [];
  if (kind === "Devis" && status === "Accepté") levels.push("devisAcceptes");
  if (kind === "Facture" && !INVOICE_VOID_STATUSES.includes(status)) {
    levels.push("ventesConfirmees");
    if (status === "Payée") levels.push("facturesPayees");
  }
  return levels;
}

function emptyBucket(key, label) {
  return {
    key,
    label,
    prospects: 0,
    appointments: 0,
    devisAcceptes: { count: 0, ht: 0, ttc: 0 },
    ventesConfirmees: { count: 0, ht: 0, ttc: 0 },
    facturesPayees: { count: 0, ht: 0, ttc: 0 },
    performance: true,
  };
}

function addDocument(bucket, doc) {
  const { ht, ttc } = amountOf(doc);
  for (const level of revenueLevelsOfDocument(doc)) {
    bucket[level].count += 1;
    bucket[level].ht += ht;
    bucket[level].ttc += ttc;
  }
}

function round(value) {
  return Number(Number(value || 0).toFixed(2));
}

/**
 * Taux de conversion. Sans prospect dans le seau, il n'y a pas de taux : 0 %
 * se lirait comme un échec alors qu'il n'y a simplement rien à mesurer.
 */
function rate(numerator, denominator) {
  if (!denominator) return null;
  return round((numerator / denominator) * 100);
}

/**
 * Agrégat par origine, pour un modèle d'attribution donné.
 *
 * Les devis sont rattachés à un client, pas à une fiche prospect. Le
 * rapprochement passe donc par la conversion du prospect en client. Un
 * document dont le client ne provient d'aucune fiche connue tombe dans
 * `nonAttribue` : il reste visible, car le faire disparaître donnerait un
 * chiffre d'affaires publicitaire flatteur.
 */
export function aggregateByOrigin({
  prospects = [],
  attributions = [],
  documents = [],
  appointments = [],
  model = "premier_contact",
  prospectorLabels = {},
} = {}) {
  if (!ATTRIBUTION_MODELS.includes(model)) {
    throw new Error(`Modèle d'attribution inconnu : ${model}`);
  }
  const touches = touchesByOpportunity(attributions);
  const buckets = new Map();
  const bucketOfProspect = new Map();
  const bucketOfClient = new Map();

  const bucketFor = origin => {
    const axis = comparisonAxis({
      category: origin.category,
      subtype: origin.subtype,
      prospectorId: origin.prospectorId,
    });
    if (!buckets.has(axis.key)) {
      const label = axis.label || prospectorLabels[origin.prospectorId] || "Prospecteur";
      const bucket = emptyBucket(axis.key, label);
      bucket.performance = isPerformanceCategory(origin.category);
      buckets.set(axis.key, bucket);
    }
    return buckets.get(axis.key);
  };

  const unattributed = emptyBucket("non_attribue", "Non attribué");
  unattributed.performance = false;

  for (const prospect of prospects || []) {
    const id = text(prospect?.id);
    if (!id) continue;
    const attribution = attributionOf(prospect, touches.get(id) || []);
    const origin = attribution[model];
    const bucket = origin ? bucketFor(origin) : unattributed;
    bucket.prospects += 1;
    bucketOfProspect.set(id, bucket);
    const clientId = text(prospect?.clientId || extraOf(prospect).clientId);
    if (clientId && !bucketOfClient.has(clientId)) bucketOfClient.set(clientId, bucket);
  }

  for (const appointment of appointments || []) {
    const id = text(appointment?.prospectId || appointment?.prospect_id);
    const bucket = bucketOfProspect.get(id);
    if (bucket) bucket.appointments += 1;
    else unattributed.appointments += 1;
  }

  for (const doc of documents || []) {
    if (!revenueLevelsOfDocument(doc).length) continue;
    const clientId = text(doc?.clientId || doc?.client_id);
    addDocument(bucketOfClient.get(clientId) || unattributed, doc);
  }

  const unattributedUsed = Boolean(unattributed.prospects)
    || Boolean(unattributed.appointments)
    || REVENUE_LEVELS.some(level => unattributed[level].count > 0);
  const rows = [...buckets.values()];
  if (unattributedUsed) rows.push(unattributed);

  for (const bucket of rows) {
    for (const level of REVENUE_LEVELS) {
      bucket[level].ht = round(bucket[level].ht);
      bucket[level].ttc = round(bucket[level].ttc);
    }
    bucket.appointmentRate = rate(bucket.appointments, bucket.prospects);
    bucket.conversionRate = rate(bucket.ventesConfirmees.count, bucket.prospects);
  }

  rows.sort((a, b) => b.prospects - a.prospects || a.label.localeCompare(b.label));
  return rows;
}

/**
 * Les deux modèles côte à côte, comme demandé à la lecture. Les écarts entre
 * les deux colonnes montrent les canaux qui ouvrent les affaires sans les
 * conclure, et inversement.
 */
export function compareAttributionModels(input = {}) {
  return {
    premier_contact: aggregateByOrigin({ ...input, model: "premier_contact" }),
    dernier_contact: aggregateByOrigin({ ...input, model: "dernier_contact" }),
  };
}