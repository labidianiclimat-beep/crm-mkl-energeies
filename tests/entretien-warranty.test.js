import test from "node:test";
import assert from "node:assert/strict";
import { callCard } from "../app/lib/entretien-tour.js";
import {
  readMaintenanceStop,
  warrantyDecision,
  warrantyWaiverLetterHtml,
  writeMaintenanceStop,
} from "../app/lib/entretien-warranty.js";

const TODAY = "2026-09-30";

test("la garantie se compte depuis la date d installation", () => {
  const covered = warrantyDecision({ installedOn: "2024-03-12", years: 5, today: TODAY });
  assert.equal(covered.covered, true);
  assert.equal(covered.endsOn, "2029-03-12");
  const ended = warrantyDecision({ installedOn: "2019-01-01", years: 5, today: TODAY });
  assert.equal(ended.covered, false);
  assert.equal(ended.endsOn, "2024-01-01");
  assert.equal(warrantyDecision({ years: 5, today: TODAY }).ready, false);
});

test("un arret sort le client de la liste d appel", () => {
  const notes = writeMaintenanceStop("PAC Atlantic", {
    day: TODAY,
    reason: "refus",
    installedOn: "2024-03-12",
    years: 5,
    covered: true,
  });
  assert.match(notes, /PAC Atlantic/);
  assert.equal(readMaintenanceStop(notes).reason, "refus");
  assert.doesNotMatch(writeMaintenanceStop(`rappel\n[[rappel:2026-11-02]]`, {
    day: TODAY,
    reason: "annule",
    installedOn: "2020-01-01",
    years: 2,
    covered: false,
  }), /rappel:/);
  const card = callCard({ notes, last_confirmed_entretien_on: "2020-01-01" }, TODAY);
  assert.equal(card.callable, false);
  assert.equal(card.tone, "arret");
  assert.equal(card.label, "Ne veut plus d’entretien");
});

test("le courrier renonce a la garantie parce que le materiel n est plus entretenu", () => {
  const html = warrantyWaiverLetterHtml({
    clientName: "Camille Martin",
    clientAddress: "12 rue des Lilas 69001 Lyon",
    installedOn: "2024-03-12",
    endsOn: "2029-03-12",
    years: 5,
    equipment: "Pompe à chaleur Atlantic",
    reason: "annule",
    today: TODAY,
  });
  assert.match(html, /Camille Martin/);
  assert.match(html, /annulé votre contrat d’entretien/);
  assert.match(html, /renonce à la garantie contractuelle/);
  assert.match(html, /n’étant plus entretenu/);
  assert.match(html, /Pompe à chaleur Atlantic/);
  assert.match(html, /12\/03\/2024/);
  assert.match(html, /12\/03\/2029/);
  assert.doesNotMatch(html, /FAC-/);
});
