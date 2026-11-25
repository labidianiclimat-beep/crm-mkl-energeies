import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const serverUrl = new URL("../server.mjs", import.meta.url);
const adminUrl = new URL("../admin.js", import.meta.url);

test("le serveur branche le garde-fous, la file et l’envoi signé, sans conversion Ads", async () => {
  const server = await fs.readFile(serverUrl, "utf8");
  const admin = await fs.readFile(adminUrl, "utf8");
  assert.match(server, /servePublicFile\(req, res, ROOT\)/);
  assert.match(server, /appendLeadRecord\(/);
  assert.match(server, /appendAppointmentRecord\(/);
  assert.match(server, /\/api\/crm-outbox/);
  assert.equal(server.includes("generate_lead"), false);
  assert.equal(server.includes("dataLayer"), false);
  assert.match(admin, /Synchro CRM/);
});

/**
 * L’envoi est désormais branché, mais reste inerte sans drapeau ni
 * configuration complète. Ces vérifications portent sur le câblage, pas sur le
 * comportement, qui est couvert par tests/crm-sync.test.js.
 */
test("l’envoi vers le CRM passe par la file et ne part jamais sans configuration", async () => {
  const server = await fs.readFile(serverUrl, "utf8");
  assert.match(server, /processCrmOutbox\(/);
  assert.match(server, /function syncActive\(\)\s*\{\s*return crmSyncEnabled\(\) && crmSyncConfigured\(\);/);
  assert.match(server, /if \(crmSyncRunning \|\| !syncActive\(\)\) return/);
});

test("l’adresse du CRM vient de la configuration, jamais du code", async () => {
  const server = await fs.readFile(serverUrl, "utf8");
  const sync = await fs.readFile(new URL("../lib/crm-sync.mjs", import.meta.url), "utf8");
  assert.equal(server.includes("crm-mkl-energeies.vercel.app"), false);
  assert.equal(sync.includes("crm-mkl-energeies.vercel.app"), false);
  assert.match(sync, /env\.CRM_SYNC_URL/);
  assert.match(sync, /env\.CRM_SYNC_SECRET/);
});

test("aucun secret de synchronisation n’est journalisé", async () => {
  const server = await fs.readFile(serverUrl, "utf8");
  const sync = await fs.readFile(new URL("../lib/crm-sync.mjs", import.meta.url), "utf8");
  for (const source of [server, sync]) {
    for (const line of source.split("\n")) {
      if (!/console\.(log|error|warn)/.test(line)) continue;
      assert.ok(!/secret/i.test(line), `secret journalisé : ${line.trim()}`);
    }
  }
});

test("la reprise manuelle d’une tâche est réservée à l’administration", async () => {
  const server = await fs.readFile(serverUrl, "utf8");
  const retry = server.slice(server.indexOf('pathname.endsWith("/retry")'));
  const bloc = retry.slice(0, retry.indexOf("handleRequeueCrmJob(req, res, id)"));
  assert.match(bloc, /requireAdmin\(req, res\)/);
});
