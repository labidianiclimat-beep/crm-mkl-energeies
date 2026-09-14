import test from "node:test";
import assert from "node:assert/strict";
import {
  findClientDuplicates,
  formToClientRecord,
  validateClientPayload,
} from "../app/lib/clients.js";

test("particulier requires nom and prenom", () => {
  const record = formToClientRecord({
    customerType: "Particulier",
    firstName: "",
    lastName: "",
    phone: "0612345678",
    address: "1 rue de Test",
    postalCode: "44000",
    city: "Nantes",
    status: "Prospect",
  });
  const errors = validateClientPayload(record);
  assert.ok(errors.some(error => /prénom/i.test(error)));
  assert.ok(errors.some(error => /nom/i.test(error)));
});

test("professionnel requires raison sociale", () => {
  const record = formToClientRecord({
    customerType: "Entreprise",
    company: "",
    email: "contact@example.com",
    address: "1 rue de Test",
    postalCode: "44000",
    city: "Nantes",
    status: "Prospect",
  });
  const errors = validateClientPayload(record);
  assert.ok(errors.some(error => /raison sociale/i.test(error)));
});

test("requires phone or email", () => {
  const record = formToClientRecord({
    customerType: "Particulier",
    firstName: "Jean",
    lastName: "Dupont",
    address: "1 rue de Test",
    postalCode: "44000",
    city: "Nantes",
    status: "Prospect",
  });
  const errors = validateClientPayload(record);
  assert.ok(errors.some(error => /téléphone ou un email/i.test(error)));
});

test("detects duplicate by email and phone", () => {
  const record = formToClientRecord({
    customerType: "Particulier",
    firstName: "Jean",
    lastName: "Dupont",
    email: "jean@example.com",
    phone: "06 12 34 56 78",
    address: "1 rue de Test",
    postalCode: "44000",
    city: "Nantes",
    status: "Prospect",
  });
  const duplicates = findClientDuplicates([
    { id: "1", email: "jean@example.com", telephone: "0612345678", nom: "Martin", prenom: "Paul", code_postal: "44000" },
  ], record);
  assert.equal(duplicates.length, 1);
  assert.ok(duplicates[0]._duplicateReasons.includes("email"));
});

test("valid particulier passes validation", () => {
  const record = formToClientRecord({
    customerType: "Particulier",
    firstName: "Jean",
    lastName: "Dupont",
    phone: "0612345678",
    address: "1 rue de Test",
    postalCode: "44000",
    city: "Nantes",
    status: "Prospect",
  });
  assert.deepEqual(validateClientPayload(record), []);
});
