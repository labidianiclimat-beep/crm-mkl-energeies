import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyWizardState } from "../app/lib/devis-wizard.js";
import { clientToUi, formToClientRecord } from "../app/lib/clients.js";
import { formToProspectRecord, prospectToUi } from "../app/lib/prospects.js";
import { prospectToClientPayload } from "../app/lib/prospect-to-client.js";
import { housingFromPerson } from "../app/lib/housing.js";

const housing = {
  housingType: "Maison",
  constructionYear: "1998",
  occupancy: "Propriétaire",
};

test("le logement du prospect est stocké et relu", () => {
  const record = formToProspectRecord({
    name: "Jean Dupont",
    phone: "0612345678",
    address: "12 rue de la Paix",
    postalCode: "44500",
    city: "La Baule",
    ...housing,
  }, { organizationId: "org" });
  assert.equal(record.extra.housingType, "Maison");
  assert.equal(record.extra.constructionYear, "1998");
  assert.equal(record.extra.occupancy, "Propriétaire");
  const ui = prospectToUi(record);
  assert.deepEqual(housingFromPerson(ui), housing);
});

test("le logement du client est conservé sans casser les notes", () => {
  const record = formToClientRecord({
    customerType: "Particulier",
    firstName: "Jean",
    lastName: "Dupont",
    phone: "0612345678",
    address: "1 rue de Test",
    postalCode: "44000",
    city: "Nantes",
    notes: "Portail à gauche",
    ...housing,
  });
  assert.match(record.notes, /Portail à gauche/);
  assert.match(record.notes, /\[\[logement\]\]/);
  const ui = clientToUi({ ...record, prenom: "Jean", nom: "Dupont" });
  assert.equal(ui.housingType, "Maison");
  assert.equal(ui.constructionYear, "1998");
  assert.equal(ui.occupancy, "Propriétaire");
  assert.equal(ui.notes, "Portail à gauche");
});

test("un devis ouvert depuis un prospect préremplit le logement", () => {
  const state = emptyWizardState({
    prospect: { id: "p1", name: "Jean", ...housing },
  });
  assert.equal(state.housingType, "Maison");
  assert.equal(state.constructionYear, "1998");
  assert.equal(state.occupancy, "Propriétaire");
});

test("un prospecteur Autre est conserve sur le client", () => {
  const record = formToClientRecord({
    customerType: "Particulier",
    firstName: "Jean",
    lastName: "Dupont",
    phone: "0612345678",
    address: "1 rue de Test",
    postalCode: "44000",
    city: "Nantes",
    notes: "Portail à gauche",
    prospectorId: "__autre__",
    prospector: "Karim Call",
    ...housing,
  });
  assert.match(record.notes, /Portail à gauche/);
  assert.match(record.notes, /Karim Call/);
  const ui = clientToUi({ ...record, prenom: "Jean", nom: "Dupont" });
  assert.equal(ui.prospector, "Karim Call");
  assert.equal(ui.prospectorId, "");
  assert.equal(ui.notes, "Portail à gauche");
});

test("la conversion prospect → client conserve le logement", () => {
  const payload = prospectToClientPayload({
    name: "Jean Dupont",
    phone: "0612345678",
    address: "12 rue de la Paix",
    postalCode: "44500",
    city: "La Baule",
    ...housing,
  }, { documentKind: "Devis" });
  assert.equal(payload.housingType, "Maison");
  assert.equal(payload.occupancy, "Propriétaire");
  const record = formToClientRecord(payload);
  const ui = clientToUi({ ...record, prenom: "Jean", nom: "Dupont" });
  assert.equal(ui.constructionYear, "1998");
});

test("les fiches prospect, client et devis partagent les mêmes listes", () => {
  const prospect = readFileSync(new URL("../app/components/prospect-fields.js", import.meta.url), "utf8");
  const client = readFileSync(new URL("../app/components/client-fields.js", import.meta.url), "utf8");
  const wizard = readFileSync(new URL("../app/components/devis-wizard.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(prospect, /HousingFields/);
  assert.match(prospect, /3\. Logement/);
  assert.match(client, /HousingFields/);
  assert.match(wizard, /HousingFields/);
  assert.match(wizard, /housingFromPerson/);
  assert.match(page, /housingType:d\.housingType/);
});
