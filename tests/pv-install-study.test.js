import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compassToPvgisAspect } from "../app/lib/pv-geo.js";
import {
  addPlaneModule,
  alignRoofModules,
  compassLabel,
  completeStudyFromProject,
  computeInstallStudyResults,
  emptyCompleteStudy,
  emptyPlaneLayout,
  layoutRoofPanels,
  normalizeRoofPlane,
  planeProduction,
} from "../app/lib/pv-install-study.js";
import { canCreateCompletePvStudy, canCreateSoftPvStudy, isCompletePvStudy } from "../app/lib/pv-study-kinds.js";
import { computePvStudyResults } from "../app/lib/pv-study.js";
import { buildPvInstallStudyPdfBlob } from "../app/lib/pv-install-study-pdf.js";
import { roleModuleDefaults } from "../app/lib/roles.js";

const ready = { active: true, onboarding_completed_at: "2026-01-01T00:00:00Z" };

test("l etude soft du commercial n est pas remplacee par le calcul complet", () => {
  const project = {
    estimatedProduction: 7200,
    annualConsumption: 8500,
    selfConsumptionRate: 65,
    electricityPrice: 0.194,
    surplusPrice: 0.04,
    price: 15000,
  };
  const soft = computePvStudyResults(project);
  assert.equal(soft.production, 7200);
  assert.equal(soft.selfConsumed, Math.min(8500, 7200 * 0.65));
  assert.equal(isCompletePvStudy(project), false);
});

test("l etude d installation calcule pans, batterie virtuelle et journee type", () => {
  const project = {
    annualConsumption: 2300,
    electricityPrice: 0.2001,
    surplusPrice: 0.04,
    price: 0,
    completeStudy: emptyCompleteStudy({
      planes: [{
        name: "Sud",
        compass: 159,
        tilt: 27,
        panels: 9,
        panelPower: 500,
        shadePercent: 4,
        yieldValue: 900,
      }, {
        name: "Nord",
        compass: 340,
        tilt: 27,
        panels: 9,
        panelPower: 500,
        shadePercent: 8,
        yieldValue: 750,
      }],
    }),
  };
  const complete = completeStudyFromProject(project);
  const results = computeInstallStudyResults(project, complete);
  assert.equal(results.panels, 18);
  assert.ok(results.powerKwp > 8.9 && results.powerKwp < 9.1);
  assert.ok(results.production > 6000);
  assert.ok(results.fromBattery > 0);
  assert.equal(results.hours.length, 24);
  assert.equal(results.monthly.length, 12);
  assert.ok(planeProduction(complete.planes[0]) > planeProduction(complete.planes[1]));
  assert.equal(results.monthlySplit.length, 12);
  assert.ok(results.savings25 !== undefined);
  assert.ok(results.machines > 0);
});

test("les heures PVGIS calent la journee de septembre et l autoconso", () => {
  const typicalDays = Array.from({ length: 12 }, () => Array.from({ length: 24 }, (_, hour) => (
    hour >= 8 && hour <= 16 ? 380 : 0
  )));
  const project = {
    annualConsumption: 2300,
    electricityPrice: 0.2001,
    surplusPrice: 0.04,
    price: 0,
    completeStudy: emptyCompleteStudy({
      consumptionProfile: "day-present",
      planes: [{
        name: "Sud",
        compass: 180,
        tilt: 27,
        panels: 18,
        panelPower: 500,
        shadePercent: 0,
        typicalDays,
      }],
    }),
  };
  const present = computeInstallStudyResults(project, completeStudyFromProject(project));
  const absent = computeInstallStudyResults({
    ...project,
    completeStudy: { ...project.completeStudy, consumptionProfile: "day-absent" },
  });
  assert.equal(present.hourlySource, "pvgis-hourly");
  assert.ok(present.hours[12].production > present.hours[2].production);
  assert.ok(present.hours[12].production > 0);
  assert.equal(present.hours[2].production, 0);
  assert.ok(present.direct > absent.direct);
});

