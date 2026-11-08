import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attachTechnicianReach, clientForMaintenanceVisit, isFieldMaintenanceTechnician, maintenanceAgendaBoards, maintenanceReportHref, mapsSearchUrl, phoneCallHref } from "../app/lib/entretien-agenda.js";

test("le planning ouvre les agendas des techniciens", () => {
  const people = [
    { id: "t1", name: "Tolga", role: "Technicien", active: true },
    { id: "t2", name: "Yanis", role: "Technicien", active: true },
    { id: "rt", name: "Yannick", role: "Responsable technique", active: true },
    { id: "off", name: "Inactif", role: "Technicien", active: false },
  ];
  assert.deepEqual(maintenanceAgendaBoards(people, "").map(item => item.id), ["t1", "t2"]);
  assert.deepEqual(maintenanceAgendaBoards(people, "rt").map(item => item.id), ["rt"]);
  assert.deepEqual(maintenanceAgendaBoards(people, "t1").map(item => item.id), ["t1"]);
  const screen = readFileSync(new URL("../app/components/entretien-module.js", import.meta.url), "utf8");
  assert.match(screen, /maintenanceAgendaBoards/);
  assert.match(screen, /Tous les techniciens/);
  assert.match(screen, /entretien-tech-board/);
});

test("seul le technicien de maintenance est limité à son agenda", () => {
  assert.equal(isFieldMaintenanceTechnician("Technicien"), true);
  assert.equal(isFieldMaintenanceTechnician("Responsable technique"), false);
  assert.equal(isFieldMaintenanceTechnician("Admin VIP"), false);
});

test("le formulaire d entretien reprend la visite", () => {
  const href = maintenanceReportHref({
    title: "Entretien Martin",
    location: "12 rue des Lilas 69001 Lyon",
    scheduled_start: "2026-09-30T07:30:00.000Z",
  }, "Yanis Terrain");
  const url = new URL(href, "https://crm.example");
  assert.equal(url.pathname, "/maintenance-form");
  assert.equal(url.searchParams.get("client"), "Martin");
  assert.equal(url.searchParams.get("address"), "12 rue des Lilas 69001 Lyon");
  assert.equal(url.searchParams.get("date"), "2026-09-30");
  assert.equal(url.searchParams.get("technician"), "Yanis Terrain");
  assert.match(url.searchParams.get("startTime"), /^\d{2}:\d{2}$/);
});

test("le formulaire s ouvre sur le client de la visite", () => {
  const clients = [
    { id: "c1", name: "Jean Muller", firstName: "Jean", lastName: "Muller" },
    { id: "c2", name: "Camille Bernard", firstName: "Camille", lastName: "Bernard" },
  ];
  assert.equal(clientForMaintenanceVisit({ client_id: "c2", title: "Entretien autre" }, clients).id, "c2");
  assert.equal(clientForMaintenanceVisit({ title: "Entretien Monsieur et Madame Muller" }, clients).id, "c1");
  assert.equal(clientForMaintenanceVisit({ title: "Entretien inconnu" }, clients), null);
  const href = maintenanceReportHref({ id: "visit-9", title: "Entretien Jean Muller", client_id: "c1" }, "Yanis");
  const params = new URL(href, "https://crm.example").searchParams;
  assert.equal(params.get("clientId"), "c1");
  assert.equal(params.get("id"), "visit-9");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /studio\.kind==="report"&&String\(studio\.preset\?\.client/);
});

test("l agenda technicien montre le telephone et ouvre l adresse dans Google Maps", () => {
  const [visit] = attachTechnicianReach([
    { id: "v1", client_id: "c1", location: "lieu agenda" },
  ], [{
    id: "c1",
    adresse: "12 rue des Lilas",
    code_postal: "69001",
    ville: "Lyon",
    telephone: "06 12 34 56 78",
    telephone_secondaire: "04 78 00 00 00",
  }]);
  assert.equal(visit.client_phone, "06 12 34 56 78");
  assert.equal(visit.client_phone_alt, "04 78 00 00 00");
  assert.equal(visit.client_address, "12 rue des Lilas, 69001 Lyon");
  assert.equal(visit.maps_url, mapsSearchUrl("12 rue des Lilas, 69001 Lyon"));
  assert.match(visit.maps_url, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  assert.equal(phoneCallHref("06 12 34 56 78"), "tel:0612345678");
  const fallback = attachTechnicianReach([{ id: "v2", location: "8 rue du Port, 44000 Nantes" }], [])[0];
  assert.equal(fallback.client_address, "8 rue du Port, 44000 Nantes");
  assert.match(fallback.maps_url, /44000/);
  const visits = readFileSync(new URL("../app/api/entretien/visits/route.js", import.meta.url), "utf8");
  assert.match(visits, /attachTechnicianReach/);
  assert.match(visits, /listEntretienClientNames/);
});

test("l ecran technicien n expose pas le stock clients", () => {
  const screen = readFileSync(new URL("../app/components/entretien-module.js", import.meta.url), "utf8");
  const start = screen.indexOf("entretien-module entretien-tech");
  const field = screen.slice(start, screen.indexOf("\n  return (", start));
  assert.match(field, /Aujourd’hui/);
  assert.match(field, /TechVisitAction/);
  assert.match(field, /openPrevisit=\{openTechnicalVisit\}/);
  assert.match(screen, /Remplir le formulaire/);
  assert.match(screen, /kind === "visite" && visit\.client_id/);
  assert.match(screen, />Visite technique</);
  assert.match(field, /Jour suivant/);
  assert.match(field, /Jour précédent/);
  assert.match(field, /Semaine précédente/);
  assert.match(field, /entretien-tech-daystrip/);
  assert.match(field, /VisitReach/);
  assert.match(screen, /mapsSearchUrl\(address\)/);
  assert.match(screen, /phoneCallHref\(phone\)/);
  assert.doesNotMatch(field, /Contrats/);
  assert.doesNotMatch(field, /Fait ce jour/);
  assert.doesNotMatch(field, /Pilotage/);
  const visits = readFileSync(new URL("../app/api/entretien/visits/route.js", import.meta.url), "utf8");
  assert.match(visits, /technician_id=eq\./);
  assert.match(visits, /isFieldMaintenanceTechnician/);
  const pilotage = readFileSync(new URL("../app/api/entretien/pilotage/route.js", import.meta.url), "utf8");
  assert.match(pilotage, /isFieldMaintenanceTechnician/);
});
