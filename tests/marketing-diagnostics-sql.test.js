/**
 * Le fichier de diagnostic est destiné à être collé dans l'éditeur SQL de
 * production. Il doit rester strictement en lecture et ne jamais faire sortir
 * de coordonnées client.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SQL = readFileSync(
  new URL("../supabase/diagnostics/20261105_marketing_bloc5.sql", import.meta.url),
  "utf8"
);

/** Corps réel, commentaires retirés : les mots-clés cités en commentaire ne comptent pas. */
const BODY = SQL.replace(/--[^\n]*/g, "");

test("aucune écriture, aucune modification de schéma", () => {
  for (const keyword of [
    "insert", "update", "delete", "alter", "drop", "truncate",
    "create", "grant", "revoke", "merge", "copy", "vacuum",
  ]) {
    assert.doesNotMatch(
      BODY,
      new RegExp(`\\b${keyword}\\b`, "i"),
      `le diagnostic ne doit pas contenir ${keyword}`
    );
  }
});

test("aucune colonne nominative n'est sélectionnée", () => {
  for (const column of ["name", "prospect_name", "client_name", "email", "address", "notes"]) {
    assert.doesNotMatch(
      BODY,
      new RegExp(`\\b${column}\\b`, "i"),
      `le diagnostic ne doit pas lire ${column}`
    );
  }
});

/**
 * `phone` est la seule colonne sensible lue, pour mesurer les doublons. Elle
 * ne doit apparaître que normalisée dans un comptage, jamais en sortie.
 */
test("le téléphone n'est lu que pour être compté", () => {
  const occurrences = BODY.match(/\bphone\b/g) || [];
  assert.equal(occurrences.length, 1, "une seule lecture du téléphone est attendue");
  assert.match(BODY, /regexp_replace\(coalesce\(phone, ''\), '\[\^0-9\]', '', 'g'\)/);
  const bloc = BODY.slice(BODY.indexOf("with normalise"));
  assert.doesNotMatch(bloc.slice(bloc.indexOf("select\n  organization_id")), /\btel\b(?!,)/);
});

test("les trois niveaux de chiffre d'affaires sont mesurés séparément", () => {
  assert.match(BODY, /1 devis acceptés/);
  assert.match(BODY, /2 ventes confirmées/);
  assert.match(BODY, /3 factures payées/);
});

/** Une facture payée doit alimenter deux niveaux, comme dans l'application. */
test("une facture payée compte dans deux niveaux", () => {
  assert.match(
    BODY,
    /statut = 'Payée'\s*\n\s*then array\['2 ventes confirmées', '3 factures payées'\]/
  );
});

test("le lien prospect-client est comparé en texte, sans cast risqué", () => {
  assert.doesNotMatch(BODY, /extra->>'clientId'\), ''\)::uuid/);
  assert.match(BODY, /l\.client_id = d\.client_id::text/);
});

test("le marqueur réservé google est surveillé à part", () => {
  assert.match(BODY, /fiches_avec_marqueur_google_reserve/);
  assert.match(BODY, /lower\(trim\(coalesce\(source, ''\)\)\) = 'google'/);
});

test("seules les tables connues sont interrogées", () => {
  const tables = new Set((BODY.match(/\b(?:from|join)\s+public\.(\w+)/g) || [])
    .map(item => item.replace(/.*public\./, "")));
  assert.deepEqual(
    [...tables].sort(),
    ["commercial_appointments", "commercial_opportunities", "devis"]
  );
});

test("chaque instruction est terminée", () => {
  const statements = BODY.split(";").map(item => item.trim()).filter(Boolean);
  assert.ok(statements.length >= 9, "les neuf blocs doivent être présents");
  assert.equal(BODY.trim().endsWith(";"), true, "le fichier doit finir par un point-virgule");
  for (const statement of statements) {
    assert.match(statement, /^(select|with)\b/i, `instruction non lecture : ${statement.slice(0, 40)}`);
  }
});
