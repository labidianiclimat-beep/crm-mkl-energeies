import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  REFRESH_AHEAD_MS,
  SESSION_IDLE_MESSAGE,
  SESSION_MAX_MS,
  accessTokenMsLeft,
  isSessionExpired,
  nextLastActivityAt,
  sessionStartedAt,
  withSessionActivity,
} from "../app/lib/session-idle.js";

test("une session reste ouverte 8 heures après la connexion", () => {
  const now = Date.parse("2026-09-21T16:00:00.000Z");
  assert.equal(SESSION_MAX_MS, 8 * 60 * 60 * 1000);
  assert.equal(REFRESH_AHEAD_MS, 3 * 60 * 1000);
  assert.equal(isSessionExpired({ connected_at: now - 7 * 60 * 60 * 1000 }, now), false);
  assert.equal(isSessionExpired({ connected_at: now - SESSION_MAX_MS }, now), true);
  assert.equal(isSessionExpired({ connected_at: now - 9 * 60 * 60 * 1000 }, now), true);
  assert.equal(isSessionExpired({ connected_at: 0 }, now), false);
  assert.equal(isSessionExpired({}, now), false);
  assert.equal(isSessionExpired(null, now), false);

  const quietButRecent = {
    connected_at: now - 3 * 60 * 60 * 1000,
    last_activity_at: now - 3 * 60 * 60 * 1000,
  };
  assert.equal(isSessionExpired(quietButRecent, now), false);

  const oldLogin = {
    connected_at: now - SESSION_MAX_MS,
    last_activity_at: now - 5 * 60 * 1000,
  };
  assert.equal(isSessionExpired(oldLogin, now), true);
});

test("le jeton réel est renouvelé avant une date de fin trop lointaine", () => {
  const now = Date.parse("2026-09-21T16:00:00.000Z");
  const stored = Math.floor(now / 1000) + 60 * 60;
  const fiveMinutes = accessTokenMsLeft({
    jwtExp: Math.floor(now / 1000) + 5 * 60,
    expiresAt: stored,
  }, now);
  assert.equal(fiveMinutes, 5 * 60 * 1000);
  const twoMinutes = accessTokenMsLeft({
    jwtExp: Math.floor(now / 1000) + 2 * 60,
    expiresAt: stored,
  }, now);
  assert.equal(twoMinutes <= REFRESH_AHEAD_MS, true);
});

test("une session existante sans horodatage n’est pas expulsée au déploiement", () => {
  const now = 1_000_000;
  assert.equal(nextLastActivityAt({}, now), now);
  assert.equal(nextLastActivityAt({ last_activity_at: 42 }, now), 42);
  assert.equal(sessionStartedAt({}, now), now);
  assert.equal(sessionStartedAt({ connected_at: 42 }, now), 42);
  assert.equal(withSessionActivity({ access_token: "x" }, now).last_activity_at, now);
});

test("la connexion PIN et le portail ferment la session au bout de 8 heures", () => {
  const rest = readFileSync(new URL("../app/lib/supabase-rest.js", import.meta.url), "utf8");
  const gate = readFileSync(new URL("../app/components/crm-access-gate.js", import.meta.url), "utf8");
  const tracker = readFileSync(new URL("../app/components/usage-tracker.js", import.meta.url), "utf8");
  assert.match(rest, /isSessionExpired\(session\)/);
  assert.match(rest, /connected_at/);
  assert.match(rest, /clearExpiredIdleSession/);
  assert.match(rest, /isNetworkFailure\(error\)/);
  assert.match(rest, /refreshFlight/);
  assert.doesNotMatch(rest, /Math\.max\(jwtExp/);
  assert.doesNotMatch(rest, /dropIfRejected/);
  assert.match(gate, /SessionIdleGuard/);
  assert.match(gate, /logoutCrm\(\{ idle: true \}\)/);
  assert.match(gate, /consumeIdleLogoutMessage/);
  assert.match(gate, /sessionIsExpired/);
  assert.doesNotMatch(gate, /if \(!token && !closing\)/);
  assert.match(gate, /forceRefresh: true/);
  assert.doesNotMatch(tracker, /markSessionActivity/);
  assert.equal(SESSION_IDLE_MESSAGE.includes("8 heures"), true);
  assert.equal(SESSION_IDLE_MESSAGE.includes("sans activité"), false);
});
