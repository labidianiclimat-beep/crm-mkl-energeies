import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptySaleBook } from "../app/lib/commercial-sale.js";
import { runSaleRequest } from "../app/lib/commercial-sale-flow.js";
import { PILOT_MANAGER_CONFIRM_BY_ROLE, signaturePermissions } from "../app/lib/commercial-sale-pilot.js";
import { ACTIVITY_ACTIONS, modulesEqual } from "../app/lib/activity-logs.js";
import {
  SIGNED_QUOTE_VALIDATION,
  assertAssignableAccess,
  persistProfileAccess,
} from "../app/lib/roles.js";

const pdf = Buffer.from("%PDF-1.4\npreuve-droit");
const date = "2026-11-13";
const now = new Date("2026-11-13T12:00:00.000Z").getTime();
const grant = [SIGNED_QUOTE_VALIDATION];
const commercial = { id: "commercial-1", role: "Commercial", full_name: "Camille Martin", active: true, onboarding_completed_at: "2026-01-01" };
const colleague = { id: "commercial-2", role: "Commercial", full_name: "Autre vendeur", active: true, onboarding_completed_at: "2026-01-01" };
const responsable = { id: "resp-1", role: "Responsable commercial", full_name: "Rita Conseil", active: true, onboarding_completed_at: "2026-01-01" };
const responsableGrant = { ...responsable, actions: grant };
const commercialGrant = { ...commercial, modules: ["Devis", SIGNED_QUOTE_VALIDATION] };
const direction = { id: "dir-1", role: "Direction", full_name: "Direction", active: true, onboarding_completed_at: "2026-01-01" };
const admin = { id: "admin-1", role: "Admin VIP", full_name: "Admin", active: true, onboarding_completed_at: "2026-01-01" };
const superadmin = { id: "super-1", role: "Superadmin", full_name: "Super", active: true, onboarding_completed_at: "2026-01-01" };

function recorded(extra = {}) {
  return {
    id: "devis-1",
    organizationId: "org",
    kind: "Devis",
    totalTtc: 21655.98,
    commercialId: commercial.id,
    sourceProspectId: "prospect-1",
    status: "Envoyé",
    ...extra,
  };
}

function call(action, actor, book, extra = {}) {
  return runSaleRequest({
    profile: actor,
    user: { id: extra.userId || actor.id },
    action,
    recorded: extra.recorded || recorded(),
    body: extra.body || {},
    book,
    now,
    mode: extra.mode,
    pilot: extra.pilot,
    pilotManagerByRole: extra.pilotManagerByRole,
  });
}

test("seuls les administrateurs confirment sans case, et la case ouvre les autres", async () => {
  const deposited = await call("demande", commercial, emptySaleBook(), {
    body: { kind: "devis_signe", declaredSignatureDate: date, pdfBase64: pdf.toString("base64") },
  });
  assert.equal(deposited.status, 200);
  assert.equal(deposited.body.sync.devisStatus, "inchangé");
  assert.equal(deposited.body.sync.opportunityStage, null);

  for (const actor of [responsable, commercial, direction, { ...commercialGrant, active: false }]) {
    const refused = await call("confirmer", actor, deposited.book);
    assert.equal(refused.status, 403, actor.role || actor.id);
    assert.equal(refused.persist, false);
  }

  for (const actor of [admin, superadmin, responsableGrant, commercialGrant]) {
    const confirmed = await call("confirmer", actor, deposited.book);
    assert.equal(confirmed.status, 200, actor.role);
    assert.equal(confirmed.sale.status, "confirmee");
    assert.equal(confirmed.sale.amountTtc, 21655.98);
    assert.equal(confirmed.body.sync.devisStatus, "Accepté");
    assert.equal(confirmed.body.sync.opportunityStage, "Gagné");
    assert.equal(confirmed.body.sync.clientStatut, "inchangé");
    assert.equal(confirmed.body.totals.net, 21655.98);
  }
});

test("un commercial ne dépose pas le devis d’un collègue, même avec un identifiant annoncé", async () => {
  const stolen = await call("demande", colleague, emptySaleBook(), {
    body: {
      kind: "devis_signe",
      declaredSignatureDate: date,
      pdfBase64: pdf.toString("base64"),
      userId: commercial.id,
      role: "Superadmin",
      commercialId: commercial.id,
    },
  });
  assert.equal(stolen.status, 403);
  assert.equal(stolen.persist, false);
  const inactive = await call("demande", { ...commercial, active: false }, emptySaleBook(), {
    body: { kind: "devis_signe", declaredSignatureDate: date, pdfBase64: pdf.toString("base64") },
  });
  assert.equal(inactive.status, 403);
  const pending = await call("demande", { ...commercial, onboarding_completed_at: null }, emptySaleBook(), {
    body: { kind: "devis_signe", declaredSignatureDate: date, pdfBase64: pdf.toString("base64") },
  });
  assert.equal(pending.status, 403);
});

