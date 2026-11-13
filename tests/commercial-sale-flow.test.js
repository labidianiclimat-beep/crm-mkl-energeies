import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { emptySaleBook, saleForDevis } from "../app/lib/commercial-sale.js";
import { proofAccess, runSaleRequest, saleView } from "../app/lib/commercial-sale-flow.js";
import { loadRecordedDevis, recordedDevisFromRow } from "../app/lib/commercial-sale-record.js";
import { readSalePdf, saveSalePdf } from "../app/lib/commercial-sale-file.js";
import { COMMERCIAL_SALE_PRODUCTION_WRITE, commitDevisSignatureInDatabase } from "../app/lib/commercial-sale-production.js";
import { signatureAccess, signatureProjectTarget } from "../app/lib/commercial-sale-target.js";

const pdf = Buffer.from("%PDF-1.4\npreuve");
const pdfBase64 = pdf.toString("base64");
const otherPdf = Buffer.from("%PDF-1.4\nautre");
const date = "2026-11-13";
const commercial = { id: "commercial-1", role: "Commercial", full_name: "Camille Martin" };
const colleague = { id: "commercial-2", role: "Commercial", full_name: "Autre vendeur" };
const responsable = { id: "resp-1", role: "Responsable commercial", full_name: "Rita Conseil" };
const direction = { id: "dir-1", role: "Direction", full_name: "Direction" };
const secretariat = { id: "sec-1", role: "Secrétariat", full_name: "Secrétariat" };

function recorded(extra = {}) {
  return {
    id: "devis-1",
    organizationId: "org",
    kind: "Devis",
    totalTtc: 12000,
    commercialId: "commercial-1",
    sourceProspectId: "prospect-1",
    status: "Envoyé",
    label: "DEV-1",
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
    requireStatusSync: extra.requireStatusSync || false,
    transaction: extra.transaction,
  });
}

test("le montant relu ignore celui du navigateur", async () => {
  const row = recordedDevisFromRow({
    id: "devis-9",
    kind: "Devis",
    total_ttc: 9000,
    totalTtc: 1,
    organization_id: "org",
    commercial_id: "commercial-1",
    statut: "Envoyé",
    extra: { sourceProspectId: "prospect-9" },
  });
  assert.equal(row.totalTtc, 9000);
  assert.equal(row.sourceProspectId, "prospect-9");
  let query = "";
  const loaded = await loadRecordedDevis("devis-9", "jeton", {
    query: async (path) => {
      query = path;
      return [{ ...{
        id: "devis-9",
        kind: "Devis",
        total_ttc: "1500.5",
        organization_id: "org",
        commercial_id: "commercial-1",
        statut: "Envoyé",
        extra: {},
      } }];
    },
  });
  assert.match(query, /select=id,organization_id,kind,numero_devis,commercial_id,statut,total_ttc,extra/);
  assert.equal(loaded.totalTtc, 1500.5);
  const tampered = await call("demande", commercial, emptySaleBook(), {
    recorded: row,
    body: { kind: "devis_signe", declaredSignatureDate: date, pdfBase64, devis: { totalTtc: 1 } },
  });
  assert.equal(tampered.status, 400);
  assert.equal(tampered.persist, false);
  const trusted = await call("demande", commercial, emptySaleBook(), {
    recorded: row,
    body: { kind: "devis_signe", declaredSignatureDate: date, pdfBase64 },
  });
  assert.equal(trusted.sale.amountTtc, 9000);
  assert.equal(trusted.sale.amountSource, "devis.total_ttc");
});

