import test from "node:test";
import assert from "assert/strict";
import { readFileSync } from "node:fs";
import { buildDevisPdfBlob, closingBlockHeight, euro, pinClosingTop, CONTENT_BOTTOM } from "../app/lib/devis-pdf.js";
import { formatHeatPumpDescription } from "../app/lib/heat-pump-specs.js";

const longPac = formatHeatPumpDescription({
  eprel: "123456",
  ademe: "PAC-88",
  refrigerant: "R32",
  energyClass: "A+++ / A++",
  seasonalEfficiency: "185 % / 145 %",
  scop: "4,6 / 3,8",
  maxFlowTemp: "60 °C",
  powerMinus7_35: "8,2 kW",
  copMinus7_35: "3,4",
  powerMinus7_55: "7,1 kW",
  copMinus7_55: "2,6",
  powerPlus7_35: "9,5 kW",
  copPlus7_35: "4,8",
  soundLevel: "35 dB(A)",
  warranty: "- 2 ans pièces\n- 5 ans compresseur",
}, { brand: "Atlantic", title: "ATLANTIC ALFEA EXCELLIA S 9 KW MONOPHASE" });

function sampleDoc() {
  return {
    kind: "Devis",
    number: "DEV-2026-000024",
    date: "2026-09-20",
    due: "2026-10-20",
    deliveryDate: "2026-11-04",
    client: "noel Laurent",
    items: [
      { name: "ATLANTIC ALFEA EXCELLIA S 9 KW MONOPHASE", code: "520-556", qty: 1, unit: 15000, tax: 5.5, description: longPac },
      { name: "FOURNITURES POUR INSTALLATION POMPE À CHALEUR AIR/EAU", code: "FOUR-PAC", qty: 1, unit: 3000, tax: 5.5, description: `${"Kit hydraulique, liaisons, supports. ".repeat(12)}` },
      { name: "INSTALLATION ET MISE EN SERVICE PAC", code: "MO-PAC", qty: 1, unit: 3200, tax: 10, description: `${"Pose, raccordements et mise en service. ".repeat(10)}` },
    ],
  };
}

test("l adresse de chantier s imprime au-dessus des articles", async () => {
  const blob = await buildDevisPdfBlob({
    ...sampleDoc(),
    client: "Jean Muller",
    siteDifferent: true,
    siteAddress: "8 allee du Parc",
    sitePostalCode: "67000",
    siteCity: "Strasbourg",
  }, {
    logoData: "",
    clients: [{
      name: "Jean Muller",
      firstName: "Jean",
      lastName: "Muller",
      address: "15 rue Racine",
      postalCode: "67550",
      city: "Drusenheim",
    }],
    company: { legalName: "MKL Énergies" },
  });
  const raw = Buffer.from(await blob.arrayBuffer()).toString("latin1");
  assert.match(raw, /15 rue Racine/);
  assert.match(raw, /Drusenheim/);
  assert.match(raw, /ADRESSE DE CHANTIER/);
  assert.match(raw, /8 allee du Parc/);
  assert.match(raw, /Strasbourg/);
  const chantier = raw.indexOf("ADRESSE DE CHANTIER");
  const article = raw.indexOf("ATLANTIC ALFEA");
  assert.ok(chantier > -1 && article > chantier);
});

test("le devis PDF natif contient le texte du modèle", async () => {
  const blob = await buildDevisPdfBlob(sampleDoc(), {
    logoData: "",
    clients: [{ name: "noel Laurent", address: "7 Rue des Alouettes", postalCode: "67116", city: "Reichstett" }],
    company: {
      legalName: "MKL Énergies",
      siret: "93021297200010",
      vatNumber: "FR47930212972",
      capital: "74 000 €",
      address: "30 Rue des Tuileries",
      postalCode: "67460",
      city: "Souffelweyersheim",
    },
  });
  assert.ok(blob?.size > 2000);
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  const raw = bytes.toString("latin1");
  assert.match(raw, /DEVIS DEV-2026-000024/);
  assert.match(raw, /Offre valable/);
  assert.match(raw, /Détail|Detail/);
  assert.match(raw, /ATLANTIC ALFEA EXCELLIA/);
  assert.match(raw, /Total TTC/);
  assert.match(raw, /Page 1/);
  assert.match(raw, /SIRET 930 212 972 00010/);
  assert.match(raw, /TVA FR47930212972/);
  assert.match(raw, /Capital 74 000/);
  assert.match(raw, /30 Rue des Tuileries/);
  assert.match(raw, /67460 Souffelweyersheim/);
  const pages = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.ok(pages >= 2, `attendu au moins 2 pages, obtenu ${pages}`);
});

