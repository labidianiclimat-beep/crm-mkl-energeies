import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  advanceStatuerAlert,
  dismissStatuerAlert,
  isOverdueUnstatuedAppointment,
  overdueUnstatuedAppointments,
  readStatuerAlert,
  receivesStatuerAlerts,
  statuerAlertCopy,
  statuerAlertShows,
  statuerAlertStorageKey,
  writeStatuerAlert,
  STATUER_DELAY_MS,
} from "../app/lib/rdv-statuer-alert.js";

const HOUR = 60 * 60 * 1000;
const now = Date.parse("2026-10-26T18:00:00.000Z");

function visit(overrides = {}) {
  return {
    id: "a1",
    kind: "rendez-vous",
    status: "Non statué",
    commercialId: "commercial-1",
    start: new Date(now - STATUER_DELAY_MS - HOUR).toISOString(),
    prospectName: "Martin",
    ...overrides,
  };
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

test("cinq heures après l’heure prévue, le rendez-vous non statué du commercial est en retard", () => {
  const item = visit();
  assert.equal(isOverdueUnstatuedAppointment(item, "commercial-1", now), true);
  assert.equal(isOverdueUnstatuedAppointment(item, "commercial-1", Date.parse(item.start) + STATUER_DELAY_MS - 1), false);
  assert.equal(isOverdueUnstatuedAppointment(visit({ commercialId: "autre" }), "commercial-1", now), false);
  assert.equal(isOverdueUnstatuedAppointment(visit({ status: "Client absent" }), "commercial-1", now), false);
  assert.equal(isOverdueUnstatuedAppointment(visit({ kind: "rappel" }), "commercial-1", now), false);
  assert.equal(isOverdueUnstatuedAppointment(visit({ kind: "formation" }), "commercial-1", now), false);
  assert.equal(isOverdueUnstatuedAppointment(visit({ source: "google", kind: "rendez-vous" }), "commercial-1", now), false);
});

test("la file ne garde que les rendez-vous en retard du commercial, du plus ancien au plus récent", () => {
  const rows = overdueUnstatuedAppointments([
    visit({ id: "late", start: new Date(now - STATUER_DELAY_MS - 2 * HOUR).toISOString() }),
    visit({ id: "soon", start: new Date(now - HOUR).toISOString() }),
    visit({ id: "other", commercialId: "autre" }),
    visit({ id: "older", start: new Date(now - STATUER_DELAY_MS - 5 * HOUR).toISOString() }),
  ], "commercial-1", now);
  assert.deepEqual(rows.map(item => item.id), ["older", "late"]);
});

test("chaque nouvelle connexion monte d’un cran, jusqu’au blocage", () => {
  let record = advanceStatuerAlert(null, { connectionId: "c1", hasOverdue: true });
  assert.equal(record.step, 1);
  record = advanceStatuerAlert(record, { connectionId: "c1", hasOverdue: true });
  assert.equal(record.step, 1);
  record = advanceStatuerAlert(record, { connectionId: "c2", hasOverdue: true });
  assert.equal(record.step, 2);
  record = advanceStatuerAlert(record, { connectionId: "c3", hasOverdue: true });
  assert.equal(record.step, 3);
  record = advanceStatuerAlert(record, { connectionId: "c4", hasOverdue: true });
  assert.equal(record.step, 3);
  assert.equal(statuerAlertShows(record, 1), true);
  assert.equal(dismissStatuerAlert(record).dismissed, false);
});

test("une alerte fermée revient à la connexion suivante, et le compteur repart après statut", () => {
  let record = advanceStatuerAlert(null, { connectionId: "c1", hasOverdue: true });
  record = dismissStatuerAlert(record);
  assert.equal(statuerAlertShows(record, 2), false);
  record = advanceStatuerAlert(record, { connectionId: "c1", hasOverdue: true });
  assert.equal(record.step, 1);
  assert.equal(record.dismissed, true);
  record = advanceStatuerAlert(record, { connectionId: "c1", hasOverdue: false });
  assert.equal(record.step, 0);
  record = advanceStatuerAlert(record, { connectionId: "c1", hasOverdue: true });
  assert.equal(record.step, 0);
  record = advanceStatuerAlert(record, { connectionId: "c2", hasOverdue: true });
  assert.equal(record.step, 1);
});

test("les phrases suivent le cran et le nombre de rendez-vous", () => {
  assert.match(statuerAlertCopy(1, 1), /Première alerte/);
  assert.match(statuerAlertCopy(2, 2), /Deuxième alerte/);
  assert.match(statuerAlertCopy(3, 1), /Pour continuer à utiliser votre espace CRM/);
  assert.match(statuerAlertCopy(3, 2), /les rendez-vous ci-dessous/);
});

test("seul un commercial connecté pour lui-même reçoit les alertes", () => {
  const commercial = { role: "Commercial", active: true, onboarding_completed_at: "2026-01-01" };
  assert.equal(receivesStatuerAlerts(commercial), true);
  assert.equal(receivesStatuerAlerts({ ...commercial, role: "Responsable commercial" }), false);
  assert.equal(receivesStatuerAlerts({ ...commercial, role: "Admin VIP" }), false);
  assert.equal(receivesStatuerAlerts({ ...commercial, previewUserId: "vue" }), false);
});

test("le cran est mémorisé par commercial", () => {
  const storage = memoryStorage();
  writeStatuerAlert(storage, "commercial-1", { step: 2, connectionId: "c2", dismissed: false });
  assert.equal(readStatuerAlert(storage, "commercial-1").step, 2);
  assert.equal(readStatuerAlert(storage, "commercial-2").step, 0);
  assert.equal(statuerAlertStorageKey("commercial-1"), "mkl-rdv-statuer:commercial-1");
});

test("l’espace commercial affiche l’alerte de rendez-vous non statué", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const view = readFileSync(new URL("../app/components/rdv-statuer-alert.js", import.meta.url), "utf8");
  const lib = readFileSync(new URL("../app/lib/rdv-statuer-alert.js", import.meta.url), "utf8");
  assert.match(page, /RdvStatuerAlert/);
  assert.match(view, /Rendez-vous à statuer/);
  assert.match(lib, /Pour continuer à utiliser votre espace CRM/);
});
