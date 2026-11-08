import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OPTIMIZER_600W_SPECS,
  formatOptimizerDescription,
  isOptimizerPath,
  isOptimizerSpecText,
  optimizerField,
  parseOptimizerDescription,
} from "../app/lib/optimizer-specs.js";

test("la fiche optimiseur est reservee a cette sous-categorie PV", () => {
  assert.equal(isOptimizerPath({ category: "Photovoltaïque", subcategory: "Optimiseur" }), true);
  assert.equal(isOptimizerPath({ category: "Photovoltaïque", subcategory: "Optimiseurs" }), true);
  assert.equal(isOptimizerPath({ category: "Photovoltaïque", subcategory: "Onduleurs" }), false);
  assert.equal(isOptimizerPath({ category: "Photovoltaïque", subcategory: "Panneaux" }), false);
  assert.equal(isOptimizerPath({ category: "Photovoltaïque", subcategory: "Main-d’œuvre" }), false);
  assert.equal(isOptimizerPath({ category: "Climatisation", subcategory: "Optimiseur" }), false);
  assert.equal(isOptimizerPath({ category: "Photovoltaïque", subcategory: "Optimiseur", accessory: true }), false);
});

test("les valeurs vertes du SUN2000-600W-P remplissent la case correspondante", () => {
  const text = formatOptimizerDescription(OPTIMIZER_600W_SPECS, { brand: "Huawei", title: "SUN2000-600W-P" });
  assert.match(text, /^SUN2000-600W-P/);
  assert.match(text, /OPTIMISEUR/);
  assert.match(text, /Marque : Huawei/);
  const pairs = [
    ["Modèle", "SUN2000-600W-P"],
    ["Puissance d’entrée DC nominale", "600 W"],
    ["Tension d’entrée maximale absolue", "80 V"],
    ["Plage de tension MPPT", "10 – 80 V"],
    ["Courant de court-circuit maximal (Isc)", "14,5 A"],
    ["Efficacité maximale", "99,5 %"],
    ["Efficacité pondérée", "99,0 %"],
    ["Catégorie de surtension", "II"],
    ["Tension de sortie maximale", "80 V"],
    ["Courant de sortie maximal", "15 A"],
    ["Bypass de sortie", "Oui"],
    ["Tension de sortie à l’arrêt", "0 V"],
    ["Impédance de sortie à l’arrêt", "1 kΩ ± 10 %"],
    ["Communication", "MBUS"],
    ["Sécurité", "IEC 62109-1 (sécurité classe II)"],
    ["RoHS", "Oui"],
    ["Dimensions (L × H × P)", "75 × 140 × 28 mm (3,0 × 5,5 × 1,1 in)"],
    ["Poids (câbles inclus)", "0,6 kg (1,3 lb)"],
    ["Pièce d’installation", "Équerre de fixation sur cadre / boulon en T"],
    ["Connecteur d’entrée", "MC4"],
    ["Longueur de câble d’entrée", "0,15 m"],
    ["Connecteur de sortie", "MC4"],
    ["Longueur de câble de sortie", "1,3 m (4,3 ft)"],
    ["Température et humidité de fonctionnement", "–40 °C à 85 °C / 0 % à 100 % HR"],
    ["Indice de protection", "IP68"],
    ["Produits compatibles", OPTIMIZER_600W_SPECS.compatibleProducts],
  ];
  for (const [label, value] of pairs) {
    assert.ok(text.includes(`${label} : ${value}`), `${label} : ${value}`);
  }
  assert.doesNotMatch(text, /450 W/);
  assert.equal(optimizerField("ratedInputPower").label, "Puissance d’entrée DC nominale");
});

test("recharge une fiche optimiseur existante dans les memes cases", () => {
  const source = formatOptimizerDescription(OPTIMIZER_600W_SPECS, { brand: "Huawei", title: "SUN2000-600W-P" });
  const parsed = parseOptimizerDescription(source);
  assert.ok(isOptimizerSpecText(source));
  assert.equal(parsed.brand, "Huawei");
  assert.equal(parsed.model, "SUN2000-600W-P");
  assert.equal(parsed.ratedInputPower, "600 W");
  assert.equal(parsed.maxIsc, "14,5 A");
  assert.equal(parsed.efficiencyWeighted, "99,0 %");
  assert.equal(parsed.shutdownImpedance, "1 kΩ ± 10 %");
  assert.equal(parsed.inputWireLength, "0,15 m");
  assert.equal(parsed.outputWireLength, "1,3 m (4,3 ft)");
  assert.equal(parsed.ipRating, "IP68");
  assert.match(parsed.compatibleProducts, /SUN2000-12\/15\/17\/20KTL-M2/);
});

test("le formulaire optimiseur est branche au catalogue et au wizard", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const wizard = readFileSync(new URL("../app/components/article-picker-wizard.js", import.meta.url), "utf8");
  const fields = readFileSync(new URL("../app/components/optimizer-spec-fields.js", import.meta.url), "utf8");
  assert.match(page, /OptimizerSpecFields/);
  assert.match(wizard, /OptimizerSpecFields/);
  assert.match(page, /isOptimizerPath/);
  assert.match(wizard, /isOptimizerPath/);
  assert.match(fields, /optimizer600wSpecs/);
  assert.match(fields, /colonne soulignée en vert/);
  assert.match(wizard, /item\.group \|\| Number\(item\.count \|\| 0\) > 0/);
});
