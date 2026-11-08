import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prospectOwnerPatch } from "../app/lib/prospect-appointment-owner.js";
import { buildProspectScopeFilter, canSeeAssignedProspect } from "../app/lib/scoping.js";

const COMMERCIAL = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

test("attribuer le rendez-vous donne le prospect à ce commercial", () => {
  const patch = prospectOwnerPatch(
    { id: "p1", commercial_id: null, stage: "À contacter", extra: {} },
    COMMERCIAL,
    "2026-10-12T12:00:00.000Z"
  );
  assert.equal(patch.commercial_id, COMMERCIAL);
  assert.equal(patch.stage, "Rendez-vous planifié");
  assert.equal(patch.updated_at, "2026-10-12T12:00:00.000Z");
});

test("un stade déjà avancé reste en place", () => {
  const patch = prospectOwnerPatch(
    { id: "p1", commercial_id: OTHER, stage: "Devis envoyé", extra: {} },
    COMMERCIAL,
    "2026-10-12T12:00:00.000Z"
  );
  assert.equal(patch.commercial_id, COMMERCIAL);
  assert.equal(patch.stage, undefined);
  const wonByHand = prospectOwnerPatch(
    { id: "p1", commercial_id: OTHER, stage: "Gagné", extra: {} },
    COMMERCIAL,
    "2026-10-12T12:00:00.000Z"
  );
  assert.equal(wonByHand.commercial_id, COMMERCIAL);
  assert.equal(wonByHand.stage, undefined);
});

test("le même commercial, un prospect déjà client, ou un rendez-vous sans vendeur ne changent pas la fiche", () => {
  const same = { id: "p1", commercial_id: COMMERCIAL, stage: "Nouveau", extra: {} };
  assert.equal(prospectOwnerPatch(same, COMMERCIAL), null);
  assert.equal(prospectOwnerPatch({ id: "p1", commercial_id: null, extra: { clientId: "c1" } }, COMMERCIAL), null);
  assert.equal(prospectOwnerPatch(same, ""), null);
  assert.equal(prospectOwnerPatch(null, COMMERCIAL), null);
});

test("une fois le prospect attribué, l’ancien commercial ne le voit plus", () => {
  const row = {
    organization_id: "org",
    commercial_id: COMMERCIAL,
    created_by: OTHER,
    extra: {},
  };
  const commercial = { role: "Commercial", organization_id: "org" };
  const previous = { role: "Commercial", organization_id: "org" };
  assert.equal(canSeeAssignedProspect(commercial, COMMERCIAL, row, []), true);
  assert.equal(canSeeAssignedProspect(previous, OTHER, row, []), false);
  const unassigned = { organization_id: "org", commercial_id: null, created_by: OTHER, extra: {} };
  assert.equal(canSeeAssignedProspect(previous, OTHER, unassigned, []), true);
  const filter = buildProspectScopeFilter([COMMERCIAL]);
  assert.match(filter, new RegExp(`commercial_id\\.eq\\.${COMMERCIAL}`));
  assert.match(filter, /commercial_id\.is\.null/);
  assert.equal(buildProspectScopeFilter(null), "");
});

test("la création et la réattribution d’un rendez-vous rattachent le prospect", () => {
  const create = readFileSync(new URL("../app/api/appointments/route.js", import.meta.url), "utf8");
  const update = readFileSync(new URL("../app/api/appointments/[id]/route.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(create, /claimProspectForAppointment/);
  assert.match(update, /claimProspectForAppointment/);
  assert.match(page, /if\(active!=="Prospects"&&!quoteWizard\) return/);
  assert.match(page, /authFetch\("\/api\/prospects"\)/);
});
