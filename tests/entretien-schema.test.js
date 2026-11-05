import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyColumnMap,
  applyNatureValidation,
  applyRealization,
  classifyAgendaTitle,
  clientPilotageFlags,
  emptyRealization,
  lastConfirmedEntretienDate,
} from "../app/lib/entretien.js";
import { visitPatchFromReview } from "../app/lib/entretien-store.js";
import { contractPriceForReport, maintenanceReportBoards, placedContractTotals, shiftMonthKey } from "../app/lib/entretien-agenda.js";

const sql = readFileSync(new URL("../supabase/migrations/20260932_entretien.sql", import.meta.url), "utf8");
const form = readFileSync(new URL("../app/maintenance-form/page.js", import.meta.url), "utf8");

test("la migration est additive et ne touche pas aux tables existantes", () => {
  assert.match(sql, /create table if not exists public\.entretien_visits/);
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(sql, /alter table public\.(clients|devis|profiles|google_calendar_accounts|maintenance_contracts|maintenance_reports)/);
  assert.doesNotMatch(sql, /jamais[_ ]effectue|never_done/i);
});

test("les deux validations restent séparées dans le schéma", () => {
  assert.match(sql, /nature_validated/);
  assert.match(sql, /realization_status text not null default 'inconnu'/);
  assert.match(sql, /entretien_visits_realization_confirmed_ck/);
  assert.match(sql, /entretien_visits_realization_unknown_ck/);
  assert.match(sql, /origin <> 'historique' or devis_id is null/);
  assert.match(sql, /entretien_visits_google_event_uidx/);
  assert.match(sql, /alone_is_insufficient/);
  const imperson = readFileSync(new URL("../app/api/entretien/import/route.js", import.meta.url), "utf8");
  assert.match(imperson, /forceUnlock/);
  assert.match(imperson, /DEBLOQUER/);
});

test("classer un entretien ne crée pas une date de réalisation", () => {
  const raw = { title: "Entretien chez Dupont", ...emptyRealization(), natureStatus: "propose", natureProposed: "entretien" };
  const classified = applyNatureValidation(raw, {
    clientId: "client-1",
    natureValidated: "entretien",
    actorId: "user-1",
    at: "2026-09-26T10:00:00.000Z",
  });
  assert.equal(classified.natureValidated, "entretien");
  assert.equal(classified.clientId, "client-1");
  assert.equal(classified.realizationStatus, "inconnu");
  assert.equal(classified.realizationDate, null);
  assert.equal(lastConfirmedEntretienDate([classified]), null);
});

test("une confirmation de réalisation exige une base et un auteur", () => {
  const visit = applyRealization({ ...emptyRealization(), natureValidated: "entretien", natureStatus: "valide" }, {
    status: "confirme",
    date: "2026-03-12",
    basis: "rapport_signe",
    actorId: "tech-1",
    at: "2026-03-12T16:00:00.000Z",
  });
  assert.equal(visit.realizationStatus, "confirme");
  assert.equal(visit.realizationDate, "2026-03-12");
  assert.equal(visit.realizationBasis, "rapport_signe");
  assert.equal(visit.realizationRecordedBy, "tech-1");
  assert.equal(lastConfirmedEntretienDate([visit]), "2026-03-12");
});

test("une revue peut classer et confirmer la date le même geste", () => {
  const patch = visitPatchFromReview({
    natureValidated: "entretien",
    clientId: "c1",
    realizationStatus: "confirme",
    realizationDate: "2024-03-12",
    realizationBasis: "revue_humaine",
    realizationNote: "Date lue sur l’agenda Google, confirmée à la main.",
  }, "u1");
  assert.equal(patch.nature_validated, "entretien");
  assert.equal(patch.client_id, "c1");
  assert.equal(patch.realization_status, "confirme");
  assert.equal(patch.realization_date, "2024-03-12");
  assert.equal(patch.realization_basis, "revue_humaine");
});

test("le classement d’agenda mixte reste ambigu sur un mot faible ou un conflit", () => {
  assert.equal(classifyAgendaTitle("Photovoltaïque Dupont").natureStatus, "ambigu");
  assert.equal(classifyAgendaTitle("Mise en service Martin").natureStatus, "ambigu");
  assert.equal(classifyAgendaTitle("Pose installation PV").natureProposed, null);
  assert.equal(classifyAgendaTitle("Entretien pose PAC Dupont").natureStatus, "ambigu");
  assert.equal(classifyAgendaTitle("Entretien annuel Dupont").natureProposed, "entretien");
  assert.equal(classifyAgendaTitle("Maintenance annuelle Dupont").natureProposed, "entretien");
  assert.equal(classifyAgendaTitle("Contrat de maintenance Martin").natureProposed, "entretien");
  assert.equal(classifyAgendaTitle("Dupont Maintenance").natureProposed, "entretien");
  assert.equal(classifyAgendaTitle("").natureStatus, "ambigu");
});

