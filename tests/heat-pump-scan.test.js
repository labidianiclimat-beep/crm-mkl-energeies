import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractHeatPumpSpecsFromText, mergeHeatPumpScan } from "../app/lib/heat-pump-scan.js";

const ATLANTIC_FICHE = `
EXCELLIA S DUO
N° EPREL : 1765432
N° agrément ADEME : PAC-AA-7788
Fluide frigorigène : R32
Classe énergétique - chauffage (35°C/55°C) : A+++ / A++
Efficacité énergétique saisonnière : 185 % / 145 %
SCOP 35°C / 55°C : 4,63 / 3,63
Température de départ maximum : 60 °C

              A-7/W35    A-7/W55    A7/W35
Puissance     8,20       7,10       9,48
COP           3,40       2,60       4,85

Niveau sonore : 35 dB(A)
Ballon ECS intégré : Oui — 190 L
Volume tampon intégré : 40 L
Vase d'expansion : 12 L
Poids de fonctionnement : 148 kg
Plage de fonctionnement conseillée : -20 °C / +35 °C
Alimentation : 230 V monophasé
Appoint électrique : 6 kW / 32 A / 3G6
Appoint ECS : 1,8 kW / 10 A / 3G1,5

Garantie :
- 2 ans pièces
- 5 ans compresseur
`;

test("scanne une fiche constructeur et remplit les cases", () => {
  const { specs, found } = extractHeatPumpSpecsFromText(ATLANTIC_FICHE);
  assert.ok(found >= 12);
  assert.equal(specs.eprel, "1765432");
  assert.match(specs.ademe, /PAC-AA-7788/);
  assert.equal(specs.refrigerant, "R32");
  assert.equal(specs.energyClass, "A+++ / A++");
  assert.match(specs.seasonalEfficiency, /185/);
  assert.match(specs.scop, /4,63/);
  assert.match(specs.maxFlowTemp, /60/);
  assert.match(specs.powerMinus7_35, /8,20/);
  assert.equal(specs.copMinus7_35, "3,40");
  assert.match(specs.powerMinus7_55, /7,10/);
  assert.equal(specs.copMinus7_55, "2,60");
  assert.match(specs.powerPlus7_35, /9,48/);
  assert.equal(specs.copPlus7_35, "4,85");
  assert.match(specs.soundLevel, /35/);
  assert.match(specs.dhwTank, /190/);
  assert.match(specs.bufferVolume, /40/);
  assert.match(specs.expansionVessel, /12/);
  assert.match(specs.operatingWeight, /148/);
  assert.match(specs.operatingRange, /-20/);
  assert.match(specs.powerSupply, /230/);
  assert.match(specs.electricBackup, /6 kW/);
  assert.match(specs.dhwBackup, /1,8/);
  assert.match(specs.warranty, /compresseur/);
});

test("conserve le numero EPREL deja saisi et remplit le reste", () => {
  const { specs } = extractHeatPumpSpecsFromText(ATLANTIC_FICHE);
  const merged = mergeHeatPumpScan({ eprel: "999001", refrigerant: "" }, specs);
  assert.equal(merged.eprel, "999001");
  assert.equal(merged.refrigerant, "R32");
});

test("le formulaire propose de scanner la fiche constructeur", () => {
  const fields = readFileSync(new URL("../app/components/heat-pump-spec-fields.js", import.meta.url), "utf8");
  assert.match(fields, /Scanner la fiche constructeur/);
  assert.match(fields, /extractTextFromHeatPumpFile/);
  assert.match(fields, /extractHeatPumpSpecsFromText/);
});
