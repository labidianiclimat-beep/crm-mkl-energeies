import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendAppointmentRecord, appendLeadRecord } from "../lib/lead-records.mjs";
import { listCrmJobs, markCrmJobError, processCrmOutbox } from "../lib/crm-outbox.mjs";

async function tempSite() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mkl-store-"));
  return {
    directory,
    leadsPath: path.join(directory, "leads.json"),
    appointmentsPath: path.join(directory, "appointments.json"),
    outboxPath: path.join(directory, "crm-outbox.json"),
  };
}

test("des demandes simultanées conservent l’historique et n’effacent rien", async () => {
  const site = await tempSite();
  const historical = [
    { id: "hist-1", name: "Existant Un", status: "contacte" },
    { id: "hist-2", name: "Existant Deux", status: "traite" },
  ];
  await fs.writeFile(site.leadsPath, `${JSON.stringify(historical, null, 2)}\n`);

  await Promise.all(
    Array.from({ length: 30 }, (_, index) =>
      appendLeadRecord(site.directory, site.leadsPath, site.outboxPath, {
        id: `new-${index}`,
        createdAt: "2026-11-04T12:00:00.000Z",
        name: `Nouveau ${index}`,
        status: "nouveau",
        intent: index % 2 ? "rappel" : "devis",
      })
    )
  );

  const leads = JSON.parse(await fs.readFile(site.leadsPath, "utf8"));
  const ids = leads.map((row) => row.id);
  assert.equal(new Set(ids).size, 32);
  assert.equal(ids.includes("hist-1"), true);
  assert.equal(ids.includes("hist-2"), true);
  assert.equal(leads.find((row) => row.id === "hist-1").status, "contacte");
  const jobs = await listCrmJobs(site.outboxPath);
  assert.equal(jobs.length, 30);
  assert.equal(jobs.every((job) => job.kind === "lead" && job.status === "pending"), true);
  await fs.rm(site.directory, { recursive: true, force: true });
});

test("des rendez-vous simultanés ne se perdent pas et ne se dédoublent pas", async () => {
  const site = await tempSite();
  const paths = {
    appointmentsPath: site.appointmentsPath,
    leadsPath: site.leadsPath,
    outboxPath: site.outboxPath,
  };
  await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      appendAppointmentRecord(
        site.directory,
        paths,
        {
          id: `rdv-${index}`,
          createdAt: "2026-11-04T12:00:00.000Z",
          status: "confirme",
          date: "2026-11-10",
          time: "09:00",
          name: `Client ${index}`,
        },
        {
          id: `mirror-${index}`,
          source: "rdv",
          intent: "rdv",
          appointmentId: `rdv-${index}`,
          name: `Client ${index}`,
        }
      )
    )
  );

  const appointments = JSON.parse(await fs.readFile(site.appointmentsPath, "utf8"));
  const leads = JSON.parse(await fs.readFile(site.leadsPath, "utf8"));
  assert.equal(appointments.length, 20);
  assert.equal(new Set(appointments.map((row) => row.id)).size, 20);
  assert.equal(leads.length, 20);
  assert.equal(new Set(leads.map((row) => row.appointmentId)).size, 20);

  await appendAppointmentRecord(
    site.directory,
    paths,
    appointments[0],
    { id: leads[0].id, appointmentId: appointments[0].id, source: "rdv" }
  );
  const again = JSON.parse(await fs.readFile(site.appointmentsPath, "utf8"));
  const jobs = await listCrmJobs(site.outboxPath);
  assert.equal(again.length, 20);
  assert.equal(jobs.length, 20);
  assert.equal(jobs.every((job) => job.kind === "appointment"), true);
  await fs.rm(site.directory, { recursive: true, force: true });
});

test("un fichier illisible n’est pas réinitialisé", async () => {
  const site = await tempSite();
  const broken = "{ceci n’est pas une liste";
  await fs.writeFile(site.leadsPath, broken);
  await assert.rejects(() =>
    appendLeadRecord(site.directory, site.leadsPath, site.outboxPath, {
      id: "x",
      createdAt: "2026-11-04T12:00:00.000Z",
    })
  );
  assert.equal(await fs.readFile(site.leadsPath, "utf8"), broken);
  await fs.rm(site.directory, { recursive: true, force: true });
});

test("la file CRM enregistre l’échec et n’envoie rien tant qu’elle est éteinte", async () => {
  const site = await tempSite();
  await appendLeadRecord(site.directory, site.leadsPath, site.outboxPath, {
    id: "lead-1",
    createdAt: "2026-11-04T12:00:00.000Z",
    name: "Ada",
  });
  let calls = 0;
  const idle = await processCrmOutbox(site.directory, site.outboxPath, {
    enabled: false,
    send() {
      calls += 1;
    },
  });
  assert.equal(idle.ran, false);
  assert.equal(calls, 0);
  const [job] = await listCrmJobs(site.outboxPath);
  const failed = await markCrmJobError(site.directory, site.outboxPath, job.id, "CRM injoignable");
  assert.equal(failed.status, "error");
  assert.equal(failed.attempts, 1);
  assert.equal(failed.lastError, "CRM injoignable");
  assert.equal(Number.isNaN(Date.parse(failed.nextRetryAt)), false);
  await fs.rm(site.directory, { recursive: true, force: true });
});
