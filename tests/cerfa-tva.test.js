import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  buildCerfaTvaData,
  cerfaTvaPrintSheets,
  formatCerfaDate,
  quoteHasVat55,
  shouldPrintCerfaTva,
} from "../app/lib/cerfa-tva.js";
import { documentToWizardState, emptyWizardState, wizardToPayload } from "../app/lib/devis-wizard.js";
import { formToDevisRecord } from "../app/lib/devis.js";
import { applyAnnexChoices, devisAnnexChoices } from "../app/lib/devis-annex-choices.js";

const quote55 = {
  kind: "Devis",
  date: "2026-09-20",
  client: "Martin",
  housingType: "Maison",
  occupancy: "Propriétaire",
  printCerfaTva: true,
  items: [
    { name: "PAC air/eau", qty: 1, unit: 8000, tax: 5.5 },
    { name: "Pose et raccordements", qty: 1, unit: 400, tax: 5.5 },
  ],
};

test("detecte une ligne tva 5.5 et ignore une ligne libre vide", () => {
  assert.equal(quoteHasVat55({ items: [{ name: "PAC", tax: 5.5 }] }), true);
  assert.equal(quoteHasVat55({ items: [{ name: "Panneau", tax: 20 }] }), false);
  assert.equal(quoteHasVat55({ tax: 5.5, items: [{ name: "PAC" }] }), true);
  assert.equal(quoteHasVat55({ tax: 5.5, items: [{ name: "", tax: 5.5, free: true }] }), false);
});

test("imprime le cerfa seulement si la case est cochee", () => {
  assert.equal(shouldPrintCerfaTva(quote55), true);
  assert.equal(shouldPrintCerfaTva({ ...quote55, printCerfaTva: false }), false);
  assert.equal(shouldPrintCerfaTva({ ...quote55, printCerfaTva: undefined }), false);
  assert.equal(shouldPrintCerfaTva({ printCerfaTva: true, items: [{ name: "PV", tax: 20 }] }), false);
  assert.equal(shouldPrintCerfaTva({ ...quote55, kind: "Facture" }), false);
  assert.equal(shouldPrintCerfaTva({ ...quote55, kind: "Pro forma" }), false);
});

test("preremplit identite logement occupant et cases energetiques", () => {
  const data = buildCerfaTvaData(quote55, {
    client: { lastName: "Martin", firstName: "Claire", address: "12 rue des Lilas", postalCode: "44000", city: "Nantes" },
    company: { city: "Rezé" },
  });
  assert.equal(data.lastName, "Martin");
  assert.equal(data.firstName, "Claire");
  assert.equal(data.address, "12 rue des Lilas");
  assert.equal(data.postalCode, "44000");
  assert.equal(data.city, "Nantes");
  assert.equal(data.housing, "maison");
  assert.equal(data.occupancy, "proprietaire");
  assert.equal(data.worksPlace, "habitation");
  assert.equal(data.signedAt, "Nantes");
  assert.equal(data.signedOn, "20/09/2026");
  assert.equal(data.checks.cac14, true);
  assert.equal(data.checks.cac4, true);
  assert.equal(data.checks.cac15, true);
  assert.equal(data.siteAddress, "");
});

test("adresse chantier si differente et appartement locataire", () => {
  const data = buildCerfaTvaData({
    ...quote55,
    housingType: "Appartement",
    occupancy: "Locataire",
    siteDifferent: true,
    siteAddress: "8 allée du Parc",
    sitePostalCode: "44100",
    siteCity: "Saint-Nazaire",
  }, { client: { lastName: "Durand", firstName: "Paul", address: "1 quai", postalCode: "44000", city: "Nantes" } });
  assert.equal(data.housing, "appartement");
  assert.equal(data.occupancy, "locataire");
  assert.equal(data.siteAddress, "8 allée du Parc");
  assert.equal(data.sitePostalCode, "44100");
  assert.equal(data.signedAt, "Nantes");
});

