import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  blockedNameAddressConflict,
  blockedNameAddressRows,
  clientDuplicateConflict,
  findClientDuplicates,
  formToClientRecord,
  normalizeClientStatus,
  splitScopedDuplicates,
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

test("le meme nom a la meme adresse bloque la creation", () => {
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
  const existing = {
    id: "1",
    prenom: "Jean",
    nom: "Dupont",
    adresse: "1 rue de Test",
    code_postal: "44000",
    ville: "Nantes",
    email: "autre@example.com",
  };
  const duplicates = findClientDuplicates([existing], record);
  assert.equal(blockedNameAddressRows(duplicates).length, 1);
  const conflict = blockedNameAddressConflict(blockedNameAddressRows(duplicates));
  assert.equal(conflict.blocked, true);
  assert.match(conflict.error, /même nom et la même adresse/);
  const otherStreet = findClientDuplicates([{ ...existing, adresse: "8 rue des Lilas" }], record);
  assert.equal(blockedNameAddressRows(otherStreet).length, 0);
});

test("un doublon hors perimetre ne revele ni nom ni telephone", () => {
  const own = {
    id: "own",
    organization_id: "org",
    commercial_id: "com-1",
    created_by: "com-1",
    email: "moi@example.com",
    telephone: "0611111111",
    nom: "Martin",
    prenom: "Paul",
  };
  const other = {
    id: "other",
    organization_id: "org",
    commercial_id: "com-2",
    created_by: "com-2",
    email: "jean@example.com",
    telephone: "0612345678",
    nom: "Dupont",
    prenom: "Jean",
  };
  const profile = { role: "Commercial", organization_id: "org" };
  const { visible, hidden } = splitScopedDuplicates([own, other], profile, "com-1", ["com-1"]);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, "own");
  assert.equal(hidden.length, 1);
  const leak = clientDuplicateConflict([]);
  assert.match(leak.error, /secrétariat/i);
  assert.deepEqual(leak.duplicates, []);
  const shown = clientDuplicateConflict(visible);
  assert.equal(shown.duplicates[0].id, "own");
  assert.ok(!JSON.stringify(shown).includes("Dupont"));
});

test("refuse un client avec seulement la ville", () => {
  const record = formToClientRecord({
    customerType: "Particulier",
    firstName: "Jean",
    lastName: "Dupont",
    phone: "0612345678",
    address: "Nantes",
    postalCode: "44000",
    city: "Nantes",
    status: "Prospect",
  });
  const errors = validateClientPayload(record);
  assert.ok(errors.some(error => /voie|ville/i.test(error)));
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

test("le statut Actif est mappe vers Client", () => {
  assert.equal(normalizeClientStatus("Actif"), "Client");
  assert.equal(normalizeClientStatus(""), "Prospect");
  const record = formToClientRecord({
    customerType: "Particulier",
    firstName: "Jean",
    lastName: "Dupont",
    phone: "0612345678",
    address: "1 rue de Test",
    postalCode: "44000",
    city: "Nantes",
    status: "Actif",
  });
  assert.equal(record.statut, "Client");
  assert.deepEqual(validateClientPayload(record), []);
});

test("clients ne passent plus par le blob crm_state", () => {
  const source = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.ok(!/useStored\("mkl-clients"/.test(source));
  assert.match(source, /authFetch\("\/api\/clients"\)/);
  assert.match(source, /normalizeClientStatus\(r\.statut\|\|r\.status\)/);
  const fields = readFileSync(new URL("../app/components/client-fields.js", import.meta.url), "utf8");
  const createApi = readFileSync(new URL("../app/api/clients/route.js", import.meta.url), "utf8");
  assert.match(fields, /Au moins un téléphone ou un email est obligatoire/);
  assert.match(createApi, /clientDuplicateConflict/);
  assert.match(createApi, /splitScopedDuplicates/);
  assert.match(fields, /ProspectorPicker/);
  assert.match(fields, /CIVILITIES/);
  const clientsLib = readFileSync(new URL("../app/lib/clients.js", import.meta.url), "utf8");
  assert.match(clientsLib, /"Monsieur"/);
  assert.match(clientsLib, /"Madame"/);
  assert.match(clientsLib, /"Mr & Mme"/);
  assert.match(source, /confirmAgendaOverlap/);
  const pvStudy = readFileSync(new URL("../app/pv-study/page.js", import.meta.url), "utf8");
  assert.ok(!/getCloudState\("mkl-clients"\)/.test(pvStudy));
  assert.match(pvStudy, /authFetch\("\/api\/clients"\)/);
});

test("la fiche client reprend la charte bleu jaune blanc", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const record = readFileSync(new URL("../app/components/client-record.js", import.meta.url), "utf8");
  assert.match(record, /client-record-btn is-primary/);
  assert.match(record, /client-record-btn is-sun is-block/);
  assert.match(css, /section\.client-record \.client-record-btn/);
  assert.match(css, /background:#ffcc00;color:#152347/);
  assert.match(css, /section\.client-record \.client-record-info>div\{background:#fff/);
});

test("le tableau clients a une typographie unique", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(css, /\.clients-table \.data-row b/);
  assert.match(css, /font:600 13px\/1\.35 "DM Sans"/);
  assert.match(css, /font:400 12px\/1\.35 "DM Sans"/);
  assert.match(page, /<span>N° client<\/span><span>Client<\/span><span>Contact<\/span>/);
});

test("seuls Admin VIP et Superadmin peuvent modifier une fiche client enregistree", () => {
  const api = readFileSync(new URL("../app/api/clients/[id]/route.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const fields = readFileSync(new URL("../app/components/client-fields.js", import.meta.url), "utf8");
  assert.match(api, /canEditExistingClient\(auth\.profile\)/);
  assert.match(api, /fiche enregistrée/);
  assert.match(page, /canEditDirectory/);
  assert.match(page, /clientReadOnly/);
  assert.match(fields, /readOnly = false/);
  assert.match(fields, /fieldset disabled=\{readOnly\}/);
});
