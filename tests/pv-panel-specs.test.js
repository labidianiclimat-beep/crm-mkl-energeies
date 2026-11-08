import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formatPvPanelDescription,
  isPvPanelPath,
  isPvPanelSpecText,
  parsePvPanelDescription,
} from "../app/lib/pv-panel-specs.js";

test("la fiche panneau est reservee a cette sous-categorie PV", () => {
  assert.equal(isPvPanelPath({ category: "Photovoltaïque", subcategory: "Panneaux" }), true);
  assert.equal(isPvPanelPath({ category: "Photovoltaïque", subcategory: "Panneau" }), true);
  assert.equal(isPvPanelPath({ category: "Photovoltaïque", subcategory: "Module" }), true);
  assert.equal(isPvPanelPath({ category: "Photovoltaïque", subcategory: "Onduleurs" }), false);
  assert.equal(isPvPanelPath({ category: "Photovoltaïque", subcategory: "Micro-onduleur" }), false);
  assert.equal(isPvPanelPath({ category: "Climatisation", subcategory: "Panneaux" }), false);
  assert.equal(isPvPanelPath({ category: "Photovoltaïque", subcategory: "Panneaux", accessory: true }), false);
  assert.equal(isPvPanelPath({ subcategory: "Module" }), false);
});

test("assemble la fiche panneau visible sur le devis sans marque", () => {
  const text = formatPvPanelDescription(
    {
      cellType: "Type N mono-cristallin, 120 (6×20)",
      pmaxStc: "500 W",
      efficiencyStc: "22,8 %",
      vocStc: "44,70 V",
      dimensions: "1950 × 1134 × 30 mm",
      certifications: "IEC 61215, IEC 61730",
    },
    { title: "Panneau 500 W" }
  );
  assert.match(text, /^Panneau 500 W/);
  assert.match(text, /PANNEAU/);
  assert.match(text, /Puissance maximale \(Pmax\) STC : 500 W/);
  assert.match(text, /Rendement du module STC : 22,8 %/);
  assert.match(text, /Dimensions : 1950 × 1134 × 30 mm/);
  assert.ok(!/Marque/.test(text));
  assert.ok(!/DMEGC|Hengdian|Advanced Black/i.test(text));
  assert.ok(!/Courant de court-circuit \(Isc\) STC/.test(text));
});

test("recharge une fiche panneau existante", () => {
  const source = formatPvPanelDescription(
    {
      pmaxStc: "500 W",
      pmaxNmot: "376 W",
      vmpStc: "37,66 V",
      vmpNmot: "35,22 V",
      testLoad: "Avant 5400 / Arrière 2400 Pa",
      designLoad: "Avant 3600 / Arrière 1600 Pa",
      nmot: "42 ± 2 °C",
    },
    { title: "Panneau 500 W" }
  );
  const parsed = parsePvPanelDescription(source);
  assert.ok(isPvPanelSpecText(source));
  assert.equal(parsed.pmaxStc, "500 W");
  assert.equal(parsed.pmaxNmot, "376 W");
  assert.equal(parsed.vmpStc, "37,66 V");
  assert.equal(parsed.vmpNmot, "35,22 V");
  assert.equal(parsed.testLoad, "Avant 5400 / Arrière 2400 Pa");
  assert.equal(parsed.designLoad, "Avant 3600 / Arrière 1600 Pa");
  assert.equal(parsed.nmot, "42 ± 2 °C");
});

test("le formulaire panneau est branche au catalogue et au wizard", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const wizard = readFileSync(new URL("../app/components/article-picker-wizard.js", import.meta.url), "utf8");
  const fields = readFileSync(new URL("../app/components/pv-panel-spec-fields.js", import.meta.url), "utf8");
  const lib = readFileSync(new URL("../app/lib/pv-panel-specs.js", import.meta.url), "utf8");
  assert.match(page, /PvPanelSpecFields/);
  assert.match(wizard, /PvPanelSpecFields/);
  assert.match(page, /isPvPanelPath/);
  assert.match(wizard, /isPvPanelPath/);
  assert.match(fields, /PV_PANEL_HEADING/);
  assert.ok(!/Marque/.test(fields));
  assert.ok(!/DMEGC|Hengdian/i.test(lib));
  assert.ok(!/DMEGC|Hengdian/i.test(fields));
  assert.match(lib, /Spécifications électriques \(STC\)/);
  assert.match(lib, /Température nominale de fonctionnement du module \(NMOT\)/);
  assert.match(lib, /Charge d’essai max\. \(poussée \/ traction\)/);
});