test("le pilotage sépare retard confirmé, date inconnue et à vérifier", () => {
  const unknown = clientPilotageFlags({ visits: [], invoices: [], today: "2026-09-26" });
  assert.equal(unknown.isLastEntretienUnknown, true);
  assert.equal(unknown.isConfirmedOverdue, false);
  assert.equal(unknown.hasItemsToReview, false);

  const review = clientPilotageFlags({
    visits: [{ natureStatus: "ambigu", clientLinkStatus: "propose", ...emptyRealization() }],
    today: "2026-09-26",
  });
  assert.equal(review.hasItemsToReview, true);
  assert.equal(review.isLastEntretienUnknown, true);

  const overdue = clientPilotageFlags({
    visits: [{
      natureStatus: "valide",
      natureValidated: "entretien",
      realizationStatus: "confirme",
      realizationDate: "2025-01-01",
    }],
    frequency: "Annuelle",
    today: "2026-09-26",
  });
  assert.equal(overdue.isLastEntretienUnknown, false);
  assert.equal(overdue.isConfirmedOverdue, true);
});

test("le mapping d’import est configurable et n’exige pas les en-têtes maintenant", () => {
  const mapped = applyColumnMap(
    { "Nom client": "Dupont", Courriel: "a@b.fr" },
    { nom: "Nom client", email: "Courriel" }
  );
  assert.equal(mapped.nom, "Dupont");
  assert.equal(mapped.email, "a@b.fr");
});

test("la fiche d’entretien actuelle n’est pas remplacée", () => {
  assert.match(form, /Rapport de maintenance/);
  assert.match(form, /Sécurité et état général/);
  assert.match(form, /Signature du technicien/);
  assert.match(form, /mkl-maintenance-reports/);
});

