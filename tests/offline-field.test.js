import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  acceptFieldSync,
  fieldStoreForUser,
  isNetworkFailure,
  localProspectFromPayload,
  pendingFieldCount,
  queueFieldChange,
  readFieldStore,
  rememberFieldLists,
  sortFieldQueue,
  writeFieldStore,
} from "../app/lib/offline-field.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  };
}

test("le mode terrain garde les prospects du compte connecté", () => {
  const storage = memoryStorage();
  const store = rememberFieldLists(null, {
    userId: "user-1",
    profile: { id: "user-1", role: "Prospecteur terrain" },
    prospects: [{ id: "p1", name: "Martin" }],
    appointments: [{ id: "a1", prospectId: "p1", status: "Client en réflexion" }],
  });
  writeFieldStore(store, storage);
  const read = fieldStoreForUser(readFieldStore(storage), "user-1");
  assert.equal(read.prospects[0].name, "Martin");
  assert.equal(read.appointments[0].status, "Client en réflexion");
  assert.equal(fieldStoreForUser(read, "user-2"), null);
});

test("une saisie hors ligne part après les fiches déjà en base", () => {
  const prospect = localProspectFromPayload({ name: "Durand", phone: "0612345678", city: "Nantes" }, { id: "offline-1" });
  assert.equal(prospect.offlinePending, true);
  let store = rememberFieldLists(null, { userId: "user-1", prospects: [{ id: "p1", name: "Martin" }], appointments: [] });
  store = queueFieldChange(store, {
    id: "job-1",
    kind: "prospect-create",
    localId: "offline-1",
    url: "/api/prospects",
    method: "POST",
    body: { name: "Durand" },
    at: "2026-09-30T10:00:00.000Z",
  });
  store = {
    ...store,
    prospects: [prospect, ...store.prospects],
  };
  store = rememberFieldLists(store, { userId: "user-1", prospects: [{ id: "p1", name: "Martin" }], appointments: [] });
  assert.equal(store.prospects[0].id, "offline-1");
  assert.equal(pendingFieldCount(store), 1);
  const synced = acceptFieldSync(store, store.queue[0], { id: "server-9", name: "Durand" });
  assert.equal(synced.queue.length, 0);
  assert.equal(synced.prospects.some(item => item.id === "server-9"), true);
  assert.equal(synced.prospects.some(item => item.id === "offline-1"), false);
});

test("la file envoie le prospect avant le rendez-vous qui en dépend", () => {
  const queue = sortFieldQueue([
    { id: "2", kind: "appointment-create", at: "2026-09-30T10:01:00.000Z" },
    { id: "1", kind: "prospect-create", at: "2026-09-30T10:00:00.000Z" },
  ]);
  assert.deepEqual(queue.map(item => item.kind), ["prospect-create", "appointment-create"]);
  assert.equal(isNetworkFailure({ name: "TypeError", message: "Failed to fetch" }), true);
});

test("le devis n est pas mis en file hors ligne", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const field = readFileSync(new URL("../app/lib/offline-field.js", import.meta.url), "utf8");
  assert.match(page, /Le devis reste en ligne/);
  assert.doesNotMatch(field, /\/api\/devis/);
  assert.match(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), /\/api\//);
});
