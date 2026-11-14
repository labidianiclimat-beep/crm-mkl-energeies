import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const original = readFileSync(new URL("../supabase/migrations/20261113_devis_signatures.sql", import.meta.url), "utf8");
const fix = readFileSync(new URL("../supabase/migrations/20261113_devis_signatures_rls_securite.sql", import.meta.url), "utf8");
const serverRead = readFileSync(new URL("../supabase/migrations/20261114_devis_signatures_lecture_serveur.sql", import.meta.url), "utf8");

test("le correctif est distinct de la migration déjà publiée", () => {
  assert.match(original, /NON APPLIQUÉE/);
  assert.match(original, /create policy devis_signatures_insert/);
  assert.doesNotMatch(fix, /create policy devis_signatures_insert/);
  assert.match(fix, /drop policy if exists devis_signatures_insert/);
  assert.match(fix, /revoke all on table public\.devis_signatures from public, anon, authenticated/);
  assert.match(fix, /grant select on table public\.devis_signatures to authenticated/);
});

test("le correctif qualifie l’organisation et lie le pdf au devis", () => {
  assert.doesNotMatch(fix, /organization_id = organization_id/);
  assert.doesNotMatch(fix, /d\.organization_id = d\.organization_id/);
  assert.doesNotMatch(fix, /actor\.organization_id = actor\.organization_id/);
  assert.match(fix, /acteur\.organization_id = devis_signatures\.organization_id/);
  assert.match(fix, /preuve\.organization_id = acteur\.organization_id/);
  assert.match(fix, /preuve\.organization_id::text = \(storage\.foldername\(storage\.objects\.name\)\)\[1\]/);
  assert.match(fix, /preuve\.devis_id::text = \(storage\.foldername\(storage\.objects\.name\)\)\[2\]/);
  assert.match(fix, /devis_signatures_storage_path_check/);
  assert.match(fix, /file_size_limit = 4000000/);
  assert.match(fix, /application\/pdf/);
  assert.match(fix, /public = false/);
});

test("la lecture directe des preuves est retirée aux sessions", () => {
  assert.match(serverRead, /revoke select on table public\.devis_signatures from public, anon, authenticated/);
  assert.match(serverRead, /revoke select on table public\.devis_signature_journal from public, anon, authenticated/);
  assert.match(serverRead, /drop policy if exists devis_signatures_storage_select/);
  assert.doesNotMatch(serverRead, /update public\.clients/i);
  assert.doesNotMatch(serverRead, /update public\.devis/i);
  assert.doesNotMatch(serverRead, /update public\.commercial_opportunities/i);
  assert.doesNotMatch(serverRead, /update public\.commercial_appointments/i);
  assert.doesNotMatch(serverRead, /delete from public\.devis_signatures/i);
  assert.doesNotMatch(serverRead, /MKL_SIGNATURE_PILOT/);
});

test("le correctif ne réécrit aucune donnée commerciale", () => {
  assert.doesNotMatch(fix, /update public\.clients/i);
  assert.doesNotMatch(fix, /update public\.commercial_appointments/i);
  assert.doesNotMatch(fix, /update public\.devis/i);
  assert.doesNotMatch(fix, /update public\.commercial_opportunities/i);
  assert.doesNotMatch(fix, /delete from public\.devis_signatures/i);
  assert.doesNotMatch(fix, /electronique/);
});
