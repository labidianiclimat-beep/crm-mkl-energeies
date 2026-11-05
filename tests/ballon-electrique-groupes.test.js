import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/20261028_ballon_electrique_groupes.sql", import.meta.url), "utf8");

test("chaque ballon électrique Atlantic a son groupe et la pose", () => {
  assert.match(sql, /Installation ballons électriques/);
  assert.match(sql, /INST-BALLON-ELEC/);
  assert.match(sql, /catalogue:installation-ballon-electrique/);
  assert.match(sql, /catalogue:chauffeo-plus-2015/);
  assert.match(sql, /Ballon électrique/);
  assert.match(sql, /atlantic/);
  assert.match(sql, /'role', 'labor'/);
  assert.match(sql, /'role', 'principal'/);
  assert.match(sql, /article_bundles/);
  assert.match(sql, /prix_achat_ht = 0/);
  assert.match(sql, /prix_vente_ht = 0/);
  assert.match(sql, /set taux_tva = 10/);
  assert.match(sql, /'tax', 10/);
  assert.doesNotMatch(sql, /taux_tva = 20/);
  assert.doesNotMatch(sql, /'tax', 20/);
  assert.match(sql, /20261027_chauffeo_plus\.sql/);
  assert.doesNotMatch(sql, /thermodynamique Atlantic/i);
});
