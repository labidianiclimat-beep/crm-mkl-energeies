/**
 * Identité d'une soumission, de la réception sur le site jusqu'à l'envoi au CRM.
 *
 * Deux garanties sont vérifiées ici, parce qu'une défaillance de l'une ou de
 * l'autre fausserait tous les indicateurs marketing :
 *
 * 1. Une prise de rendez-vous crée une fiche miroir locale pour l'affichage de
 *    l'administration du site, mais ne met en file qu'une seule tâche. Sans
 *    cela, une seule demande compterait pour deux prospects.
 *
 * 2. L'identifiant envoyé au CRM est celui persisté à la réception, relu à
 *    chaque tentative. Un identifiant régénéré à l'envoi ferait échouer
 *    l'idempotence et créerait un doublon à chaque reprise.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { enqueueCrmJob, listCrmJobs } from "../lib/crm-outbox.mjs";
import { appendAppointmentRecord, appendLeadRecord } from "../lib/lead-records.mjs";
import { buildSignedRequest } from "../lib/crm-sync.mjs";

const SECRET = "secret-de-test-de-plus-de-32-caracteres";

async function store() {
  const directory = await mkdtemp(join(tmpdir(), "mkl-submission-"));
  return {
    directory,
    paths: {
      leadsPath: join(directory, "leads.json"),
      appointmentsPath: join(directory, "appointments.json"),
      outboxPath: join(directory, "outbox.json"),
    },
    async cleanup() {
      await rm(directory, { recursive: true, force: true });
    },
  };
}

async function jsonAt(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return [];
  }
}

test("une demande simple met en file une seule tâche", async () => {
  const { directory, paths, cleanup } = await store();
  try {
    const lead = { id: "lead-1", createdAt: "2026-11-05T10:00:00.000Z", name: "Demande" };
    await appendLeadRecord(directory, paths.leadsPath, paths.outboxPath, lead);
    const jobs = await listCrmJobs(paths.outboxPath);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].kind, "lead");
    assert.equal(jobs[0].sourceId, "lead-1");
    assert.equal(jobs[0].status, "pending");
  } finally {
    await cleanup();
  }
});

test("la même demande reçue deux fois ne crée pas deux tâches", async () => {
  const { directory, paths, cleanup } = await store();
  try {
    const lead = { id: "lead-2", createdAt: "2026-11-05T10:00:00.000Z" };
    const first = await appendLeadRecord(directory, paths.leadsPath, paths.outboxPath, lead);
    const second = await appendLeadRecord(directory, paths.leadsPath, paths.outboxPath, lead);
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal((await listCrmJobs(paths.outboxPath)).length, 1);
    assert.equal((await jsonAt(paths.leadsPath)).length, 1);
  } finally {
    await cleanup();
  }
});

/** Le cœur du sujet : le miroir est écrit localement mais jamais transmis. */
test("une prise de rendez-vous ne met en file que le rendez-vous", async () => {
  const { directory, paths, cleanup } = await store();
  try {
    const appointment = { id: "rdv-1", createdAt: "2026-11-05T10:00:00.000Z" };
    const mirror = { id: "miroir-1", createdAt: "2026-11-05T10:00:00.000Z", appointmentId: "rdv-1" };
    await appendAppointmentRecord(directory, paths, appointment, mirror);

    const jobs = await listCrmJobs(paths.outboxPath);
    assert.equal(jobs.length, 1, "une seule tâche, sinon le prospect compte double");
    assert.equal(jobs[0].kind, "appointment");
    assert.equal(jobs[0].sourceId, "rdv-1");
    assert.equal(
      jobs.some((job) => job.sourceId === "miroir-1"),
      false,
      "la fiche miroir ne doit jamais être transmise"
    );

    const leads = await jsonAt(paths.leadsPath);
    assert.equal(leads.length, 1, "le miroir reste visible dans l'administration du site");
    assert.equal(leads[0].id, "miroir-1");
  } finally {
    await cleanup();
  }
});

