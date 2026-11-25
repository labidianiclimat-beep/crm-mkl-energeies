import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/20261119_marstek_installation_groupe.sql", import.meta.url), "utf8");

test("la batterie Marstek et sa pose sont en TVA 20, total 5 000 €", () => {
  assert.match(sql, /Installation de batterie Marstek/);
  assert.match(sql, /INST-BAT-MARSTEK/);
  assert.match(sql, /catalogue:installation-batterie-marstek/);
  assert.match(sql, /marstek-venus-e/);
  assert.match(sql, /Pose et fixation de la batterie Marstek VENUS-E 5 kW/);
  assert.match(sql, /v_labor_ht numeric\(12,2\) := 458\.33/);
  assert.match(sql, /v_battery_ht := 3708\.34/);
  assert.match(sql, /5 000,00 € TTC/);
  assert.match(sql, /taux_tva = 20/);
  assert.match(sql, /'tax', 20/);
  assert.match(sql, /'role', 'labor'/);
  assert.match(sql, /'role', 'principal'/);
  assert.match(sql, /article_bundles/);
  assert.doesNotMatch(sql, /taux_tva = 5\.5/);
  assert.doesNotMatch(sql, /'tax', 5\.5/);
});
