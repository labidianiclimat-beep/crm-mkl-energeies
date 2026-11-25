import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildQuoteLineFromArticle, buildQuoteLinesFromBundle } from "../app/lib/article-picker.js";
import {
  HEAT_PUMP_EMITTERS,
  applyHeatPumpEmitterToLines,
  bundleNeedsHeatPumpEmitter,
  withHeatPumpEmitterLabel,
} from "../app/lib/heat-pump-emitters.js";

const machine = {
  id: "pac-1",
  code: "PAC-8",
  name: "PUHZ-SHW230YKA2",
  category: "Chauffage",
  subcategory: "Pompe à chaleur",
  sell: 6200,
  tax: 5.5,
  status: "Actif",
};
const supply = {
  id: "sup-1",
  code: "PAC-FOUR",
  name: "Fourniture pompe à chaleur",
  category: "Chauffage",
  subcategory: "Fourniture",
  sell: 80,
  tax: 5.5,
  status: "Actif",
};

test("radiateurs et plancher mixte donnent la moyenne température, le plancher seul la basse", () => {
  assert.equal(HEAT_PUMP_EMITTERS.find(item => item.id === "radiators").quoteLabel, "Pompe à chaleur, moyenne température");
  assert.equal(HEAT_PUMP_EMITTERS.find(item => item.id === "radiators-floor").quoteLabel, "Pompe à chaleur, moyenne température");
  assert.equal(HEAT_PUMP_EMITTERS.find(item => item.id === "floor").quoteLabel, "Pompe à chaleur, basse température");
  assert.equal(
    withHeatPumpEmitterLabel("PUHZ-SHW230YKA2", "floor"),
    "PUHZ-SHW230YKA2 — Pompe à chaleur, basse température"
  );
  assert.equal(
    withHeatPumpEmitterLabel("PUHZ-SHW230YKA2 — Pompe à chaleur, basse température", "floor"),
    "PUHZ-SHW230YKA2 — Pompe à chaleur, basse température"
  );
});

test("le régime s’ajoute seulement sur la pompe à chaleur du groupe", () => {
  const bundle = {
    id: "g1",
    name: "Pack PAC",
    items: [
      { articleId: "pac-1", code: "PAC-8", name: "PUHZ-SHW230YKA2", price: 6200, qty: 1, category: "Chauffage", subcategory: "Pompe à chaleur" },
      { articleId: "sup-1", code: "PAC-FOUR", name: "Fourniture pompe à chaleur", price: 80, qty: 1, category: "Chauffage", subcategory: "Fourniture" },
    ],
  };
  assert.equal(bundleNeedsHeatPumpEmitter(bundle, [machine, supply]), true);
  const lines = applyHeatPumpEmitterToLines(
    buildQuoteLinesFromBundle(bundle, [machine, supply], { idBase: 1 }),
    [machine, supply],
    "radiators"
  );
  assert.equal(lines[0].name, "PUHZ-SHW230YKA2 — Pompe à chaleur, moyenne température");
  assert.equal(lines[0].heatPumpEmitter, "radiators");
  assert.equal(lines[0].unit, 6200);
  assert.equal(lines[0].tax, 5.5);
  assert.equal(lines[1].name, "Fourniture pompe à chaleur");
  assert.equal(lines[1].unit, 80);
  assert.equal(lines[1].heatPumpEmitter, undefined);
});

test("une pompe à chaleur seule reçoit le même libellé", () => {
  const line = buildQuoteLineFromArticle(machine, { qty: 1, tax: 5.5 }, { tax: 20 });
  const [labeled] = applyHeatPumpEmitterToLines([line], [machine], "radiators-floor");
  assert.equal(labeled.name, "PUHZ-SHW230YKA2 — Pompe à chaleur, moyenne température");
  assert.equal(labeled.unit, 6200);
  assert.equal(bundleNeedsHeatPumpEmitter({ items: [{ name: "Kit hydraulique", category: "Petite fourniture" }] }, []), false);
});

test("la fenêtre du devis propose les trois émetteurs avant d’ajouter", () => {
  const wizard = readFileSync(new URL("../app/components/article-picker-wizard.js", import.meta.url), "utf8");
  assert.match(wizard, /step === "emitters"/);
  assert.match(wizard, /bundleNeedsHeatPumpEmitter/);
  assert.match(wizard, /isHeatPumpMachineArticle\(article\)/);
  assert.match(wizard, /confirmEmitter\(choice\.id\)/);
  assert.match(wizard, /src=\{choice\.image\}/);
  assert.match(wizard, /HEAT_PUMP_EMITTERS\.map/);
});
