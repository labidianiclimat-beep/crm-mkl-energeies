import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PV_INCLINATIONS,
  computePvSimulation,
  departmentFromPostal,
  efficiencyFactor,
  inclinationSlopePoints,
  irradiationForPostal,
  orientationCoefficient,
  productionKwh,
} from "../app/lib/pv-production-simulator.js";

test("le coefficient reprend le tableau orientation et inclinaison", () => {
  assert.equal(orientationCoefficient("sud", "30-35"), 1.15);
  assert.equal(orientationCoefficient("est", "30-35"), 0.91);
  assert.equal(orientationCoefficient("ouest", "30-35"), 0.94);
  assert.equal(orientationCoefficient("ouest", "90"), 0.58);
  assert.equal(orientationCoefficient("sud-est", "0"), 1);
  assert.equal(orientationCoefficient("nord", "30-35"), null);
});

test("chaque inclinaison a une barre au degré moyen de la plage", () => {
  assert.deepEqual(PV_INCLINATIONS.map(item => item.degrees), [0, 12.5, 22.5, 32.5, 42.5, 52.5, 60, 90]);
  const flat = inclinationSlopePoints(0);
  assert.equal(flat.y1, flat.y2);
  const upright = inclinationSlopePoints(90);
  assert.equal(upright.x1, upright.x2);
  const slope = inclinationSlopePoints(12.5);
  assert.ok(slope.y2 < slope.y1);
  const page = readFileSync(new URL("../app/simulateur-pv/page.js", import.meta.url), "utf8");
  assert.match(page, /InclinationSlope degrees=\{item\.degrees\}/);
});

test("le code postal remplit l ensoleillement departemental", () => {
  assert.equal(departmentFromPostal("67116"), "67");
  assert.equal(irradiationForPostal("67116").name, "Bas-Rhin");
  assert.equal(irradiationForPostal("67116").kwh, 1180);
  assert.equal(departmentFromPostal("20200"), "2B");
  assert.equal(departmentFromPostal("20090"), "2A");
  assert.equal(departmentFromPostal("97400"), "974");
});

test("la production vaut A fois B fois C fois D", () => {
  assert.equal(efficiencyFactor("0,8"), 0.8);
  assert.equal(efficiencyFactor(80), 0.8);
  assert.equal(productionKwh({
    irradiation: 1180,
    coefficient: 1.15,
    powerKwc: 6,
    efficiency: 80,
  }), 6514);
  const computed = computePvSimulation({
    postalCode: "67116",
    irradiation: 1180,
    orientation: "sud",
    inclination: "30-35",
    powerKwc: 6,
    efficiency: "0.8",
  });
  assert.equal(computed.departmentName, "Bas-Rhin");
  assert.equal(computed.coefficient, 1.15);
  assert.equal(computed.production, 6514);
  assert.equal(computePvSimulation({ orientation: "sud" }).production, null);
});

test("le simulateur est a cote de l etude thermique", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const access = readFileSync(new URL("../app/lib/access-control.js", import.meta.url), "utf8");
  assert.match(page, /Simulateur photovoltaïque/);
  assert.match(page, /Nouveau simulateur/);
  assert.match(page, /className="data-panel pvsim-table"/);
  assert.match(page, /<span>Simulation<\/span><span>Client<\/span>/);
  assert.match(page, /kind:"simulator"/);
  assert.match(access, /Simulateur photovoltaïque/);
  assert.doesNotMatch(access, /"Simulateur photovoltaïque": "Études thermiques"/);
});
