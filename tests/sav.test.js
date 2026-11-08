import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  availableSavActions,
  decideSavAction,
  formatSavNumber,
  isSavOverdue,
  savPersonName,
  shouldRecordFirstOpen,
  validateCreateInput,
} from "../app/lib/sav.js";
import { grantedModules } from "../app/lib/roles.js";

const CLIENT = "00000000-0000-4000-8000-000000000001";
const OWNER = "00000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-10-03T12:00:00.000Z");

function payload(extra = {}) {
  return {
    clientId: CLIENT,
    subject: "Fuite sous l’unité extérieure",
    description: "Le client signale une fuite depuis ce matin.",
    category: "fuite",
    priority: "urgent",
    channel: "telephone",
    ownerId: OWNER,
    dueAt: "2026-10-04T16:00:00.000Z",
    ...extra,
  };
}

test("le numéro SAV suit MKL-SAV-", () => {
  assert.equal(formatSavNumber(1), "MKL-SAV-00001");
  assert.equal(formatSavNumber(0), "");
  assert.equal(savPersonName("Camille Martin"), "Martin Camille");
});

test("un appel exige client, motif, catégorie, responsable et échéance", () => {
  const created = validateCreateInput(payload());
  assert.equal(created.ok, true);
  assert.equal(created.value.channel, "telephone");
  assert.equal(created.value.priority, "urgent");
  assert.equal(created.value.ownerId, OWNER);
  assert.match(validateCreateInput(payload({ clientId: "" })).error, /client/);
  assert.match(validateCreateInput(payload({ subject: "" })).error, /motif/);
  assert.match(validateCreateInput(payload({ category: "toit" })).error, /catégorie/);
  assert.match(validateCreateInput(payload({ ownerId: "" })).error, /responsable/);
  assert.match(validateCreateInput(payload({ dueAt: "" })).error, /échéance/);
  assert.match(validateCreateInput(payload({ callerPhone: "abc" })).error, /téléphone/);
});

test("le retard est un indicateur, et l’ouverture ne se note qu’une fois", () => {
  const row = { id: CLIENT, status: "new", due_at: "2026-10-03T08:00:00.000Z" };
  assert.equal(isSavOverdue(row, NOW), true);
  assert.equal(isSavOverdue({ ...row, status: "closed" }, NOW), false);
  assert.equal(shouldRecordFirstOpen(row), true);
  assert.equal(shouldRecordFirstOpen({ ...row, opened_at: "2026-10-03T09:00:00.000Z" }), false);
  assert.equal(shouldRecordFirstOpen({ ...row, status: "cancelled" }), false);
});

test("la liste ne marque pas le dossier comme ouvert", () => {
  const server = readFileSync(new URL("../app/lib/sav-server.js", import.meta.url), "utf8");
  const list = server.slice(server.indexOf("export async function listSavCases"), server.indexOf("export async function searchSavClients"));
  assert.equal(list.includes("shouldRecordFirstOpen"), false);
  const detail = server.slice(server.indexOf("export async function getSavCase"));
  assert.match(detail, /shouldRecordFirstOpen/);
  const sql = readFileSync(new URL("../supabase/migrations/20261003_sav.sql", import.meta.url), "utf8");
  assert.match(sql, /grant select, insert on public.sav_events/);
  assert.doesNotMatch(sql, /grant update on public.sav_events/);
  assert.match(sql, /grant execute on function public.assign_sav_number/);
});

test("le secrétariat et le technique voient le SAV, pas le commercial ni le prospecteur", () => {
  const secretariat = grantedModules({
    role: "Secrétariat",
    modules: ["Clients", "Devis"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  });
  assert.ok(secretariat.includes("SAV"));
  const technique = grantedModules({
    role: "Responsable technique",
    modules: ["Planning", "Chantiers"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  });
  assert.ok(technique.includes("SAV"));
  const commercial = grantedModules({
    role: "Commercial",
    modules: ["Clients", "Devis"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  });
  assert.equal(commercial.includes("SAV"), false);
  const prospector = grantedModules({
    role: "Prospecteur terrain",
    modules: ["Prospects"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  });
  assert.deepEqual(prospector, ["Prospects"]);
});

const CASE_ID = "00000000-0000-4000-8000-000000000010";
const CREATOR = "00000000-0000-4000-8000-000000000003";

test("la prise en charge, l’attente, le contrôle et la clôture suivent les motifs", () => {
  let row = {
    id: CASE_ID,
    number: 1,
    subject: "Fuite",
    status: "new",
    owner_id: OWNER,
    created_by: CREATOR,
    due_at: "2026-10-05T16:00:00.000Z",
    result_comment: "",
    client_informed: false,
    reopen_count: 0,
  };
  const now = new Date("2026-10-04T10:00:00.000Z");
  function step(action, userId, canManage, input = {}) {
    const decision = decideSavAction(row, action, { userId, canManage, input, now });
    assert.equal(decision.ok, true, decision.error || action);
    row = { ...row, ...decision.patch };
    return decision;
  }
  assert.match(decideSavAction(row, "accept", { userId: CREATOR, input: {}, now }).error, /responsable/);
  step("accept", OWNER, false);
  assert.equal(row.status, "accepted");
  assert.match(decideSavAction(row, "wait", { userId: OWNER, input: {}, now }).error, /motif/);
  assert.match(decideSavAction(row, "block", { userId: OWNER, input: {}, now }).error, /blocage/);
  step("wait", OWNER, false, { reason: "Pièce en commande", waitFor: "le fournisseur", waitUntil: "2026-10-08", side: "internal" });
  assert.equal(row.status, "waiting_internal");
  assert.equal(row.wait_until, "2026-10-08");
  step("start", OWNER, false);
  assert.match(decideSavAction(row, "submit", { userId: OWNER, input: {}, now }).error, /compte rendu/);
  step("report", OWNER, false, { result: "Joint remplacé." });
  step("submit", OWNER, false);
  assert.equal(row.status, "to_review");
  assert.match(decideSavAction(row, "control", { userId: OWNER, canManage: false, input: {}, now }).error, /responsable SAV/);
  step("control", CREATOR, true);
  assert.ok(row.reviewed_at);
  assert.match(decideSavAction(row, "close", { userId: CREATOR, canManage: true, input: {}, now }).error, /résolu|informé/);
  step("resolve", OWNER, false);
  assert.equal(row.status, "resolved");
  assert.match(decideSavAction(row, "close", { userId: CREATOR, canManage: true, input: {}, now }).error, /informé/);
  step("inform", CREATOR, true);
  step("close", CREATOR, true);
  assert.equal(row.status, "closed");
  assert.match(decideSavAction(row, "reopen", { userId: CREATOR, canManage: true, input: {}, now }).error, /motif/);
  const reopened = step("reopen", CREATOR, true, { reason: "La fuite est revenue." });
  assert.equal(reopened.event.kind, "reopened");
  assert.equal(row.reopen_count, 1);
  assert.equal(row.reviewed_at, null);
  const fresh = { ...row, status: "accepted", owner_id: OWNER, created_by: CREATOR };
  assert.ok(availableSavActions(fresh, { userId: OWNER, canManage: false }).includes("wait"));
  assert.equal(availableSavActions({ ...fresh, status: "new" }, { userId: OWNER }).includes("accept"), true);
  assert.equal(availableSavActions({ ...fresh, status: "new" }, { userId: CREATOR, canManage: true }).includes("accept"), false);
});