test("le forfait photovoltaïque écrit le TTC dans la colonne P.U TTC", async () => {
  const blob = await buildDevisPdfBlob({
    kind: "Devis",
    number: "DEV-MICRO",
    date: "2026-11-06",
    due: "2026-12-06",
    client: "Client Test",
    items: [
      {
        name: "JINKO SOLAR 54HL4M-BDV-500 W",
        qty: 9,
        unit: 0,
        tax: 5.5,
        forfait: true,
        forfaitHt: 13127.96,
        description: "PANNEAU\nType de cellule : Monocristallin",
      },
      {
        name: "MICRO-ONDULEUR ENPHASE IQ9N-A-INT",
        qty: 9,
        unit: 0,
        tax: 0,
        forfait: true,
        forfaitHt: null,
        description: "MICRO-ONDULEUR\nMarque : Enphase",
      },
    ],
  }, { logoData: "", clients: [{ name: "Client Test" }], company: { legalName: "MKL Énergies" } });
  const raw = Buffer.from(await blob.arrayBuffer()).toString("latin1");
  assert.equal((raw.match(/13 850/g) || []).length, 3);
  assert.match(raw, /13 128/);
  assert.match(raw, /Type de cellule : Monocristallin/);
  assert.match(raw, /Marque : Enphase/);
});

test("le PDF imprime le titre d un groupe photovoltaïque", async () => {
  const blob = await buildDevisPdfBlob({
    kind: "Devis",
    number: "DEV-PV-TITRE",
    date: "2026-11-06",
    due: "2026-12-06",
    client: "Client Test",
    items: [
      {
        name: "JINKO SOLAR 54HL4M-BDV-500 W",
        category: "Photovoltaïque",
        subcategory: "Panneaux",
        qty: 9,
        unit: 0,
        tax: 5.5,
        forfait: true,
        forfaitHt: 13127.96,
        bundleId: "pv-1",
        bundleName: "Jinko Solar — 4,5 kW monophasé — micro-onduleurs",
        description: "PANNEAU\nType de cellule",
      },
      {
        name: "MICRO-ONDULEUR ENPHASE IQ9N-A-INT",
        category: "Photovoltaïque",
        subcategory: "Micro-onduleur",
        qty: 9,
        unit: 0,
        tax: 0,
        forfait: true,
        bundleId: "pv-1",
        bundleName: "Jinko Solar — 4,5 kW monophasé — micro-onduleurs",
        description: "MICRO-ONDULEUR",
      },
    ],
  }, { logoData: "", clients: [{ name: "Client Test" }], company: { legalName: "MKL Énergies" } });
  const raw = Buffer.from(await blob.arrayBuffer()).toString("latin1");
  assert.match(raw, /Jinko Solar - 4,5 kW monophasé - micro-onduleurs/);
  assert.equal((raw.match(/Jinko Solar/g) || []).length, 1);
  assert.match(raw, /Type de cellule/);
});

test("le PDF devis n affiche pas le surtitre du groupe", async () => {
  const blob = await buildDevisPdfBlob({
    kind: "Devis",
    number: "DEV-BUNDLE",
    date: "2026-09-22",
    due: "2026-10-22",
    deliveryDate: "2026-11-06",
    client: "Client Test",
    items: [
      { name: "Groupe extérieur", qty: 1, unit: 1200, tax: 20, bundleId: "clim-1", bundleName: "Installation climatisation" },
      { name: "Unité intérieure", qty: 1, unit: 800, tax: 20, bundleId: "clim-1", bundleName: "Installation climatisation" },
    ],
  }, {
    logoData: "",
    clients: [{ name: "Client Test" }],
    company: { legalName: "MKL Énergies" },
  });
  const raw = Buffer.from(await blob.arrayBuffer()).toString("latin1");
  assert.match(raw, /Groupe ext/);
  assert.doesNotMatch(raw, /Installation climatisation/);
});

