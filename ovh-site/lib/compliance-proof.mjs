/**
 * Justificatifs numériques de demande (append-only).
 * Activé uniquement si ENABLE_CALLBACK_COMPLIANCE=1|true|yes.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { FORM_COPY_VERSION, legalBundleForAction } from "./form-legal-copy.mjs";
import { computeCallbackDeadline, isCallbackStillAuthorized } from "./callback-deadline.mjs";

export function isComplianceEnabled() {
  const v = String(process.env.ENABLE_CALLBACK_COMPLIANCE || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function sha256(input) {
  return createHash("sha256").update(String(input), "utf8").digest("hex");
}

export async function ensureProofStore(rootDir) {
  const dir = path.join(rootDir, "data", "proofs");
  await fs.mkdir(dir, { recursive: true });
  const jsonl = path.join(rootDir, "data", "consent-proofs.jsonl");
  try {
    await fs.access(jsonl);
  } catch {
    await fs.writeFile(jsonl, "", "utf8");
  }
  return { dir, jsonl };
}

/**
 * @param {object} params
 */
export async function appendComplianceProof(rootDir, params) {
  const {
    leadId = null,
    appointmentId = null,
    channel = "formulaire",
    action,
    intent,
    projects = [],
    firstName = "",
    lastName = "",
    phone = "",
    email = "",
    postalCode = "",
    callbackChecked = false,
    meetingType = "",
    uiActionLabel = "",
    pagePath = "",
    ip = "",
    userAgent = "",
  } = params;

  const createdAt = new Date().toISOString();
  const proofId = randomUUID();
  const legalTexts = legalBundleForAction({
    action,
    projects,
    callbackChecked,
    meetingType,
  });
  const legalText = legalTexts.info || "";
  const legalTextSha256 = sha256(`${FORM_COPY_VERSION}\n${legalText}`);

  const wantsCallback =
    action === "request_callback" || (action === "request_study" && callbackChecked);

  let deadline = null;
  if (wantsCallback) {
    deadline = computeCallbackDeadline(new Date(), { postalCode });
  }

  const proof = {
    proofId,
    schemaVersion: 1,
    createdAt,
    leadId,
    appointmentId,
    channel,
    action,
    intent,
    projects: Array.isArray(projects) ? projects : [],
    identity: {
      firstName: String(firstName || "").slice(0, 80),
      lastName: String(lastName || "").slice(0, 80),
      phone: String(phone || "").slice(0, 32),
      email: String(email || "").slice(0, 120),
    },
    formId: channel === "rdv" ? "rdv-form" : "lead-form",
    formCopyVersion: FORM_COPY_VERSION,
    legalText,
    legalTexts,
    legalTextSha256,
    callbackChecked: !!callbackChecked,
    explicitAction: true,
    uiActionLabel: String(uiActionLabel || "").slice(0, 160),
    pagePath: String(pagePath || "").slice(0, 200),
    meetingType: meetingType ? String(meetingType).slice(0, 40) : "",
    callbackDeadline: deadline?.callbackDeadline || null,
    callbackDeadlineLocal: deadline?.callbackDeadlineLocal || null,
    timezone: deadline?.timezone || "Europe/Paris",
    ipHash: ip ? sha256(`${ip}|mkl-proof-salt-v1`) : "",
    userAgentHash: userAgent ? sha256(userAgent) : "",
    oppositions: [],
    integritySha256: "",
  };

  const { integritySha256: _drop, ...forHash } = proof;
  proof.integritySha256 = sha256(JSON.stringify(forHash));

  const { dir, jsonl } = await ensureProofStore(rootDir);
  const year = createdAt.slice(0, 4);
  const month = createdAt.slice(5, 7);
  const monthDir = path.join(dir, year, month);
  await fs.mkdir(monthDir, { recursive: true });
  const filePath = path.join(monthDir, `${proofId}.json`);
  await fs.writeFile(filePath, JSON.stringify(proof, null, 2), "utf8");
  await fs.appendFile(jsonl, `${JSON.stringify(proof)}\n`, "utf8");

  return proof;
}

export async function readProof(rootDir, proofId) {
  const id = String(proofId || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { jsonl } = await ensureProofStore(rootDir);
  const raw = await fs.readFile(jsonl, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const row = JSON.parse(lines[i]);
      if (row.proofId === id) return row;
    } catch {
      /* skip */
    }
  }
  return null;
}

export async function appendOppositionToProof(rootDir, proofId, note = "") {
  const proof = await readProof(rootDir, proofId);
  if (!proof) return null;
  const entry = {
    at: new Date().toISOString(),
    note: String(note || "").slice(0, 500),
  };
  proof.oppositions = Array.isArray(proof.oppositions) ? proof.oppositions : [];
  proof.oppositions.push(entry);
  const { dir } = await ensureProofStore(rootDir);
  const year = String(proof.createdAt || "").slice(0, 4) || "unknown";
  const month = String(proof.createdAt || "").slice(5, 7) || "00";
  const filePath = path.join(dir, year, month, `${proof.proofId}.json`);
  await fs.writeFile(filePath, JSON.stringify(proof, null, 2), "utf8");
  const { jsonl } = await ensureProofStore(rootDir);
  await fs.appendFile(
    jsonl,
    `${JSON.stringify({ ...proof, eventType: "opposition_registered" })}\n`,
    "utf8"
  );
  return proof;
}

export function deriveCallbackCompliance(lead, now = new Date()) {
  if (lead?.callbackCompliance === "opposition" || lead?.opposition === true) {
    return "opposition";
  }
  const intent = lead?.intent;
  const checked = lead?.callbackChecked === true;
  const isCallback =
    intent === "rappel" || (intent === "devis" && checked) || lead?.action === "request_callback";

  if (lead?.proofLevel === "legacy_intent_only") {
    return "unjustified";
  }
  if (!isCallback) {
    return "unjustified";
  }
  if (!lead?.proofId) {
    return "unjustified";
  }
  if (!isCallbackStillAuthorized(lead.callbackDeadline, now)) {
    return "expired";
  }
  return "authorized";
}

export { FORM_COPY_VERSION, isCallbackStillAuthorized };
