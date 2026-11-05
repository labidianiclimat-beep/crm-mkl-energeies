import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RECORD_TABLE_BY_ORG_KEY, isFieldSalesScopedRecordKind, isKnownRecordTable } from "../app/lib/record-table-kinds.js";
import { recordToRow, rowToRecord } from "../app/lib/record-tables.js";

test("les dossiers partagés ont une table dédiée", () => {
  assert.equal(isKnownRecordTable("pv_projects"), true);
  assert.equal(RECORD_TABLE_BY_ORG_KEY["mkl-pv-projects"], "pv_projects");
  assert.equal(RECORD_TABLE_BY_ORG_KEY["mkl-thermal-studies"], "thermal_studies");
  assert.equal(RECORD_TABLE_BY_ORG_KEY["mkl-contracts"], "maintenance_contracts");
  assert.equal(RECORD_TABLE_BY_ORG_KEY["mkl-installations"], "installations");
  assert.equal(RECORD_TABLE_BY_ORG_KEY["mkl-technical-visits"], "technical_visits");
  assert.equal(RECORD_TABLE_BY_ORG_KEY["mkl-cost-requests"], "cost_requests");
  assert.equal(RECORD_TABLE_BY_ORG_KEY["mkl-maintenance-reports"], "maintenance_reports");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /useRecordTable\("mkl-pv-projects"\)/);
  assert.match(page, /useRecordTable\("mkl-installations"\)/);
  assert.match(page, /useRecordTable\("mkl-technical-visits"\)/);
  assert.doesNotMatch(page, /useOrgState\("/);
  const route = readFileSync(new URL("../app/api/record-tables/route.js", import.meta.url), "utf8");
  assert.match(route, /requireApiSession/);
  assert.match(route, /recordTableModules/);
  assert.match(route, /scopeFieldSalesRecords/);
  assert.equal(isFieldSalesScopedRecordKind("pv_projects"), true);
  const hook = readFileSync(new URL("../app/lib/use-record-table.js", import.meta.url), "utf8");
  assert.match(hook, /error.code === "FORBIDDEN"/);
  assert.match(hook, /if \(error.code === "FORBIDDEN"\) throw new Error/);
  assert.match(hook, /loadSharedRecordsState/);
  assert.match(hook, /writable.current = !forbidden/);
  assert.match(hook, /if \(!writable.current\)/);
  const first = readFileSync(new URL("../supabase/migrations/20260929_record_tables.sql", import.meta.url), "utf8");
  const next = readFileSync(new URL("../supabase/migrations/20260930_remaining_record_tables.sql", import.meta.url), "utf8");
  assert.match(first, /create table if not exists public.pv_projects/);
  assert.match(next, /technical_visits/);
  assert.match(next, /maintenance_reports/);
});

test("le payload conserve l identifiant et le client", () => {
  const row = recordToRow("org-1", {
    id: 1710000000000,
    clientId: "11111111-1111-4111-8111-111111111111",
    client: "Maison Durand",
    name: "Étude solaire",
    townHallStatus: "Déposé",
    completeStudy: { fluxPngPath: "org-1/1/fluxPng.png" },
  }, "user-1");
  assert.equal(row.record_id, "1710000000000");
  assert.equal(row.client_name, "Maison Durand");
  assert.equal(row.title, "Étude solaire");
  assert.equal(row.status, "Déposé");
  const back = rowToRecord(row);
  assert.equal(back.id, 1710000000000);
  assert.equal(back.client, "Maison Durand");
  assert.equal(back.completeStudy.fluxPngPath, "org-1/1/fluxPng.png");
});
