import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  REMEMBERED_EMAIL_KEY,
  isLoginEmail,
  persistRememberedEmail,
  readRememberedEmail,
} from "../app/lib/remembered-login.js";

function memoryStorage(start = {}) {
  const data = { ...start };
  return {
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: key => { delete data[key]; },
    data,
  };
}

test("seul un email valide est mémorisé, jamais le PIN", () => {
  assert.equal(isLoginEmail("Camille@mkl-energies.fr"), true);
  assert.equal(isLoginEmail("123456"), false);
  const storage = memoryStorage();
  assert.equal(persistRememberedEmail(storage, "Camille@mkl-energies.fr", true), "camille@mkl-energies.fr");
  assert.equal(readRememberedEmail(storage), "camille@mkl-energies.fr");
  persistRememberedEmail(storage, "camille@mkl-energies.fr", false);
  assert.equal(readRememberedEmail(storage), "");
  persistRememberedEmail(storage, "123456", true);
  assert.equal(storage.data[REMEMBERED_EMAIL_KEY], undefined);
});

test("l’écran de connexion propose de mémoriser l’identifiant", () => {
  const gate = readFileSync(new URL("../app/components/crm-access-gate.js", import.meta.url), "utf8");
  assert.match(gate, /Mémoriser l’identifiant/);
  assert.match(gate, /persistRememberedEmail/);
  assert.match(gate, /readRememberedEmail/);
  assert.doesNotMatch(gate, /localStorage\.setItem\([^)]*pin/i);
});
