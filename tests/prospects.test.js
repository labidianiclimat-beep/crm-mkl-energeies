import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  appointmentToUi,
  formToAppointmentRecord,
  formToProspectRecord,
  formatProjectTypes,
  PROSPECT_STAGES,
  isContactSheetProspect,
  latestRdvStatusForProspect,
  parseProjectTypes,
  PROSPECT_SOURCES,
  prospectorUsers,
  prospectToUi,
  validateAppointmentPayload,
  validateProspectPayload,
  withProspectRdvStatuses,
} from "../app/lib/prospects.js";
import { displayRdvStatus, rdvStatusTone } from "../app/lib/appointment-status.js";
import {
  appointmentIdentity,
  isDemoProspect,
  prospectIdentity,
} from "../app/lib/legacy-state-recovery.js";

test("un prospect SQL se lit comme une fiche d'ecran", () => {
  const ui = prospectToUi({
    id: "11111111-1111-4111-8111-111111111111",
    name: "SCI Horizon",
    phone: "0612345678",
    email: "contact@horizon.fr",
    city: "La Baule",
    project_type: "Photovoltaïque",
    estimated_value: 24900,
    stage: "Étude",
    commercial_id: "22222222-2222-4222-8222-222222222222",
    extra: { power: "12 kWc", color: "#405fae" },
  }, { "22222222-2222-4222-8222-222222222222": "Sébastien Brun" });
  assert.equal(ui.type, "Photovoltaïque");
  assert.equal(ui.value, 24900);
  assert.equal(ui.power, "12 kWc");
  assert.equal(ui.owner, "Sébastien Brun");
});

test("la civilite Mr et Mme est enregistree sur le prospect", () => {
  const record = formToProspectRecord({
    name: "Martin",
    phone: "0612345678",
    address: "12 rue de la Paix",
    postalCode: "44000",
    city: "Nantes",
    civilite: "Mr & Mme",
  }, { organizationId: "org" });
  assert.equal(record.extra.civilite, "Mr & Mme");
  assert.equal(prospectToUi({ ...record, id: "11111111-1111-4111-8111-111111111111" }).civilite, "Mr & Mme");
});

test("un rendez-vous SQL conserve l'heure et le commercial", () => {
  const ui = appointmentToUi({
    id: "33333333-3333-4333-8333-333333333333",
    opportunity_id: "11111111-1111-4111-8111-111111111111",
    prospect_name: "SCI Horizon",
    starts_at: "2026-09-20T09:00:00.000Z",
    duration_minutes: 90,
    commercial_id: "22222222-2222-4222-8222-222222222222",
    status: "Affecté",
  }, { "22222222-2222-4222-8222-222222222222": "Karim" });
  assert.equal(ui.prospectId, "11111111-1111-4111-8111-111111111111");
  assert.equal(ui.start, "2026-09-20T09:00:00.000Z");
  assert.equal(ui.duration, 90);
  assert.equal(ui.commercial, "Karim");
});

test("la validation refuse un prospect sans adresse complete ni telephone", () => {
  const record = formToProspectRecord({ name: "Test", city: "Nantes" }, { organizationId: "org" });
  const errors = validateProspectPayload(record);
  assert.ok(errors.some(item => /voie|adresse/i.test(item)));
  assert.ok(errors.some(item => /code postal/i.test(item)));
  assert.ok(errors.some(item => /téléphone/i.test(item)));
});

test("un prospect conserve l'adresse complete dans extra", () => {
  const record = formToProspectRecord({
    name: "SCI Horizon",
    phone: "0612345678",
    address: "12 rue de la Paix",
    postalCode: "44500",
    city: "La Baule",
  }, { organizationId: "org" });
  assert.equal(validateProspectPayload(record).length, 0);
  assert.equal(record.city, "La Baule");
  assert.equal(record.extra.address, "12 rue de la Paix");
  assert.equal(record.extra.postalCode, "44500");
});

test("la creation d un prospect rattache le rendez-vous avec le nom de la fiche", () => {
  const record = formToAppointmentRecord({
    name: "Marie Laurent",
    start: "2026-09-25T09:00:00.000Z",
    kind: "rendez-vous",
  }, {});
  assert.equal(record.prospect_name, "Marie Laurent");
  assert.equal(validateAppointmentPayload(record).some(item => /rattaché à un prospect/i.test(item)), false);
  const source = readFileSync(new URL("../app/api/prospects/route.js", import.meta.url), "utf8");
  assert.match(source, /prospectName: record\.name/);
});