test("html officiel contient le fond cerfa et les valeurs preremplies", () => {
  const data = buildCerfaTvaData(quote55, {
    client: { lastName: "Martin", firstName: "Claire", city: "Nantes" },
    company: { city: "Rezé" },
  });
  const html = cerfaTvaPrintSheets(data, ["/cerfa/page-1.jpg", "/cerfa/page-2.jpg", "/cerfa/page-3.jpg", "/cerfa/page-4.jpg"]);
  assert.match(html, /cerfa-sheet/);
  assert.match(html, /\/cerfa\/page-1\.jpg/);
  assert.match(html, />Martin</);
  assert.match(html, />Claire</);
  assert.match(html, />Nantes</);
  assert.doesNotMatch(html, />Rezé</);
  assert.match(html, />20\/09\/2026</);
  assert.equal((html.match(/cerfa-x/g) || []).length > 4, true);
});

test("le drapeau cerfa survit a l assistant et a l extra devis", () => {
  const state = emptyWizardState();
  state.clientId = "c1";
  state.printCerfaTva = true;
  state.housingType = "Maison";
  state.occupancy = "Propriétaire";
  state.items = [{ id: 1, name: "PAC", qty: 1, unit: 100, tax: 5.5 }];
  const payload = wizardToPayload(state);
  assert.equal(payload.printCerfaTva, true);
  const off = wizardToPayload({ ...state, printCerfaTva: false });
  assert.equal(off.printCerfaTva, false);
  const restored = documentToWizardState({ ...payload, id: "11111111-1111-4111-8111-111111111111" });
  assert.equal(restored.printCerfaTva, true);
  const { header } = formToDevisRecord(payload);
  assert.equal(header.extra.printCerfaTva, true);
});

test("format date cerfa", () => {
  assert.equal(formatCerfaDate("2026-09-20"), "20/09/2026");
});

test("la fenetre propose le cerfa decoche et n imprime que les cases cochees", () => {
  const doc = {
    kind: "Devis",
    items: [
      { name: "Alfea", subcategory: "Pompe à chaleur air/eau", tax: 5.5 },
      { name: "Panneau 500 W", category: "Photovoltaïque", subcategory: "Panneaux photovoltaïques", tax: 10 },
    ],
  };
  const choices = devisAnnexChoices(doc, [], { cgvData: "data:application/pdf;base64,abc", cgvName: "CGV" });
  assert.equal(choices.find(item => item.id === "cerfa")?.checked, false);
  assert.equal(choices.find(item => item.id === "pv")?.checked, true);
  assert.equal(choices.find(item => item.id === "anah")?.checked, true);
  assert.equal(choices.find(item => item.id === "cgv")?.checked, true);
  const printed = applyAnnexChoices(doc, choices.map(item => (
    item.id === "pv" ? { ...item, checked: false } : item
  )));
  assert.equal(printed.printCerfaTva, false);
  assert.equal(printed.printPvMandat, false);
  assert.equal(printed.printAnahMandat, true);
  assert.equal(printed.printCgv, true);
});

test("le cerfa officiel et les pages sont dans public", () => {
  assert.equal(existsSync(new URL("../public/cerfa/cerfa-1301-sd.pdf", import.meta.url)), true);
  assert.equal(existsSync(new URL("../public/cerfa/page-1.jpg", import.meta.url)), true);
  assert.equal(existsSync(new URL("../public/cerfa/page-4.jpg", import.meta.url)), true);
  const wizard = readFileSync(new URL("../app/components/devis-wizard.js", import.meta.url), "utf8");
  const print = readFileSync(new URL("../app/lib/devis-print.js", import.meta.url), "utf8");
  assert.match(wizard, /proposé avant l’impression, décoché par défaut/);
  assert.match(wizard, /DevisAnnexPicker/);
  assert.doesNotMatch(wizard, /joint automatiquement à l’impression/);
  assert.doesNotMatch(wizard, /Joindre et imprimer l’attestation simplifiée TVA 5,5 %/);
  assert.match(print, /buildCerfaTvaAnnexHtml/);
  assert.match(print, /cerfaTvaToAnnexImages/);
});
