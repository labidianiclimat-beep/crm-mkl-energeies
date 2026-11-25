/**
 * Prospects des formulaires instantanés Meta.
 *
 * Chaque lead est traduit en demande du site, puis enregistré par la file
 * déjà utilisée pour Google Ads : même table, même fiche, même anti-doublon
 * sur l'identifiant de soumission.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { parseWebLeadPayload, webLeadConfig } from "./web-lead-ingest.js";
import { processWebLeadQueue } from "./web-lead-queue-server.js";
import { serviceRequest, serviceRoleConfigured } from "./supabase-server.js";

export const META_SOURCE = "Facebook Lead Ads";
const GRAPH = "https://graph.facebook.com/v21.0";
const LEAD_FIELDS = "created_time,field_data,ad_id,ad_name,adset_name,campaign_name,form_id";
const PROJECT_TYPES = ["Rénovation", "Construction neuve", "Remplacement de chauffage"];

function text(value, max = 200) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function sameSecret(received, expected) {
  const left = Buffer.from(String(received || ""), "utf8");
  const right = Buffer.from(String(expected || ""), "utf8");
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function metaVerifyChallenge({ mode, token, challenge, expected }) {
  if (mode === "subscribe" && sameSecret(token, expected)) return { ok: true, challenge: String(challenge ?? "") };
  return { ok: false };
}

/** HMAC SHA256 du corps brut, en-tête `sha256=<hex>`. */
export function metaSignatureValid(rawBody, header, secret) {
  const received = String(header || "").trim().toLowerCase();
  if (!secret || !received.startsWith("sha256=")) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  return sameSecret(received, `sha256=${digest}`);
}

export function metaFieldObject(fieldData = []) {
  const fields = {};
  for (const item of Array.isArray(fieldData) ? fieldData : []) {
    const name = text(item?.name, 80).toLowerCase();
    if (!name) continue;
    const values = Array.isArray(item.values) ? item.values.map(value => text(value, 500)).filter(Boolean) : [];
    if (values.length) fields[name] = values.join(", ");
  }
  return fields;
}

function fold(value) {
  return text(value, 200).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function projectType(fields) {
  const known = PROJECT_TYPES.map(item => [fold(item), item]);
  for (const [name, value] of Object.entries(fields)) {
    const found = known.find(([key]) => fold(value) === key || fold(name).includes(key));
    if (found) return found[1];
    if (fold(name).includes("projet")) {
      const byValue = known.find(([key]) => fold(value).includes(key));
      if (byValue) return byValue[1];
    }
  }
  return "";
}

function ownerAnswer(fields) {
  for (const [name, value] of Object.entries(fields)) {
    if (!fold(name).includes("propri")) continue;
    return value;
  }
  return "";
}

const IDENTITY_KEYS = new Set([
  "email", "full_name", "phone_number", "phone", "post_code", "zip_code", "postal_code",
  "first_name", "last_name",
]);

export function metaLeadToWebPayload(lead = {}, context = {}) {
  const fields = metaFieldObject(lead.field_data);
  const fullName = fields.full_name || `${fields.first_name || ""} ${fields.last_name || ""}`.trim();
  const [firstName, ...rest] = fullName.split(/\s+/).filter(Boolean);
  const project = projectType(fields);
  const owner = ownerAnswer(fields);
  const notes = [];
  if (project) notes.push(`Type de projet : ${project}`);
  if (owner) notes.push(`Propriétaire : ${owner}`);
  for (const [name, value] of Object.entries(fields)) {
    if (IDENTITY_KEYS.has(name)) continue;
    if (fold(name).includes("propri")) continue;
    if (project && (fold(value) === fold(project) || fold(name).includes("projet"))) continue;
    notes.push(`${name} : ${value}`);
  }
  const formId = text(lead.form_id || context.formId, 40);
  const adId = text(lead.ad_id || context.adId, 40);
  const adName = text(lead.ad_name, 120);
  const campaign = text(lead.campaign_name, 120);
  const adset = text(lead.adset_name, 120);
  if (formId) notes.push(`form_id : ${formId}`);
  if (adId) notes.push(`ad_id : ${adId}`);
  if (adName) notes.push(`Pub : ${adName}`);
  const leadId = text(lead.id || context.leadgenId, 120);
  return {
    submissionId: leadId,
    kind: "lead",
    receivedAt: text(lead.created_time, 40) || new Date().toISOString(),
    source: META_SOURCE,
    projects: project ? [project] : [],
    postalCode: fields.post_code || fields.postal_code || fields.zip_code || "",
    firstName: firstName || "",
    lastName: rest.join(" "),
    name: fullName,
    phone: fields.phone_number || fields.phone || "",
    email: fields.email || "",
    message: notes.join("\n"),
    attribution: {
      utm_source: "facebook",
      utm_medium: "cpc",
      utm_campaign: campaign,
      utm_content: adset,
      utm_term: adName,
    },
  };
}

export function metaLeadgenChanges(body = {}) {
  const changes = [];
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== "leadgen") continue;
      const value = change.value || {};
      const leadgenId = text(value.leadgen_id, 120);
      if (!leadgenId) continue;
      changes.push({
        leadgenId,
        formId: text(value.form_id, 40),
        adId: text(value.ad_id, 40),
        pageId: text(value.page_id, 40),
      });
    }
  }
  return changes;
}