test("les montants n ont pas de slash a la place des milliers", () => {
  assert.equal(euro(15000), "15 000 €");
  assert.doesNotMatch(euro(15000), /\//);
  assert.doesNotMatch(euro(31825), /[\u00a0\u202f]/);
});

test("la remise s aligne sur les totaux sans caractere special", () => {
  const pdf = readFileSync(new URL("../app/lib/devis-pdf.js", import.meta.url), "utf8");
  assert.match(pdf, /\["Remise", `- \$\{euro/);
  assert.doesNotMatch(pdf, /− \$\{euro/);
  assert.match(pdf, /align: "right"/);
});

test("totaux et signatures se calent en bas de page", () => {
  const height = closingBlockHeight({ finance: false, signatures: true });
  assert.ok(height > 50 && height < 120);
  assert.equal(pinClosingTop(80, height), CONTENT_BOTTOM - height);
  assert.equal(pinClosingTop(CONTENT_BOTTOM - height + 1, height), null);
  assert.ok(CONTENT_BOTTOM - height > 180);
});

test("un PDF commercial se colle a la fin du devis sans changer le modele", async () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC";
  const options = {
    logoData: "",
    clients: [{ name: "noel Laurent", address: "7 Rue des Alouettes", postalCode: "67116", city: "Reichstett" }],
    company: {
      legalName: "MKL Énergies",
      siret: "93021297200010",
      vatNumber: "FR47930212972",
      capital: "74 000 €",
      address: "30 Rue des Tuileries",
      postalCode: "67460",
      city: "Souffelweyersheim",
    },
  };
  const base = await buildDevisPdfBlob(sampleDoc(), options);
  const withAnnex = await buildDevisPdfBlob(sampleDoc(), { ...options, annexImages: [{ data: png, format: "PNG" }] });
  const baseRaw = Buffer.from(await base.arrayBuffer()).toString("latin1");
  const annexRaw = Buffer.from(await withAnnex.arrayBuffer()).toString("latin1");
  const countPages = raw => (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.ok(countPages(annexRaw) > countPages(baseRaw));
  assert.match(annexRaw, /DEVIS DEV-2026-000024/);
  assert.match(annexRaw, /Total TTC/);
  const pdf = readFileSync(new URL("../app/lib/devis-pdf.js", import.meta.url), "utf8");
  const print = readFileSync(new URL("../app/lib/devis-print.js", import.meta.url), "utf8");
  assert.match(pdf, /annexImages/);
  assert.match(print, /commercialDocsToAnnexImages/);
});

test("le telechargement devis n utilise plus html2canvas", () => {
  const print = readFileSync(new URL("../app/lib/devis-print.js", import.meta.url), "utf8");
  const pdf = readFileSync(new URL("../app/lib/devis-pdf.js", import.meta.url), "utf8");
  assert.match(print, /buildDevisPdfBlob/);
  assert.doesNotMatch(print, /openHtmlPreview/);
  assert.match(pdf, /new jsPDF/);
  assert.match(pdf, /Détail/);
  assert.match(pdf, /Offre valable jusqu/);
  assert.match(pdf, /pinClosingTop/);
  assert.match(pdf, /pdfLatin/);
  assert.doesNotMatch(pdf, /from ["']html2canvas|html2canvas\(/);
});

test("le bandeau devis facture et proforma porte le logo RGE Qualifelec", async () => {
  const pdf = readFileSync(new URL("../app/lib/devis-pdf.js", import.meta.url), "utf8");
  const print = readFileSync(new URL("../app/lib/devis-print.js", import.meta.url), "utf8");
  assert.match(pdf, /rge-qualifelec/);
  assert.match(pdf, /rgeLogoData/);
  assert.match(pdf, /N\\u00b0 156901 PAC/);
  assert.match(pdf, /N\\u00b0 156899 PV/);
  assert.match(print, /loadRgeLogo/);
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC";
  const options = {
    logoData: "",
    clients: [{ name: "noel Laurent", address: "7 Rue des Alouettes", postalCode: "67116", city: "Reichstett" }],
    company: { legalName: "MKL Énergies" },
  };
  const without = await buildDevisPdfBlob(sampleDoc(), options);
  const withRge = await buildDevisPdfBlob(sampleDoc(), { ...options, rgeLogoData: png });
  const facture = await buildDevisPdfBlob({ ...sampleDoc(), kind: "Facture", number: "FAC-2026-000001" }, { ...options, rgeLogoData: png });
  const proforma = await buildDevisPdfBlob({ ...sampleDoc(), kind: "Facture pro forma", number: "PF-2026-000001" }, { ...options, rgeLogoData: png });
  assert.ok(withRge.size > without.size);
  const factureBytes = Buffer.from(await facture.arrayBuffer()).toString("latin1");
  const devisBytes = Buffer.from(await withRge.arrayBuffer()).toString("latin1");
  assert.match(factureBytes, /FACTURE FAC-2026-000001/);
  assert.match(factureBytes, /N\u00b0 156901 PAC/);
  assert.match(factureBytes, /N\u00b0 156899 PV/);
  assert.match(devisBytes, /N\u00b0 156901 PAC/);
  assert.match(devisBytes, /N\u00b0 156899 PV/);
  assert.match(Buffer.from(await proforma.arrayBuffer()).toString("latin1"), /FACTURE PRO FORMA PF-2026-000001/);
});
