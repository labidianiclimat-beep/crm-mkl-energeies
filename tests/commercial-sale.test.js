import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  applySaleSync,
  authorizeSaleAction,
  cancelCommercialSale,
  canConfirmCommercialSale,
  canRequestCommercialSignature,
  commercialSaleTotals,
  confirmCommercialSale,
  emptySaleBook,
  legacyAcceptedQuoteCountsAsSale,
  replaceCommercialSale,
  requestCommercialSignature,
  saleSyncPlan,
  saleVerdict,
  validateSaleProof,
  verifyElectronicSignature,
} from "../app/lib/commercial-sale.js";
import { readSaleBook, saveSalePdf, writeSaleBook } from "../app/lib/commercial-sale-file.js";

const now = new Date("2026-11-13T12:00:00.000Z").getTime();
const pdf = Buffer.from("%PDF-1.4\npreuve");
const commercial = { id: "commercial-1", role: "Commercial" };
const responsable = { id: "resp-1", role: "Responsable commercial" };
const admin = { id: "admin-1", role: "Administrateur" };
const superadmin = { id: "super-1", role: "Super admin" };
const direction = { id: "dir-1", role: "Direction" };

function devis(extra = {}) {
  return {
    id: "devis-1",
    organizationId: "org",
    totalTtc: 12000,
    commercialId: "commercial-1",
    sourceProspectId: "prospect-1",
    representativeSignature: "data:image/png;base64,AAAA",
    ...extra,
  };
}

test("la confirmation est un droit distinct du statut des devis", () => {
  assert.equal(canConfirmCommercialSale(superadmin), true);
  assert.equal(canConfirmCommercialSale(admin), true);
  assert.equal(canConfirmCommercialSale(responsable), true);
  assert.equal(canConfirmCommercialSale(commercial), false);
  assert.equal(canConfirmCommercialSale(direction), false);
  assert.equal(canRequestCommercialSignature(commercial), true);
  assert.equal(canRequestCommercialSignature(responsable), false);
  assert.equal(canRequestCommercialSignature({ role: "Secrétariat" }), false);
  assert.equal(authorizeSaleAction(commercial, "confirmer").ok, false);
  assert.equal(authorizeSaleAction(direction, "demande").ok, false);
  assert.equal(authorizeSaleAction(admin, "confirmer").ok, true);
  assert.equal(legacyAcceptedQuoteCountsAsSale({ status: "Accepté" }), false);
});

test("la signature du commercial et un rendez-vous ne prouvent pas la vente", () => {
  const representative = validateSaleProof({
    kind: "representant",
    declaredSignatureDate: "2026-11-13",
    reference: "data:image/png;base64,AAAA",
  }, { now });
  assert.equal(representative.ok, false);
  const appointment = validateSaleProof({
    kind: "manuel",
    declaredSignatureDate: "2026-11-13",
    status: "Commande signée",
    source: "google",
  }, { action: "confirmer", now });
  assert.equal(appointment.ok, false);
  assert.equal(saleSyncPlan({ sourceProspectId: "prospect-1" }).appointment, "inchangé");
});

test("un commercial dépose, un responsable confirme, la fiche et le rendez-vous restent", () => {
  const asked = requestCommercialSignature(emptySaleBook(), {
    actor: commercial,
    devis: devis(),
    proof: { kind: "devis_signe", declaredSignatureDate: "2026-11-12", bytes: pdf },
    now,
  });
  assert.equal(asked.ok, true);
  assert.equal(asked.sync.devisStatus, "inchangé");
  assert.equal(asked.sync.opportunityStage, null);
  assert.equal(asked.sale.storagePath.startsWith("devis-signatures/"), true);
  assert.equal(asked.sale.storagePath.includes("http"), false);

  const signed = confirmCommercialSale(asked.book, { actor: responsable, devis: devis(), now });
  assert.equal(signed.ok, true);
  assert.equal(signed.sale.status, "confirmee");
  assert.equal(signed.sale.confirmedBy, "resp-1");
  assert.equal(signed.sale.amountTtc, 12000);
  assert.equal(signed.sale.declaredSignatureDate, "2026-11-12");
  assert.equal(signed.sync.devisStatus, "Accepté");
  assert.equal(signed.sync.opportunityStage, "Gagné");
  assert.equal(signed.sync.clientStatut, "inchangé");
  assert.equal(signed.sync.finance, "inchangé");
  assert.equal(signed.sync.installation, "inchangé");
  assert.equal(signed.book.journal.at(-1).action, "confirmation");
});

