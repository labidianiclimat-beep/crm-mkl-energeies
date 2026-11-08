import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canAccessNav } from "../app/lib/access-control.js";
import { documentsForRecord } from "../app/lib/record-documents.js";
import { buildSizingPrintHtml } from "../app/lib/sizing-note-print.js";
import { computeThermalStudy } from "../app/lib/thermal-study.js";
import {
  computeSizingNote,
  coverageRate,
  energyCoverageRate,
  findThermalStudyByNumber,
  heatLossWatts,
  heatPumpMachineForClient,
  heatedVolume,
  isSizingNote,
  nextSizingNumber,
  searchHeatPumpArticles,
  sizingClientForStudy,
  sizingDeltaT,
  sizingFieldsFromThermalStudy,
} from "../app/lib/sizing-note.js";

const base = {
  equipmentType: "bar-th-171",
  surface: 40,
  height: 2.5,
  tIndoor: 21,
  tOutdoor: 1,
  coefficient: 1,
};

test("volume à chauffer = surface × hauteur", () => {
  assert.equal(heatedVolume(100, 2.5), 250);
  assert.equal(heatedVolume("100,5", "2,5"), 251.25);
});

test("delta T retient l’arrêt de la PAC seulement s’il dépasse la base", () => {
  assert.equal(sizingDeltaT({ tIndoor: 21, tOutdoor: -7 }).deltaT, 28);
  assert.equal(sizingDeltaT({ tIndoor: 21, tOutdoor: -7, stopTemp: -7 }).usesStop, false);
  assert.equal(sizingDeltaT({ tIndoor: 21, tOutdoor: -7, stopTemp: 0 }).deltaT, 21);
  assert.equal(sizingDeltaT({ tIndoor: 21, tOutdoor: -7, stopTemp: 0 }).usesStop, true);
});

test("déperditions = volume × coefficient × delta T", () => {
  assert.equal(heatLossWatts(250, 1.1, 28), 7700);
  const note = computeSizingNote(base);
  assert.equal(note.volume, 100);
  assert.equal(note.deltaT, 20);
  assert.equal(note.lossesW, 2000);
  assert.equal(note.lossesKw, 2);
});

test("une PAC air/eau, eau/eau ou sol/eau couvre 60 % à 130 %", () => {
  assert.equal(coverageRate(1200, 2000), 60);
  assert.equal(coverageRate(2600, 2000), 130);
  assert.equal(computeSizingNote({ ...base, pacPowerW: 1500 }).verdict.ok, true);
  assert.equal(computeSizingNote({ ...base, pacPowerW: 1000 }).verdict.ok, false);
  assert.equal(computeSizingNote({ ...base, equipmentType: "bar-th-172", pacPowerW: 2700 }).verdict.ok, false);
  assert.equal(computeSizingNote({ ...base, pacPowerW: "" }).coverage, null);
});

test("une PAC hybride exige 70 % hors appoint et 40 % à 80 % en puissance", () => {
  assert.equal(energyCoverageRate(700, 1000), 70);
  assert.equal(energyCoverageRate(699, 1000), 69.9);
  const ok = computeSizingNote({
    ...base,
    equipmentType: "bar-th-159",
    pacEnergyKwh: 700,
    annualNeedsKwh: 1000,
    pacPowerW: 800,
  });
  assert.equal(ok.energyCoverage, 70);
  assert.equal(ok.coverage, 40);
  assert.equal(ok.verdict.ok, true);
  assert.equal(computeSizingNote({
    ...base,
    equipmentType: "bar-th-159",
    pacEnergyKwh: 699,
    annualNeedsKwh: 1000,
    pacPowerW: 800,
  }).verdict.ok, false);
  assert.equal(computeSizingNote({
    ...base,
    equipmentType: "bar-th-159",
    pacEnergyKwh: 800,
    annualNeedsKwh: 1000,
    pacPowerW: 1620,
  }).verdict.label.includes("80 %"), true);
});