export function metaFormIds(env = process.env) {
  return String(env.META_FORM_IDS || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

async function graphGet(url, fetchImpl) {
  const response = await fetchImpl(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = text(data?.error?.message, 180) || `Graph ${response.status}`;
    throw new Error(message);
  }
  return data;
}

export async function fetchMetaLead(leadgenId, token, fetchImpl = fetch) {
  const url = new URL(`${GRAPH}/${encodeURIComponent(leadgenId)}`);
  url.searchParams.set("fields", LEAD_FIELDS);
  url.searchParams.set("access_token", token);
  return graphGet(url, fetchImpl);
}

export async function fetchMetaFormLeads(formId, since, token, fetchImpl = fetch) {
  const leads = [];
  let url = new URL(`${GRAPH}/${encodeURIComponent(formId)}/leads`);
  url.searchParams.set("fields", LEAD_FIELDS);
  url.searchParams.set("since", String(since));
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "100");
  for (let page = 0; page < 5 && url; page += 1) {
    const data = await graphGet(url, fetchImpl);
    for (const lead of Array.isArray(data.data) ? data.data : []) leads.push(lead);
    url = data?.paging?.next ? new URL(data.paging.next) : null;
  }
  return leads;
}

export async function enqueueMetaLead(lead, context = {}) {
  const raw = metaLeadToWebPayload(lead, context);
  const parsed = parseWebLeadPayload(raw);
  if (!parsed.ok) throw new Error(parsed.reason);
  if (!serviceRoleConfigured()) throw new Error("RECEPTION_INDISPONIBLE");
  const { organizationId, retentionDays } = webLeadConfig();
  const rows = await serviceRequest("/rest/v1/rpc/enqueue_web_lead", {
    method: "POST",
    body: {
      p_organization_id: organizationId,
      p_submission_id: parsed.value.submissionId,
      p_kind: parsed.value.kind,
      p_payload: parsed.value,
      p_signature_sent_at: new Date().toISOString(),
      p_retention_days: retentionDays,
    },
  });
  const receipt = Array.isArray(rows) ? rows[0] : rows;
  if (!receipt?.id) throw new Error("ENQUEUE_SANS_ACCUSE");
  return { id: receipt.id, duplicate: Boolean(receipt.duplicate), submissionId: parsed.value.submissionId };
}

export async function recordMetaLead(lead, context = {}) {
  const receipt = await enqueueMetaLead(lead, context);
  if (!receipt.duplicate) await processWebLeadQueue({ worker: "meta-leads" });
  return receipt;
}
