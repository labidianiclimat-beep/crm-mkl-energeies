import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCommercialScopeFilter,
  canViewOrgWideCommercialData,
  canViewTeamCommercialData,
  resolveScopedCommercialIds,
} from "../app/lib/scoping.js";
import { canViewAllClients } from "../app/lib/clients.js";
import { canViewAllDevis } from "../app/lib/devis.js";

test("commercial sees only self scope", () => {
  const profile = { role: "Commercial" };
  assert.equal(canViewOrgWideCommercialData(profile), false);
  assert.equal(canViewTeamCommercialData(profile), false);
  assert.deepEqual(resolveScopedCommercialIds(profile, "u1", ["u2"]), ["u1"]);
});

test("responsable commercial sees team scope not org-wide", () => {
  const profile = { role: "Responsable commercial" };
  assert.equal(canViewAllClients(profile), false);
  assert.equal(canViewAllDevis(profile), false);
  assert.equal(canViewTeamCommercialData(profile), true);
  assert.deepEqual(resolveScopedCommercialIds(profile, "lead", ["lead", "c1"]).sort(), ["c1", "lead"]);
});

test("admin and secretariat see org-wide", () => {
  assert.equal(canViewOrgWideCommercialData({ role: "Admin VIP" }), true);
  assert.equal(canViewOrgWideCommercialData({ role: "Secrétariat" }), true);
  assert.equal(resolveScopedCommercialIds({ role: "Direction" }, "u1"), null);
});

test("builds postgrest or filter for scoped ids", () => {
  const filter = buildCommercialScopeFilter(["commercial_id", "created_by"], ["a", "b"]);
  assert.match(filter, /commercial_id\.eq\.a/);
  assert.match(filter, /created_by\.eq\.b/);
  assert.equal(buildCommercialScopeFilter(["commercial_id"], null), "");
});
