import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatHeatPumpDescription } from "../app/lib/heat-pump-specs.js";
import { euro } from "../app/lib/devis-pdf.js";
import {
  articleElectricalPhase,
  atlanticHeatPumpArticles,
  buildHeatPumpTariffPdfBlob,
  buildTariffGridPdfBlob,
  heatPumpTariffRows,
  isAtlanticBrand,
  isAtlanticHeatPumpArticle,
  isBallonThermodynamiqueArticle,
  isHeatPumpModelArticle,
  preparedTariffGrids,
  tariffSectionsFor,
} from "../app/lib/heat-pump-tariff.js";

function pac({ name, code, sell, power, brand = "Atlantic", subcategory = "Pompe à chaleur", supply = "230 V monophasé", extra = {} } = {}) {
  return {
    id: code,
    code,
    name,
    brand,
    category: "Chauffage",
    subcategory,
    sell,
    tax: 5.5,
    status: "Actif",
    active: true,
    description: formatHeatPumpDescription({
      eprel: "100001",
      energyClass: "A+++ / A++",
      scop: "4,6 / 3,8",
      powerMinus7_35: power,
      powerSupply: supply,
    }, { brand, title: name }),
    ...extra,
  };
}

const catalog = [
  pac({ name: "Alfea Excellia 6", code: "ATL-6", sell: 9800, power: "6,2 kW" }),
  pac({ name: "Alfea Excellia 8", code: "ATL-8", sell: 11200, power: "8,2 kW" }),
  pac({ name: "Alfea Excellia 11", code: "ATL-11", sell: 12900, power: "10,8 kW" }),
  pac({ name: "Alfea Excellia 14 TRI", code: "ATL-14T", sell: 14900, power: "13,8 kW", supply: "400 V triphasé" }),
  pac({ name: "Alfea Excellia 16 TRI", code: "ATL-16T", sell: 16200, power: "16,1 kW", supply: "400 V triphasé" }),
  pac({ name: "Alfea Excellia Duo 8", code: "ATL-D8", sell: 14100, power: "8,0 kW", subcategory: "Pompe à chaleur Duo" }),
  pac({ name: "Alfea Excellia Duo 11", code: "ATL-D11", sell: 15800, power: "11,0 kW", subcategory: "Pompe à chaleur Duo" }),
  pac({ name: "Alfea Excellia Duo 16 TRI", code: "ATL-D16T", sell: 17900, power: "16,0 kW", subcategory: "Pompe à chaleur Duo", supply: "400 V triphasé" }),
  pac({ name: "Altherma 8", code: "DAI-8", sell: 12000, power: "8,0 kW", brand: "Daikin" }),
  {
    id: "FOUR-1",
    code: "FOUR-PAC",
    name: "Fournitures PAC",
    brand: "Atlantic",
    category: "Chauffage",
    subcategory: "Fourniture",
    sourceReference: "picker:fourniture",
    sell: 800,
    tax: 20,
    status: "Actif",
    active: true,
  },
  {
    id: "INST-1",
    code: "INST-PAC",
    name: "Installation PAC",
    brand: "Atlantic",
    category: "Chauffage",
    subcategory: "Installation",
    sourceReference: "picker:installation",
    sell: 2400,
    tax: 10,
    status: "Actif",
    active: true,
  },
];

test("seules les PAC Atlantic actives alimentent la grille", () => {
  assert.equal(isAtlanticBrand("Atlantic"), true);
  assert.equal(isAtlanticBrand("Daikin"), false);
  assert.equal(isAtlanticHeatPumpArticle(catalog[0]), true);
  assert.equal(isAtlanticHeatPumpArticle(catalog.find(item => item.code === "DAI-8")), false);
  assert.equal(isAtlanticHeatPumpArticle(catalog.find(item => item.code === "FOUR-PAC")), false);
  assert.equal(articleElectricalPhase(catalog.find(item => item.code === "ATL-6")), "mono");
  assert.equal(articleElectricalPhase(catalog.find(item => item.code === "ATL-14T")), "tri");
  const rows = heatPumpTariffRows(catalog);
  assert.deepEqual(rows.map(row => row.code), ["ATL-6", "ATL-8", "ATL-11", "ATL-14T", "ATL-16T", "ATL-D8", "ATL-D11", "ATL-D16T"]);
  assert.deepEqual(rows.map(row => row.section), ["simpleMono", "simpleMono", "simpleMono", "simpleTri", "simpleTri", "duoMono", "duoMono", "duoTri"]);
  assert.equal(atlanticHeatPumpArticles(catalog).length, 8);
});