test("sans opportunité la vente reste à rattacher", () => {
  const signed = confirmCommercialSale(emptySaleBook(), {
    actor: admin,
    devis: devis({ sourceProspectId: "" }),
    proof: { kind: "manuel", declaredSignatureDate: "2026-11-13", bytes: pdf },
    now,
  });
  assert.equal(signed.ok, true);
  assert.equal(signed.sale.linkState, "À rattacher");
  assert.equal(signed.sync.opportunityStage, null);
  assert.equal(signed.sync.devisStatus, "Accepté");
});

test("la même preuve ne confirme pas deux fois, l’annulation sépare le brut et le net", () => {
  const proof = { kind: "manuel", declaredSignatureDate: "2026-11-10", bytes: pdf };
  const first = confirmCommercialSale(emptySaleBook(), { actor: superadmin, devis: devis(), proof, now });
  const second = confirmCommercialSale(first.book, { actor: superadmin, devis: devis(), proof, now });
  assert.equal(second.identical, true);
  assert.equal(second.book.sales.filter(item => item.status === "confirmee").length, 1);
  const missing = cancelCommercialSale(second.book, { actor: admin, devisId: "devis-1", now });
  assert.equal(missing.ok, false);
  const cancelled = cancelCommercialSale(second.book, { actor: admin, devisId: "devis-1", reason: "Client se rétracte", now });
  const again = cancelCommercialSale(cancelled.book, { actor: admin, devisId: "devis-1", now });
  assert.equal(again.identical, true);
  assert.equal(cancelled.sale.cancelReason, "Client se rétracte");
  assert.deepEqual(commercialSaleTotals(again.book.sales), { brut: 12000, net: 0 });
  assert.equal(cancelled.sync.devisStatus, "inchangé");
  assert.equal(cancelled.sync.clientStatut, "inchangé");
});

test("un devis remplacé sort des deux chiffres", () => {
  const first = confirmCommercialSale(emptySaleBook(), {
    actor: responsable,
    devis: devis(),
    proof: { kind: "manuel", declaredSignatureDate: "2026-11-01", bytes: pdf },
    now,
  });
  const next = replaceCommercialSale(first.book, {
    actor: responsable,
    devis: devis({ id: "devis-2", totalTtc: 15000 }),
    replacesDevisId: "devis-1",
    proof: { kind: "manuel", declaredSignatureDate: "2026-11-13", bytes: Buffer.from("%PDF-1.4\navenant") },
    now,
  });
  assert.equal(next.ok, true);
  assert.equal(next.replaced.status, "remplacee");
  assert.deepEqual(commercialSaleTotals(next.book.sales), { brut: 15000, net: 15000 });
  const revived = confirmCommercialSale(next.book, {
    actor: responsable,
    devis: devis(),
    proof: { kind: "manuel", declaredSignatureDate: "2026-11-13", bytes: Buffer.from("%PDF-1.4\nancien") },
    now,
  });
  assert.equal(revived.ok, false);
  assert.deepEqual(commercialSaleTotals(next.book.sales), { brut: 15000, net: 15000 });
  const duplicate = replaceCommercialSale(next.book, {
    actor: responsable,
    devis: devis({ id: "devis-2", totalTtc: 15000 }),
    replacesDevisId: "devis-1",
    proof: { kind: "manuel", declaredSignatureDate: "2026-11-13", bytes: Buffer.from("%PDF-1.4\navenant") },
    now,
  });
  assert.equal(duplicate.ok, false);
});

