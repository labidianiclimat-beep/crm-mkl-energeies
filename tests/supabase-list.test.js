import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { listAllRows, listAllRowsByIds, POSTGREST_PAGE_SIZE } from "../app/lib/supabase-list.js";

test("listAllRows enchaine les pages PostgREST au-dela de 1000 lignes", async () => {
  const first = Array.from({ length: POSTGREST_PAGE_SIZE }, (_, index) => ({ id: `a${index}` }));
  const second = [{ id: "b1" }, { id: "b2" }, { id: "b3" }];
  const pages = [first, second];
  const seen = [];
  async function request(path) {
    seen.push(path);
    return pages.shift() || [];
  }
  const rows = await listAllRows("/rest/v1/devis?select=id&order=updated_at.desc", { request });
  assert.equal(rows.length, 1003);
  assert.equal(rows.at(-1).id, "b3");
  assert.equal(seen.length, 2);
  assert.match(seen[0], /limit=1000&offset=0/);
  assert.match(seen[1], /limit=1000&offset=1000/);
});

test("listAllRowsByIds decoupe les identifiants pour les lignes de devis", async () => {
  const calls = [];
  async function request(path) {
    calls.push(path);
    return [{ id: "line-1", devis_id: "d1" }];
  }
  const rows = await listAllRowsByIds(
    "/rest/v1/devis_lignes?select=id&order=ordre.asc",
    ["d1", "d2"],
    { column: "devis_id", request, chunkSize: 1 }
  );
  assert.equal(rows.length, 2);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /devis_id=in\.\("d1"\)/);
  assert.match(calls[1], /devis_id=in\.\("d2"\)/);
});

test("les listes devis et clients ne s arretent plus a la premiere page", () => {
  const devis = readFileSync(new URL("../app/api/devis/route.js", import.meta.url), "utf8");
  const clients = readFileSync(new URL("../app/api/clients/route.js", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../app/api/dashboard/commercial/route.js", import.meta.url), "utf8");
  assert.match(devis, /listAllRows\(path\)/);
  assert.match(devis, /listAllRowsByIds/);
  assert.match(clients, /listAllRows\(path\)/);
  assert.match(dashboard, /listAllRows\(devisPath\)/);
  assert.match(dashboard, /listAllRows\(clientsPath\)/);
});
