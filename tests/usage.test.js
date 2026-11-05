import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACTIVITY_ACTIONS,
  actionLabel,
  buildActivityLogEntry,
} from "../app/lib/activity-logs.js";
import {
  applyHeartbeat,
  buildUsageReport,
  clampUsageRange,
  defaultUsageRange,
  formatDurationMs,
  IDLE_GAP_MS,
  listDays,
  mergeModules,
  parisDay,
  sessionDurationMs,
  shouldContinueSession,
} from "../app/lib/usage.js";

test("parisDay formate une date civile Europe/Paris", () => {
  assert.equal(parisDay(new Date("2026-09-21T22:30:00.000Z")), "2026-09-22");
  assert.equal(parisDay(new Date("2026-09-21T21:30:00.000Z")), "2026-09-21");
});

test("formatDurationMs et plage de jours", () => {
  assert.equal(formatDurationMs(0), "0 min");
  assert.equal(formatDurationMs(20_000), "moins d’1 min");
  assert.equal(formatDurationMs(60_000), "1 min");
  assert.equal(formatDurationMs(2 * 60 * 60_000 + 14 * 60_000), "2 h 14 min");
  assert.deepEqual(listDays("2026-09-20", "2026-09-21"), ["2026-09-20", "2026-09-21"]);
  const range = defaultUsageRange(new Date("2026-09-21T12:00:00.000Z"));
  assert.equal(range.toDay, "2026-09-21");
  assert.equal(range.fromDay, "2026-09-15");
  const clamped = clampUsageRange("2026-01-01", "2026-03-01");
  assert.equal(clamped.toDay, "2026-03-01");
  assert.equal(listDays(clamped.fromDay, clamped.toDay).length, 31);
});

test("heartbeat continue la session si last_seen < 3 min le même jour", () => {
  const now = new Date("2026-09-21T10:02:00.000Z");
  const existing = {
    id: "s1",
    day: "2026-09-21",
    last_seen_at: "2026-09-21T10:00:00.000Z",
    modules: ["Clients"],
    user_name: "Camille",
  };
  const continued = applyHeartbeat({
    existing,
    now,
    module: "Devis",
    userId: "u1",
    userName: "Camille",
    organizationId: "org",
  });
  assert.equal(continued.type, "update");
  assert.deepEqual(continued.patch.modules, ["Clients", "Devis"]);
  assert.equal(shouldContinueSession(existing.last_seen_at, now.getTime()), true);
  assert.equal(shouldContinueSession(existing.last_seen_at, now.getTime() + IDLE_GAP_MS + 1), false);

  const nextDay = applyHeartbeat({
    existing,
    now: new Date("2026-09-22T08:00:00.000Z"),
    module: "Devis",
    userId: "u1",
    userName: "Camille",
    organizationId: "org",
  });
  assert.equal(nextDay.type, "insert");
  assert.equal(nextDay.row.day, "2026-09-22");
});

test("buildUsageReport agrège durée et actions par utilisateur et par jour", () => {
  const report = buildUsageReport({
    now: Date.parse("2026-09-21T12:00:00.000Z"),
    fromDay: "2026-09-21",
    toDay: "2026-09-21",
    profiles: [
      { id: "u1", full_name: "Camille Martin", role: "Commercial", email: "camille@mkl.fr", active: true },
      { id: "u2", full_name: "Karim Aït", role: "Commercial", email: "karim@mkl.fr", active: true },
    ],
    sessions: [
      {
        user_id: "u1",
        user_name: "Camille Martin",
        day: "2026-09-21",
        started_at: "2026-09-21T08:00:00.000Z",
        last_seen_at: "2026-09-21T10:00:00.000Z",
        last_module: "Devis",
        modules: ["Clients", "Devis"],
      },
    ],
    logs: [
      {
        id: "l1",
        user_id: "u1",
        user_name: "Camille Martin",
        action: ACTIVITY_ACTIONS.DEVIS_CREATE,
        module: "Devis",
        entity_label: "DEV-2026-000001",
        created_at: "2026-09-21T09:10:00.000Z",
      },
    ],
  });
  assert.equal(report.users.length, 2);
  assert.equal(report.users[0].userName, "Camille Martin");
  assert.equal(report.users[0].days[0].modules.includes("Devis"), true);
  assert.equal(report.users[0].days[0].actions[0].label, "Création devis");
  assert.equal(report.users[1].durationLabel, "0 min");
  const live = sessionDurationMs(
    { started_at: "2026-09-21T08:00:00.000Z", last_seen_at: "2026-09-21T08:00:00.000Z" },
    Date.parse("2026-09-21T08:00:20.000Z")
  );
  assert.equal(live, 20_000);
  assert.deepEqual(mergeModules(["Clients"], "Devis"), ["Clients", "Devis"]);
});

test("le rapport d’usage est réservé à l’Admin VIP, le heartbeat à tout compte connecté", () => {
  const report = readFileSync(new URL("../app/api/usage/report/route.js", import.meta.url), "utf8");
  const heartbeat = readFileSync(new URL("../app/api/usage/heartbeat/route.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const journal = readFileSync(new URL("../app/components/activity-journal.js", import.meta.url), "utf8");
  assert.match(report, /isAdminVip/);
  assert.match(report, /Journal réservé à l’Admin VIP/);
  assert.doesNotMatch(heartbeat, /isAdminVip/);
  assert.match(heartbeat, /requireApiSession/);
  assert.match(page, /UsageTracker/);
  assert.match(journal, /Temps passé/);
  assert.match(journal, /\/api\/usage\/report/);
});

test("une connexion PIN est journalisée", () => {
  const login = readFileSync(new URL("../app/api/auth/pin-login/route.js", import.meta.url), "utf8");
  assert.match(login, /SESSION_LOGIN/);
  assert.equal(actionLabel(ACTIVITY_ACTIONS.SESSION_LOGIN), "Connexion");
  const row = buildActivityLogEntry({
    organizationId: "org",
    action: ACTIVITY_ACTIONS.SESSION_LOGIN,
    module: "Connexion",
  });
  assert.equal(row.action, "session.login");
});