test("un ancien devis accepté et une preuve incomplète ne créent pas de vente", () => {
  assert.equal(legacyAcceptedQuoteCountsAsSale(), false);
  const unsigned = confirmCommercialSale(emptySaleBook(), {
    actor: admin,
    devis: devis({ status: "Accepté" }),
    proof: { kind: "electronique", verified: false, reference: "en-attente", declaredSignatureDate: "2026-11-13" },
    now,
  });
  assert.equal(unsigned.ok, false);
  const mismatch = confirmCommercialSale(emptySaleBook(), {
    actor: admin,
    devis: devis(),
    proof: { kind: "manuel", declaredSignatureDate: "2026-11-14", bytes: pdf, amountTtc: 1 },
    now,
  });
  assert.equal(mismatch.ok, false);
  assert.deepEqual(commercialSaleTotals([]), { brut: 0, net: 0 });
});

test("une référence électronique ne confirme pas la vente", () => {
  const checked = verifyElectronicSignature({ verified: true, reference: "signature-electronique-42" });
  assert.equal(checked.ok, false);
  assert.equal(checked.code, "provider_absent");
  const signed = confirmCommercialSale(emptySaleBook(), {
    actor: admin,
    devis: devis({ status: "Accepté" }),
    proof: { kind: "electronique", verified: true, reference: "signature-electronique-42", declaredSignatureDate: "2026-11-13" },
    now,
  });
  assert.equal(signed.ok, false);
  assert.equal(saleVerdict({ devisStatus: "Accepté" }), "Acceptation historique non vérifiée");
  assert.equal(saleVerdict({ appointmentStatus: "Commande signée" }), "Commande signée sans preuve");
  assert.equal(saleVerdict({ sale: { status: "confirmee" }, appointmentStatus: "Commande signée" }), "Signée vérifiée");
});

test("la synchronisation ne touche ni la fiche ni le rendez-vous, et s’arrête si l’opportunité échoue", async () => {
  const sync = saleSyncPlan(devis());
  const clientCalls = [];
  const blocked = await applySaleSync(sync, { client: () => clientCalls.push("client") });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.clientCalled, false);
  assert.equal(clientCalls.length, 0);
  const steps = [];
  const failed = await applySaleSync(sync, {
    devis: async () => { steps.push("devis"); },
    opportunity: async () => { throw new Error("opportunite indisponible"); },
  });
  assert.equal(failed.step, "opportunite");
  assert.equal(failed.devisApplied, true);
  assert.equal(failed.clientCalled, false);
  assert.deepEqual(steps, ["devis"]);
});

test("le pdf reste dans un dossier local privé", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mkl-sale-"));
  try {
    const saved = await saveSalePdf("abc123", pdf, root);
    const stored = await readFile(saved);
    assert.equal(stored.subarray(0, 5).toString(), "%PDF-");
    assert.equal(saved.includes(`${path.sep}.local${path.sep}`) || saved.includes("mkl-sale-"), true);
    await writeSaleBook({ sales: [{ id: "1", devisId: "devis-1", status: "demande" }], journal: [] }, root);
    const book = await readSaleBook(root);
    assert.equal(book.sales[0].status, "demande");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("la route et la migration n’écrivent rien en production", () => {
  const route = readFileSync(new URL("../app/api/devis/[id]/signature/route.js", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20261113_devis_signatures.sql", import.meta.url), "utf8");
  const source = readFileSync(new URL("../app/lib/commercial-sale.js", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../app/components/commercial-sale-panel.js", import.meta.url), "utf8");
  assert.match(route, /productionWrite: false/);
  assert.match(route, /signatureAccess/);
  assert.match(route, /target === "recette"/);
  assert.match(route, /loadRecordedDevis/);
  assert.match(route, /commitDevisSignatureInDatabase/);
  assert.doesNotMatch(route, /rzkwmwtjnwnmmcexwoov/);
  assert.match(migration, /NON APPLIQUÉE/);
  assert.match(panel, /Déposer un devis signé/);
  assert.match(panel, /Confirmer la vente/);
  assert.doesNotMatch(source, /serviceRequest|gclid|google_ads/);
});