test("la case d’un troisième compte n’ouvre pas le pilote", async () => {
  assert.equal(PILOT_MANAGER_CONFIRM_BY_ROLE, true);
  const pilot = {
    valid: true,
    commercialId: "b8230f67-2bc0-4a9b-b569-3f824c299b84",
    managerId: "f9562652-1ad4-40b5-9c55-318a83ef0476",
  };
  const byron = { id: pilot.commercialId, role: "Commercial", full_name: "Byron PFALZGRAF", organization_id: "mkl", active: true, onboarding_completed_at: "2026-01-01" };
  const ouahib = { id: pilot.managerId, role: "Responsable commercial", full_name: "Ouahib EL OUARIACHI", organization_id: "mkl", active: true, onboarding_completed_at: "2026-01-01" };
  const third = { ...responsableGrant, id: "99999999-9999-4999-8999-999999999999", actions: grant, modules: grant };
  const devis = recorded({ id: "devis-pilote", commercialId: byron.id, organizationId: "mkl" });
  const deposit = await call("demande", byron, emptySaleBook(), {
    mode: "pilote",
    pilot,
    recorded: devis,
    body: { kind: "devis_signe", declaredSignatureDate: date, pdfBase64: pdf.toString("base64"), userId: third.id, role: "Admin VIP" },
  });
  assert.equal(deposit.status, 200);
  assert.equal(deposit.sale.requestedBy, byron.id);
  const outsider = await call("confirmer", third, deposit.book, { mode: "pilote", pilot, recorded: devis });
  assert.equal(outsider.status, 403);
  assert.equal(outsider.persist, false);
  const kept = await call("confirmer", ouahib, deposit.book, { mode: "pilote", pilot, recorded: devis });
  assert.equal(kept.status, 200);
  assert.equal(kept.sale.confirmedBy, ouahib.id);
  const ready = signaturePermissions({
    mode: "pilote",
    profile: { ...ouahib, actions: grant },
    userId: ouahib.id,
    devis,
    pilot,
    pilotManagerByRole: false,
  });
  assert.equal(ready.confirm, true);
  const removed = signaturePermissions({
    mode: "pilote",
    profile: ouahib,
    userId: ouahib.id,
    devis,
    pilot,
    pilotManagerByRole: false,
  });
  assert.equal(removed.confirm, false);
  const thirdReady = signaturePermissions({
    mode: "pilote",
    profile: third,
    userId: third.id,
    devis,
    pilot,
    pilotManagerByRole: false,
  });
  assert.equal(thirdReady.confirm, false);
  assert.equal(thirdReady.request, false);
});

test("la case survit au changement de rôle et le journal voit l’écart", () => {
  const existing = ["Devis", "Clients", SIGNED_QUOTE_VALIDATION];
  const kept = persistProfileAccess({
    role: "Direction",
    modules: ["Devis", "Clients"],
    roleChange: true,
    existingModules: existing,
    actorRole: "Superadmin",
  });
  assert.ok(kept.includes(SIGNED_QUOTE_VALIDATION));
  const removed = persistProfileAccess({
    role: "Direction",
    modules: ["Devis"],
    actions: [],
    existingModules: existing,
    actorRole: "Admin VIP",
  });
  assert.equal(removed.includes(SIGNED_QUOTE_VALIDATION), false);
  assert.equal(modulesEqual(existing, removed), false);
  const granted = persistProfileAccess({
    role: "Commercial",
    modules: ["Devis"],
    actions: grant,
    existingModules: ["Devis"],
    actorRole: "Superadmin",
  });
  assert.ok(granted.includes(SIGNED_QUOTE_VALIDATION));
  const blocked = persistProfileAccess({
    role: "Commercial",
    modules: ["Devis"],
    actions: grant,
    existingModules: ["Devis"],
    actorRole: "Responsable commercial",
  });
  assert.equal(blocked.includes(SIGNED_QUOTE_VALIDATION), false);
  assert.equal(assertAssignableAccess({
    actorRole: "Commercial",
    nextRole: "Commercial",
    existingRole: "Commercial",
    nextActions: grant,
    existingActions: ["Devis"],
  }).ok, false);
  assert.equal(assertAssignableAccess({
    actorRole: "Superadmin",
    nextRole: "Commercial",
    existingRole: "Commercial",
    nextActions: grant,
    existingActions: ["Devis"],
  }).ok, true);
  assert.equal(assertAssignableAccess({
    actorRole: "Admin VIP",
    nextRole: "Responsable commercial",
    existingRole: "Responsable commercial",
    nextActions: [],
    existingActions: existing,
  }).ok, true);
  const users = readFileSync(new URL("../app/api/users/[id]/route.js", import.meta.url), "utf8");
  const screen = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const pin = readFileSync(new URL("../app/api/users/resend-pin/route.js", import.meta.url), "utf8");
  const sql = readFileSync(new URL("../supabase/migrations/20261114130500_devis_signature_permission.sql", import.meta.url), "utf8");
  assert.match(users, /USER_PERMISSIONS_CHANGE/);
  assert.equal(ACTIVITY_ACTIONS.USER_PERMISSIONS_CHANGE, "user.permissions_change");
  assert.match(screen, /Valider les devis signés/);
  assert.match(screen, /actorIsAdmin/);
  assert.match(pin, /actions: \[\]/);
  assert.match(sql, /NON APPLIQUÉE/);
  assert.match(sql, /action:validate_signed_quote/);
  assert.match(sql, /commercial_id is distinct from p_actor_id/);
  assert.match(sql, /'Accepté'/);
  assert.match(sql, /'Gagné'/);
  assert.doesNotMatch(sql, /update\s+public\.clients/i);
  assert.doesNotMatch(sql, /Responsable commercial/);
});