test("le visuel pose les panneaux sur les coordonnees Google ou sur chaque pan", () => {
  const project = { lat: 48.1852, lon: 6.9448 };
  const google = {
    center: { lat: 48.1852, lon: 6.9448 },
    imageryDate: { year: 2024, month: 6, day: 1 },
    panelWidthMeters: 1.7,
    panelHeightMeters: 1,
    solarPanels: [
      { lat: 48.18521, lon: 6.94481, segmentIndex: 0 },
      { lat: 48.18519, lon: 6.94479, segmentIndex: 0 },
    ],
    roofSegments: [{ azimuth: 160 }],
  };
  const fromGoogle = layoutRoofPanels({
    project,
    complete: emptyCompleteStudy({ google }),
    planes: [{ panels: 18, compass: 180 }],
  });
  assert.equal(fromGoogle.length, 2);
  assert.ok(fromGoogle.every(item => item.source === "google"));
  assert.ok(fromGoogle[0].x > 40 && fromGoogle[0].x < 60);
  const fromPlanes = layoutRoofPanels({
    project,
    complete: emptyCompleteStudy(),
    planes: [{ panels: 6, compass: 180 }, { panels: 6, compass: 0 }],
  });
  assert.equal(fromPlanes.length, 12);
  assert.ok(fromPlanes.some(item => item.y > 50));
  assert.ok(fromPlanes.some(item => item.y < 50));
  const stale = layoutRoofPanels({
    project,
    complete: emptyCompleteStudy({
      google: { ...google, imageryDate: { year: 2012, month: 4, day: 1 } },
    }),
    planes: [{ panels: 6, compass: 180 }],
  });
  assert.equal(stale.length, 6);
  assert.ok(stale.every(item => item.source === "plane"));
  const shifted = layoutRoofPanels({
    project,
    complete: emptyCompleteStudy({ panelLayout: { manual: true } }),
    planes: [{ panels: 4, compass: 180, layout: emptyPlaneLayout({ offsetX: 8, offsetY: -5, columns: 4, rotate: 12 }) }],
  });
  assert.equal(shifted.length, 4);
  assert.ok(shifted.every(item => item.source === "plane"));
  assert.ok(shifted.every(item => item.rotate === 192));
  assert.ok(shifted[0].x !== fromPlanes[0].x);
});

test("un clic pose un module noir sur le pan choisi", () => {
  const layout = addPlaneModule(emptyPlaneLayout(), { x: 42, y: 55 }, 0);
  assert.equal(layout.modules.length, 1);
  assert.equal(layout.modules[0].x, 42);
  const plane = normalizeRoofPlane({ layout, panels: 9 }, 0);
  assert.equal(plane.panels, 1);
  const drawn = layoutRoofPanels({
    project: { lat: 48.1852, lon: 6.9448 },
    complete: emptyCompleteStudy(),
    planes: [plane, normalizeRoofPlane({ name: "Nord", layout: emptyPlaneLayout() }, 1)],
    preferPlaced: true,
  });
  assert.equal(drawn.length, 1);
  assert.equal(drawn[0].source, "placed");
  assert.equal(drawn[0].planeIndex, 0);
});

test("aligner cale les voisins d un meme pan sans toucher l autre versant", () => {
  const row = alignRoofModules([
    { id: "a", x: 20, y: 30.8 },
    { id: "b", x: 24, y: 31.4 },
    { id: "c", x: 28, y: 30.2 },
  ], { w: 3.2, h: 2 });
  assert.equal(row.length, 3);
  assert.ok(Math.abs(row[0].y - row[1].y) < 0.02);
  assert.ok(Math.abs(row[1].y - row[2].y) < 0.02);
  assert.ok(row[0].x < row[1].x && row[1].x < row[2].x);

  const far = alignRoofModules([
    { id: "a", x: 20, y: 30 },
    { id: "z", x: 80, y: 70 },
  ], { w: 3.2, h: 2 });
  assert.equal(far[0].x, 20);
  assert.equal(far[0].y, 30);
  assert.equal(far[1].x, 80);
  assert.equal(far[1].y, 70);

  const north = normalizeRoofPlane({
    name: "Nord",
    layout: emptyPlaneLayout({ modules: [{ id: "n1", x: 21, y: 50.4 }] }),
  }, 1);
  const southAligned = alignRoofModules([
    { id: "s1", x: 20, y: 30.6 },
    { id: "s2", x: 24, y: 31.1 },
  ], { w: 3, h: 2 });
  assert.equal(north.layout.modules[0].y, 50.4);
  assert.ok(Math.abs(southAligned[0].y - southAligned[1].y) < 0.02);
});

