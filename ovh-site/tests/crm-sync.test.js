import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendLeadRecord } from "../lib/lead-records.mjs";
import {
  MAX_ATTEMPTS,
  crmSyncEnabled,
  listCrmJobs,
  markCrmJobError,
  markCrmJobSent,
  processCrmOutbox,
  requeueCrmJob,
} from "../lib/crm-outbox.mjs";
import {
  CRM_HEADERS,
  buildCrmPayload,
  buildSignedRequest,
  canonicalString,
  crmSyncConfigured,
  sendCrmJob,
} from "../lib/crm-sync.mjs";

const SECRET = "secret-de-test-suffisamment-long-pour-passer";

async function tempSite() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mkl-sync-"));
  return {
    directory,
    leadsPath: path.join(directory, "leads.json"),
    outboxPath: path.join(directory, "crm-outbox.json"),
  };
}

async function seed(site, id = "lead-1") {
  await appendLeadRecord(site.directory, site.leadsPath, site.outboxPath, {
    id,
    createdAt: "2026-11-04T12:00:00.000Z",
    name: "Ada Lovelace",
    intent: "devis",
    phone: "0612345678",
  });
  const jobs = await listCrmJobs(site.outboxPath);
  return jobs.find(job => job.sourceId === id);
}

const sendOptions = {
  record: { id: "lead-1", name: "Ada" },
  secret: SECRET,
  keyId: "k1",
  endpoint: "https://crm.test/api/web-leads",
};
const sendJob = { kind: "lead", sourceId: "lead-1", createdAt: "2026-11-04T12:00:00.000Z" };

test("une tâche transmise ne repart pas au passage suivant", async () => {
  const site = await tempSite();
  await seed(site);
  let envois = 0;
  const send = () => {
    envois += 1;
    return { id: "crm-1" };
  };

  const premier = await processCrmOutbox(site.directory, site.outboxPath, { enabled: true, send });
  assert.deepEqual([premier.ran, premier.sent, premier.failed], [true, 1, 0]);

  const [apres] = await listCrmJobs(site.outboxPath);
  assert.equal(apres.status, "sent");
  assert.equal(apres.receiptId, "crm-1");
  assert.notEqual(apres.sentAt, null);

  const second = await processCrmOutbox(site.directory, site.outboxPath, { enabled: true, send });
  assert.equal(second.sent, 0);
  assert.equal(envois, 1, "la demande ne doit être transmise qu’une fois");
  await fs.rm(site.directory, { recursive: true, force: true });
});

test("l’accusé du CRM est conservé, duplication comprise", async () => {
  const site = await tempSite();
  const job = await seed(site);
  const saved = await markCrmJobSent(site.directory, site.outboxPath, job.id, {
    id: "crm-42",
    duplicate: true,
  });
  assert.equal(saved.status, "sent");
  assert.equal(saved.receiptId, "crm-42");
  assert.equal(saved.duplicate, true);
  assert.equal(saved.nextRetryAt, null);
  await fs.rm(site.directory, { recursive: true, force: true });
});

test("les réessais s’espacent puis la tâche est abandonnée", async () => {
  const site = await tempSite();
  const job = await seed(site);
  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
    const last = await markCrmJobError(site.directory, site.outboxPath, job.id, "CRM injoignable");
    assert.equal(last.status, "error", `essai ${attempt} devrait rester réessayable`);
    assert.notEqual(last.nextRetryAt, null);
  }
  const abandonnee = await markCrmJobError(site.directory, site.outboxPath, job.id, "CRM injoignable");
  assert.equal(abandonnee.status, "failed");
  assert.equal(abandonnee.attempts, MAX_ATTEMPTS);
  assert.equal(abandonnee.nextRetryAt, null);
  await fs.rm(site.directory, { recursive: true, force: true });
});

test("une tâche abandonnée n’est plus envoyée tant qu’elle n’est pas reprise", async () => {
  const site = await tempSite();
  const job = await seed(site);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await markCrmJobError(site.directory, site.outboxPath, job.id, "panne");
  }
  let envois = 0;
  const send = () => {
    envois += 1;
    return { id: "crm-1" };
  };
  const ignoree = await processCrmOutbox(site.directory, site.outboxPath, { enabled: true, send });
  assert.equal(ignoree.sent, 0);
  assert.equal(envois, 0);

  const reprise = await requeueCrmJob(site.directory, site.outboxPath, job.id);
  assert.equal(reprise.status, "pending");
  assert.equal(reprise.attempts, 0);
  assert.equal(reprise.lastError, null);

  const apres = await processCrmOutbox(site.directory, site.outboxPath, { enabled: true, send });
  assert.equal(apres.sent, 1);
  assert.equal(envois, 1);
  await fs.rm(site.directory, { recursive: true, force: true });
});

