import test from "node:test";
import assert from "assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { buildSavInterventionPdf, interventionFooterLines, interventionSheetModel } from "../app/lib/sav-intervention-sheet.js";

const scheduled = {
  reference: "MKL-SAV-00042",
  clientName: "Camille Martin",
  clientPhone: "06 12 34 56 78",
  clientAddress: "12 rue des Lilas",
  clientPostal: "67000",
  clientCity: "Strasbourg",
  callerName: "Camille Martin",
  subject: "Pompe à chaleur en défaut",
  description: "Contrôler le code erreur et le circulateur.",
  categoryLabel: "Panne",
  scheduledAt: "2026-11-24T08:30:00.000Z",
};

test("le bon reprend le client et le rendez-vous déjà programmé", () => {
  const model = interventionSheetModel(scheduled);
  assert.equal(model.number, "MKL-SAV-00042");
  assert.equal(model.billTo[0], "Camille Martin");
  assert.equal(model.site[1], "12 rue des Lilas");
  assert.equal(model.site[2], "67000 Strasbourg");
  assert.equal(model.phone, "06 12 34 56 78");
  assert.match(model.nature, /Panne/);
  assert.match(model.nature, /Pompe à chaleur/);
  assert.equal(model.date, "24/11/2026");
  assert.equal(model.time, "09:30");
  const withDeadline = interventionSheetModel({ ...scheduled, dueAt: "2026-12-01T16:00:00.000Z" });
  assert.equal(withDeadline.date, "24/11/2026");
  assert.equal(withDeadline.time, "09:30");
  const unscheduled = interventionSheetModel({ ...scheduled, scheduledAt: "" });
  assert.equal(unscheduled.date, "");
  assert.equal(unscheduled.time, "");
});

test("le bon tient sur une page A4 et se remplit à l’ordinateur", async () => {
  const company = {
    legalName: "MKL Énergies",
    tradeName: "MKL Énergies",
    capital: "84 000 €",
    address: "30 Rue des Tuileries",
    postalCode: "67460",
    city: "Souffelweyersheim",
    email: "contact@mkl-energies.fr",
  };
  const model = interventionSheetModel(scheduled, company);
  assert.deepEqual(interventionFooterLines(company).slice(0, 2), [
    "MKL Énergies",
    "Siège social : 30 Rue des Tuileries · 67460 Souffelweyersheim",
  ]);
  assert.match(interventionFooterLines(company)[2], /Capital 84 000 €/);
  const pdf = await buildSavInterventionPdf(model);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const document = await PDFDocument.load(pdf);
  assert.equal(document.getPageCount(), 1);
  const form = document.getForm();
  assert.equal(form.getTextField("date").getText(), "24/11/2026");
  assert.equal(form.getTextField("heure").getText(), "09:30");
  assert.equal(form.getTextField("contact").getText(), "Camille Martin");
  assert.equal(form.getTextField("telephone").getText(), "06 12 34 56 78");
  assert.match(form.getTextField("nature").getText(), /Pompe/);
  assert.equal(form.getTextField("observation").getText() || "", "");
  assert.equal(form.getTextField("ligne_1_1").getText() || "", "");
  assert.ok(form.getCheckBox("devis_oui"));
  assert.ok(form.getCheckBox("travaux_non"));
  assert.equal(form.getCheckBox("facturer_oui").isChecked(), false);
  const billed = await buildSavInterventionPdf(interventionSheetModel({ ...scheduled, toInvoice: true }, company));
  const billedForm = (await PDFDocument.load(billed)).getForm();
  assert.equal(billedForm.getCheckBox("facturer_oui").isChecked(), true);
  const raw = pdf.toString("latin1");
  assert.match(raw, /MKL-SAV-00042/);
  assert.match(raw, /30 Rue des Tuileries/);
  assert.match(raw, /84 000/);
});

test("chaque dossier SAV ouvre son bon, y compris ceux déjà planifiés", () => {
  const source = readFileSync(new URL("../app/components/sav-module.js", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/sav/[id]/intervention-sheet/route.js", import.meta.url), "utf8");
  assert.match(source, /visible\.map/);
  assert.ok((source.match(/Bon d’intervention/g) || []).length >= 3);
  assert.match(source, /Fiches d’intervention/);
  assert.match(source, /sav-invoice-button/);
  assert.match(source, /intervention-sheet/);
  assert.match(route, /skipOpen: true/);
  assert.match(route, /getSavCase/);
});
