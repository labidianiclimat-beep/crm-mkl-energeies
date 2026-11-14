import test from "node:test";
import assert from "node:assert/strict";
import { emptySaleBook } from "../app/lib/commercial-sale.js";
import { runSaleRequest, saleView } from "../app/lib/commercial-sale-flow.js";
import { sameSignatureOrganization, signatureActorIdentity, signaturePermissions } from "../app/lib/commercial-sale-pilot.js";
import { signatureObjectName } from "../app/lib/commercial-sale-remote.js";

const pdf = Buffer.from("%PDF-1.4\npreuve-pilote");
const date = "2026-11-13";
const commercialId = "11111111-1111-4111-8111-111111111111";
const managerId = "22222222-2222-4222-8222-222222222222";
const otherCommercialId = "33333333-3333-4333-8333-333333333333";
const otherManagerId = "44444444-4444-4444-8444-444444444444";
const org = "55555555-5555-4555-8555-555555555555";
const pilot = { valid: true, commercialId, managerId };
const mode = "pilote";

const commercial = { id: commercialId, role: "Commercial", full_name: "Camille Pilote", organization_id: org };
const manager = { id: managerId, role: "Responsable commercial", full_name: "Rita Pilote", organization_id: org };
const otherCommercial = { id: otherCommercialId, role: "Commercial", full_name: "Autre commercial", organization_id: org };
const otherManager = { id: otherManagerId, role: "Responsable commercial", full_name: "Autre responsable", organization_id: org };
const admin = { id: "66666666-6666-4666-8666-666666666666", role: "Admin VIP", full_name: "Admin", organization_id: org };
const superadmin = { id: "77777777-7777-4777-8777-777777777777", role: "Superadmin", full_name: "Superadmin", organization_id: org };
const direction = { id: "88888888-8888-4888-8888-888888888888", role: "Direction", full_name: "Direction", organization_id: org };

function recorded(extra = {}) {
  return {
    id: "devis-pilote",
    organizationId: org,
    kind: "Devis",
    totalTtc: 12000,
    commercialId,
    sourceProspectId: "prospect-pilote",
    status: "Envoyé",
    ...extra,
  };
}

function call(action, actor, book, extra = {}) {
  return runSaleRequest({
    profile: actor,
    user: { id: actor.id },
    action,
    recorded: extra.recorded || recorded(),
    body: extra.body || {},
    book,
    now: new Date("2026-11-13T12:00:00.000Z").getTime(),
    mode,
    pilot,
  });
}

test("le pilote ignore l’identité annoncée par le navigateur", async () => {
  const spoofed = await call("confirmer", otherCommercial, emptySaleBook(), {
    body: {
      MKL_SIGNATURE_PILOT_COMMERCIAL_ID: commercialId,
      MKL_SIGNATURE_PILOT_MANAGER_ID: managerId,
      userId: managerId,
      actorId: managerId,
    },
  });
  assert.equal(spoofed.status, 403);
  assert.equal(spoofed.persist, false);
  const preview = signatureActorIdentity({
    realUserId: admin.id,
    user: { id: commercialId },
    profile: {
      id: commercialId,
      role: "Commercial",
      realRole: "Admin VIP",
      realUserId: admin.id,
      organization_id: org,
    },
  });
  assert.equal(preview.userId, admin.id);
  assert.equal(preview.profile.role, "Admin VIP");
  assert.equal(signaturePermissions({
    mode,
    profile: preview.profile,
    userId: preview.userId,
    devis: recorded(),
    pilot,
  }).read, false);
});