test("une tâche déjà transmise ne peut pas être remise en file", async () => {
  const site = await tempSite();
  const job = await seed(site);
  await markCrmJobSent(site.directory, site.outboxPath, job.id, { id: "crm-1" });
  await assert.rejects(() => requeueCrmJob(site.directory, site.outboxPath, job.id), /déjà transmise/);
  const [inchangee] = await listCrmJobs(site.outboxPath);
  assert.equal(inchangee.status, "sent");
  await fs.rm(site.directory, { recursive: true, force: true });
});

test("un échec sur une tâche n’empêche pas les suivantes", async () => {
  const site = await tempSite();
  await seed(site, "lead-a");
  await seed(site, "lead-b");
  const send = (job) => {
    if (job.sourceId === "lead-a") throw new Error("refus");
    return { id: "crm-b" };
  };
  const result = await processCrmOutbox(site.directory, site.outboxPath, { enabled: true, send });
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 1);
  await fs.rm(site.directory, { recursive: true, force: true });
});

test("la liaison reste éteinte sans drapeau ni configuration complète", () => {
  assert.equal(crmSyncEnabled({}), false);
  assert.equal(crmSyncEnabled({ CRM_SYNC_ENABLED: "0" }), false);
  assert.equal(crmSyncEnabled({ CRM_SYNC_ENABLED: "1" }), true);

  assert.equal(crmSyncConfigured({}), false);
  assert.equal(
    crmSyncConfigured({ CRM_SYNC_URL: "https://crm.test/api/web-leads", CRM_SYNC_KEY_ID: "k1" }),
    false
  );
  assert.equal(crmSyncConfigured({
    CRM_SYNC_URL: "https://crm.test/api/web-leads",
    CRM_SYNC_KEY_ID: "k1",
    CRM_SYNC_SECRET: "trop-court",
  }), false);
  assert.equal(crmSyncConfigured({
    CRM_SYNC_URL: "https://crm.test/api/web-leads",
    CRM_SYNC_KEY_ID: "k1",
    CRM_SYNC_SECRET: SECRET,
  }), true);
});

test("la signature couvre la route, l’horodatage, l’aléa et le corps", () => {
  const base = {
    method: "POST",
    path: "/api/web-leads",
    timestamp: "1762250400000",
    nonce: "a".repeat(32),
    rawBody: "{}",
  };
  const reference = canonicalString(base);
  assert.notEqual(canonicalString({ ...base, path: "/api/autre" }), reference);
  assert.notEqual(canonicalString({ ...base, timestamp: "1762250400001" }), reference);
  assert.notEqual(canonicalString({ ...base, nonce: "b".repeat(32) }), reference);
  assert.notEqual(canonicalString({ ...base, rawBody: '{"x":1}' }), reference);
  assert.match(reference, /^v1\nPOST\n/);
});

test("la requête signée ne transporte ni le secret ni de données inutiles", () => {
  const request = buildSignedRequest({
    job: { kind: "lead", sourceId: "lead-1", createdAt: "2026-11-04T12:00:00.000Z" },
    record: {
      id: "lead-1",
      createdAt: "2026-11-04T12:00:00.000Z",
      name: "Ada Lovelace",
      phone: "0612345678",
      intent: "devis",
      ip: "203.0.113.4",
      userAgent: "Mozilla/5.0",
      proofId: "preuve-1",
    },
    secret: SECRET,
    keyId: "k1",
    endpoint: "https://crm.test/api/web-leads",
    nonce: "c".repeat(32),
    now: 1762250400000,
  });

  const serialise = JSON.stringify(request);
  assert.ok(!serialise.includes(SECRET), "le secret ne doit jamais circuler");
  assert.ok(!request.rawBody.includes("203.0.113.4"), "l’adresse IP reste sur le site");
  assert.ok(!request.rawBody.includes("Mozilla"), "l’agent utilisateur reste sur le site");
  assert.ok(!request.rawBody.includes("preuve-1"), "la preuve de consentement reste sur le site");
  assert.equal(request.headers[CRM_HEADERS.keyId], "k1");
  assert.match(request.headers[CRM_HEADERS.signature], /^v1=[0-9a-f]{64}$/);
  assert.equal(request.headers[CRM_HEADERS.timestamp], "1762250400000");
});

