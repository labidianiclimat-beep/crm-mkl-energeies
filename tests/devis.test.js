import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cloneDocumentForCreate,
  computeDocumentTotals,
  isQuoteBundleStart,
  quoteArticleRefs,
  photovoltaicGroupTitle,
  quoteBundleHeading,
  setQuoteBundleHeading,
  defaultQuoteDeliveryDate,
  defaultQuoteValidityDate,
  devisCommercialRequiredError,
  findQuoteByNumber,
  formToDevisRecord,
  firstMonthlyDelayChoices,
  firstMonthlyDelayLabel,
  formatDevisNumber,
  historyToUi,
  isLockedDevisStatus,
  isUnassignedDevis,
  canInvoiceQuote,
  mustAssignDevisCommercial,
  resolveDevisOwnerId,
  splitPersonName,
  quoteBillingAddress,
  quoteWorksiteAddress,
  quoteMatchesClientQuery,
  quoteStatusLabel,
  statusesForKind,
  statusTone,
  validateDevisPayload,
} from "../app/lib/devis.js";

test("le surtitre d un groupe s applique a toutes ses lignes", () => {
  const items = [
    { id: 1, name: "UE", bundleId: "g1", bundleName: "" },
    { id: 2, name: "UI", bundleId: "g1", bundleName: "" },
    { id: 3, name: "PAC", bundleId: "g2", bundleName: "Pack PAC" },
  ];
  assert.equal(isQuoteBundleStart(items, 0), true);
  assert.equal(isQuoteBundleStart(items, 1), false);
  assert.equal(isQuoteBundleStart(items, 2), true);
  const next = setQuoteBundleHeading(items, 0, "Installation climatisation");
  assert.equal(quoteBundleHeading(next[0]), "Installation climatisation");
  assert.equal(quoteBundleHeading(next[1]), "Installation climatisation");
  assert.equal(quoteBundleHeading(next[2]), "Pack PAC");
  const pv = [
    { name: "Panneau 500 W", category: "Photovoltaïque", bundleId: "pv", bundleName: "Jinko Solar — 4,5 kW monophasé — micro-onduleurs" },
    { name: "Micro-onduleur", category: "Photovoltaïque", bundleId: "pv", bundleName: "Jinko Solar — 4,5 kW monophasé — micro-onduleurs" },
  ];
  assert.equal(photovoltaicGroupTitle(pv, 0), "Jinko Solar — 4,5 kW monophasé — micro-onduleurs");
  assert.equal(photovoltaicGroupTitle(pv, 1), "");
  assert.equal(photovoltaicGroupTitle(next, 0), "");
});

test("le total d un groupe micro-onduleur compte le prix unique", () => {
  const totals = computeDocumentTotals({
    tax: 20,
    items: [
      {
        name: "JINKO SOLAR 54HL4M-BDV-500 W",
        qty: 9,
        unit: 0,
        tax: 5.5,
        forfait: true,
        forfaitHt: 13127.96,
        bundleName: "Jinko Solar — 4,5 kW monophasé — micro-onduleurs",
      },
      {
        name: "MICRO-ONDULEUR ENPHASE IQ9N-A-INT",
        qty: 9,
        unit: 0,
        tax: 0,
        forfait: true,
        forfaitHt: null,
        bundleName: "Jinko Solar — 4,5 kW monophasé — micro-onduleurs",
      },
      { name: "Raccordement sans Linky", qty: 1, unit: 947.87, tax: 5.5 },
    ],
  });
  assert.equal(Number(totals.lines[0].totalTTC.toFixed(2)), 13850);
  assert.equal(totals.lines[1].totalTTC, 0);
  assert.equal(Number(totals.totalTTC.toFixed(2)), 14850);
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/devis/[id]/route.js", import.meta.url), "utf8");
  assert.match(page, /function billingTotals\(document\) \{\s*return computeDocumentTotals\(document\);\s*\}/);
  assert.match(route, /loadLines\(id\)\)\.map\(lineToUi\)/);
});