test("un rendez-vous sans date est refuse", () => {
  const record = formToAppointmentRecord({ prospectName: "A" }, {});
  const errors = validateAppointmentPayload(record);
  assert.ok(errors.some(item => /date/i.test(item)));
});

test("l'affectation d'un commercial passe le statut a Non statue", () => {
  const record = formToAppointmentRecord({
    prospectName: "A",
    start: "2026-09-20T09:00:00.000Z",
    commercialId: "22222222-2222-4222-8222-222222222222",
  }, {});
  assert.equal(record.status, "Non statué");
  assert.equal(record.commercial_id, "22222222-2222-4222-8222-222222222222");
});

test("un rendez-vous reprend l'adresse complete du prospect", () => {
  const record = formToAppointmentRecord({
    prospectName: "SCI Horizon",
    start: "2026-09-20T09:00:00.000Z",
    address: "12 rue de la Paix",
    postalCode: "44500",
    city: "La Baule",
  }, {});
  assert.equal(record.extra.address, "12 rue de la Paix 44500 La Baule");
});

test("les prospects de demonstration ne sont pas recuperes", () => {
  assert.equal(isDemoProspect({ id: 101, name: "Boulangerie Le Sillon" }), true);
  assert.equal(isDemoProspect({ name: "EARL des Chênes" }), true);
  assert.equal(isDemoProspect({ name: "Client réel Nantes", city: "Nantes" }), false);
});

test("l'identite d'un prospect et d'un rendez-vous est stable", () => {
  assert.equal(
    prospectIdentity({ email: "A@X.fr", name: "Autre" }),
    prospectIdentity({ email: "a@x.fr" })
  );
  assert.equal(
    appointmentIdentity({ prospectName: "SCI Horizon", start: "2026-09-20T09:00" }),
    "rdv:sci horizon|2026-09-20T09:00"
  );
});