test("la chaudière biomasse calcule les déperditions sans la plage 60-130", () => {
  const note = computeSizingNote({
    ...base,
    equipmentType: "bar-th-113",
    stopTemp: 15,
    pacPowerW: 100,
  });
  assert.equal(note.family, "biomass");
  assert.equal(note.usesStop, false);
  assert.equal(note.deltaT, 20);
  assert.equal(note.coverage, null);
  assert.equal(note.verdict.ok, true);
});

test("le numéro ND ne se mélange pas aux études thermiques", () => {
  assert.equal(isSizingNote({ kind: "dimensionnement" }), true);
  assert.equal(isSizingNote({ number: "ETH-2026-000001" }), false);
  assert.equal(nextSizingNumber([
    { number: "ETH-2026-000004" },
    { number: "ND-2026-000002" },
  ], new Date("2026-10-08")), "ND-2026-000003");
});

test("le document imprime toutes les équations", () => {
  const pac = buildSizingPrintHtml({
    ...base,
    brand: "MKL",
    model: "PAC-1",
    pacPowerW: 1500,
    waterTemp: 45,
    lastName: "Martin",
    firstName: "Léa",
    noteDate: "2026-10-08",
  }, { number: "ND-2026-000001" });
  assert.match(pac, /Note de dimensionnement/);
  assert.match(pac, /volume à chauffer/);
  assert.match(pac, /Delta T/);
  assert.match(pac, /Déperditions/);
  assert.match(pac, /60% et 130%/);
  assert.match(pac, /avant le début des travaux/);
  assert.doesNotMatch(pac, /hydride/);
  const hybrid = buildSizingPrintHtml({
    ...base,
    equipmentType: "bar-th-159",
    pacEnergyKwh: 800,
    annualNeedsKwh: 1000,
    pacPowerW: 1000,
    regulationModule: "Module A",
  });
  assert.match(hybrid, /hybride/);
  assert.match(hybrid, /70 %/);
  assert.match(hybrid, /40 % et 80 %/);
  assert.match(hybrid, /Module A/);
});

test("la note est dans l’espace commercial, pas dans l’administration", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const commercial = page.slice(page.indexOf('name:"Commercial"'), page.indexOf('name:"Administration"'));
  const administration = page.slice(page.indexOf('name:"Administration"'), page.indexOf('name:"Opérations"'));
  assert.match(commercial, /Note de dimensionnement/);
  assert.doesNotMatch(administration, /Note de dimensionnement/);
  assert.match(page, /!isSizingNote\(study\)/);
  assert.equal(canAccessNav(["Études thermiques"], "Note de dimensionnement"), true);
  assert.equal(canAccessNav(["Clients"], "Note de dimensionnement"), false);
});

test("la fiche client range la note à part de l’étude thermique", () => {
  const docs = documentsForRecord({
    person: { id: "c1", name: "Martin Léa", lastName: "Martin", firstName: "Léa" },
    kind: "client",
    billing: [],
    thermalStudies: [
      { id: "t1", number: "ETH-2026-000001", clientId: "c1", powerDynamicKw: 6 },
      { id: "n1", kind: "dimensionnement", number: "ND-2026-000001", clientId: "c1", equipmentLabel: "Pompe à chaleur hybride – BAR TH 159" },
    ],
    visits: [],
    contracts: [],
    installations: [],
    pvProjects: [],
  });
  assert.equal(docs.find(item => item.download === "thermal")?.title, "ETH-2026-000001");
  const note = docs.find(item => item.download === "sizing");
  assert.equal(note?.kind, "Note de dimensionnement");
  assert.equal(note?.href, "/note-dimensionnement?id=n1");
});

