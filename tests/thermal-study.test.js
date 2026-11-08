import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ALSACE_DJU,
  DEFAULT_T_INDOOR,
  PAC_COP,
  createEmptyThermalStudy,
  annualEnergyKwh,
  computeThermalStudy,
  fuelQuantity,
  gFromPoints,
  heatLossKw,
  heatedVolume,
  insulationPoints,
  nextStudyNumber,
  pacEnergyKwh,
  temperatureDelta,
} from "../app/lib/thermal-study.js";
import { buildThermalPrintHtml } from "../app/lib/thermal-print.js";

test("volume chauffé = surface × hauteur", () => {
  assert.equal(heatedVolume(100, 2.5), 250);
  assert.equal(heatedVolume("80,5", "2,4"), 193.2);
});

test("delta T = température intérieure − extérieure de base", () => {
  assert.equal(temperatureDelta(19, -15), 34);
  assert.equal(temperatureDelta(21, -15), 36);
});

test("la température intérieure de confort vaut 21 °C par défaut", () => {
  assert.equal(DEFAULT_T_INDOOR, 21);
  assert.equal(createEmptyThermalStudy().tIndoor, 21);
  assert.equal(computeThermalStudy({}).tIndoor, 21);
});

test("grille d’isolation additionne les points du document", () => {
  assert.equal(insulationPoints({
    construction: 4,
    housingType: 2,
    wallInsulation: 3,
    roofInsulation: 3,
    floorInsulation: 3,
    glazing: 3,
    ventilation: 3,
  }), 21);
  assert.equal(insulationPoints({
    construction: 0,
    housingType: 0,
    wallInsulation: 0,
    roofInsulation: 0,
    floorInsulation: 0,
    glazing: 0,
    ventilation: 0,
  }), 0);
});

test("coefficient G suit le tableau du PDF Alsace", () => {
  assert.equal(gFromPoints(6), 1.4);
  assert.equal(gFromPoints(6.5), 1.3);
  assert.equal(gFromPoints(7), 1.3);
  assert.equal(gFromPoints(10), 1.15);
  assert.equal(gFromPoints(11), 1.1);
  assert.equal(gFromPoints(12), 1);
  assert.equal(gFromPoints(16), 0.8);
  assert.equal(gFromPoints(17), 0.75);
  assert.equal(gFromPoints(17.5), 0.7);
  assert.equal(gFromPoints(21), 0.7);
});

test("puissance et énergie annuelle reprennent les formules du document", () => {
  const volume = 250;
  const g = 0.7;
  const deltaT = 34;
  assert.equal(heatLossKw(volume, g, deltaT), 5.95);
  assert.equal(annualEnergyKwh(volume, g, ALSACE_DJU), 10029.6);
  assert.equal(pacEnergyKwh(10029.6, PAC_COP), 2388);
});

test("quantités combustibles à partir de l’énergie de référence", () => {
  assert.equal(fuelQuantity(1380, 13.8), 100);
  assert.equal(fuelQuantity(1000, 10), 100);
  assert.equal(fuelQuantity(1050, 10.5), 100);
});

test("étude complète calcule G, kW, kWh, PAC et coûts", () => {
  const study = computeThermalStudy({
    surface: 100,
    height: 2.5,
    tIndoor: 19,
    tOutdoor: -15,
    construction: 4,
    housingType: 2,
    wallInsulation: 3,
    roofInsulation: 3,
    floorInsulation: 3,
    glazing: 3,
    ventilation: 3,
    edfTariff: 0.2,
    propaneTariff: 1.5,
    airAirTariff: 0.2,
    airEauTariff: 0.18,
  });
  assert.equal(study.volume, 250);
  assert.equal(study.points, 21);
  assert.equal(study.g, 0.7);
  assert.equal(study.deltaT, 34);
  assert.equal(study.powerDynamicKw, 5.95);
  assert.equal(study.powerMaxKw, 6.3);
  assert.equal(study.energyKwh, 10029.6);
  assert.equal(study.heatPumpKwh, 2388);
  assert.equal(study.propaneQty, 726.8);
  assert.equal(study.costs.edf, 2005.92);
  assert.equal(study.costs.airAir, 477.6);
  assert.equal(study.costs.airEau, 429.84);
});

test("numérotation ETH-AAAA-000001", () => {
  assert.equal(nextStudyNumber([], new Date("2026-09-16")), "ETH-2026-000001");
  assert.equal(nextStudyNumber([
    { number: "ETH-2026-000003" },
    { number: "ETH-2025-000099" },
  ], new Date("2026-09-16")), "ETH-2026-000004");
});

test("module Études thermiques ouvert au service commercial", async () => {
  const { ACCESS_MODULES, roleModuleDefaults } = await import("../app/lib/roles.js");
  const defaults = roleModuleDefaults();
  assert.ok(ACCESS_MODULES.includes("Études thermiques"));
  assert.ok(defaults.Commercial.includes("Études thermiques"));
  assert.ok(defaults["Responsable commercial"].includes("Études thermiques"));
  assert.ok(defaults.Direction.includes("Études thermiques"));
});

test("le formulaire imprime un PDF via le navigateur", () => {
  const source = readFileSync(new URL("../app/etude-thermique/page.js", import.meta.url), "utf8");
  const print = readFileSync(new URL("../app/lib/thermal-print.js", import.meta.url), "utf8");
  assert.match(source, /openThermalPrintWindow/);
  assert.match(source, /computeThermalStudy/);
  assert.match(source, /THERMAL_STUDY_STORAGE_KEY/);
  assert.match(source, /loadSharedRecords/);
  assert.match(source, /thermal-euro-field/);
  assert.doesNotMatch(source, /\/> €/);
  assert.match(print, /buildThermalPrintHtml/);
  assert.match(print, /Coefficient G d’isolation de la maison/);
});

test("le PDF thermique reprend la même feuille que le formulaire", () => {
  const html = buildThermalPrintHtml({
    lastName: "Dupont",
    firstName: "Marie",
    address: "12 rue des Lilas",
    postalCode: "67000",
    city: "Strasbourg",
    surface: 100,
    height: 2.5,
    construction: 3,
    housingType: 1,
    wallInsulation: 2,
    roofInsulation: 2,
    floorInsulation: 1,
    glazing: 2,
    ventilation: 1,
  }, { number: "ETH-2026-000001" });
  assert.match(html, /Dupont/);
  assert.match(html, /Marie/);
  assert.match(html, /12 rue des Lilas/);
  assert.match(html, /ETH-2026-000001/);
  assert.match(html, /Coefficient G d’isolation de la maison/);
  assert.match(html, /Situation actuelle/);
  assert.match(html, /Avec la pompe à chaleur/);
  assert.match(html, /thermal-euro-box/);
  assert.match(html, /onclick="window\.print\(\)"/);
  assert.match(html, />Imprimer</);
});

test("les etudes thermiques s affichent en tableau", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /Nouvelle étude thermique/);
  assert.match(page, /className="data-panel thermal-table"/);
  assert.match(page, /<span>Étude<\/span><span>Client<\/span><span>Adresse<\/span>/);
});