test("la boussole 159 devient Sud et 340 Nord", () => {
  assert.equal(compassLabel(159), "Sud");
  assert.equal(compassLabel(340), "Nord");
});

test("la boussole sud devient aspect PVGIS 0", () => {
  assert.equal(compassToPvgisAspect(180), 0);
  assert.equal(compassToPvgisAspect(270), 90);
  assert.equal(compassToPvgisAspect(90), -90);
});

test("le commercial a l etude soft, le responsable technique l etude complete", () => {
  const commercial = { ...ready, role: "Commercial" };
  const tech = { ...ready, role: "Responsable technique" };
  assert.equal(canCreateSoftPvStudy(commercial), true);
  assert.equal(canCreateCompletePvStudy(commercial), false);
  assert.equal(canCreateCompletePvStudy(tech), true);
  assert.ok(roleModuleDefaults()["Responsable technique"].includes("Photovoltaïque administratif"));
});

test("le PDF etude d installation reprend le titre", async () => {
  const blob = await buildPvInstallStudyPdfBlob({
    project: {
      name: "Anould 9 kWc",
      client: "William Gerard",
      city: "Anould",
      powerKwp: 9,
      price: 0,
      annualConsumption: 2300,
      completeStudy: emptyCompleteStudy(),
    },
    company: { legalName: "MKL Énergies" },
  });
  const raw = Buffer.from(await blob.arrayBuffer()).toString("latin1");
  assert.match(raw, /installation photovolta/);
  assert.match(raw, /William|Anould/);
});

test("l etude d installation reprend les 18 pages du PDF de reference", () => {
  const page = readFileSync(new URL("../app/pv-install-study/page.js", import.meta.url), "utf8");
  [
    "Étude d’installation",
    "Retour CRM",
    "Votre offre",
    "Fonctionnement du PV",
    "pv-flow-schema",
    "Schéma de l’installation",
    "Production d’électricité",
    "Impact du photovoltaïque",
    "Répartition de la consommation",
    "Décomposition consommation",
    "Pourquoi ajouter une batterie virtuelle",
    "Impact de la batterie virtuelle",
    "Économies N+1",
    "Impact environnemental",
    "Analyse d’ensoleillement",
    "Carte de flux annuel Google Solar",
    "pas une photo à jour",
    "Analyse de l’ombrage",
    "Installation proposée",
    "Équipements installés",
    "Prochaines étapes",
    "Paramètres de l’étude",
    "Qui sommes-nous",
    "/ 18",
    "orientation: \"landscape\"",
  ].forEach(label => assert.ok(page.includes(label), label));
  assert.equal(page.includes("isheet-mark"), false);
});

test("le service commercial et le dossier solaire sont separes", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /mode=\{active==="Études photovoltaïques"\?"soft":"dossier"\}/);
  assert.match(page, /Première étude chez le client/);
  assert.match(page, /Étude d’installation photovoltaïque/);
  assert.match(page, /pv-install-study/);
  assert.doesNotMatch(page, /canComplete&&!softMode&&<button className="secondary"/);
  const home = readFileSync(new URL("../app/lib/commercial-home.js", import.meta.url), "utf8");
  assert.match(home, /Études photovoltaïques/);
});