test("les prix TTC suivent la TVA de la fiche", () => {
  const [first] = heatPumpTariffRows([catalog[0]]);
  assert.equal(first.ht, 9800);
  assert.equal(first.ttc, 9800 * 1.055);
  assert.equal(first.htLabel, euro(9800));
  assert.doesNotMatch(first.htLabel, /\//);
});

test("le PDF paysage separe monophase et triphase par puissance croissante", async () => {
  const blob = await buildHeatPumpTariffPdfBlob(catalog, { logoData: "", date: new Date("2026-09-21") });
  assert.ok(blob?.size > 1200);
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  const raw = bytes.toString("latin1");
  assert.match(raw, /GRILLE TARIFAIRE/);
  assert.match(raw, /Atlantic/);
  assert.match(raw, /Alfea Excellia 6/);
  assert.match(raw, /Alfea Excellia Duo 11/);
  assert.match(raw, /ATL-6/);
  assert.match(raw, /ATL-14T/);
  assert.match(raw, /P.U HT|P\.U HT/);
  assert.match(raw, /Pompes à chaleur monophasé|Pompes a chaleur monophase/);
  assert.match(raw, /Pompes à chaleur triphasé|Pompes a chaleur triphase/);
  assert.match(raw, /Pompes à chaleur Duo monophasé|Pompes a chaleur Duo monophase/);
  assert.match(raw, /Pompes à chaleur Duo triphasé|Pompes a chaleur Duo triphase/);
  assert.doesNotMatch(raw, /Fourniture/);
  assert.doesNotMatch(raw, /Installation/);
  assert.doesNotMatch(raw, /FOUR-PAC/);
  assert.doesNotMatch(raw, /INST-PAC/);
  assert.doesNotMatch(raw, /Altherma/);
  const pages = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.ok(pages >= 1 && pages <= 2, `attendu 1 ou 2 pages, obtenu ${pages}`);
  assert.match(raw, /\/MediaBox\s*\[\s*0\s+0\s+8[34]\d(?:\.\d+)?\s+59[0-9](?:\.\d+)?\s*\]/);
  const atlantic = tariffSectionsFor(catalog, { familyId: "pac", brand: "Atlantic" });
  assert.deepEqual(atlantic.simpleMono.map(row => row.code), ["ATL-6", "ATL-8", "ATL-11"]);
  assert.deepEqual(atlantic.simpleTri.map(row => row.code), ["ATL-14T", "ATL-16T"]);
  assert.deepEqual(atlantic.duoMono.map(row => row.code), ["ATL-D8", "ATL-D11"]);
  assert.deepEqual(atlantic.duoTri.map(row => row.code), ["ATL-D16T"]);
});

test("les ballons thermodynamiques ont leur propre grille Atlantic", () => {
  const tanks = [
    {
      id: "BTD-1",
      code: "ATL-CAL-200",
      name: "Calypso VM 200",
      brand: "Atlantic",
      category: "Ballon d’eau chaude",
      subcategory: "Ballon thermodynamique",
      sell: 2100,
      tax: 5.5,
      status: "Actif",
      active: true,
      powerW: 200,
      description: formatHeatPumpDescription({ scop: "3,2", energyClass: "A+", powerSupply: "230 V monophasé" }, { brand: "Atlantic", title: "Calypso VM 200" }),
    },
    {
      id: "BTD-2",
      code: "ATL-CAL-270",
      name: "Ballon thermodynamique Calypso 270",
      brand: "Atlantic",
      category: "Chauffage",
      subcategory: "Pompe à chaleur",
      sell: 2450,
      tax: 5.5,
      status: "Actif",
      active: true,
      powerW: 270,
      description: formatHeatPumpDescription({ scop: "3,1", energyClass: "A+", powerSupply: "230 V monophasé" }, { brand: "Atlantic", title: "Calypso 270" }),
    },
  ];
  const mixed = [...catalog, ...tanks];
  assert.equal(isBallonThermodynamiqueArticle(tanks[0]), true);
  assert.equal(isBallonThermodynamiqueArticle(tanks[1]), true);
  assert.equal(isHeatPumpModelArticle(tanks[0]), false);
  assert.equal(isHeatPumpModelArticle(tanks[1]), false);
  assert.equal(isAtlanticHeatPumpArticle(tanks[0]), false);
  const pacRows = heatPumpTariffRows(mixed);
  assert.equal(pacRows.some(row => /CAL/.test(row.code)), false);
  const grids = preparedTariffGrids(mixed);
  const pac = grids.find(grid => grid.id === "pac-atlantic");
  const ballon = grids.find(grid => grid.id === "ballon-atlantic");
  assert.equal(pac?.ready, true);
  assert.equal(pac.counts.simples + pac.counts.tris + pac.counts.duos, 8);
  assert.equal(ballon?.ready, true);
  assert.deepEqual(ballon.counts, { simples: 2, tris: 0, duos: 0 });
  const sections = tariffSectionsFor(mixed, ballon);
  assert.deepEqual(sections.simpleMono.map(row => row.code), ["ATL-CAL-200", "ATL-CAL-270"]);
});

test("le module liste la grille Atlantic deja preparee", () => {
  const grids = preparedTariffGrids(catalog);
  const atlantic = grids.find(grid => grid.id === "pac-atlantic");
  const daikin = grids.find(grid => grid.id === "pac-daikin");
  assert.equal(atlantic?.ready, true);
  assert.deepEqual(atlantic.counts, { simples: 3, tris: 2, duos: 3 });
  assert.equal(daikin?.ready, true);
  assert.equal(daikin.counts.simples, 1);
  assert.equal(daikin.counts.tris, 0);
});

test("climatisation et photovoltaique ont une grille par marque", async () => {
  const extra = [
    {
      id: "CLIM-1",
      code: "TOS-35",
      name: "Split mural 3,5 kW",
      brand: "Toshiba",
      category: "Climatisation",
      subcategory: "Mono-split",
      sell: 1800,
      tax: 20,
      status: "Actif",
      active: true,
      powerW: 3500,
    },
    {
      id: "CLIM-2",
      code: "TOS-50",
      name: "Split mural 5 kW",
      brand: "Toshiba",
      category: "Climatisation",
      subcategory: "Mono-split",
      sell: 2300,
      tax: 20,
      status: "Actif",
      active: true,
      powerW: 5000,
    },
    {
      id: "CLIM-M",
      code: "TOS-M",
      name: "Multi-split 2 sorties",
      brand: "Toshiba",
      category: "Climatisation",
      subcategory: "Multi-split",
      sell: 3100,
      tax: 20,
      status: "Actif",
      active: true,
      powerW: 5200,
    },
    {
      id: "FOUR-C",
      code: "FOUR-CLIM",
      name: "Fournitures climatisation",
      brand: "Toshiba",
      category: "Climatisation",
      subcategory: "Fourniture",
      sourceReference: "picker:fourniture",
      sell: 120,
      tax: 20,
      status: "Actif",
      active: true,
    },
    {
      id: "INST-C",
      code: "INST-CLIM",
      name: "Installation climatisation",
      brand: "Toshiba",
      category: "Climatisation",
      subcategory: "Installation",
      sourceReference: "picker:installation",
      sell: 890,
      tax: 10,
      status: "Actif",
      active: true,
    },
    {
      id: "PV-1",
      code: "DS-450",
      name: "Panneau DualSun 450",
      brand: "DualSun",
      category: "Photovoltaïque",
      subcategory: "Panneaux",
      sell: 210,
      tax: 20,
      status: "Actif",
      active: true,
      powerW: 450,
    },
    {
      id: "PV-2",
      code: "DS-500",
      name: "Panneau DualSun 500",
      brand: "DualSun",
      category: "Photovoltaïque",
      subcategory: "Panneaux",
      sell: 240,
      tax: 20,
      status: "Actif",
      active: true,
      powerW: 500,
    },
    {
      id: "PV-O",
      code: "DS-INV",
      name: "Onduleur DualSun 6 kW",
      brand: "DualSun",
      category: "Photovoltaïque",
      subcategory: "Onduleur",
      sell: 980,
      tax: 20,
      status: "Actif",
      active: true,
      powerW: 6000,
    },
    {
      id: "FOUR-P",
      code: "FOUR-PV",
      name: "Fournitures photovoltaïques",
      brand: "DualSun",
      category: "Photovoltaïque",
      subcategory: "Fourniture",
      sourceReference: "picker:fourniture",
      sell: 75,
      tax: 20,
      status: "Actif",
      active: true,
    },
    {
      id: "INST-P",
      code: "INST-PV",
      name: "Installation photovoltaïque",
      brand: "DualSun",
      category: "Photovoltaïque",
      subcategory: "Installation",
      sourceReference: "picker:installation",
      sell: 1450,
      tax: 10,
      status: "Actif",
      active: true,
    },
  ];
  const mixed = [...catalog, ...extra];
  const grids = preparedTariffGrids(mixed);
  const clim = grids.find(grid => grid.id === "clim-toshiba");
  const pv = grids.find(grid => grid.id === "pv-dualsun");
  assert.equal(clim?.ready, true);
  assert.deepEqual(clim.counts, { simples: 2, tris: 0, duos: 1 });
  assert.equal(pv?.ready, true);
  assert.deepEqual(pv.counts, { simples: 2, tris: 0, duos: 1 });

  const climRows = tariffSectionsFor(mixed, clim);
  assert.deepEqual(climRows.simples.map(row => row.code), ["TOS-35", "TOS-50"]);
  assert.equal(climRows.duos[0].code, "TOS-M");

  const pvRows = tariffSectionsFor(mixed, pv);
  assert.deepEqual(pvRows.simples.map(row => row.code), ["DS-450", "DS-500"]);
  assert.equal(pvRows.duos[0].code, "DS-INV");

  const climPdf = await buildTariffGridPdfBlob(mixed, clim, { logoData: "", date: new Date("2026-09-21") });
  const climRaw = Buffer.from(await climPdf.arrayBuffer()).toString("latin1");
  assert.match(climRaw, /Climatisation Toshiba|GRILLE TARIFAIRE/);
  assert.match(climRaw, /TOS-35/);
  assert.match(climRaw, /TOS-M/);
  assert.match(climRaw, /Climatisation monophasé|Climatisation monophase/);
  assert.doesNotMatch(climRaw, /FOUR-CLIM/);
  assert.doesNotMatch(climRaw, /INST-CLIM/);
  assert.doesNotMatch(climRaw, /Alfea/);

  const pvPdf = await buildTariffGridPdfBlob(mixed, pv, { logoData: "", date: new Date("2026-09-21") });
  const pvRaw = Buffer.from(await pvPdf.arrayBuffer()).toString("latin1");
  assert.match(pvRaw, /Photovolta/);
  assert.match(pvRaw, /DS-450/);
  assert.match(pvRaw, /DS-INV/);
  assert.doesNotMatch(pvRaw, /FOUR-PV/);
  assert.doesNotMatch(pvRaw, /INST-PV/);
});

test("Mitsubishi et Atlantic separent pompe a chaleur, climatisation et ballon", () => {
  const mixed = [
    pac({ name: "Ecodan 8", code: "MIT-PAC", sell: 9000, power: "8,0 kW", brand: "Mitsubishi" }),
    {
      id: "MIT-CLIM",
      code: "MIT-CLIM",
      name: "Split mural Mitsubishi 3,5",
      brand: "Mitsubishi",
      category: "Climatisation",
      subcategory: "Mono-split",
      sell: 1600,
      tax: 20,
      status: "Actif",
      active: true,
      powerW: 3500,
      description: formatHeatPumpDescription({ scop: "4,1", energyClass: "A++", powerSupply: "230 V monophasé" }, { brand: "Mitsubishi", title: "Split mural" }),
    },
    pac({ name: "Alfea 8", code: "ATL-PAC", sell: 9800, power: "8,0 kW", brand: "Atlantic" }),
    {
      id: "ATL-ECS",
      code: "ATL-ECS",
      name: "Ballon d’eau chaude 200 L",
      brand: "Atlantic",
      category: "Ballon d’eau chaude",
      subcategory: "Ballon électrique",
      sell: 890,
      tax: 5.5,
      status: "Actif",
      active: true,
    },
  ];
  const grids = preparedTariffGrids(mixed);
  assert.deepEqual(
    grids.filter(grid => grid.brand === "Mitsubishi").map(grid => grid.familyId),
    ["pac", "clim"]
  );
  assert.deepEqual(
    grids.filter(grid => grid.brand === "Atlantic").map(grid => grid.familyId),
    ["pac", "ballon"]
  );
  const pacRows = tariffSectionsFor(mixed, { familyId: "pac", brand: "Mitsubishi" });
  assert.deepEqual(pacRows.simples.map(row => row.code), ["MIT-PAC"]);
  const climRows = tariffSectionsFor(mixed, { familyId: "clim", brand: "Mitsubishi" });
  assert.deepEqual(climRows.simples.map(row => row.code), ["MIT-CLIM"]);
  const atlanticPac = tariffSectionsFor(mixed, { familyId: "pac", brand: "Atlantic" });
  assert.equal(atlanticPac.simples.some(row => row.code === "ATL-ECS"), false);
  const atlanticTank = tariffSectionsFor(mixed, { familyId: "ballon", brand: "Atlantic" });
  assert.deepEqual(atlanticTank.simples.map(row => row.code), ["ATL-ECS"]);
});

test("la grille tarifaire s’imprime seulement pour Admin VIP et Superadmin", () => {
  const view = readFileSync(new URL("../app/components/tariff-grids.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const tariff = readFileSync(new URL("../app/lib/heat-pump-tariff.js", import.meta.url), "utf8");
  assert.match(view, /canPrint/);
  assert.match(view, /Imprimer/);
  assert.match(view, /print: action === "print"/);
  assert.match(page, /TariffGridsView[\s\S]*canPrint=\{isAdminRole\(currentRole\)\}/);
  assert.match(tariff, /printPdfBlob\(blob\)/);
});