test("un rendez-vous rejoué ne duplique ni la tâche ni le miroir", async () => {
  const { directory, paths, cleanup } = await store();
  try {
    const appointment = { id: "rdv-2", createdAt: "2026-11-05T10:00:00.000Z" };
    const mirror = { id: "miroir-2", createdAt: "2026-11-05T10:00:00.000Z" };
    const first = await appendAppointmentRecord(directory, paths, appointment, mirror);
    const second = await appendAppointmentRecord(directory, paths, appointment, mirror);
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal((await listCrmJobs(paths.outboxPath)).length, 1);
    assert.equal((await jsonAt(paths.appointmentsPath)).length, 1);
    assert.equal((await jsonAt(paths.leadsPath)).length, 1);
  } finally {
    await cleanup();
  }
});

test("une demande et un rendez-vous de même identifiant restent deux tâches", async () => {
  const { directory, paths, cleanup } = await store();
  try {
    await enqueueCrmJob(directory, paths.outboxPath, { kind: "lead", sourceId: "x-1" });
    await enqueueCrmJob(directory, paths.outboxPath, { kind: "appointment", sourceId: "x-1" });
    const jobs = await listCrmJobs(paths.outboxPath);
    assert.equal(jobs.length, 2, "le type fait partie de la clé d'idempotence");
  } finally {
    await cleanup();
  }
});

test("une tâche sans type ni identifiant est refusée", async () => {
  const { directory, paths, cleanup } = await store();
  try {
    await assert.rejects(
      () => enqueueCrmJob(directory, paths.outboxPath, { kind: "lead" }),
      /Tâche CRM incomplète/
    );
    await assert.rejects(
      () => enqueueCrmJob(directory, paths.outboxPath, { sourceId: "y-1" }),
      /Tâche CRM incomplète/
    );
    assert.equal((await listCrmJobs(paths.outboxPath)).length, 0);
  } finally {
    await cleanup();
  }
});

/**
 * L'identifiant transmis est relu depuis la tâche persistée. Deux envois de la
 * même tâche doivent produire le même `submissionId`, sinon chaque reprise
 * créerait un prospect de plus.
 */
test("l'identifiant transmis est stable d'une tentative à l'autre", () => {
  const job = { id: "job-1", kind: "lead", sourceId: "lead-stable", createdAt: "2026-11-05T10:00:00.000Z" };
  const record = { id: "lead-stable", name: "Demande", phone: "0612345678" };
  const first = buildSignedRequest({
    job,
    record,
    endpoint: "https://crm.example.test/api/web-leads",
    keyId: "k1",
    secret: SECRET,
  });
  const second = buildSignedRequest({
    job,
    record,
    endpoint: "https://crm.example.test/api/web-leads",
    keyId: "k1",
    secret: SECRET,
  });
  const payloadA = JSON.parse(first.rawBody);
  const payloadB = JSON.parse(second.rawBody);
  assert.equal(payloadA.submissionId, "lead-stable");
  assert.equal(payloadA.submissionId, payloadB.submissionId);
  assert.equal(payloadA.kind, "lead");
});

test("l'identifiant transmis n'est jamais celui de la tâche", () => {
  const job = { id: "job-2", kind: "appointment", sourceId: "rdv-stable", createdAt: "2026-11-05T10:00:00.000Z" };
  const body = JSON.parse(buildSignedRequest({
    job,
    record: { id: "rdv-stable" },
    endpoint: "https://crm.example.test/api/web-leads",
    keyId: "k1",
    secret: SECRET,
  }).rawBody);
  assert.equal(body.submissionId, "rdv-stable");
  assert.notEqual(body.submissionId, job.id);
});

/** Un seul module peut mettre en file : toute autre porte d'entrée serait un risque. */
test("la mise en file n'a qu'un seul point d'entrée", async () => {
  const leadRecords = await readFile(
    fileURLToPath(new URL("../lib/lead-records.mjs", import.meta.url)),
    "utf8"
  );
  const server = await readFile(
    fileURLToPath(new URL("../server.mjs", import.meta.url)),
    "utf8"
  );
  assert.equal((leadRecords.match(/await enqueueCrmJob\(/g) || []).length, 3);
  assert.doesNotMatch(server, /enqueueCrmJob/);
});
