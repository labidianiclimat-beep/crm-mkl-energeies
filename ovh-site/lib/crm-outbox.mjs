import { randomUUID } from "node:crypto";
import { atomicWriteJson, readJsonArray, withStoreLock } from "./json-store.mjs";

/**
 * Paliers de réessai, alignés sur ceux de la file côté CRM. Au-delà du dernier
 * essai la tâche devient « failed » : elle cesse de consommer du réseau et
 * devient visible dans l’administration, où elle peut être reprise.
 */
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];

export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export function crmSyncEnabled(env = process.env) {
  return String(env.CRM_SYNC_ENABLED || "").trim() === "1";
}

function retryDelayMs(attempts) {
  return RETRY_DELAYS_MS[Math.min(Math.max(attempts, 1), RETRY_DELAYS_MS.length) - 1];
}

/** Ajoute une tâche. Le même couple type + identifiant ne crée pas une seconde ligne. */
export async function enqueueCrmJob(directory, filePath, job) {
  const kind = String(job?.kind || "");
  const sourceId = String(job?.sourceId || "");
  if (!kind || !sourceId) throw new Error("Tâche CRM incomplète.");
  return withStoreLock(directory, async () => {
    const jobs = await readJsonArray(filePath);
    const existing = jobs.find((row) => row.kind === kind && row.sourceId === sourceId);
    if (existing) return { job: existing, created: false };
    const now = job.createdAt || new Date().toISOString();
    const row = {
      id: randomUUID(),
      kind,
      sourceId,
      status: "pending",
      attempts: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      nextRetryAt: now,
      sentAt: null,
      receiptId: null,
    };
    jobs.unshift(row);
    await atomicWriteJson(filePath, jobs);
    return { job: row, created: true };
  });
}

export async function listCrmJobs(filePath) {
  return readJsonArray(filePath);
}

async function patchCrmJob(directory, filePath, jobId, patch) {
  return withStoreLock(directory, async () => {
    const jobs = await readJsonArray(filePath);
    const index = jobs.findIndex((row) => row.id === jobId);
    if (index < 0) return null;
    const next = typeof patch === "function" ? patch(jobs[index]) : patch;
    if (!next) return jobs[index];
    jobs[index] = { ...jobs[index], ...next, updatedAt: new Date().toISOString() };
    await atomicWriteJson(filePath, jobs);
    return jobs[index];
  });
}

/**
 * Marque une tâche transmise.
 *
 * Sans cette écriture la tâche resterait « pending » avec un `nextRetryAt`
 * échu, et chaque passage de la file réexpédierait toutes les demandes déjà
 * transmises.
 */
export async function markCrmJobSent(directory, filePath, jobId, receipt = {}) {
  return patchCrmJob(directory, filePath, jobId, {
    status: "sent",
    lastError: null,
    nextRetryAt: null,
    sentAt: new Date().toISOString(),
    receiptId: receipt?.id ? String(receipt.id).slice(0, 64) : null,
    duplicate: Boolean(receipt?.duplicate),
  });
}

export async function markCrmJobError(directory, filePath, jobId, message) {
  return patchCrmJob(directory, filePath, jobId, (current) => {
    const attempts = Number(current.attempts || 0) + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    return {
      status: exhausted ? "failed" : "error",
      attempts,
      lastError: String(message || "Échec de synchronisation").slice(0, 500),
      nextRetryAt: exhausted ? null : new Date(Date.now() + retryDelayMs(attempts)).toISOString(),
    };
  });
}

/**
 * Reprise manuelle depuis l’administration. Une tâche déjà transmise n’est
 * jamais remise en file : ce serait rouvrir la porte aux doublons.
 */
export async function requeueCrmJob(directory, filePath, jobId) {
  return patchCrmJob(directory, filePath, jobId, (current) => {
    if (current.status === "sent") throw new Error("Tâche déjà transmise.");
    return {
      status: "pending",
      attempts: 0,
      lastError: null,
      nextRetryAt: new Date().toISOString(),
    };
  });
}

/**
 * Passage de renvoi. `send` reçoit la tâche et renvoie l’accusé du CRM.
 * Tant que la liaison n’est pas activée, rien n’est envoyé.
 */
export async function processCrmOutbox(directory, filePath, { enabled = false, send, now = Date.now() } = {}) {
  if (!enabled || typeof send !== "function") return { ran: false, sent: 0, failed: 0 };
  const jobs = await listCrmJobs(filePath);
  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    if (job.status === "sent" || job.status === "failed") continue;
    if (job.nextRetryAt && Date.parse(job.nextRetryAt) > now) continue;
    try {
      const receipt = await send(job);
      await markCrmJobSent(directory, filePath, job.id, receipt || {});
      sent += 1;
    } catch (error) {
      await markCrmJobError(directory, filePath, job.id, error?.message || "Échec");
      failed += 1;
    }
  }
  return { ran: true, sent, failed };
}