test("prospects et agenda ne passent plus par le blob crm_state", () => {
  const source = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.ok(!/useStored\("mkl-prospects"/.test(source));
  assert.ok(!/useStored\("mkl-commercial-appointments"/.test(source));
  assert.match(source, /authFetch\("\/api\/prospects"\)/);
  assert.match(source, /authFetch\("\/api\/appointments"\)/);
  assert.match(source, /ProspectFields/);
  assert.match(source, /forceOverlap:true/);
  assert.match(source, /confirmAgendaOverlap/);
  assert.match(source, /requestWithOverlap/);
});

test("un telephone francais est exigé et le 0000000000 est refuse", () => {
  const valid = formToProspectRecord({
    name: "SCI Horizon",
    phone: "06 12 34 56 78",
    address: "12 rue de la Paix",
    postalCode: "44500",
    city: "La Baule",
  }, { organizationId: "org" });
  assert.deepEqual(validateProspectPayload(valid), []);

  const fake = formToProspectRecord({
    name: "SCI Horizon",
    phone: "0000000000",
    address: "12 rue de la Paix",
    postalCode: "44500",
    city: "La Baule",
  }, { organizationId: "org" });
  assert.ok(validateProspectPayload(fake).some(error => /téléphone/i.test(error)));

  const foreign = formToProspectRecord({
    name: "SCI Horizon",
    phone: "+32 470 12 34 56",
    landline: "+49 30 12345678",
    address: "12 rue de la Paix",
    postalCode: "44500",
    city: "La Baule",
  }, { organizationId: "org" });
  assert.deepEqual(validateProspectPayload(foreign), []);
  assert.equal(foreign.extra.landline, "+49 30 12345678");

  const landlineOnly = formToProspectRecord({
    name: "SCI Horizon",
    phone: "",
    landline: "+352 621 123 456",
    address: "12 rue de la Paix",
    postalCode: "44500",
    city: "La Baule",
  }, { organizationId: "org" });
  assert.deepEqual(validateProspectPayload(landlineOnly), []);
});

test("le formulaire prospect est large et tactile pour la saisie tablette", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const fields = readFileSync(new URL("../app/components/prospect-fields.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /prospect-modal/);
  assert.match(fields, /prospect-chips/);
  assert.match(fields, /PROSPECT_SOURCES/);
  assert.match(fields, /ProspectorPicker/);
  const picker = readFileSync(new URL("../app/components/prospector-picker.js", import.meta.url), "utf8");
  assert.match(picker, />Autre</);
  assert.match(fields, /multiple/);
  assert.doesNotMatch(fields, /Montant estimé/);
  assert.match(css, /min\(1040px,100%\)/);
  assert.match(css, /font-size:16px/);
  assert.match(fields, /fieldCapture/);
  assert.match(fields, /readOnly/);
  assert.match(fields, /commercialsForProspectAssign/);
  assert.match(page, /canAssignProspectCommercial/);
});

test("les administrateurs et la responsable prospection peuvent effacer un prospect depuis la fiche et le tableau", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/prospects/[id]/route.js", import.meta.url), "utf8");
  const board = readFileSync(new URL("../app/components/prospect-dispatch-board.js", import.meta.url), "utf8");
  assert.match(page, /canDeleteProspects=canPerformAction\(currentProfile,"delete_prospects"\)/);
  assert.match(page, /method:"DELETE"/);
  assert.match(page, /prospect-delete/);
  assert.match(board, /canDelete && <button type="button" className="trash"/);
  assert.match(api, /canPerformAction\(auth\.profile, "delete_prospects"\)/);
  assert.match(api, /Suppression réservée aux administrateurs et à la responsable prospection/);
});

test("l origine Stand Carrefour et le prospecteur sont conserves", () => {
  assert.ok(PROSPECT_SOURCES.includes("Stand Carrefour"));
  assert.ok(PROSPECT_SOURCES.includes("Call Marrakech (Pros)"));
  assert.ok(PROSPECT_SOURCES.includes("Appel entrant"));
  const other = formToProspectRecord({
    name: "SCI Horizon",
    phone: "0612345678",
    address: "12 rue de la Paix",
    postalCode: "44500",
    city: "La Baule",
    source: "Call Marrakech (Pros)",
    prospectorId: "__autre__",
    prospector: "Karim Call",
  }, { organizationId: "org" });
  assert.equal(other.extra.prospectorId, "");
  assert.equal(other.extra.prospector, "Karim Call");
  assert.equal(prospectToUi({ ...other, id: "11111111-1111-4111-8111-111111111111" }).prospector, "Karim Call");
  const prospectorId = "44444444-4444-4444-8444-444444444444";
  const record = formToProspectRecord({
    name: "SCI Horizon",
    phone: "0612345678",
    address: "12 rue de la Paix",
    postalCode: "44500",
    city: "La Baule",
    source: "Stand Carrefour",
    prospectorId,
  }, { organizationId: "org" });
  assert.equal(record.source, "Stand Carrefour");
  assert.equal(record.extra.prospectorId, prospectorId);
  const ui = prospectToUi({
    ...record,
    id: "11111111-1111-4111-8111-111111111111",
  }, { [prospectorId]: "Léa Terrain" });
  assert.equal(ui.source, "Stand Carrefour");
  assert.equal(ui.prospectorId, prospectorId);
  assert.equal(ui.prospector, "Léa Terrain");
  assert.equal(prospectorUsers([
    { id: prospectorId, name: "Léa Terrain", role: "Prospecteur terrain", active: true },
    { id: "c1", name: "Karim", role: "Commercial", active: true },
  ]).length, 1);
});

test("le statut RDV du commercial se lit sur le prospect avec les libelles iCollect", () => {
  const prospectId = "11111111-1111-4111-8111-111111111111";
  assert.equal(latestRdvStatusForProspect(prospectId, []), "");
  assert.equal(displayRdvStatus(""), "Aucun rendez-vous");
  assert.equal(rdvStatusTone(""), "muted");
  const older = { opportunity_id: prospectId, status: "Client absent", starts_at: "2026-09-01T09:00:00.000Z" };
  const newer = { opportunity_id: prospectId, status: "Client en réflexion", starts_at: "2026-09-20T09:00:00.000Z" };
  assert.equal(latestRdvStatusForProspect(prospectId, [older, newer]), "Client en réflexion");
  assert.equal(latestRdvStatusForProspect(prospectId, [{ opportunity_id: prospectId, status: "Absence du prospect", starts_at: "2026-09-20T09:00:00.000Z" }]), "Client absent");
  assert.equal(displayRdvStatus("Commande signée"), "Commande signée");
  assert.equal(rdvStatusTone("Commande signée"), "ok");
  assert.equal(rdvStatusTone("Client absent"), "bad");
  const [ui] = withProspectRdvStatuses(
    [{ id: prospectId, name: "SCI Horizon" }],
    [newer]
  );
  assert.equal(ui.rdvStatus, "Client en réflexion");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /STATUT RDV/);
  assert.match(page, /displayRdvStatus/);
  assert.match(page, /stampProspectRdv/);
  const fiche = readFileSync(new URL("../app/components/prospect-fields.js", import.meta.url), "utf8");
  assert.match(fiche, /Qualification du rendez-vous/);
  assert.match(fiche, /displayRdvStatus\(prospect\.rdvStatus\)/);
  assert.doesNotMatch(fiche, /ChipGroup name="rdvStatus"/);
  const listApi = readFileSync(new URL("../app/api/prospects/route.js", import.meta.url), "utf8");
  assert.match(listApi, /attachProspectRdvStatuses/);
  const oneApi = readFileSync(new URL("../app/api/prospects/[id]/route.js", import.meta.url), "utf8");
  assert.match(oneApi, /attachProspectRdvStatuses/);
});

test("plusieurs types de projet sont conserves sur la fiche", () => {
  assert.deepEqual(parseProjectTypes("Photovoltaïque · Pompe à chaleur"), ["Photovoltaïque", "Pompe à chaleur"]);
  assert.equal(formatProjectTypes(["Photovoltaïque", "Climatisation"]), "Photovoltaïque · Climatisation");
  const record = formToProspectRecord({
    name: "SCI Horizon",
    phone: "0612345678",
    address: "12 rue de la Paix",
    postalCode: "44500",
    city: "La Baule",
    type: "Photovoltaïque · Pompe à chaleur",
  }, { organizationId: "org" });
  assert.equal(record.project_type, "Photovoltaïque · Pompe à chaleur");
  assert.deepEqual(record.extra.types, ["Photovoltaïque", "Pompe à chaleur"]);
  const ui = prospectToUi({ ...record, id: "11111111-1111-4111-8111-111111111111" });
  assert.equal(ui.type, "Photovoltaïque · Pompe à chaleur");
  assert.deepEqual(ui.types, ["Photovoltaïque", "Pompe à chaleur"]);
});

test("une fiche contact reste hors du tableau prospects tant que le statut n avance pas", () => {
  const contact = { desiredKind: "rappel", stage: "À contacter" };
  const planned = { desiredKind: "rappel", stage: "Rendez-vous planifié" };
  const qualified = { desiredKind: "rappel", stage: "Qualifié" };
  const visit = { desiredKind: "rendez-vous", stage: "Nouveau" };
  assert.equal(isContactSheetProspect(contact), true);
  assert.equal(isContactSheetProspect(planned, { kind: "rappel" }), true);
  assert.equal(isContactSheetProspect(qualified, { kind: "rappel" }), false);
  assert.equal(isContactSheetProspect(visit), false);
  assert.equal(isContactSheetProspect(contact, { kind: "rendez-vous" }), true);
  assert.equal(isContactSheetProspect({ desiredKind: "rendez-vous", stage: "À contacter" }, { kind: "rappel" }), false);
  const reminder = formToAppointmentRecord({
    prospectName: "Contact",
    start: "2026-10-13T09:00:00.000Z",
    actionKind: "rappel",
  }, {});
  assert.equal(reminder.extra.kind, "rappel");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const choice = readFileSync(new URL("../app/components/prospect-next-action.js", import.meta.url), "utf8");
  assert.match(page, /Contacts \(\{contactCount\}\)/);
  assert.match(page, /Fiche contact/);
  assert.match(choice, /Fiche contact/);
  assert.doesNotMatch(choice, /Rappel téléphonique/);
});

test("un stade Gagné choisi à la main reste enregistré", () => {
  assert.ok(PROSPECT_STAGES.includes("Gagné"));
  const record = formToProspectRecord({
    name: "Martin",
    phone: "0612345678",
    address: "12 rue de la Paix",
    postalCode: "44000",
    city: "Nantes",
    stage: "Gagné",
  }, { organizationId: "org" });
  assert.equal(record.stage, "Gagné");
  assert.equal(prospectToUi({ ...record, id: "11111111-1111-4111-8111-111111111111" }).stage, "Gagné");
});