test("le parcours dépôt, confirmation, refus, annulation et historique", async () => {
  const book = emptySaleBook();
  const refused = await call("demande", direction, book, {
    body: { kind: "devis_signe", declaredSignatureDate: date, pdfBase64 },
  });
  assert.equal(refused.status, 403);
  assert.equal(refused.persist, false);

  const invoice = await call("demande", commercial, book, {
    recorded: recorded({ kind: "Facture" }),
    body: { kind: "devis_signe", declaredSignatureDate: date, pdfBase64 },
  });
  assert.equal(invoice.status, 400);

  const deposited = await call("demande", commercial, book, {
    body: { kind: "devis_signe", declaredSignatureDate: date, pdfBase64 },
  });
  assert.equal(deposited.status, 200);
  assert.equal(deposited.sale.status, "demande");
  assert.equal(deposited.sale.amountTtc, 12000);
  assert.equal(deposited.body.sync.devisStatus, "inchangé");
  assert.equal(deposited.body.sync.opportunityStage, null);

  const commercialConfirm = await call("confirmer", commercial, deposited.book);
  assert.equal(commercialConfirm.status, 403);

  const outsider = proofAccess({ profile: colleague, userId: colleague.id, sale: deposited.sale });
  const office = proofAccess({ profile: secretariat, userId: secretariat.id, sale: deposited.sale });
  const owner = proofAccess({ profile: commercial, userId: commercial.id, sale: deposited.sale });
  const manager = proofAccess({ profile: responsable, userId: responsable.id, sale: deposited.sale });
  assert.equal(outsider.status, 403);
  assert.equal(office.status, 403);
  assert.equal(owner.status, 200);
  assert.equal(manager.status, 200);

  const wrongAmount = await call("confirmer", responsable, deposited.book, {
    body: { amountTtc: 1 },
  });
  assert.equal(wrongAmount.persist, false);
  assert.equal(saleForDevis(deposited.book, "devis-1").status, "demande");

  const confirmed = await call("confirmer", responsable, deposited.book);
  assert.equal(confirmed.sale.status, "confirmee");
  assert.equal(confirmed.sale.amountTtc, 12000);
  assert.equal(confirmed.sale.confirmedByName, "Rita Conseil");
  assert.equal(confirmed.body.sync.devisStatus, "Accepté");
  assert.equal(confirmed.body.sync.opportunityStage, "Gagné");
  assert.equal(confirmed.body.sync.appointment, "inchangé");
  assert.equal(confirmed.body.sync.clientStatut, "inchangé");
  assert.equal(confirmed.body.productionWrite, false);

  const repeated = await call("confirmer", responsable, confirmed.book, {
    body: { kind: "devis_signe", declaredSignatureDate: date, pdfBase64 },
  });
  assert.equal(repeated.body.identical, true);
  assert.equal(confirmed.book.sales.filter(item => item.status === "confirmee" && item.devisId === "devis-1").length, 1);

  const otherProof = await call("confirmer", responsable, confirmed.book, {
    body: { kind: "manuel", declaredSignatureDate: date, pdfBase64: otherPdf.toString("base64") },
  });
  assert.equal(otherProof.persist, false);

  const second = await call("confirmer", responsable, confirmed.book, {
    recorded: recorded({ id: "devis-2", totalTtc: 8000, sourceProspectId: "prospect-2", label: "DEV-2" }),
    body: { kind: "manuel", declaredSignatureDate: date, pdfBase64: otherPdf.toString("base64") },
  });
  assert.equal(second.sale.amountTtc, 8000);
  assert.equal(second.body.totals.net, 20000);

  const missingReason = await call("annuler", responsable, second.book, { body: { reason: "ok" } });
  assert.equal(missingReason.persist, false);
  const cancelled = await call("annuler", responsable, second.book, {
    body: { reason: "Client se rétracte" },
  });
  assert.equal(cancelled.sale.status, "annulee");
  assert.equal(cancelled.body.sync.devisStatus, "inchangé");
  assert.equal(cancelled.body.sync.clientStatut, "inchangé");
  assert.equal(cancelled.body.totals.net, 8000);
  assert.equal(cancelled.body.totals.brut, 20000);

  const view = saleView({
    profile: responsable,
    book: cancelled.book,
    devisId: "devis-1",
    recorded: recorded({ status: "Envoyé" }),
  });
  assert.deepEqual(view.journal.map(entry => entry.action), ["demande", "confirmation", "annulation"]);
  assert.match(view.journal.at(-1).reason, /rétracte/);
  assert.equal(view.verdict, "Signature annulée");
});

test("une synchronisation échouée ne confirme pas la vente", async () => {
  const deposited = await call("demande", commercial, emptySaleBook(), {
    body: { kind: "devis_signe", declaredSignatureDate: date, pdfBase64 },
  });
  const broken = await call("confirmer", responsable, deposited.book, {
    requireStatusSync: true,
    transaction: async () => {
      throw new Error("base indisponible");
    },
  });
  assert.equal(broken.persist, false);
  assert.equal(broken.body.confirmed, false);
  assert.equal(saleForDevis(deposited.book, "devis-1").status, "demande");

  const refusedWrite = await call("confirmer", responsable, deposited.book, {
    requireStatusSync: true,
    transaction: async () => ({ ok: true, clientCalled: true }),
  });
  assert.equal(refusedWrite.persist, false);
  assert.match(refusedWrite.body.error, /fiche client/);

  let received = null;
  const synced = await call("confirmer", responsable, deposited.book, {
    requireStatusSync: true,
    transaction: async (payload) => {
      received = payload;
      return { ok: true };
    },
  });
  assert.equal(synced.persist, true);
  assert.equal(synced.sale.status, "confirmee");
  assert.equal(received.sync.devisStatus, "Accepté");
  assert.equal(received.sync.opportunityStage, "Gagné");
  assert.equal(received.sync.appointment, "inchangé");
  assert.equal(received.sync.clientStatut, "inchangé");
  assert.equal(received.recorded.totalTtc, 12000);
});