test("le numéro d’étude thermique ouvre les valeurs déjà calculées", () => {
  const study = {
    id: "eth-1",
    number: "ETH-2026-000042",
    clientId: "c1",
    lastName: "Martin",
    firstName: "Alice",
    address: "12 rue des Lilas",
    postalCode: "67000",
    city: "Strasbourg",
    surface: 120,
    height: 2.5,
    tIndoor: 19,
    tOutdoor: -15,
    walls: 3,
    powerDynamicKw: 8,
    pacPowerW: 9000,
  };
  const notes = [
    { kind: "dimensionnement", number: "ND-2026-000042", id: "note" },
    study,
    { number: "ETH-2025-000042", id: "older", clientId: "c9" },
  ];
  assert.equal(findThermalStudyByNumber(notes, "eth-2026-000042").study?.id, "eth-1");
  assert.equal(findThermalStudyByNumber(notes, "000042").ambiguous, true);
  assert.equal(findThermalStudyByNumber(notes, "ETH-2025-000042").study?.id, "older");
  const fields = sizingFieldsFromThermalStudy(study);
  const computed = computeThermalStudy(study);
  assert.equal(fields.surface, 120);
  assert.equal(fields.height, 2.5);
  assert.equal(fields.tIndoor, 19);
  assert.equal(fields.tOutdoor, -15);
  assert.equal(fields.coefficient, computed.g);
  assert.equal(fields.annualNeedsKwh, computed.energyKwh);
  assert.equal(fields.lastName, "Martin");
  assert.equal(fields.address, "12 rue des Lilas");
  assert.equal(fields.pacPowerW, undefined);
  assert.equal(fields.stopTemp, undefined);
  assert.equal(fields.waterTemp, undefined);
  assert.equal(fields.pacEnergyKwh, undefined);
  assert.equal(fields.regulationModule, undefined);
  assert.equal(fields.equipmentType, undefined);
  assert.equal(sizingClientForStudy(study, [{ id: "c1", name: "Alice Martin" }]).client?.id, "c1");
  assert.equal(sizingClientForStudy({ prospectId: "p1", number: "ETH-2026-000007" }, []).reason, "prospect");
});

test("la marque et le modèle viennent du devis pompe à chaleur, sinon du catalogue", () => {
  const pac = {
    id: "a-pac",
    brand: "Panasonic",
    name: "Aquarea T-CAP 9 kW",
    code: "WH-WXG09ME5",
    category: "Chauffage",
    subcategory: "Pompe à chaleur",
    active: true,
  };
  const pose = {
    id: "a-pose",
    brand: "Panasonic",
    name: "Installation",
    code: "POSE-PAC",
    category: "Chauffage",
    subcategory: "Installation",
    active: true,
  };
  const older = {
    kind: "Devis",
    clientId: "c1",
    date: "2026-01-01",
    items: [{ articleId: "a-old", code: "OLD" }],
  };
  const latest = {
    kind: "Devis",
    clientId: "c1",
    date: "2026-09-01",
    items: [
      { articleId: "a-pose", code: "POSE-PAC" },
      { articleId: "a-pac", code: "WH-WXG09ME5" },
    ],
  };
  const other = { kind: "Devis", clientId: "c2", date: "2026-10-01", items: [{ articleId: "a-pac" }] };
  const machine = heatPumpMachineForClient(
    [older, latest, other],
    [pose, pac, { id: "a-old", brand: "Autre", name: "Ancien", code: "OLD", category: "Chauffage", subcategory: "Pompe à chaleur" }],
    "c1",
  );
  assert.deepEqual(machine, { articleId: "a-pac", brand: "Panasonic", model: "Aquarea T-CAP 9 kW" });
  assert.equal(heatPumpMachineForClient([latest], [pose], "c1"), null);
  const found = searchHeatPumpArticles([pose, pac], "aquarea panasonic");
  assert.equal(found.length, 1);
  assert.equal(found[0].id, "a-pac");
  const page = readFileSync(new URL("../app/note-dimensionnement/page.js", import.meta.url), "utf8");
  const connect = readFileSync(new URL("../app/components/document-window.js", import.meta.url), "utf8");
  const crm = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /Numéro d’étude thermique/);
  assert.match(page, /Article pompe à chaleur/);
  assert.match(connect, /Numéro d’étude thermique/);
  assert.match(crm, /thermalStudies=\{studio\.kind==="sizing"\?studies:null\}/);
  assert.match(crm, /presetStudy=\{linkedStudy\}/);
});
