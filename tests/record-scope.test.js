import test from "node:test";
import assert from "node:assert/strict";
import { mergeOrgStateRecords } from "../app/lib/org-state.js";
import {
  canSeeFieldSalesRecord,
  filterFieldSalesRecords,
  isFieldSalesScopedOrgKey,
  isFieldSalesScopedRecordKind,
  prepareScopedRecordMutation,
  shouldScopeFieldSalesRecords,
  stampRecordOwner,
} from "../app/lib/record-scope.js";
import { canAccessWorkspace } from "../app/lib/access-control.js";

const tony = {
  profile: { role: "Commercial", organization_id: "org" },
  userId: "tony",
  scopedIds: ["tony"],
  teamIds: ["tony"],
  clientIds: new Set(["client-tony"]),
  clientNames: new Set(["maison tony"]),
  quoteIds: new Set(["devis-tony"]),
  quoteNumbers: new Set(["DEV-2026-100"]),
  studyIdsFromQuotes: new Set(["study-from-quote"]),
};

function ctxFor(profile, userId, extra = {}) {
  return {
    profile,
    userId,
    scopedIds: extra.scopedIds,
    teamIds: extra.teamIds || [userId],
    clientIds: extra.clientIds || new Set(),
    clientNames: extra.clientNames || new Set(),
    quoteIds: extra.quoteIds || new Set(),
    quoteNumbers: extra.quoteNumbers || new Set(),
    studyIdsFromQuotes: extra.studyIdsFromQuotes || new Set(),
  };
}

test("commercial et responsable commercial sont scopés, pas le technique", () => {
  assert.equal(shouldScopeFieldSalesRecords({ role: "Commercial" }), true);
  assert.equal(shouldScopeFieldSalesRecords({ role: "Responsable commercial" }), true);
  assert.equal(shouldScopeFieldSalesRecords({ role: "Responsable technique" }), false);
  assert.equal(shouldScopeFieldSalesRecords({ role: "Admin VIP" }), false);
  assert.equal(isFieldSalesScopedRecordKind("pv_projects"), true);
  assert.equal(isFieldSalesScopedRecordKind("thermal_studies"), true);
  assert.equal(isFieldSalesScopedOrgKey("mkl-pv-projects"), true);
  assert.equal(isFieldSalesScopedOrgKey("mkl-pv-simulations"), true);
  assert.equal(isFieldSalesScopedRecordKind("maintenance_contracts"), false);
});

test("un commercial ne voit que ses études solaires", () => {
  const own = { id: "1", commercialId: "tony", name: "Chez Tony" };
  const other = { id: "2", commercialId: "karim", name: "Chez Karim" };
  const viaClient = { id: "3", clientId: "client-tony", name: "Client Tony" };
  const viaQuote = { id: "study-from-quote", name: "Auto devis" };
  const orphan = { id: "9", name: "Sans proprio" };

  assert.equal(canSeeFieldSalesRecord(own, tony), true);
  assert.equal(canSeeFieldSalesRecord(other, tony), false);
  assert.equal(canSeeFieldSalesRecord(viaClient, tony), true);
  assert.equal(canSeeFieldSalesRecord(viaQuote, tony), true);
  assert.equal(canSeeFieldSalesRecord(orphan, tony), false);

  const visible = filterFieldSalesRecords([own, other, viaClient, viaQuote, orphan], tony);
  assert.deepEqual(visible.map(item => item.id), ["1", "3", "study-from-quote"]);
});

test("un responsable commercial voit l équipe, pas toute l entreprise", () => {
  const lead = ctxFor({ role: "Responsable commercial", organization_id: "org" }, "lead", {
    scopedIds: ["lead", "tony"],
    teamIds: ["lead", "tony"],
    clientIds: new Set(["client-tony"]),
  });
  assert.equal(canSeeFieldSalesRecord({ id: "1", commercialId: "tony" }, lead), true);
  assert.equal(canSeeFieldSalesRecord({ id: "2", commercialId: "lead" }, lead), true);
  assert.equal(canSeeFieldSalesRecord({ id: "3", commercialId: "karim" }, lead), false);
});

test("enregistrer ses études ne supprime pas celles des autres", () => {
  const current = [
    { id: "mine", commercialId: "tony", name: "Tony" },
    { id: "theirs", commercialId: "karim", name: "Karim" },
  ];
  const incoming = [{ id: "mine", commercialId: "tony", name: "Tony mis à jour" }];
  const { toDelete, toUpsert } = prepareScopedRecordMutation({
    current,
    incoming,
    deletedIds: [],
    canSee: record => canSeeFieldSalesRecord(record, tony),
    userId: "tony",
    scopedIds: ["tony"],
    stampOwners: true,
  });
  assert.deepEqual(toDelete, []);
  assert.equal(toUpsert.length, 1);
  assert.equal(toUpsert[0].name, "Tony mis à jour");
  assert.equal(toUpsert[0].commercialId, "tony");
  const merged = mergeOrgStateRecords(current, toUpsert, toDelete);
  assert.equal(merged.length, 2);
  assert.equal(merged.find(item => item.id === "theirs").name, "Karim");
});

test("un commercial ne peut pas s attribuer l étude d un collègue", () => {
  const current = [{ id: "theirs", commercialId: "karim", name: "Karim" }];
  const incoming = [{ id: "theirs", commercialId: "tony", name: "Volée" }];
  const { toUpsert } = prepareScopedRecordMutation({
    current,
    incoming,
    deletedIds: [],
    canSee: record => canSeeFieldSalesRecord(record, tony),
    userId: "tony",
    scopedIds: ["tony"],
    stampOwners: true,
  });
  assert.equal(toUpsert.length, 0);
});

test("une nouvelle étude est marquée au commercial", () => {
  const stamped = stampRecordOwner({ id: "new", name: "Chez le client" }, "tony", ["tony"]);
  assert.equal(stamped.commercialId, "tony");
  assert.equal(stamped.createdBy, "tony");
});

test("le commercial n a pas le dossier solaire de toute l entreprise", () => {
  const allowed = ["Photovoltaïque administratif", "Devis", "Clients"];
  assert.equal(canAccessWorkspace(allowed, "Études photovoltaïques", { role: "Commercial" }), true);
  assert.equal(canAccessWorkspace(allowed, "Photovoltaïque administratif", { role: "Commercial" }), false);
  assert.equal(canAccessWorkspace(allowed, "Photovoltaïque administratif", { role: "Responsable commercial" }), true);
});
