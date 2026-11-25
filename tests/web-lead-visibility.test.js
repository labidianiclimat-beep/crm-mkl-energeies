/**
 * Visibilité d'une demande du site : elle n'appartient à personne, donc seuls
 * les profils qui voient toute l'organisation et le responsable prospection
 * doivent la trouver, et elle doit tomber dans la file d'attribution.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prospectRowFromWebLead } from "../app/lib/web-lead-consumer.js";
import {
  buildProspectScopeFilter,
  canAccessScopedRow,
  resolveScopedCommercialIds,
} from "../app/lib/scoping.js";
import { isAssignedProspect, isUnassignedProspect } from "../app/lib/prospect-dispatch.js";
import { visibleProspects } from "../app/lib/prospect-to-client.js";
import { prospectorIdOf } from "../app/lib/prospects.js";

const ORG = "00000000-0000-0000-0000-000000000001";
const USER = "11111111-1111-1111-1111-111111111111";
const TEAM = "22222222-2222-2222-2222-222222222222";

const PAYLOAD = {
  submissionId: "web-visibilite-0001",
  kind: "lead",
  name: "Demande du site",
  phone: "0612345678",
  email: "demande@example.test",
  attribution: { gclid: "Cj0KCQabcdef", utmSource: "google", utmMedium: "cpc" },
};

/** La ligne telle que le consommateur l'insère vraiment. */
const ROW = prospectRowFromWebLead({ payload: PAYLOAD, organizationId: ORG });

function profile(role) {
  return { role, organization_id: ORG, active: true, onboarding_completed_at: "2026-01-01" };
}

/** Un profil voit-il la ligne, avec la même règle que le filtre SQL ? */
function sees(role, { teamIds = [TEAM] } = {}) {
  const prof = profile(role);
  const forDispatch = role === "Responsable prospection";
  return canAccessScopedRow(prof, USER, ROW, teamIds, { forDispatch });
}

test("la demande du site n'appartient à personne", () => {
  assert.equal(ROW.commercial_id, null);
  assert.equal(ROW.created_by, null);
  assert.equal(prospectorIdOf(ROW), "");
});

test("la direction et le secrétariat voient la demande", () => {
  for (const role of ["Admin VIP", "Superadmin", "Direction", "Secrétariat"]) {
    assert.equal(sees(role), true, `${role} doit voir la demande`);
  }
});

test("le responsable prospection voit la demande pour l'attribuer", () => {
  assert.equal(sees("Responsable prospection"), true);
  assert.equal(
    resolveScopedCommercialIds(profile("Responsable prospection"), USER, [], { forDispatch: true }),
    null
  );
});

/**
 * Choix d'organisation : l'attribution appartient au responsable prospection et
 * à la direction. Le responsable commercial peut attribuer une fiche qu'on lui
 * présente, mais il ne parcourt pas les demandes sans propriétaire.
 */
test("un commercial ne voit pas une demande qui ne lui est pas attribuée", () => {
  for (const role of ["Commercial", "Responsable commercial", "Prospecteur terrain", "Technicien"]) {
    assert.equal(sees(role), false, `${role} ne doit pas voir une demande non attribuée`);
  }
});

test("le filtre SQL n'a aucune branche qui attrape une ligne sans propriétaire", () => {
  const filter = buildProspectScopeFilter([USER, TEAM]);
  const inner = filter.slice(filter.indexOf("(") + 1, filter.lastIndexOf(")"));
  const branches = inner.split(/,(?![^(]*\))/);
  assert.ok(branches.length >= 6);
  for (const branch of branches) {
    assert.match(
      branch,
      /\.eq\.[0-9a-f-]{36}/,
      `chaque branche doit exiger un identifiant, sinon la ligne fuite : ${branch}`
    );
  }
});

test("l'organisation entière n'ajoute aucun filtre", () => {
  assert.equal(buildProspectScopeFilter(null), "");
});

test("un périmètre vide ne laisse rien passer", () => {
  assert.match(buildProspectScopeFilter([]), /commercial_id=eq\.0{8}-0{4}-0{4}-0{4}-0{12}/);
});

test("la demande tombe dans la file d'attribution du tableau de dispatch", () => {
  assert.equal(isUnassignedProspect(ROW), true);
  assert.equal(isAssignedProspect(ROW), false);
  assert.equal(visibleProspects([ROW]).length, 1);
});

test("une demande déjà attribuée quitte la file", () => {
  const attribuee = { ...ROW, commercial_id: USER };
  assert.equal(isUnassignedProspect(attribuee), false);
  assert.equal(isAssignedProspect(attribuee), true);
  assert.equal(sees("Commercial", { teamIds: [] }), false);
  assert.equal(
    canAccessScopedRow(profile("Commercial"), USER, attribuee, [], {}),
    true,
    "le commercial attributaire doit voir sa fiche"
  );
});

test("la liste des prospects applique bien le périmètre", () => {
  const route = readFileSync(new URL("../app/api/prospects/route.js", import.meta.url), "utf8");
  const bloc = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  assert.match(bloc, /buildProspectScopeFilter\(scoped\)/);
  assert.match(bloc, /isProspectDispatcher\(auth\.profile\)/);
  assert.match(bloc, /organization_id=eq\.\$\{encodeURIComponent\(orgId\)\}/);
});