test("l’agenda entretien n’interroge plus Google", () => {
  const calendar = readFileSync(new URL("../app/api/entretien/calendar/route.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const store = readFileSync(new URL("../app/lib/entretien-store.js", import.meta.url), "utf8");
  const list = readFileSync(new URL("../app/lib/supabase-list.js", import.meta.url), "utf8");
  assert.match(store, /listAllRows/);
  assert.match(list, /limit=\$\{pageSize\}&offset=/);
  assert.match(calendar, /googleDisabled: true/);
  assert.match(calendar, /wroteToGoogle: false/);
  assert.doesNotMatch(calendar, /listGoogleCalendars|watchOnly|pullEntretienAccount/);
  const cron = readFileSync(new URL("../app/api/cron/entretien-calendar/route.js", import.meta.url), "utf8");
  assert.match(cron, /googleDisabled: true/);
  assert.match(cron, /wroteToGoogle: false/);
  assert.doesNotMatch(cron, /pullSavedEntretienCalendars|listGoogleEvents/);
  const vercel = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
  assert.doesNotMatch(vercel, /entretien-calendar/);
  const google = readFileSync(new URL("../app/lib/google-calendar.js", import.meta.url), "utf8");
  assert.match(google, /60 \* 86400000/);
  assert.doesNotMatch(calendar, /applyGoogleSync|syncAppointmentToGoogle/);
  assert.match(page, /EntretienModule/);
  assert.match(page, /entretien-keep-alive/);
  assert.match(page, /authFetch\("\/api\/users"\)\.then/);
  const module = readFileSync(new URL("../app/components/entretien-module.js", import.meta.url), "utf8");
  assert.match(module, /Retard confirmé/);
  assert.match(module, /Dernier entretien inconnu/);
  assert.match(module, /À vérifier/);
  assert.match(module, /rendez-vous d’agenda/);
  assert.match(module, /le plus récent déjà passé/);
  assert.match(module, /starClients/);
  assert.match(module, /entretien-stars/);
  assert.match(module, /entretien-stars-bar/);
  assert.match(module, /samples=1/);
  assert.doesNotMatch(module, /visit_samples/);
  assert.match(module, /DATE CONTRAT/);
  assert.match(module, /Hors liste Excel/);
  assert.match(module, /Entretien \/ maintenance/);
  assert.doesNotMatch(module, /jamais effectué/);
  assert.match(module, /lit uniquement la base CRM/);
  assert.doesNotMatch(module, /\/api\/entretien\/calendar/);
  assert.doesNotMatch(module, /\/api\/entretien\/sheet/);
  assert.doesNotMatch(module, /Relire un historique Google/);
  assert.match(module, /Contrats placés/);
  assert.match(module, /Aujourd’hui/);
  assert.match(module, /Cette semaine/);
  assert.match(module, /Ce mois/);
  assert.match(module, /isAdminVip\(currentProfile\?\.role\)/);
  assert.match(module, /Agendas CRM/);
  assert.match(module, /Planifier/);
  assert.match(module, /Nouvelle visite CRM/);
  assert.match(module, /Client en base/);
  assert.match(module, /Créer un contrat d’entretien/);
  const visitsRoute = readFileSync(new URL("../app/api/entretien/visits/route.js", import.meta.url), "utf8");
  assert.match(visitsRoute, /ensureEntretienContractForClient/);
  assert.match(visitsRoute, /createContract/);
  assert.match(visitsRoute, /wroteToGoogle: false/);
  assert.match(visitsRoute, /samples"\) === "1"/);
  assert.match(visitsRoute, /listEntretienVisitSamples/);
  const pilotage = readFileSync(new URL("../app/api/entretien/pilotage/route.js", import.meta.url), "utf8");
  assert.match(pilotage, /rememberOrgPayload/);
  assert.doesNotMatch(pilotage, /visit_samples/);
  const usersPage = page;
  assert.match(usersPage, /Chargement des comptes/);
  assert.match(usersPage, /mkl-users/);
  assert.match(visitsRoute, /buildCrmVisitRecord/);
  assert.doesNotMatch(visitsRoute, /listGoogleEvents|google-calendar/);
  const sheet = readFileSync(new URL("../app/api/entretien/sheet/route.js", import.meta.url), "utf8");
  assert.match(sheet, /googleDisabled: true/);
  assert.doesNotMatch(sheet, /fetchSheetCsv/);
});

test("les totaux de contrats placés suivent le jour, la semaine et le mois", () => {
  const now = new Date("2026-10-04T12:00:00");
  const totals = placedContractTotals([
    { start_on: "2026-10-04", amount: 100 },
    { start_on: "2026-09-30", amount: 40 },
    { startOn: "2026-10-06", amount: "25" },
    { amount: 999 },
    { start_on: "sans-date", amount: 50 },
  ], now);
  assert.equal(totals.day, 100);
  assert.equal(totals.week, 140);
  assert.equal(totals.month, 125);
  assert.equal(totals.dayCount, 1);
  assert.equal(totals.weekCount, 2);
  assert.equal(totals.monthCount, 2);
});

test("les rapports de maintenance reprennent le prix du contrat sur la semaine et le mois", () => {
  const contracts = [
    { number: "ENT-1", client_id: "c1", client_name: "Jean Dupont", amount: 180 },
    { number: "ENT-2", client_id: "c2", client_name: "Marie Martin", amount: 90 },
    { client_id: "c3", client_name: "Paul Durand", amount: 50 },
    { client_id: "c3", client_name: "Paul Durand", amount: 70 },
    { number: "ENT-4", client_name: "Sans prix", amount: null },
  ];
  assert.equal(contractPriceForReport({ contract: "ent-1" }, contracts), 180);
  assert.equal(contractPriceForReport({ clientId: "c2" }, contracts), 90);
  assert.equal(contractPriceForReport({ client: "Paul Durand" }, contracts), null);
  assert.equal(contractPriceForReport({ contract: "ENT-4", client: "Sans prix" }, contracts), null);
  const boards = maintenanceReportBoards([
    { id: "v1", date: "2026-11-02", client: "Jean Dupont", contract: "ENT-1", technician: "Yanis" },
    { id: "v2", date: "2026-11-03", client: "Jean Dupont", contract: "ENT-1", technician: "Yanis" },
    { id: "v3", date: "2026-11-20", client: "Marie Martin", clientId: "c2", technician: "Inès" },
    { id: "v4", date: "2026-10-28", client: "Ancien", contract: "ENT-9" },
    { id: "v5", client: "Sans date", contract: "ENT-1" },
  ], contracts, { weekStart: "2026-11-02", month: "2026-11" });
  assert.equal(boards.week.rows.length, 2);
  assert.equal(boards.week.total, 180);
  assert.equal(boards.month.rows.length, 3);
  assert.equal(boards.month.total, 270);
  assert.equal(boards.month.rows[0].amount, 90);
  assert.equal(shiftMonthKey("2026-11", -1), "2026-10");
  assert.equal(shiftMonthKey("2026-01", -1), "2025-12");
  const screen = readFileSync(new URL("../app/components/entretien-module.js", import.meta.url), "utf8");
  assert.match(screen, /Rapports de la semaine/);
  assert.match(screen, /Rapports du mois/);
  assert.match(screen, /PRIX DU CONTRAT/);
  const tech = screen.slice(screen.indexOf("entretien-module entretien-tech"), screen.indexOf("\n  return (", screen.indexOf("entretien-module entretien-tech")));
  assert.doesNotMatch(tech, /Rapports de la semaine/);
});