test("computes line and document totals with discounts", () => {
  const totals = computeDocumentTotals({
    tax: 20,
    globalDiscountType: "percent",
    globalDiscountValue: 10,
    items: [{ name: "Panneau", qty: 2, unit: 100, tax: 20, discountType: "percent", discountValue: 0 }],
  });
  assert.equal(Math.round(totals.beforeGlobalTTC), 240);
  assert.equal(Math.round(totals.totalTTC), 216);
});

test("un brouillon peut etre enregistre sans ligne", () => {
  const { header, lines } = formToDevisRecord({
    kind: "Devis",
    status: "Brouillon",
    date: "2026-09-13",
    clientId: "c1",
    client: "Client Test",
    items: [],
  });
  const errors = validateDevisPayload(header, lines);
  assert.equal(errors.length, 0);
  assert.equal(lines.length, 0);
  assert.equal(header.total_ttc, 0);
});

test("requires client and lines", () => {
  const { header, lines } = formToDevisRecord({
    kind: "Devis",
    status: "À valider",
    date: "2026-09-13",
    items: [],
  });
  const errors = validateDevisPayload(header, lines);
  assert.ok(errors.some(error => /client/i.test(error)));
  assert.ok(errors.some(error => /ligne/i.test(error)));
});

test("snapshots article fields into lignes", () => {
  const { header, lines } = formToDevisRecord({
    kind: "Devis",
    status: "Brouillon",
    date: "2026-09-13",
    clientId: "c1",
    client: "Client Test",
    tax: 20,
    items: [
      {
        articleId: "11111111-1111-4111-8111-111111111111",
        code: "PV-450W",
        name: "Panneau 450 W",
        description: "Mono",
        qty: 10,
        unit: 189,
        tax: 20,
        category: "Photovoltaïque",
      },
    ],
  });
  assert.equal(validateDevisPayload(header, lines).length, 0);
  assert.equal(lines[0].article_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(lines[0].reference, "PV-450W");
  assert.equal(lines[0].designation, "Panneau 450 W");
  assert.ok(lines[0].total_ttc > 0);
  assert.ok(header.total_ttc > 0);
});

test("une ligne libre sans article catalogue est valide", () => {
  const { header, lines } = formToDevisRecord({
    kind: "Devis",
    status: "Brouillon",
    date: "2026-09-13",
    clientId: "c1",
    client: "Client Test",
    tax: 20,
    items: [{ name: "Forfait déplacement", code: "", qty: 1, unit: 80, tax: 20 }],
  });
  assert.equal(validateDevisPayload(header, lines).length, 0);
  assert.equal(lines[0].article_id, null);
  assert.equal(lines[0].designation, "Forfait déplacement");
  assert.equal(lines[0].reference, null);
});

test("le devis propose une ligne en champ libre", () => {
  const wizard = readFileSync(new URL("../app/components/devis-wizard.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(wizard, /Ligne libre \(facultatif\)/);
  assert.match(page, /Ligne libre \(facultatif\)/);
  assert.doesNotMatch(wizard, /quote-free-line-btn/);
  assert.doesNotMatch(wizard, /Main-d’œuvre/);
  assert.match(page, /Désignation de l’article/);
});

test("ignores non-uuid article ids in snapshots", () => {
  const { lines } = formToDevisRecord({
    kind: "Devis",
    status: "Brouillon",
    date: "2026-09-13",
    clientId: "c1",
    client: "Client Test",
    items: [{ articleId: "local-1", code: "X", name: "Test", qty: 1, unit: 10, tax: 20 }],
  });
  assert.equal(lines[0].article_id, null);
  assert.equal(lines[0].reference, "X");
});

test("formats devis numbers with 6 digits", () => {
  assert.equal(formatDevisNumber("DEV", 2026, 1), "DEV-2026-000001");
  assert.equal(formatDevisNumber("DEV", 2026, 42), "DEV-2026-000042");
});

test("accepted devis status is locked", () => {
  assert.equal(isLockedDevisStatus("Accepté"), true);
  assert.equal(isLockedDevisStatus("Brouillon"), false);
});

test("quote statuses follow étape 7 workflow", () => {
  const statuses = statusesForKind("Devis");
  assert.deepEqual(statuses, [
    "Brouillon",
    "À valider",
    "Envoyé",
    "À relancer",
    "Accepté",
    "Refusé",
    "Expiré",
    "Annulé",
  ]);
  assert.equal(statusTone("Accepté"), "ok");
  assert.equal(statusTone("Refusé"), "bad");
  assert.equal(statusTone("À relancer"), "wait");
});

test("rejects invoice status on devis", () => {
  const { header, lines } = formToDevisRecord({
    kind: "Devis",
    status: "Payée",
    date: "2026-09-13",
    clientId: "c1",
    client: "Client Test",
    items: [{ name: "Ligne", qty: 1, unit: 10, tax: 20 }],
  });
  const errors = validateDevisPayload(header, lines);
  assert.ok(errors.some(error => /statut/i.test(error)));
});

test("maps history rows to ui", () => {
  const entry = historyToUi({
    id: "h1",
    devis_id: "d1",
    ancien_statut: "Envoyé",
    nouveau_statut: "À relancer",
    utilisateur_id: "u1",
    date: "2026-09-13T10:00:00Z",
    commentaire: "Relance téléphonique",
  });
  assert.equal(entry.from, "Envoyé");
  assert.equal(entry.to, "À relancer");
  assert.equal(entry.comment, "Relance téléphonique");
});

test("devis et pro forma ne passent plus par le blob crm_state", () => {
  const source = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.ok(!/useStored\("mkl-billing"/.test(source));
  assert.match(source, /authFetch\("\/api\/devis"\)/);
  assert.ok(!/id:Date\.now\(\),kind:"Pro forma"/.test(source));
  assert.match(source, /kind:"Pro forma"/);
});

test("dupliquer un devis cree un brouillon sans id de ligne", () => {
  const copy = cloneDocumentForCreate({
    id: "11111111-1111-4111-8111-111111111111",
    kind: "Devis",
    number: "DEV-2026-000042",
    clientId: "c1",
    client: "SCI Horizon",
    status: "Accepté",
    label: "Installation solaire",
    tax: 20,
    items: [{ id: "line-1", name: "Panneau", qty: 2, unit: 100, tax: 20 }],
  }, { kind: "Devis", status: "Brouillon", labelSuffix: " (copie)" });
  assert.equal(copy.kind, "Devis");
  assert.equal(copy.status, "Brouillon");
  assert.equal(copy.client, "SCI Horizon");
  assert.equal(copy.label, "Installation solaire (copie)");
  assert.equal(copy.items[0].name, "Panneau");
  assert.equal(copy.items[0].id, undefined);
  assert.equal(copy.sourceQuoteId, null);
});

test("un numero de devis retrouve le document a facturer", () => {
  const quotes = [
    { kind: "Devis", number: "DEV-2026-000042", id: "q1", status: "Accepté" },
    { kind: "Devis", number: "DEV-2026-000099", id: "q2", status: "Envoyé" },
    { kind: "Facture", number: "FAC-2026-000042", id: "f1" },
  ];
  assert.equal(findQuoteByNumber(quotes, "DEV-2026-000042").id, "q1");
  assert.equal(findQuoteByNumber(quotes, "000042").id, "q1");
  assert.equal(findQuoteByNumber(quotes, "inconnu"), null);
});

test("la facture propose de reprendre un devis par numero", () => {
  const source = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(source, /Reprendre le devis/);
  assert.match(source, /findQuoteByNumber/);
  assert.match(source, /sourceQuoteNumber/);
});

test("facturer un devis reprend les lignes et le numero source", () => {
  const invoice = cloneDocumentForCreate({
    id: "11111111-1111-4111-8111-111111111111",
    kind: "Devis",
    number: "DEV-2026-000042",
    client: "SCI Horizon",
    clientId: "c1",
    status: "Accepté",
    label: "Installation solaire",
    tax: 20,
    items: [{ name: "Panneau", qty: 2, unit: 100, tax: 20 }],
  }, { kind: "Facture" });
  assert.equal(invoice.kind, "Facture");
  assert.equal(invoice.status, "À payer");
  assert.equal(invoice.sourceQuoteId, "11111111-1111-4111-8111-111111111111");
  assert.equal(invoice.sourceQuoteNumber, "DEV-2026-000042");
  assert.equal(invoice.items.length, 1);
  const { header, lines } = formToDevisRecord(invoice);
  assert.equal(validateDevisPayload(header, lines).length, 0);
  assert.equal(header.extra.sourceQuoteNumber, "DEV-2026-000042");
});

test("la liste devis expose dupliquer, facturer et supprimer", () => {
  const source = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(source, /onDuplicate=\{duplicateQuote\}/);
  assert.match(source, /onInvoice=\{canInvoiceQuote\(currentProfile\)\?invoiceQuote:undefined\}/);
  assert.match(source, /onDelete=\{isAdminRole\(currentRole\)\?deleteQuote:undefined\}/);
  assert.match(source, /title="Dupliquer le devis"/);
  assert.match(source, /title="Créer une facture"/);
  assert.match(source, /className="delete-quote"/);
  assert.match(source, /modal-form-actions/);
});

test("vendeur et responsable commercial ne facturent pas un devis", () => {
  assert.equal(canInvoiceQuote({ role: "Commercial" }), false);
  assert.equal(canInvoiceQuote({ role: "Responsable commercial", modules: ["Devis", "Factures"] }), false);
  assert.equal(canInvoiceQuote({ role: "Secrétariat" }), true);
  assert.equal(canInvoiceQuote({ role: "Direction" }), true);
  assert.equal(canInvoiceQuote({ role: "Admin VIP" }), true);
  assert.equal(canInvoiceQuote({ role: "Superadmin" }), true);
  const source = readFileSync(new URL("../app/api/devis/route.js", import.meta.url), "utf8");
  assert.match(source, /requestedKind === "Facture" && !canInvoiceQuote\(auth\.profile\)/);
});

test("supprimer un devis confirme puis appelle DELETE", () => {
  const source = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const start = source.indexOf("async function deleteQuote");
  const end = source.indexOf("const mainAction");
  assert.ok(start > 0 && end > start);
  const fn = source.slice(start, end);
  assert.match(source, /method:"DELETE"/);
  assert.match(fn, /window\.confirm/);
  assert.match(fn, /\/api\/devis\/\$\{document\.id\}/);
});

test("un nouveau devis n auto-selectionne pas le premier client", () => {
  const source = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const start = source.indexOf("const resolveClientId=");
  const end = source.indexOf("const [selectedClientId,setSelectedClientId]");
  assert.ok(start > 0 && end > start);
  const fn = source.slice(start, end);
  assert.match(fn, /return "";/);
  assert.ok(!/list\[0\]\.id/.test(fn));
  assert.match(source, /DirectorySearch/);
  assert.match(source, /Recherchez une fiche par nom, prénom ou adresse/);
  assert.match(source, /kind="recipient"/);
});

test("la suppression devis est reservee aux administrateurs", () => {
  const source = readFileSync(new URL("../app/api/devis/[id]/route.js", import.meta.url), "utf8");
  const start = source.indexOf("export async function DELETE");
  assert.ok(start > 0);
  const fn = source.slice(start);
  assert.match(fn, /isAdminRole/);
  assert.match(fn, /Suppression réservée aux administrateurs/);
});

test("la validité d’un devis est à 30 jours et le représentant est conservé", () => {
  assert.equal(defaultQuoteValidityDate("2026-09-15"), "2026-10-15");
  assert.deepEqual(splitPersonName("Jean Dupont"), { firstName: "Jean", lastName: "Dupont" });
  const { header } = formToDevisRecord({
    kind: "Devis",
    status: "Brouillon",
    date: "2026-09-15",
    clientId: "c1",
    client: "Client Test",
    items: [{ name: "Panneau", qty: 1, unit: 100, tax: 20 }],
    representativeLastName: "Martin",
    representativeFirstName: "Léa",
    representativeSignature: "data:image/png;base64,xx",
  });
  assert.equal(header.extra.representativeLastName, "Martin");
  assert.equal(header.extra.representativeFirstName, "Léa");
  assert.equal(header.extra.representativeSignature, "data:image/png;base64,xx");
});

test("le formulaire devis place le représentant à la place de l’échéance", () => {
  const source = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const print = readFileSync(new URL("../app/lib/devis-print.js", import.meta.url), "utf8");
  assert.match(source, /Représentant MKL Énergies/);
  assert.match(source, /representativeLastName/);
  assert.match(source, /Validité de l’offre/);
  assert.match(print, /REPRÉSENTANT MKL ÉNERGIES/);
  assert.ok(!/Date d’émission[\s\S]{0,220}Date d’échéance[\s\S]{0,80}Date prévisionnelle/.test(source));
});

test("la livraison prévisionnelle d’un devis est à 45 jours de l’édition", () => {
  assert.equal(defaultQuoteDeliveryDate("2026-09-15"), "2026-10-30");
  const { header } = formToDevisRecord({
    kind: "Devis",
    status: "Brouillon",
    date: "2026-09-15",
    clientId: "c1",
    client: "Client Test",
    items: [{ name: "Panneau", qty: 1, unit: 100, tax: 20 }],
  });
  assert.equal(header.date_livraison, "2026-10-30");
  const copy = cloneDocumentForCreate({
    kind: "Devis",
    date: "2026-01-01",
    deliveryDate: "2026-01-10",
    items: [{ name: "Panneau", qty: 1, unit: 100, tax: 20 }],
  }, { kind: "Devis" });
  assert.equal(copy.deliveryDate, defaultQuoteDeliveryDate(copy.date));
});

test("le financement du devis conserve TAEG, TAEA et premiere mensualite", () => {
  const { header } = formToDevisRecord({
    kind: "Devis",
    status: "Brouillon",
    date: "2026-09-15",
    clientId: "c1",
    client: "Client Test",
    items: [{ name: "Panneau", qty: 1, unit: 100, tax: 20 }],
    financier: "Sofinco",
    financedAmount: 12000,
    financeMonths: 84,
    monthlyPayment: 180.5,
    firstMonthlyPayment: 210,
    financeTaeg: 5.21,
    financeTaea: 5.8,
  });
  assert.equal(header.financier, "Sofinco");
  assert.equal(header.financed_amount, 12000);
  assert.equal(header.finance_months, 84);
  assert.equal(header.monthly_payment, 180.5);
  assert.equal(header.extra.financeTaeg, 5.21);
  assert.equal(header.extra.financeTaea, 5.8);
  assert.equal(header.extra.firstMonthlyPayment, 210);
  const copy = cloneDocumentForCreate({
    kind: "Devis",
    financier: "Sofinco",
    financedAmount: 12000,
    financeMonths: 84,
    monthlyPayment: 180.5,
    firstMonthlyPayment: 210,
    financeTaeg: 5.21,
    financeTaea: 5.8,
    items: [{ name: "Panneau", qty: 1, unit: 100, tax: 20 }],
  }, { kind: "Devis" });
  assert.equal(copy.financeTaeg, 5.21);
  assert.equal(copy.financeTaea, 5.8);
  assert.equal(copy.firstMonthlyPayment, 210);
  assert.deepEqual(firstMonthlyDelayChoices(""), ["", "30", "180"]);
  assert.deepEqual(firstMonthlyDelayChoices(210), ["", "30", "180", "210"]);
  assert.equal(firstMonthlyDelayLabel(30), "30 JRS");
  assert.equal(firstMonthlyDelayLabel(180), "180 JRS");
  assert.equal(firstMonthlyDelayLabel(""), "—");
  const source = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const print = readFileSync(new URL("../app/lib/devis-print.js", import.meta.url), "utf8");
  const pdf = readFileSync(new URL("../app/lib/devis-pdf.js", import.meta.url), "utf8");
  assert.match(source, /name="financier"/);
  assert.match(source, /Montant de financement/);
  assert.match(source, /Nombre de mensualités/);
  assert.match(source, /Montant de la mensualité/);
  assert.match(source, /Première mensualité JRS/);
  assert.match(source, /firstMonthlyDelayChoices/);
  assert.doesNotMatch(source, /Première mensualité \(€\)/);
  const wizard = readFileSync(new URL("../app/components/devis-wizard.js", import.meta.url), "utf8");
  assert.match(wizard, /Première mensualité JRS/);
  assert.match(wizard, /firstMonthlyDelayChoices/);
  assert.match(source, /name="financeTaeg"/);
  assert.match(source, /name="financeTaea"/);
  assert.doesNotMatch(source, /name="financeNominalRate"/);
  assert.doesNotMatch(print, /TAUX NOMINAL/);
  assert.match(print, />TAEG</);
  assert.match(print, />TAEA</);
  assert.match(print, /PREMIÈRE MENSUALITÉ/);
  assert.match(pdf, /\["TAEG"/);
  assert.match(pdf, /\["TAEA"/);
  assert.match(pdf, /PREMIÈRE MENSUALITÉ/);
  assert.doesNotMatch(pdf, /TAUX NOMINAL/);
});

test("dupliquer un devis ouvre le formulaire sans creer tout de suite", () => {
  const source = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const start = source.indexOf("async function duplicateQuote");
  const end = source.indexOf("async function invoiceQuote");
  assert.ok(start > 0 && end > start);
  const fn = source.slice(start, end);
  assert.match(fn, /setModal\("billing"\)/);
  assert.match(fn, /setEditingBilling/);
  assert.ok(!/postBillingDocument/.test(fn));
});

test("un service administratif peut laisser une affaire sans commercial", () => {
  const commercialId = "11111111-1111-4111-8111-111111111111";
  assert.equal(mustAssignDevisCommercial({ role: "Secrétariat" }), true);
  assert.equal(mustAssignDevisCommercial({ role: "Superadmin" }), true);
  assert.equal(mustAssignDevisCommercial({ role: "Admin second" }), true);
  assert.equal(mustAssignDevisCommercial({ role: "Commercial" }), false);
  assert.equal(devisCommercialRequiredError({ role: "Secrétariat" }, ""), "");
  assert.equal(devisCommercialRequiredError({ role: "Secrétariat" }, "pas-un-uuid"), "");
  assert.equal(devisCommercialRequiredError({ role: "Secrétariat" }, commercialId), "");
  assert.equal(resolveDevisOwnerId({ role: "Commercial" }, "com-self", commercialId), "com-self");
  assert.equal(resolveDevisOwnerId({ role: "Secrétariat" }, "sec-1", commercialId), commercialId);
  assert.equal(resolveDevisOwnerId({ role: "Superadmin" }, "adm-1", commercialId), commercialId);
  assert.equal(resolveDevisOwnerId({ role: "Superadmin" }, "adm-1", "adm-1"), "");
  assert.equal(resolveDevisOwnerId({ role: "Secrétariat" }, "sec-1", ""), "");
  assert.equal(resolveDevisOwnerId({ role: "Secrétariat" }, "sec-1", undefined, commercialId), commercialId);
  assert.equal(isUnassignedDevis({ commercialId: "" }), true);
  assert.equal(isUnassignedDevis({ commercialId }), false);
  const copy = cloneDocumentForCreate({ commercialId, clientId: "c1", items: [{ name: "PAC", qty: 1, unit: 10 }] });
  assert.equal(copy.commercialId, commercialId);
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /Sans commercial — à attribuer/);
  assert.match(page, /onAssignCommercial/);
  assert.match(page, /Attribuer le devis/);
  const post = readFileSync(new URL("../app/api/devis/route.js", import.meta.url), "utf8");
  assert.match(post, /ownerId \|\| null/);
  const patch = readFileSync(new URL("../app/api/devis/[id]/route.js", import.meta.url), "utf8");
  assert.match(patch, /hasCommercialField/);
});

test("le tableau des devis affiche les references article et la date seule", () => {
  assert.equal(quoteArticleRefs({
    items: [
      { code: "TOS-BI", name: "Groupe bi-split" },
      { code: "TOS-UI-25", name: "Unité 2,5" },
      { code: "TOS-UI-25", name: "Unité 2,5" },
    ],
  }), "TOS-BI · TOS-UI-25");
  assert.equal(quoteArticleRefs({ items: [{ name: "Sans code" }] }), "—");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /quoteArticleRefs/);
  assert.match(page, />DATE</);
  assert.doesNotMatch(page, /DATE \/ ÉCHÉANCE/);
  assert.match(page, /className="billing-objet"/);
  assert.match(page, />COMMERCIAL</);
  assert.match(page, />CRÉÉ PAR</);
  assert.match(page, /people=\{team\}/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.billing-table\.has-creator \.data-row\{/);
});

test("l adresse de chantier reste hors du carre client", () => {
  const client = { address: "15 rue Racine", postalCode: "67550", city: "Drusenheim" };
  assert.equal(quoteBillingAddress(client), "15 rue Racine 67550 Drusenheim");
  assert.equal(quoteWorksiteAddress({ siteDifferent: false, siteAddress: "8 allée du Parc" }), "");
  assert.equal(quoteWorksiteAddress({
    siteDifferent: true,
    siteAddress: "8 allée du Parc",
    sitePostalCode: "67000",
    siteCity: "Strasbourg",
  }), "8 allée du Parc 67000 Strasbourg");
  const pdf = readFileSync(new URL("../app/lib/devis-pdf.js", import.meta.url), "utf8");
  const print = readFileSync(new URL("../app/lib/devis-print.js", import.meta.url), "utf8");
  assert.match(pdf, /quoteBillingAddress/);
  assert.match(pdf, /ADRESSE DE CHANTIER/);
  assert.match(print, /Adresse de chantier/);
  assert.match(print, /worksite-address/);
});

test("la page devis filtre par client, commercial et statut, et dit Validé", () => {
  const clients = [{ id: "c1", name: "Jean Muller", firstName: "Jean", lastName: "Muller" }];
  const devis = { id: "d1", clientId: "c1", client: "Jean Muller", status: "Accepté", commercialId: "u1" };
  assert.equal(quoteStatusLabel("Accepté"), "Validé");
  assert.equal(quoteStatusLabel("Envoyé"), "Envoyé");
  assert.equal(quoteMatchesClientQuery(devis, clients, "Muller"), true);
  assert.equal(quoteMatchesClientQuery(devis, clients, "jean"), true);
  assert.equal(quoteMatchesClientQuery(devis, clients, "Martin"), false);
  assert.equal(quoteMatchesClientQuery({ client: "Camille Bernard" }, [], "bernard"), true);
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /Nom ou prénom du client/);
  assert.match(page, /quoteStatusLabel/);
  assert.match(page, /commercialFilter/);
  assert.match(page, /statusFilter/);
  assert.match(page, /Ce devis n’est pas validé/);
});
