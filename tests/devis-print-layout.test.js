import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { articleDescriptionText, buildDevisArticleHtml, buildDevisPrintHtml } from "../app/lib/devis-print.js";
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
  dhwTank: "Oui — 190 L",
  bufferVolume: "40 L",
  expansionVessel: "12 L",
  operatingWeight: "148 kg",
  operatingRange: "-20 °C / +35 °C",
  powerSupply: "230 V monophasé",
  electricBackup: "6 kW / 32 A / 3G6",
  dhwBackup: "1,8 kW / 10 A / 3G1,5",
  warranty: "- 2 ans pièces\n- 5 ans compresseur",
}, { brand: "Atlantic", title: "ATLANTIC ALFEA EXCELLIA S 9 KW MONOPHASE" });

function sampleDoc() {
  return {
    kind: "Devis",
    number: "DEV-2026-000024",
    date: "2026-09-20",
    due: "2026-10-20",
    deliveryDate: "2026-11-04",
    client: "Client Test",
    items: [
      { name: "ATLANTIC ALFEA EXCELLIA S 9 KW MONOPHASE", code: "520-556", qty: 1, unit: 15000, tax: 5.5, description: longPac },
      { name: "FOURNITURES POUR INSTALLATION POMPE À CHALEUR AIR/EAU", code: "FOUR-PAC", qty: 1, unit: 1850, tax: 5.5, description: `${"Kit hydraulique, liaisons frigorifiques, supports antivibratiles, vase d’expansion, vanne 3 voies, câblage et accessoires de pose. ".repeat(8)}` },
      { name: "INSTALLATION ET MISE EN SERVICE PAC", code: "MO-PAC", qty: 1, unit: 3200, tax: 10, description: `${"Dépose de l’existant, pose de l’unité extérieure, raccordements, mise en service et formation client. ".repeat(8)}` },
      { name: "BALLON THERMODYNAMIQUE 200L", code: "BTD-200", qty: 1, unit: 2100, tax: 5.5, description: `${"Ballon thermodynamique air/eau, appoint électrique, anode, groupe de sécurité et notice constructeur. ".repeat(8)}` },
      { name: "PLANCHER CHAUFFANT RDC", code: "PC-RDC", qty: 85, unit: 62, tax: 5.5, description: `${"Collecteurs, tubes PER, isolation, chape fluide et équilibrage des boucles du rez-de-chaussée. ".repeat(8)}` },
    ],
  };
}

test("la description n’a pas le titre en double", () => {
  assert.equal(
    articleDescriptionText({
      name: "ATLANTIC ALFEA EXCELLIA S 9 KW MONOPHASE",
      description: "ATLANTIC ALFEA EXCELLIA S 9 KW MONOPHASE\n\nMarque : Atlantic\nRéfrigérant : R32",
    }),
    "Marque : Atlantic\nRéfrigérant : R32"
  );
});