test("le corps transmis porte l’identifiant de soumission du site", () => {
  const payload = buildCrmPayload(
    { kind: "appointment", sourceId: "rdv-1" },
    { id: "rdv-1", createdAt: "2026-11-04T12:00:00.000Z", date: "2026-11-10", time: "09:00", status: "confirme" }
  );
  assert.equal(payload.submissionId, "rdv-1");
  assert.equal(payload.kind, "appointment");
  assert.equal(payload.date, "2026-11-10");
  assert.deepEqual(payload.attribution, {});
});

test("une demande introuvable sur le site n’est pas envoyée à l’aveugle", () => {
  assert.throws(() => buildCrmPayload({ kind: "lead", sourceId: "absent" }, null), /introuvable/);
});

test("une panne réseau est réessayable, un refus définitif ne l’est pas", async () => {
  await assert.rejects(
    () => sendCrmJob(sendJob, { ...sendOptions, fetchImpl: () => Promise.reject(new Error("ECONNREFUSED")) }),
    error => error.retryable === true
  );
  await assert.rejects(
    () => sendCrmJob(sendJob, { ...sendOptions, fetchImpl: () => Promise.resolve({ ok: false, status: 401 }) }),
    error => error.retryable === false
  );
  await assert.rejects(
    () => sendCrmJob(sendJob, { ...sendOptions, fetchImpl: () => Promise.resolve({ ok: false, status: 503 }) }),
    error => error.retryable === true
  );
});

test("un accusé de réception incomplet n’est pas pris pour un succès", async () => {
  await assert.rejects(
    () => sendCrmJob(sendJob, {
      ...sendOptions,
      fetchImpl: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }),
    }),
    /incomplet/
  );
  const accuse = await sendCrmJob(sendJob, {
    ...sendOptions,
    fetchImpl: () => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ok: true, id: "crm-9", duplicate: true }),
    }),
  });
  assert.deepEqual(accuse, { id: "crm-9", duplicate: true, receivedAt: null });
});

test("aucun envoi sans secret ni adresse", () => {
  assert.throws(() => buildSignedRequest({ ...sendOptions, job: sendJob, secret: "" }), /Secret/);
  assert.throws(() => buildSignedRequest({ ...sendOptions, job: sendJob, endpoint: "" }), /Adresse/);
  assert.throws(() => buildSignedRequest({ ...sendOptions, job: sendJob, keyId: "" }), /clé/);
});

test("le jeton de contournement s'ajoute à la signature sans la remplacer", () => {
  // La protection Vercel intercepte la requête avant la route d'ingestion :
  // sans ce jeton, le CRM ne voit jamais la signature et rend 401. Le jeton
  // ouvre la porte, la signature authentifie l'émetteur. Les deux doivent
  // coexister, et le jeton ne doit rien changer à la signature.
  const commun = {
    job: { sourceId: "essai-contournement", kind: "lead", createdAt: "2026-11-07T00:00:00.000Z" },
    record: { name: "Essai Fictif", phone: "0600000000" },
    secret: "a".repeat(40),
    keyId: "essai",
    endpoint: "https://exemple.test/api/web-leads",
    nonce: "nonce-fixe",
    now: 1770000000000,
  };
  const sans = buildSignedRequest(commun);
  const avec = buildSignedRequest({ ...commun, bypassToken: "jeton-fictif" });

  assert.equal(avec.headers["x-vercel-protection-bypass"], "jeton-fictif");
  assert.equal(sans.headers["x-vercel-protection-bypass"], undefined);
  // La chaîne canonique ne couvre pas les en-têtes : la signature reste
  // identique, ce qui garantit qu'ajouter le jeton ne casse rien.
  assert.equal(avec.headers["x-mkl-signature"], sans.headers["x-mkl-signature"]);
  assert.equal(avec.rawBody, sans.rawBody);
});

test("un jeton vide ne produit pas d'en-tête vide", () => {
  // Un en-tête présent mais vide serait lu par Vercel comme une tentative de
  // contournement ratée, et pourrait être journalisé comme telle.
  const requete = buildSignedRequest({
    job: { sourceId: "essai-vide", kind: "lead" },
    record: { phone: "0600000000" },
    secret: "b".repeat(40),
    keyId: "essai",
    endpoint: "https://exemple.test/api/web-leads",
    bypassToken: "",
  });
  assert.ok(!("x-vercel-protection-bypass" in requete.headers));
});