test("seul le couple pilote agit, et seulement sur les devis du commercial pilote", async () => {
  const deposit = await call("demande", commercial, emptySaleBook(), {
    body: { kind: "devis_signe", declaredSignatureDate: date, pdfBase64: pdf.toString("base64") },
  });
  assert.equal(deposit.status, 200);
  assert.equal(deposit.sale.commercialId, commercialId);
  assert.equal(deposit.sale.amountTtc, 12000);
  assert.equal(deposit.body.sync.devisStatus, "inchangé");

  for (const actor of [commercial, otherCommercial, otherManager, admin, superadmin, direction]) {
    const confirm = await call("confirmer", actor, deposit.book);
    assert.equal(confirm.persist, false, actor.role);
  }
  const colleagueDevis = await call("demande", commercial, emptySaleBook(), {
    recorded: recorded({ id: "devis-collegue", commercialId: otherCommercialId }),
    body: { kind: "devis_signe", declaredSignatureDate: date, pdfBase64: pdf.toString("base64") },
  });
  assert.equal(colleagueDevis.status, 403);

  const otherDeposit = await call("demande", otherCommercial, emptySaleBook(), {
    recorded: recorded({ commercialId: otherCommercialId }),
    body: { kind: "devis_signe", declaredSignatureDate: date, pdfBase64: pdf.toString("base64") },
  });
  assert.equal(otherDeposit.status, 403);

  const confirmed = await call("confirmer", manager, deposit.book);
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.sale.status, "confirmee");
  assert.equal(confirmed.body.sync.devisStatus, "Accepté");
  assert.equal(confirmed.body.sync.opportunityStage, "Gagné");
  assert.equal(confirmed.body.sync.appointment, "inchangé");
  assert.equal(confirmed.body.sync.clientStatut, "inchangé");
  assert.equal(confirmed.sale.amountSource, "devis.total_ttc");

  const hidden = saleView({
    profile: admin,
    book: {
      sales: [
        confirmed.sale,
        { devisId: "devis-autre", status: "confirmee", amountTtc: 99999, commercialId: otherCommercialId },
      ],
      journal: [
        { devisId: "devis-pilote", action: "confirmation" },
        { devisId: "devis-autre", action: "confirmation", amountTtc: 99999 },
      ],
    },
    devisId: "devis-pilote",
    recorded: recorded({ status: "Accepté" }),
    permissions: signaturePermissions({ mode, profile: admin, userId: admin.id, devis: recorded(), sale: confirmed.sale, pilot }),
  });
  assert.equal(hidden.sale, null);
  assert.equal(hidden.journal.length, 0);
  assert.equal(hidden.totals, null);
  assert.equal(JSON.stringify(hidden).includes("99999"), false);
  assert.equal(JSON.stringify(hidden).includes("12000"), false);

  const visible = saleView({
    profile: manager,
    book: confirmed.book,
    devisId: "devis-pilote",
    recorded: recorded({ status: "Accepté" }),
    permissions: { read: true, request: false, confirm: true },
  });
  assert.equal(visible.sale.amountTtc, 12000);
  assert.equal(visible.canConfirm, true);
  assert.equal(visible.canRequest, false);
});

test("une autre organisation et un chemin de fichier indirect sont refusés", () => {
  assert.equal(sameSignatureOrganization(commercial, recorded()), true);
  assert.equal(sameSignatureOrganization(commercial, recorded({ organizationId: otherCommercialId })), false);
  assert.equal(sameSignatureOrganization({ role: "Commercial" }, recorded()), false);
  const digest = "a".repeat(64);
  const sale = {
    devisId: "devis-pilote",
    proofDigest: digest,
    storagePath: `devis-signatures/${org}/devis-pilote/${digest}.pdf`,
  };
  assert.equal(signatureObjectName(sale, org), null);
  const safe = {
    devisId: commercialId,
    proofDigest: digest,
    storagePath: `devis-signatures/${org}/${commercialId}/${digest}.pdf`,
  };
  assert.equal(signatureObjectName(safe, org), `${org}/${commercialId}/${digest}.pdf`);
  assert.equal(signatureObjectName({ ...safe, storagePath: `devis-signatures/${org}/${commercialId}/../secret.pdf` }, org), null);
  assert.equal(signatureObjectName({ ...safe, storagePath: `devis-signatures/autre-org/${commercialId}/${digest}.pdf` }, org), null);
});
