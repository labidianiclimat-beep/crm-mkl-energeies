import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  popWorkspacePlace,
  pushWorkspacePlace,
  sameWorkspacePlace,
  workspaceBackLabel,
} from "../app/lib/workspace-nav.js";

test("Relations clients → Clients → retour retrouve l’espace", () => {
  let stack = [];
  const home = { active: "Applications", selectedFamily: null };
  const family = { active: "Applications", selectedFamily: "Relations clients" };
  const clients = { active: "Clients", selectedFamily: "Relations clients" };
  stack = pushWorkspacePlace(stack, home, family);
  stack = pushWorkspacePlace(stack, family, clients);
  assert.equal(workspaceBackLabel({ previous: stack.at(-1) }), "Relations clients");
  const first = popWorkspacePlace(stack);
  assert.deepEqual(first.previous, family);
  assert.equal(workspaceBackLabel({ previous: first.stack.at(-1) }), "Applications");
  const second = popWorkspacePlace(first.stack);
  assert.deepEqual(second.previous, home);
});

test("une fiche ouverte se ferme avant de quitter la liste", () => {
  assert.equal(workspaceBackLabel({ overlay: true, previous: { active: "Clients" } }), "Retour");
  assert.equal(sameWorkspacePlace({ active: "Clients", selectedFamily: "Relations clients" }, { active: "Clients", selectedFamily: "Relations clients" }), true);
});

test("le CRM utilise un retour pas à pas au lieu de l’accueil", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /function goBack/);
  assert.match(page, /onClick={goBack}/);
  assert.match(page, /workspaceBackLabel/);
  assert.match(page, /pushWorkspacePlace/);
});
