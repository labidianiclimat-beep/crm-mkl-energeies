import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/20261027_chauffeo_plus.sql", import.meta.url), "utf8");

const codes = ["053005", "053007", "051010", "051015", "051020", "053020", "052125", "052130"];

test("la fiche Chauffeo Plus crée les huit ballons Atlantic, sans prix inventé", () => {
  assert.match(sql, /Ballon électrique/);
  assert.match(sql, /Atlantic/);
  assert.match(sql, /catalogue:chauffeo-plus-2015/);
  assert.match(sql, /prix_achat_ht, prix_vente_ht, taux_tva/);
  assert.match(sql, /0, 0, 10/);
  assert.match(sql, /taux_tva = 10/);
  assert.doesNotMatch(sql, /article_bundles/);
  for (const code of codes) assert.match(sql, new RegExp(`'${code}'`));
  assert.match(sql, /vertical mural 50 L/);
  assert.match(sql, /vertical mural 200 L/);
  assert.match(sql, /vertical sur socle 200 L/);
  assert.match(sql, /vertical sur socle 300 L/);
  assert.match(sql, /5 ans cuve/);
  assert.match(sql, /2 ans pièces/);
});
