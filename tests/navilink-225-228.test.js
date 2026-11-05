import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/20261027_navilink_225_228.sql", import.meta.url), "utf8");

test("seul le Navilink 228 est enregistré, à 260 € HT et TVA 10 %, avant la fourniture des groupes Alfea", () => {
  assert.match(sql, /Navilink 228/);
  assert.match(sql, /074903/);
  assert.match(sql, /074 903/);
  assert.doesNotMatch(sql, /074 902/);
  assert.doesNotMatch(sql, /Navilink 225 Connect/);
  assert.doesNotMatch(sql, /Alimentation 225/);
  assert.match(sql, /0, 260, 10/);
  assert.match(sql, /prix_vente_ht = 260/);
  assert.match(sql, /taux_tva = 10/);
  assert.match(sql, /'price', 260/);
  assert.match(sql, /'tax', 10/);
  assert.match(sql, /like '%fourniture%'/);
  assert.match(sql, /'role', 'option'/);
  assert.match(sql, /Pompe à chaleur/);
  assert.match(sql, /Atlantic/);
  assert.match(sql, /like '%alfea%'/);
  assert.match(sql, /like '%pompe%chaleur%'/);
  assert.match(sql, /074902-074903/);
  assert.doesNotMatch(sql, /Dossier pompe à chaleur introuvable/);
  assert.match(sql, /article_bundles/);
  assert.doesNotMatch(sql, /prix_vente_ht = 199/);
});
