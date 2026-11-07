import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addressGapSentence, missingAddressParts } from "../app/lib/address.js";
import {
  TOUR_SLOTS,
  callCard,
  haversineKm,
  indicatedEntretienRecord,
  nextFreeSlot,
  parisRange,
  placeDaySlots,
  visitClock,
  agreedClock,
  confirmedSite,
  parseTourTechnicianIds,
  pickTourTechnicians,
  tourTechnicianRole,
  tourWeekDays,
  plannedClientIds,
  buildServiceVisitRecord,
  serviceTaskText,
  isMaintenanceVisit,
  pickTourAnchorVisit,
  visitPrestation,
  crmContractsAsTourContracts,
  entretienSearchMatches,
  rankCallList,
  readCallbackOn,
  writeCallbackOn,
} from "../app/lib/entretien-tour.js";

const TODAY = "2026-09-30";

test("un appel signale la voie, le code postal ou la commune manquants", () => {
  assert.deepEqual(missingAddressParts({ address: "12 rue des Lilas", postal: "69003", city: "Lyon" }), []);
  assert.deepEqual(missingAddressParts({ address: "12 rue des Tuileries · 67460 Souffelweyersheim" }), []);
  assert.deepEqual(missingAddressParts({ address: "", postal: "690", city: "" }), ["la voie", "le code postal", "la commune"]);
  assert.equal(
    addressGapSentence(["le code postal"]),
    "Il manque le code postal. Voulez-vous compléter l’adresse pendant l’appel ?"
  );
  const route = readFileSync(new URL("../app/api/entretien/tour/route.js", import.meta.url), "utf8");
  const screen = readFileSync(new URL("../app/components/entretien-tour.js", import.meta.url), "utf8");
  const record = readFileSync(new URL("../app/components/client-record.js", import.meta.url), "utf8");
  assert.match(route, /action === "address"/);
  assert.match(screen, /Adresse incomplète|AddressCallNotice/);
  assert.match(record, /AddressCallNotice/);
  for (const file of [
    "../app/components/document-parties.js",
    "../app/components/devis-wizard.js",
    "../app/components/commercial-agenda.js",
    "../app/components/agenda-home.js",
    "../app/components/sav-module.js",
    "../app/components/commercial-rdv-table.js",
    "../app/components/prospect-dispatch-board.js",
  ]) {
    assert.match(readFileSync(new URL(file, import.meta.url), "utf8"), /AddressCallNotice|ClientPhoneLink/);
  }
  assert.doesNotMatch(screen, /window\.confirm\(`Voulez-vous mettre à jour/);
});

test("maintenance, dépannage et installation partagent la semaine sans mélanger les appels", () => {
  const entretien = { id: "e", client_id: "c1", nature_validated: "entretien", location: "12 rue A", scheduled_start: "2026-10-28T06:30:00.000Z" };
  const repair = { id: "d", client_id: "c2", nature_validated: "depannage", location: "8 rue B", scheduled_start: "2026-10-28T08:15:00.000Z" };
  const install = { id: "i", client_id: "c3", nature_validated: "installation", location: "3 rue C", scheduled_start: "2026-10-28T11:30:00.000Z" };
  assert.equal(visitPrestation(entretien), "maintenance");
  assert.equal(visitPrestation(repair), "depannage");
  assert.equal(visitPrestation(install), "installation");
  assert.equal(isMaintenanceVisit(repair), false);
  const placed = placeDaySlots([entretien, repair, install], "2026-10-28");
  assert.equal(placed.slots.filter(slot => slot.visit).length, 3);
  assert.equal(pickTourAnchorVisit(placed.slots, [entretien, repair, install]).id, "e");
  const record = buildServiceVisitRecord({
    organizationId: "org",
    technicianId: "tech",
    clientId: "c2",
    nature: "depannage",
    day: "2026-10-29",
    time: "10:15",
    title: "Dépannage Martin",
    location: "8 rue B, 67000 Strasbourg",
    description: "  Fuite sous le ballon  ",
    actorId: "user",
  });
  assert.equal(record.nature_validated, "depannage");
  assert.equal(record.contract_id, null);
  assert.equal(record.realization_status, "inconnu");
  assert.equal(record.title, "Dépannage Martin");
  assert.equal(record.description, "Fuite sous le ballon");
  assert.equal(serviceTaskText(`${"a".repeat(2005)}`), "a".repeat(2000));
  const screen = readFileSync(new URL("../app/components/entretien-tour.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(screen, /entretien-tour-board-name/);
  assert.match(screen, /Prestation pour/);
  assert.doesNotMatch(screen, /entretien-tour-person/);
  assert.match(screen, /setSite\(\{ address: "", postal: "", city: "" \}\)/);
  assert.match(screen, /À faire/);
  assert.match(screen, /setTask\(""\)/);
  assert.match(screen, /kind: "book"[\s\S]*task: ""/);
  assert.match(screen, /description: draft\.task/);
  const route = readFileSync(new URL("../app/api/entretien/tour/route.js", import.meta.url), "utf8");
  assert.match(route, /action === "book"[\s\S]*?description: serviceTaskText\(body\.description\)/);
  assert.match(screen, /book-service/);
  assert.match(screen, /is-\$\{kind\}/);
  assert.match(css, /is-depannage/);
  assert.match(css, /is-installation/);
  assert.match(css, /is-visite/);
  const sql = readFileSync(new URL("../supabase/migrations/20261028_tour_depannage.sql", import.meta.url), "utf8");
  assert.match(sql, /'depannage'/);
  const visiteSql = readFileSync(new URL("../supabase/migrations/20261105_tour_visite_technique.sql", import.meta.url), "utf8");
  assert.match(visiteSql, /'visite_technique'/);
  const visit = buildServiceVisitRecord({
    organizationId: "org",
    technicianId: "tech",
    clientId: "c3",
    nature: "visite",
    day: "2026-11-05",
    time: "13:30",
    title: "Visite technique Bernard",
    location: "3 rue C, 67000 Strasbourg",
    actorId: "user",
  });
  assert.equal(visit.nature_validated, "visite_technique");
  assert.equal(visit.nature_proposed, "visite_technique");
  assert.equal(visit.contract_id, null);
  assert.equal(visitPrestation(visit), "visite");
  assert.equal(isMaintenanceVisit(visit), false);
  const module = readFileSync(new URL("../app/components/entretien-module.js", import.meta.url), "utf8");
  assert.match(module, /Visite technique/);
  assert.match(module, /onOpenPrevisit/);
});

test("les cinq créneaux de tournée sont fixes", () => {
  assert.deepEqual(TOUR_SLOTS, ["08:30", "10:15", "13:30", "15:00", "16:30"]);
  assert.equal(nextFreeSlot(["08:30", "10:15"]), "13:30");
  assert.equal(nextFreeSlot(TOUR_SLOTS), "");
  assert.equal(agreedClock("09:15"), "09:15");
  assert.equal(agreedClock("9:15"), "");
  assert.equal(agreedClock(""), "");
  const site = confirmedSite({ address: "12 rue des Lilas", postal: "69003", city: "Lyon" });
  assert.equal(site.ok, true);
  assert.equal(site.location, "12 rue des Lilas, 69003 Lyon");
  assert.equal(confirmedSite({ address: "12 rue des Lilas", postal: "69", city: "Lyon" }).error, "Confirmez le code postal avec le client.");
  assert.equal(confirmedSite({ address: "12", postal: "69003", city: "Lyon" }).ok, false);
});

test("un entretien jamais fait reste à appeler", () => {
  const card = callCard({ client_id: "a" }, TODAY);
  assert.equal(card.callable, true);
  assert.equal(card.tone, "premier");
  assert.equal(card.label, "Premier passage");
});

test("un retard de plusieurs années reste en haut de liste", () => {
  const card = callCard({ last_confirmed_entretien_on: "2022-06-01", frequency: "Annuelle" }, TODAY);
  assert.equal(card.callable, true);
  assert.equal(card.tone, "retard");
  assert.match(card.label, /En retard/);
});

test("un entretien fait il y a quatre mois n est pas à appeler", () => {
  const card = callCard({ last_confirmed_entretien_on: "2026-06-01", next_due_on: "2027-06-01" }, TODAY);
  assert.equal(card.callable, false);
  assert.equal(card.tone, "trop-tot");
});

test("l alerte s ouvre trente jours avant l échéance", () => {
  const soon = callCard({ last_confirmed_entretien_on: "2025-10-20", next_due_on: "2026-10-20" }, TODAY);
  assert.equal(soon.callable, true);
  assert.equal(soon.tone, "echeance");
  const later = callCard({ last_confirmed_entretien_on: "2025-11-15", next_due_on: "2026-11-15" }, TODAY);
  assert.equal(later.callable, false);
});

test("rappeler le cache le client puis le ramène", () => {
  const notes = writeCallbackOn("PAC Atlantic — toit", "2026-11-02");
  assert.match(notes, /PAC Atlantic/);
  assert.equal(readCallbackOn(notes), "2026-11-02");
  const waiting = callCard({ notes, last_confirmed_entretien_on: "2022-01-01" }, TODAY);
  assert.equal(waiting.callable, false);
  assert.match(waiting.label, /02\/11\/2026/);
  const back = callCard({ notes }, "2026-11-02");
  assert.equal(back.callable, true);
  assert.equal(writeCallbackOn(notes, ""), "PAC Atlantic — toit");
});

test("après un oui, la liste reste dans les 30 km et met le retard devant", () => {
  const anchor = { lat: 45.75, lon: 4.85 };
  const rows = [
    { client_id: "loin", client_name: "Loin", client_postal: "13000", lat: 43.3, lon: 5.4, last_confirmed_entretien_on: "2020-01-01" },
    { client_id: "proche-ok", client_name: "Proche", client_postal: "69001", lat: 45.76, lon: 4.86 },
    { client_id: "proche-retard", client_name: "Retard", client_postal: "69003", lat: 45.78, lon: 4.9, last_confirmed_entretien_on: "2021-01-01" },
    { client_id: "deja", client_name: "Déjà", lat: 45.75, lon: 4.85 },
  ];
  const list = rankCallList(rows, { today: TODAY, anchor, bookedClientIds: ["deja"] });
  assert.deepEqual(list.map(row => row.client_id), ["proche-retard", "proche-ok"]);
  assert.ok(list.every(row => row.km <= 30));
  assert.ok(haversineKm(anchor, rows[0]) > 30);
});

test("une heure convenue remplace le créneau libre le plus proche", () => {
  const slot = parisRange("2026-10-01", "08:30", 75);
  assert.equal(visitClock({ scheduled_start: slot.scheduled_start }), "08:30");
  const moved = placeDaySlots([
    { id: "2", scheduled_start: parisRange("2026-10-01", "09:00").scheduled_start, client_id: "b" },
  ], "2026-10-01");
  assert.equal(moved.slots[0].time, "09:00");
  assert.equal(moved.slots[0].visit.id, "2");
  assert.equal(moved.slots[0].shifted, true);
  assert.equal(moved.extras.length, 0);
  const placed = placeDaySlots([
    { id: "1", scheduled_start: slot.scheduled_start, client_id: "a" },
    { id: "2", scheduled_start: parisRange("2026-10-01", "09:00").scheduled_start, client_id: "b" },
  ], "2026-10-01");
  assert.equal(placed.slots[0].visit.id, "1");
  assert.equal(placed.slots[0].shifted, false);
  assert.equal(placed.slots[1].time, "09:00");
  assert.equal(placed.slots[1].visit.id, "2");
  assert.equal(placed.slots[1].shifted, true);
  assert.equal(placed.extras.length, 0);
  assert.deepEqual(plannedClientIds([
    { client_id: "a", technician_id: "t", realization_status: "inconnu", scheduled_start: "2026-10-02T08:30:00.000Z" },
    { client_id: "b", technician_id: null, realization_status: "confirme", scheduled_start: null },
  ], TODAY), ["a"]);
});

test("la date indiquée à l appel ne pose pas le technicien", () => {
  const record = indicatedEntretienRecord({
    organizationId: "org",
    clientId: "client",
    contractId: "contract",
    day: "2026-06-01",
    actorId: "user",
    title: "Entretien Martin",
  });
  assert.equal(record.technician_id, null);
  assert.equal(record.scheduled_start, null);
  assert.equal(record.realization_status, "confirme");
  assert.equal(record.realization_date, "2026-06-01");
  assert.equal(record.realization_basis, "autre");
  assert.match(record.realization_note, /appel/);
  assert.equal(record.source, "saisie");
});

test("la tournée propose les techniciens sans en choisir un", () => {
  const list = pickTourTechnicians([
    { id: "rt", full_name: "Yannick Richard", role: "Responsable technique", active: true },
    { id: "tech", full_name: "Tolga", role: "technicien", active: null },
    { id: "off", full_name: "Inactif", role: "Technicien", active: false },
    { id: "com", full_name: "Commercial", role: "Commercial", active: true },
  ]);
  assert.equal(tourTechnicianRole("technicien"), "Technicien");
  assert.deepEqual(list.map(item => item.id), ["off", "tech", "rt"]);
  assert.deepEqual(tourWeekDays("2026-10-01"), [
    "2026-09-28",
    "2026-09-29",
    "2026-09-30",
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
  ]);
  const route = readFileSync(new URL("../app/api/entretien/tour/route.js", import.meta.url), "utf8");
  assert.doesNotMatch(route, /technicians\[0\]/);
  const screen = readFileSync(new URL("../app/components/entretien-tour.js", import.meta.url), "utf8");
  assert.deepEqual(parseTourTechnicianIds("a, b, a,,b"), ["a", "b"]);
  assert.deepEqual(parseTourTechnicianIds(["t1", "t2", "t1"]), ["t1", "t2"]);
  assert.match(screen, /un ou plusieurs techniciens/);
  assert.match(screen, /aria-pressed/);
  assert.match(screen, /technicianIds/);
  assert.match(route, /parseTourTechnicianIds/);
  assert.match(screen, /Technicien pour ce rendez-vous/);
  assert.match(screen, /Heure convenue/);
  assert.match(screen, /Confirmez l’adresse et le code postal/);
  assert.match(screen, /paused: !editingAddress/);
  assert.match(route, /confirmedSite\(body\)/);
  assert.match(screen, /Annuler/);
  assert.match(route, /agreedClock\(body\.time\)/);
  assert.doesNotMatch(route, /nextFreeSlot/);
  assert.match(screen, /entretien-tour-week/);
  assert.match(route, /tourWeekDays/);
  assert.doesNotMatch(screen, /board\?\.technicianId/);
});

test("un contrat crm saisi a la main entre dans la tournee", () => {
  const clients = [{ id: "taverne", prenom: "Dominique", nom: "Taverne", adresse: "1 rue des Lilas", code_postal: "67000", ville: "Strasbourg" }];
  const paper = [{
    record_id: "c1",
    client_id: "taverne",
    client_name: "Me Taverne Dominique",
    status: "À planifier",
    payload: { frequency: "Annuelle", number: "ENT-2026-014", client: "Dominique Taverne" },
  }];
  const added = crmContractsAsTourContracts(paper, clients, ["deja"]);
  assert.equal(added.length, 1);
  assert.equal(added[0].client_id, "taverne");
  assert.equal(added[0].number, "ENT-2026-014");
  assert.equal(crmContractsAsTourContracts(paper, clients, ["taverne"]).length, 0);
  assert.equal(crmContractsAsTourContracts([{ ...paper[0], status: "Suspendu" }], clients, []).length, 0);
  const byName = crmContractsAsTourContracts([{
    record_id: "c2",
    client_name: "Me Taverne Dominique",
    status: "Actif",
    payload: { client: "Me Taverne Dominique" },
  }], clients, []);
  assert.equal(byName[0]?.client_id, "taverne");
  assert.equal(entretienSearchMatches("Dominique Taverne 67000 Strasbourg", "me taverne dominique"), true);
  assert.equal(entretienSearchMatches("Martin Paul", "taverne"), false);
  const route = readFileSync(new URL("../app/api/entretien/tour/route.js", import.meta.url), "utf8");
  assert.match(route, /crmContractsAsTourContracts/);
  assert.match(route, /ensureEntretienContractForClient/);
});

test("la tournée n est pas l ecran du technicien", () => {
  const route = readFileSync(new URL("../app/api/entretien/tour/route.js", import.meta.url), "utf8");
  assert.match(route, /isFieldMaintenanceTechnician/);
  assert.match(route, /La tournée reste au secrétariat/);
  const screen = readFileSync(new URL("../app/components/entretien-module.js", import.meta.url), "utf8");
  const start = screen.indexOf("entretien-module entretien-tech");
  const field = screen.slice(start, screen.indexOf("\n  return (", start));
  assert.doesNotMatch(field, /Tournée/);
  assert.match(screen, /\["tournee", "Tournée"\]/);
});