test("les prix restent sur la ligne du titre, le détail dans la 1re colonne", () => {
  const html = buildDevisArticleHtml({
    name: "ATLANTIC ALFEA EXCELLIA S 9 KW MONOPHASE",
    code: "520-556",
    qty: 1,
    unit: 15000,
    tax: 5.5,
    totalHT: 15000,
    totalTTC: 15825,
    description: "Marque : Atlantic\nRéfrigérant : R32",
  });
  assert.match(html, /<b class="name" data-article-name>ATLANTIC ALFEA EXCELLIA S 9 KW MONOPHASE<\/b>/);
  assert.match(html, /<small>Réf\. 520-556<\/small>/);
  assert.match(html, /<div class="num">1<\/div>/);
  assert.match(html, /15\s?000/);
  const nums = [...html.matchAll(/<div class="num">([\s\S]*?)<\/div>/g)].map(match => match[1]).join(" ");
  assert.doesNotMatch(nums, /Réfrigérant/);
  assert.doesNotMatch(nums, /Marque :/);
  assert.match(html, /<div class="article-desc" data-split-text>[\s\S]*Réfrigérant/);
  assert.doesNotMatch(html, /article-desc" data-split-text>ATLANTIC ALFEA/);
});

test("un groupe photovoltaïque imprime son titre", async () => {
  const html = await buildDevisPrintHtml({
    kind: "Devis",
    number: "DEV-PV",
    date: "2026-11-06",
    due: "2026-12-06",
    deliveryDate: "2026-11-20",
    client: "Client Test",
    items: [
      { name: "Panneau 500 W", category: "Photovoltaïque", qty: 9, unit: 0, tax: 5.5, forfait: true, forfaitHt: 13127.96, bundleId: "pv-1", bundleName: "Jinko Solar — 4,5 kW monophasé — micro-onduleurs", description: "PANNEAU" },
      { name: "Micro-onduleur", category: "Photovoltaïque", qty: 9, unit: 0, tax: 0, forfait: true, bundleId: "pv-1", bundleName: "Jinko Solar — 4,5 kW monophasé — micro-onduleurs", description: "MICRO" },
    ],
  }, { logoData: "/mkl-energies.png" });
  assert.equal((html.match(/class="pv-group-title"/g) || []).length, 1);
  assert.match(html, /Jinko Solar — 4,5 kW monophasé — micro-onduleurs/);
});

test("un groupe n imprime pas son surtitre", async () => {
  const html = await buildDevisPrintHtml({
    kind: "Devis",
    number: "DEV-TEST",
    date: "2026-09-22",
    due: "2026-10-22",
    deliveryDate: "2026-11-06",
    client: "Client Test",
    items: [
      { name: "Groupe extérieur", qty: 1, unit: 1200, tax: 20, bundleId: "clim-1", bundleName: "Installation climatisation" },
      { name: "Unité intérieure", qty: 1, unit: 800, tax: 20, bundleId: "clim-1", bundleName: "Installation climatisation" },
    ],
  }, { logoData: "/mkl-energies.png" });
  assert.doesNotMatch(html, /class="bundle-surtitre"/);
  assert.doesNotMatch(html, /Installation climatisation/);
});

test("le template devis n’enferme plus le devis sur une seule page", async () => {
  const html = await buildDevisPrintHtml(sampleDoc(), { logoData: "/mkl-energies.png" });
  assert.match(html, /sheet-flow/);
  assert.match(html, /article-block/);
  assert.match(html, /closing-totals/);
  assert.match(html, /data-split-text/);
  assert.match(html, /P\.U HT/);
  assert.match(html, /Total TTC/);
  assert.match(html, /class="quote-head"/);
  assert.match(html, /Offre valable jusqu/);
  assert.match(html, />Détail</);
  assert.doesNotMatch(html, /<header class="document-head"/);
  assert.doesNotMatch(html, /SERVICE COMMERCIAL/);
  assert.doesNotMatch(html, /line-detail/);
  assert.doesNotMatch(html, /\.sheet-flow\{[^}]*overflow:hidden/);
  assert.doesNotMatch(html, /\.summary\{[^}]*position:absolute/);
  assert.match(html, /\.note\{color:#7d8799;border-top:1px solid #e4e7ee/);
  assert.doesNotMatch(html, /\.sheet-flow \.note\{[^}]*position:absolute/);
  assert.match(html, /Marque : Atlantic/);
  assert.match(html, /FOURNITURES POUR INSTALLATION/);
  assert.equal((html.match(/class="article-block"/g) || []).length, 5);
});

test("devis, thermique et prévisite partagent le même bandeau logo", () => {
  const company = readFileSync(new URL("../app/lib/company.js", import.meta.url), "utf8");
  const previsite = readFileSync(new URL("../app/previsite/previsite.css", import.meta.url), "utf8");
  const thermal = readFileSync(new URL("../app/lib/thermal-print.js", import.meta.url), "utf8");
  const pv = readFileSync(new URL("../app/pv-study/page.js", import.meta.url), "utf8");
  const pvCss = readFileSync(new URL("../app/pv-study/study.css", import.meta.url), "utf8");
  assert.match(company, /align-items:center/);
  assert.match(company, /grid-template-columns:64mm 1fr/);
  assert.match(previsite, /grid-template-columns:64mm 1fr;align-items:center/);
  assert.match(thermal, /DOCUMENT_HEAD_CSS/);
  assert.match(pv, /className="study-head"/);
  assert.match(pvCss, /width:58mm/);
  assert.doesNotMatch(pv, /SERVICE COMMERCIAL/);
  assert.doesNotMatch(pvCss, /\.document-head>div\{background:#405fae/);
});

test("le forfait photovoltaïque imprime le hors-taxe et le TTC", async () => {
  const html = await buildDevisPrintHtml({
    kind: "Devis",
    number: "DEV-MICRO",
    date: "2026-11-06",
    due: "2026-12-06",
    deliveryDate: "2026-11-20",
    client: "Client Test",
    items: [
      {
        name: "JINKO SOLAR 54HL4M-BDV-500 W",
        code: "54HL4M-BDV-500-W",
        qty: 9,
        unit: 0,
        tax: 5.5,
        forfait: true,
        forfaitHt: 13127.96,
        description: "JINKO SOLAR 54HL4M-BDV-500 W\n\nPANNEAU\n\nType de cellule : Monocristallin",
      },
      {
        name: "MICRO-ONDULEUR ENPHASE IQ9N-A-INT",
        code: "IQ9N-A-INT",
        qty: 9,
        unit: 0,
        tax: 0,
        forfait: true,
        forfaitHt: null,
        description: "MICRO-ONDULEUR ENPHASE IQ9N-A-INT\n\nMICRO-ONDULEUR\n\nMarque : Enphase",
      },
    ],
  }, { logoData: "/mkl-energies.png" });
  const blocks = [...html.matchAll(/<article[\s\S]*?<\/article>/g)].map(match => match[0]);
  assert.equal(blocks.length, 2);
  assert.match(blocks[0], /13[\s\u00a0\u202f]?128/);
  assert.match(blocks[0], /13[\s\u00a0\u202f]?850/);
  assert.match(blocks[0], /5,5\s?%/);
  assert.match(blocks[0], /Type de cellule : Monocristallin/);
  assert.doesNotMatch(blocks[1], /13[\s\u00a0\u202f]?850/);
  assert.match(blocks[1], /Marque : Enphase/);
  const prices = [...blocks[0].matchAll(/<div class="num">([\s\S]*?)<\/div>/g)].map(match => match[1]);
  assert.equal(prices.filter(cell => /850/.test(cell)).length, 2);
});

test("le moteur PDF pagine les feuilles fluides avant capture", () => {
  const pdf = readFileSync(new URL("../app/lib/html-to-pdf.js", import.meta.url), "utf8");
  const paginate = readFileSync(new URL("../app/lib/pdf-paginate.js", import.meta.url), "utf8");
  assert.match(pdf, /paginateFlowSheets/);
  assert.match(paginate, /sheet-flow/);
  assert.match(paginate, /attachColumnHead/);
  assert.match(paginate, /Suite —/);
  assert.doesNotMatch(paginate, /transform:\s*scale/);
});