test("le justificatif local ne sort pas de son dossier", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mkl-sale-"));
  try {
    const saved = await saveSalePdf("../secret", pdf, root);
    const folder = path.join(root, "devis-signatures");
    const relative = path.relative(folder, saved);
    assert.equal(relative.startsWith(".."), false);
    assert.equal(path.isAbsolute(relative), false);
    assert.equal((await readSalePdf("..", root)), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("la cible de signature distingue la recette de la production", () => {
  assert.equal(signatureProjectTarget({ NEXT_PUBLIC_SUPABASE_URL: "https://xqbjfytrssslnsxxdrou.supabase.co" }), "recette");
  assert.equal(signatureProjectTarget({ NEXT_PUBLIC_SUPABASE_URL: "https://rzkwmwtjnwnmmcexwoov.supabase.co" }), "production");
  assert.equal(signatureProjectTarget({ NEXT_PUBLIC_SUPABASE_URL: "" }), "local");
  assert.equal(signatureProjectTarget({ NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" }), "inconnu");
});

test("la production et la migration restent fermées", async () => {
  assert.equal(COMMERCIAL_SALE_PRODUCTION_WRITE, false);
  const production = { NEXT_PUBLIC_SUPABASE_URL: "https://rzkwmwtjnwnmmcexwoov.supabase.co" };
  const recette = { NEXT_PUBLIC_SUPABASE_URL: "https://xqbjfytrssslnsxxdrou.supabase.co" };
  assert.deepEqual(signatureAccess(production), { target: "production", mode: "off", reads: false, writes: false });
  assert.equal(signatureAccess({ ...production, MKL_SIGNATURE_MODULE: "actif" }).writes, false);
  assert.equal(signatureAccess({ ...production, MKL_SIGNATURE_MODULE: "actif" }).reads, false);
  assert.equal(signatureAccess({ ...production, MKL_SIGNATURE_MODULE: "lecture" }).reads, false);
  assert.equal(signatureAccess(production, { productionWrite: true }).writes, false);
  assert.equal(signatureAccess({ ...production, MKL_SIGNATURE_MODULE: "actif" }, { productionWrite: true }).writes, true);
  assert.equal(signatureAccess({ ...production, MKL_SIGNATURE_MODULE: "lecture" }, { productionWrite: true }).reads, true);
  assert.equal(signatureAccess({ ...production, MKL_SIGNATURE_MODULE: "lecture" }, { productionWrite: true }).writes, false);
  assert.equal(signatureAccess({ ...production, MKL_SIGNATURE_MODULE: "off" }, { productionWrite: true }).reads, false);
  assert.equal(signatureAccess(recette).writes, true);
  assert.equal(signatureAccess({ ...recette, MKL_SIGNATURE_MODULE: "off" }).writes, false);
  assert.equal(signatureAccess({ ...recette, MKL_SIGNATURE_MODULE: "off" }).reads, false);
  assert.equal(signatureAccess({ ...recette, MKL_SIGNATURE_MODULE: "lecture" }).writes, false);
  assert.equal(signatureAccess({ ...recette, MKL_SIGNATURE_MODULE: "lecture" }).reads, true);
  await assert.rejects(() => commitDevisSignatureInDatabase(), /Écriture production interdite/);
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousMode = process.env.MKL_SIGNATURE_MODULE;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://rzkwmwtjnwnmmcexwoov.supabase.co";
    process.env.MKL_SIGNATURE_MODULE = "actif";
    await assert.rejects(() => commitDevisSignatureInDatabase({ sale: { devisId: "devis-test" } }), /Écriture production interdite/);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousMode === undefined) delete process.env.MKL_SIGNATURE_MODULE;
    else process.env.MKL_SIGNATURE_MODULE = previousMode;
  }
  const route = readFileSync(new URL("../app/api/devis/[id]/signature/route.js", import.meta.url), "utf8");
  const record = readFileSync(new URL("../app/lib/commercial-sale-record.js", import.meta.url), "utf8");
  const sql = readFileSync(new URL("../supabase/migrations/20261113_devis_signatures.sql", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../app/components/commercial-sale-panel.js", import.meta.url), "utf8");
  assert.match(route, /signatureAccess/);
  assert.match(route, /COMMERCIAL_SALE_PRODUCTION_WRITE === true/);
  assert.match(route, /preuves déjà enregistrées sont conservées/);
  assert.match(route, /target === "recette"/);
  assert.match(route, /commitDevisSignatureInDatabase/);
  assert.doesNotMatch(route, /rzkwmwtjnwnmmcexwoov/);
  assert.match(route, /writeSaleBook/);
  assert.match(record, /row\.total_ttc/);
  assert.doesNotMatch(record, /row\.totalTtc|method:\s*"POST"|method:\s*"PATCH"/);
  assert.match(sql, /NON APPLIQUÉE/);
  assert.match(sql, /commit_devis_signature/);
  assert.match(sql, /total_ttc/);
  assert.match(sql, /'Accepté'/);
  assert.match(sql, /'Gagné'/);
  assert.match(sql, /electronique/);
  assert.match(sql, /devis_signatures_one_open/);
  assert.match(sql, /devis-signatures/);
  assert.match(sql, /security definer/);
  assert.match(sql, /grant execute on function public\.commit_devis_signature/);
  assert.match(sql, /sale_can_confirm/);
  assert.match(panel, /Déposer un devis signé/);
  assert.match(panel, /Confirmer la vente/);
  assert.match(panel, /Confirmer en avenant/);
  assert.doesNotMatch(panel, /totalTtc/);
  assert.doesNotMatch(sql, /update\s+public\.clients/i);
  assert.doesNotMatch(sql, /update\s+public\.commercial_appointments/i);
});
