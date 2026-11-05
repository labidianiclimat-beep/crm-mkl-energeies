import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  documentToWizardState,
  emptyWizardState,
  financeConsistencyError,
  findDraftsForRecipient,
  OPEN_QUOTE_STATUSES,
  stepErrors,
  wizardAcompte,
  wizardToPayload,
  wizardTotals,
} from "../app/lib/devis-wizard.js";
import { canEditDevisPricing, formToDevisRecord, validateDevisPayload } from "../app/lib/devis.js";
import { matchesDirectorySearch } from "../app/lib/directory-search.js";

test("une ligne libre vide n est pas enregistree", () => {
  const state = emptyWizardState();
  state.clientId = "c1";
  state.clientSnapshot = { name: "Martin" };
  state.items = [
    { id: 1, name: "PAC", qty: 1, unit: 100, tax: 20 },
    { id: "free-1", name: "", qty: 1, unit: 0, tax: 20, free: true },
  ];
  const payload = wizardToPayload(state);
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].name, "PAC");
  state.items[1].name = "Forfait déplacement";
  state.items[1].unit = 80;
  assert.equal(wizardToPayload(state).items.length, 2);
});

test("l assistant devis s ouvre depuis creer un devis", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const wizard = readFileSync(new URL("../app/components/devis-wizard.js", import.meta.url), "utf8");
  assert.match(page, /openDevisWizard\(\)/);
  assert.match(page, /<DevisWizard/);
  assert.match(page, /kind==="Facture"/);
  assert.match(wizard, /Valider et créer le devis/);
  assert.match(wizard, /Enregistrer comme brouillon/);
  assert.doesNotMatch(wizard, /quote-client-preview/);
  assert.match(wizard, /className="secondary" onClick=\{\(\) => goTo\(state\.step - 1\)\}/);
  assert.match(wizard, /Ajouter un groupe d’articles[\s\S]*Ajouter un article/);
  assert.match(wizard, /QuoteBundleHeading/);
  assert.match(wizard, /setQuoteBundleHeading/);
  assert.doesNotMatch(wizard, /Ligne libre<\/button>/);
  assert.doesNotMatch(wizard, /Main-d’œuvre/);
  assert.doesNotMatch(wizard, /Choisir un modèle/);
  assert.doesNotMatch(wizard, /title="Paiement"/);
  assert.match(wizard, /currentStep\.id === "summary"[\s\S]*title="Notes"/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const picker = readFileSync(new URL("../app/components/article-picker-wizard.js", import.meta.url), "utf8");
  assert.match(picker, /createPortal/);
  assert.match(css, /article-wizard-actions\{display:grid;grid-template-columns:1fr 1fr/);
  assert.match(css, /\.devis-wizard-foot\{display:grid;grid-template-columns:1fr 1fr/);
  assert.match(css, /devis-wizard-backdrop\{padding:0;overflow:hidden/);
  assert.match(css, /--devis-quote-cols:minmax\(0,1\.7fr\) 68px 88px 72px 72px 96px 112px/);
  assert.match(css, /\.devis-wizard \.quote-line\{grid-template-columns:var\(--devis-quote-cols\)/);
});

test("etape client exige un destinataire", () => {
  const state = emptyWizardState();
  assert.ok(stepErrors("client", state).some(error => /client/i.test(error)));
  state.clientId = "c1";
  state.clientSnapshot = { name: "Martin" };
  assert.equal(stepErrors("client", state).length, 0);
});

test("retour arriere conserve les lignes", () => {
  const state = emptyWizardState();
  state.clientId = "c1";
  state.items = [{ id: 1, name: "PAC", qty: 1, unit: 100, tax: 20 }];
  const payload = wizardToPayload(state);
  const restored = documentToWizardState({ ...payload, id: "11111111-1111-4111-8111-111111111111", number: "DEV-2026-000001" });
  assert.equal(restored.items[0].name, "PAC");
  assert.equal(restored.clientId, "c1");
});

test("totaux HT TVA TTC et remise", () => {
  const totals = wizardTotals({
    tax: 20,
    globalDiscountType: "percent",
    globalDiscountValue: 10,
    items: [{ name: "PAC", qty: 1, unit: 1000, tax: 20, discountType: "percent", discountValue: 0 }],
  });
  assert.equal(Math.round(totals.beforeGlobalTTC), 1200);
  assert.equal(Math.round(totals.totalTTC), 1080);
});

test("financement credit aligne le montant sur le total TTC", () => {
  const state = emptyWizardState();
  state.financeMode = "credit";
  state.financier = "Sofinco";
  state.items = [{ id: 1, name: "PAC", qty: 1, unit: 10000, tax: 20 }];
  const payload = wizardToPayload(state);
  assert.equal(payload.financedAmount, wizardTotals(state).totalTTC);
  assert.equal(financeConsistencyError(state, wizardTotals(state).totalTTC), "");
});

test("acompte pourcentage", () => {
  assert.equal(wizardAcompte({ depositPercent: 30, acompte: 10 }, 1000), 300);
});

test("brouillon existant pour un client", () => {
  const drafts = findDraftsForRecipient([
    { kind: "Devis", status: "Brouillon", clientId: "c1", number: "DEV-1" },
    { kind: "Devis", status: "Envoyé", clientId: "c1" },
  ], { clientId: "c1" });
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].number, "DEV-1");
});

test("les devis non aboutis restent dans l assistant", () => {
  const open = findDraftsForRecipient([
    { kind: "Devis", status: "Brouillon", clientId: "c1", number: "DEV-1" },
    { kind: "Devis", status: "Envoyé", clientId: "c1", number: "DEV-2" },
    { kind: "Devis", status: "Accepté", clientId: "c1", number: "DEV-3" },
  ], { clientId: "c1", statuses: OPEN_QUOTE_STATUSES });
  assert.deepEqual(open.map(item => item.number), ["DEV-1", "DEV-2"]);
  const wizard = readFileSync(new URL("../app/components/devis-wizard.js", import.meta.url), "utf8");
  assert.match(wizard, /devis-wizard-prompt-card/);
  assert.match(wizard, /is-prompting/);
  assert.match(wizard, /Ce client a un devis en cours/);
  assert.match(wizard, /Poursuivre quand même/);
  assert.match(wizard, />Suivre</);
  assert.match(wizard, /duplicateQuoteInWizard/);
  assert.doesNotMatch(wizard, /onDuplicate\?\.\(draftPrompt\)/);
});

test("validation finale refuse un devis sans article", () => {
  const { header, lines } = formToDevisRecord({
    kind: "Devis",
    status: "À valider",
    date: "2026-09-18",
    clientId: "c1",
    client: "Test",
    items: [],
  });
  const errors = validateDevisPayload(header, lines);
  assert.ok(errors.some(error => /ligne/i.test(error)));
});

test("le commercial ne peut pas modifier les prix", () => {
  assert.equal(canEditDevisPricing({ role: "Commercial" }), false);
  assert.equal(canEditDevisPricing({ role: "Admin VIP" }), true);
  assert.equal(canEditDevisPricing({ role: "Superadmin" }), true);
  assert.equal(canEditDevisPricing({ role: "Admin second" }), true);
  assert.equal(canEditDevisPricing({ role: "Responsable commercial" }), true);
});

test("recherche client par telephone ou email", () => {
  const person = { firstName: "Marie", lastName: "Dupont", phone: "06 12 34 56 78", email: "marie@test.fr", city: "Nantes", postalCode: "44000" };
  assert.equal(matchesDirectorySearch(person, { q: "06 12" }), true);
  assert.equal(matchesDirectorySearch(person, { q: "marie@test" }), true);
  assert.equal(matchesDirectorySearch(person, { q: "44000" }), true);
});

test("extra wizard survit a l enregistrement", () => {
  const { header } = formToDevisRecord({
    kind: "Devis",
    status: "Brouillon",
    date: "2026-09-18",
    clientId: "c1",
    client: "Test",
    items: [{ name: "PAC", qty: 1, unit: 10, tax: 20 }],
    financeMode: "credit",
    siteAddress: "12 rue du Chantier",
    electricityOperator: "enedis",
  });
  assert.equal(header.extra.financeMode, "credit");
  assert.equal(header.extra.siteAddress, "12 rue du Chantier");
  assert.equal(header.electricity_operator, "enedis");
});

test("le devis n attache plus les CGV ni la mention MENTION", () => {
  const wizard = readFileSync(new URL("../app/components/devis-wizard.js", import.meta.url), "utf8");
  const print = readFileSync(new URL("../app/lib/devis-print.js", import.meta.url), "utf8");
  const payload = wizardToPayload(emptyWizardState());
  assert.equal(payload.cgvAttached, false);
  assert.equal(payload.cgvVersion, "");
  assert.doesNotMatch(wizard, /Rattacher les conditions générales/);
  assert.doesNotMatch(wizard, /Fiches pompe à chaleur/);
  assert.doesNotMatch(wizard, /<b>MENTION<\/b>/);
  assert.doesNotMatch(print, /<b>MENTION<\/b>/);
  assert.doesNotMatch(print, /CGV MKL Énergies \$\{/);
  assert.match(print, /companyHasCgv/);
  assert.match(print, /collectDevisAnnexImages/);
  assert.match(print, /CONDITIONS PARTICULIÈRES/);
});

test("l absence de commercial actif ne bloque pas l etape suivante", () => {
  const state = emptyWizardState({ mustAssignCommercial: true });
  state.date = "2026-09-19";
  state.due = "2026-10-19";
  state.deliveryDate = "2026-11-03";
  state.commercialId = "commercial-inactif";
  assert.equal(stepErrors("conditions", state, { mustAssignCommercial: true }).length, 0);
  state.commercialId = "";
  assert.equal(stepErrors("conditions", state, { mustAssignCommercial: true }).length, 0);
});

test("le telechargement devis genere un PDF", () => {
  const print = readFileSync(new URL("../app/lib/devis-print.js", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../app/lib/document-preview.js", import.meta.url), "utf8");
  const thermal = readFileSync(new URL("../app/etude-thermique/page.js", import.meta.url), "utf8");
  assert.doesNotMatch(print, /printWindow\.print/);
  assert.match(print, /buildDevisPdfBlob/);
  assert.doesNotMatch(print, /openHtmlPreview/);
  assert.match(preview, /downloadHtmlAsPdf/);
  assert.match(preview, /printHtml/);
  assert.doesNotMatch(preview, /type: "text\/html"/);
  assert.match(thermal, /Télécharger/);
  assert.match(thermal, /openThermalPrintWindow/);
});

test("le PDF devis reprend l ancien bandeau logo et le detail article", () => {
  const print = readFileSync(new URL("../app/lib/devis-print.js", import.meta.url), "utf8");
  const company = readFileSync(new URL("../app/lib/company.js", import.meta.url), "utf8");
  assert.match(print, /quote-head/);
  assert.match(print, /Offre valable jusqu/);
  assert.match(print, /width:65mm/);
  assert.match(print, /DOCUMENT_HEAD_CSS/);
  assert.match(print, /sheet-flow/);
  assert.match(print, /article-main/);
  assert.match(print, /article-desc/);
  assert.match(print, /item\.description/);
  assert.match(print, /paginateFlowSheets|data-flow-block/);
  assert.match(company, /grid-template-columns:64mm 1fr/);
  assert.match(company, /align-items:center/);
  assert.match(company, /width:58mm/);
  assert.match(company, /font-size:21px/);
  assert.doesNotMatch(company, /object-fit:contain/);
  assert.doesNotMatch(company, /align-items:end/);
});

test("la liste des devis passe le catalogue au telechargement", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /function BillingView\(\{kind,documents,clients,articles=\[\]/);
  assert.match(page, /kind="Devis"[^\n]+articles=\{articles\}/);
  assert.match(page, /openDevisPrintWindow\(doc, \{ clients, articles, toast \}\)/);
});
