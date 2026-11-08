import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  agendaEventColor,
  dueReminders,
  dedupeGoogleAgendaItems,
  eventTimeLayout,
  packAgendaColumns,
  findOverlaps,
  combineDateAndTime,
  formatAgendaRange,
  formatAgendaTime,
  parisDateTimeParts,
  googleEventPayload,
  googleEventToRecord,
  groupUpcomingAgenda,
  isOverdue,
  isAuxiliaryGoogleCalendar,
  googleCalendarsToImport,
  googleAgendaChoices,
  googleCalendarColor,
  isGoogleAgendaCalendarShown,
  findStoredGoogleEvent,
  extraGoogleCopies,
  googlePrimaryAliases,
  mergeAgendaLayout,
  readAgendaLayout,
  minutesFromCanvasPoint,
  nearestAgendaDuration,
  nextAvailableSlots,
  normalizeActionKind,
  slotCreateDefaults,
  slotDraftLayout,
  APPOINTMENT_MOVE_ERROR,
  agendaScheduleIsChanging,
  appointmentPhoneError,
  canCorrectAppointmentPhone,
  canReassignAgendaAppointment,
  canViewAppointmentHistory,
  agendaKindLabel,
  allowsStackedAgendaSlots,
  canWriteAgendaComment,
  isAgendaAssignOrCommentPatch,
  isAgendaPhonePatch,
  presentAppointmentHistoryEntry,
  validateNextAction,
} from "../app/lib/agenda.js";
import { formToAppointmentRecord, appointmentToUi, validateAppointmentPayload } from "../app/lib/prospects.js";
import { isCommercialRdvRow } from "../app/lib/commercial-rdv-table.js";

test("une formation se pose sans prospect et reste hors du suivi", () => {
  const record = formToAppointmentRecord({
    kind: "formation",
    title: "Formation produits",
    start: "2026-10-20T09:00:00.000Z",
  }, {});
  assert.equal(record.extra.kind, "formation");
  assert.equal(record.prospect_name, "Formation produits");
  assert.equal(record.opportunity_id, null);
  assert.equal(validateAppointmentPayload(record).length, 0);
  const ui = appointmentToUi({ ...record, id: "f1" });
  assert.equal(ui.kind, "formation");
  assert.equal(isCommercialRdvRow(ui), false);
  assert.equal(validateAppointmentPayload(formToAppointmentRecord({ kind: "autre", start: "2026-10-20T09:00:00.000Z" }, {})).some(item => /intitulé/i.test(item)), true);
});

test("le responsable commercial empile ses propres créneaux avant de les répartir", () => {
  const lead = { role: "Responsable commercial" };
  const seller = { role: "Commercial" };
  assert.equal(allowsStackedAgendaSlots(lead, "lead", "lead"), true);
  assert.equal(allowsStackedAgendaSlots(lead, "lead", "seller"), false);
  assert.equal(allowsStackedAgendaSlots(seller, "seller", "seller"), false);
  assert.equal(allowsStackedAgendaSlots({ role: "Responsable prospection" }, "disp", "disp"), false);
  assert.equal(allowsStackedAgendaSlots({ role: "Responsable prospection" }, "disp", "lead", "Responsable commercial"), true);
  assert.equal(allowsStackedAgendaSlots({ role: "Responsable prospection" }, "disp", "seller", "Commercial"), false);
});

test("une creation de prospect exige une prochaine action", () => {
  const errors = validateNextAction({});
  assert.ok(errors.some(item => /prochaine action/i.test(item)));
  assert.equal(validateNextAction({ kind: "rappel", start: "2026-09-20T09:00:00.000Z" }).length, 0);
});

test("un rappel et un rendez-vous ont des couleurs distinctes", () => {
  const visit = formToAppointmentRecord({ prospectName: "A", start: "2026-09-20T09:00:00.000Z", kind: "rendez-vous" }, {});
  const reminder = formToAppointmentRecord({ prospectName: "A", start: "2026-09-20T10:00:00.000Z", kind: "rappel" }, {});
  assert.equal(appointmentToUi({ ...visit, starts_at: visit.starts_at, extra: visit.extra }).kind, "rendez-vous");
  assert.equal(appointmentToUi({ ...reminder, starts_at: reminder.starts_at, extra: reminder.extra }).kind, "rappel");
  assert.equal(normalizeActionKind("rappel téléphonique"), "rappel");
  assert.equal(normalizeActionKind("formation"), "formation");
  assert.equal(agendaKindLabel("accompagnement"), "Accompagnement");
  assert.notEqual(agendaEventColor({ kind: "formation" }), agendaEventColor({ kind: "rendez-vous" }));
  assert.notEqual(agendaEventColor({ kind: "rendez-vous" }), agendaEventColor({ kind: "rappel" }));
  assert.notEqual(agendaEventColor({ kind: "rendez-vous" }), agendaEventColor({ source: "google" }));
  assert.notEqual(agendaEventColor({ source: "google" }), agendaEventColor({ kind: "busy", private: true }));
});

test("un chevauchement horaire est detecte", () => {
  const existing = [{ id: "1", commercialId: "c1", start: "2026-09-20T09:00:00.000Z", duration: 60, status: "Planifié" }];
  const overlaps = findOverlaps(existing, { commercialId: "c1", start: "2026-09-20T09:30:00.000Z", duration: 30 });
  assert.equal(overlaps.length, 1);
  assert.equal(findOverlaps(existing, { commercialId: "c1", start: "2026-09-20T11:00:00.000Z", duration: 30 }).length, 0);
});

test("un rappel en retard reste visible", () => {
  const past = { start: "2020-01-01T09:00:00.000Z", duration: 30, status: "Planifié", kind: "rappel" };
  assert.equal(isOverdue(past, Date.now()), true);
  const groups = groupUpcomingAgenda([past], new Date());
  assert.equal(groups.overdue.length, 1);
});

test("une heure saisie sur le prospect reste la meme sur l agenda", () => {
  const summer = combineDateAndTime("2026-10-02", "15:00");
  const winter = combineDateAndTime("2026-01-15", "15:00");
  assert.equal(summer, "2026-10-02T13:00:00.000Z");
  assert.equal(winter, "2026-01-15T14:00:00.000Z");
  assert.equal(formatAgendaTime(summer), "15:00");
  assert.equal(formatAgendaTime(winter), "15:00");
  assert.deepEqual(parisDateTimeParts(summer), { date: "2026-10-02", time: "15:00" });
  assert.equal(combineDateAndTime("2026-10-02T15:00:00.000Z"), "2026-10-02T15:00:00.000Z");
});

test("google ne recoit que les infos utiles du rdv", () => {
  const payload = googleEventPayload({
    kind: "rendez-vous",
    prospectName: "Marie Laurent",
    subject: "Visite PAC",
    phone: "0612345678",
    commercial: "Karim",
    address: "Nantes",
    start: "2026-09-20T09:00:00.000Z",
    duration: 60,
    prospectId: "11111111-1111-4111-8111-111111111111",
  }, { crmUrl: "https://crm.example" });
  assert.match(payload.summary, /Marie Laurent/);
  assert.match(payload.description, /0612345678/);
  assert.ok(!/mot de passe/i.test(payload.description));
  assert.equal(payload.start.timeZone, "Europe/Paris");
});

test("les creneaux proposes evitent les conflits", () => {
  const slots = nextAvailableSlots([], { commercialId: "c1", duration: 60, from: new Date("2026-09-21T07:00:00"), count: 2 });
  assert.ok(slots.length >= 2);
});

test("un commercial ne peut pas attribuer via l api sans droit", () => {
  const source = readFileSync(new URL("../app/api/appointments/route.js", import.meta.url), "utf8");
  const sync = readFileSync(new URL("../app/api/google/calendar/sync/route.js", import.meta.url), "utf8");
  assert.match(source, /Vous ne pouvez pas attribuer cet événement à un autre commercial/);
  assert.match(sync, /listGoogleEvents/);
  assert.match(sync, /listGoogleEventsOnCalendars/);
  assert.match(sync, /googleEventToRecord/);
  const form = readFileSync(new URL("../app/components/prospect-next-action.js", import.meta.url), "utf8");
  assert.match(form, /PROCHAINE ACTION/);
  const popup = readFileSync(new URL("../app/components/agenda-home.js", import.meta.url), "utf8");
  assert.doesNotMatch(popup, /AgendaWelcomePopup/);
  assert.doesNotMatch(popup, /mkl-agenda-welcome-shown/);
  const welcome = readFileSync(new URL("../app/components/ticket-term-welcome.js", import.meta.url), "utf8");
  const home = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(welcome, /Tickets à terme/);
  assert.match(welcome, /mkl-ticket-term-shown/);
  assert.match(home, /TicketTermWelcome/);
  assert.doesNotMatch(home, /AgendaWelcomePopup/);
  const gate = readFileSync(new URL("../app/components/crm-access-gate.js", import.meta.url), "utf8");
  assert.match(gate, /mkl-agenda-welcome-shown/);
  assert.match(gate, /mkl-ticket-term-shown/);
});

test("un rappel deja notifie n est pas renvoye", () => {
  const start = new Date(Date.now() + 20 * 60000).toISOString();
  const due = dueReminders([{ start, status: "Planifié", reminderOffsets: [30], notifyCrm: true, notifiedAt: {} }]);
  assert.equal(due.length, 1);
  const again = dueReminders([{ start, status: "Planifié", reminderOffsets: [30], notifyCrm: true, notifiedAt: { 30: start } }]);
  assert.equal(again.length, 0);
});

test("un evenement google personnel garde son titre et son detail", () => {
  const record = googleEventToRecord({
    id: "evt-google-1",
    summary: "Visite PAC Dupont",
    description: "Rappel chantier",
    location: "Mulhouse",
    start: { dateTime: "2026-09-20T09:00:00+02:00" },
    end: { dateTime: "2026-09-20T10:30:00+02:00" },
  }, { organizationId: "org-1", commercialId: "user-1", calendarId: "primary" });
  assert.equal(record.prospect_name, "Visite PAC Dupont");
  assert.equal(record.duration_minutes, 90);
  assert.equal(record.extra.source, "google");
  assert.equal(record.extra.googleEventId, "evt-google-1");
  assert.equal(record.extra.private, false);
  assert.equal(record.extra.address, "Mulhouse");
  assert.equal(record.notes, "Rappel chantier");
  const ui = appointmentToUi({ ...record, id: "apt-1" });
  assert.equal(ui.googleEventId, "evt-google-1");
  assert.equal(ui.prospectName, "Visite PAC Dupont");
  assert.equal(ui.address, "Mulhouse");
  assert.equal(ui.notes, "Rappel chantier");
  assert.equal(ui.source, "google");
  assert.equal(googleEventToRecord({ id: "x", status: "cancelled", start: { dateTime: "2026-09-20T09:00:00Z" } }), null);
  assert.equal(googleEventToRecord({
    id: "free",
    summary: "Indisponible affichée",
    transparency: "transparent",
    start: { dateTime: "2026-09-20T09:00:00Z" },
  }), null);
  const agendaUi = readFileSync(new URL("../app/components/commercial-agenda.js", import.meta.url), "utf8");
  assert.match(agendaUi, /Google Calendar/);
  assert.doesNotMatch(agendaUi, /sans détail/);
  const sync = readFileSync(new URL("../app/api/google/calendar/sync/route.js", import.meta.url), "utf8");
  assert.match(sync, /existing\?\.source === "google"/);
});

test("un rdv google de 10h a 12h reste un seul bloc de deux heures", () => {
  const record = googleEventToRecord({
    id: "evt-2h",
    summary: "Visite PAC",
    start: { dateTime: "2026-09-20T10:00:00+02:00" },
    end: { dateTime: "2026-09-20T12:00:00+02:00" },
  }, { organizationId: "org-1", commercialId: "user-1" });
  assert.equal(record.duration_minutes, 120);
  const layout = eventTimeLayout({ start: record.starts_at, duration: record.duration_minutes });
  assert.ok(layout.heightPercent > 14 && layout.heightPercent < 17);
  assert.equal(dedupeGoogleAgendaItems([
    { id: "a", googleEventId: "evt-2h", start: record.starts_at, duration: 120 },
    { id: "b", googleEventId: "evt-2h", start: record.starts_at, duration: 60 },
  ]).length, 1);
  const range = formatAgendaRange({ start: record.starts_at, duration: 120 });
  assert.match(range, /10:00/);
  assert.match(range, /12:00/);
});

test("un commercial ne peut pas modifier un rendez-vous existant", () => {
  const patch = readFileSync(new URL("../app/api/appointments/[id]/route.js", import.meta.url), "utf8");
  assert.match(patch, /canEditExistingAppointment/);
  assert.match(patch, /ne peut pas être modifié/);
  const agenda = readFileSync(new URL("../app/components/commercial-agenda.js", import.meta.url), "utf8");
  assert.match(agenda, /canEdit/);
  assert.match(agenda, /Dupliquer/);
  assert.match(agenda, /Nouveau RDV ou rappel/);
  assert.match(agenda, /appointmentDuplicateDefaults/);
  assert.doesNotMatch(agenda, /draggable=\{!hiddenBusy/);
  const welcome = readFileSync(new URL("../app/components/agenda-home.js", import.meta.url), "utf8");
  assert.match(welcome, /canEdit = true/);
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /canEditExistingAppointment/);
  assert.match(page, /L’export de la liste clients n’est pas autorisé/);
  const gate = readFileSync(new URL("../app/components/crm-access-gate.js", import.meta.url), "utf8");
  assert.match(gate, /CaptureGuard/);
  assert.match(gate, /locksFieldSalesData/);
  const guard = readFileSync(new URL("../app/components/capture-guard.js", import.meta.url), "utf8");
  assert.match(guard, /PrintScreen/);
  assert.match(guard, /beforeprint/);
  const sync = readFileSync(new URL("../app/api/google/calendar/sync/route.js", import.meta.url), "utf8");
  assert.match(sync, /ne peut pas être déplacé/);
  assert.doesNotMatch(sync, /canEditExistingAppointment/);
});

test("réattribution, numéro, déplacement, duplication et historique des rendez-vous", () => {
  const past = { id: "rdv-1", commercialId: "seller", commercial_id: "seller", starts_at: "2020-01-15T09:00:00.000Z", duration_minutes: 60 };
  assert.equal(canReassignAgendaAppointment({ role: "Responsable commercial" }, past), true);
  assert.equal(canReassignAgendaAppointment({ role: "Commercial" }, past), false);
  assert.equal(canReassignAgendaAppointment({ role: "Responsable prospection" }, past), true);
  assert.equal(canReassignAgendaAppointment({ role: "Admin VIP" }, past), true);
  assert.equal(canCorrectAppointmentPhone({ role: "Commercial" }, "seller", past), true);
  assert.equal(canCorrectAppointmentPhone({ role: "Commercial" }, "other", past), false);
  assert.equal(canCorrectAppointmentPhone({ role: "Responsable commercial" }, "lead", past), false);
  assert.equal(isAgendaPhonePatch({ phone: "06 12 34 56 78" }), true);
  assert.equal(isAgendaPhonePatch({ phone: "06 12 34 56 78", start: "2026-10-12T10:00:00.000Z" }), false);
  assert.equal(appointmentPhoneError("06 12 34 56 78"), "");
  assert.match(appointmentPhoneError("abc"), /invalide/);
  assert.equal(agendaScheduleIsChanging(past, { phone: "06 12 34 56 78" }), false);
  assert.equal(agendaScheduleIsChanging(past, { commercialId: "other" }), false);
  assert.equal(agendaScheduleIsChanging(past, { start: "2026-11-02T14:30:00.000Z" }), true);
  assert.equal(agendaScheduleIsChanging(past, { appointmentDate: "2026-11-02", appointmentStart: "14:30" }), true);
  assert.equal(agendaScheduleIsChanging(past, { duration: 90 }), true);
  assert.equal(agendaScheduleIsChanging(past, { start: past.starts_at }), false);
  assert.equal(APPOINTMENT_MOVE_ERROR.includes("ne peut pas être déplacé"), true);
  assert.equal(canViewAppointmentHistory({ role: "Commercial" }), false);
  assert.equal(canViewAppointmentHistory({ role: "Responsable commercial" }), false);
  assert.equal(canViewAppointmentHistory({ role: "Superadmin" }), true);
  assert.equal(canViewAppointmentHistory({ role: "Admin VIP" }), true);
  const entry = presentAppointmentHistoryEntry({
    id: "h1",
    created_at: "2026-10-12T08:00:00.000Z",
    user_name: "Martin Camille",
    action: "phone",
    field: "phone",
    old_value: "06 00 00 00 00",
    new_value: "06 12 34 56 78",
  });
  assert.equal(entry.actionLabel, "Correction du numéro");
  assert.equal(entry.fieldLabel, "Téléphone");
  assert.equal(entry.oldValue, "06 00 00 00 00");
  assert.equal(entry.newValue, "06 12 34 56 78");
  assert.equal(entry.userName, "Martin Camille");
  const copy = presentAppointmentHistoryEntry({
    id: "h2",
    action: "duplicate",
    field: "duplicate",
    old_value: null,
    new_value: { sourceAppointmentId: "origin", appointmentId: "copy" },
    user_name: "Admin",
    created_at: "2026-10-12T09:00:00.000Z",
  });
  assert.equal(copy.action, "duplicate");
  assert.equal(copy.newValue.sourceAppointmentId, "origin");
  assert.equal(copy.newValue.appointmentId, "copy");
  const agenda = readFileSync(new URL("../app/components/commercial-agenda.js", import.meta.url), "utf8");
  const home = readFileSync(new URL("../app/components/agenda-home.js", import.meta.url), "utf8");
  const patch = readFileSync(new URL("../app/api/appointments/[id]/route.js", import.meta.url), "utf8");
  const create = readFileSync(new URL("../app/api/appointments/route.js", import.meta.url), "utf8");
  const history = readFileSync(new URL("../app/api/appointments/[id]/history/route.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(agenda, /Dupliquer le rendez-vous/);
  assert.match(agenda, /duplicatedFromId/);
  assert.match(agenda, /Corriger le numéro/);
  assert.match(agenda, /canViewAppointmentHistory/);
  assert.doesNotMatch(agenda, /Reporter/);
  assert.doesNotMatch(agenda, /draggable=/);
  assert.doesNotMatch(home, /Reporter/);
  assert.match(patch, /APPOINTMENT_MOVE_ERROR/);
  assert.match(patch, /canCorrectAppointmentPhone/);
  assert.match(patch, /canReassignAgendaAppointment\(auth\.profile, existing\)/);
  assert.match(patch, /action: "phone"/);
  assert.match(patch, /action: historyActionFor/);
  assert.match(create, /duplicatedFromId/);
  assert.match(create, /sourceAppointmentId/);
  assert.match(create, /googleEventId: ""/);
  assert.match(history, /canViewAppointmentHistory/);
  assert.match(history, /réservé à l’admin VIP et au superadmin/);
  assert.match(page, /agendaScheduleIsChanging/);
  assert.match(page, /isAgendaPhonePatch/);
});

test("le responsable attribue un rdv et chacun peut commenter le sien", () => {
  assert.equal(isAgendaAssignOrCommentPatch({ commercialId: "v1", notes: "Apporter le devis" }), true);
  assert.equal(isAgendaAssignOrCommentPatch({ notes: "Rappeler avant" }), true);
  assert.equal(isAgendaAssignOrCommentPatch({ start: "2026-10-05T09:00:00" }), false);
  assert.equal(canWriteAgendaComment({ role: "Responsable commercial" }, "lead", { commercialId: "seller" }), true);
  assert.equal(canWriteAgendaComment({ role: "Commercial" }, "seller", { commercialId: "seller" }), true);
  assert.equal(canWriteAgendaComment({ role: "Commercial" }, "seller", { commercialId: "other" }), false);
  const agenda = readFileSync(new URL("../app/components/commercial-agenda.js", import.meta.url), "utf8");
  assert.match(agenda, /Commentaire/);
  assert.match(agenda, /Vendeur/);
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /isAgendaAssignOrCommentPatch\(changes\)/);
  const patch = readFileSync(new URL("../app/api/appointments/[id]/route.js", import.meta.url), "utf8");
  assert.match(patch, /isAgendaAssignOrCommentPatch\(body\)/);
  assert.match(patch, /ne peut pas être modifié/);
});

test("la synchro google lit tous les agendas du compte", () => {
  assert.equal(isAuxiliaryGoogleCalendar({ id: "fr.french#holiday@group.v.calendar.google.com", summary: "Jours fériés" }), true);
  assert.equal(isAuxiliaryGoogleCalendar({ id: "primary", summary: "Climholia" }), false);
  assert.equal(isAuxiliaryGoogleCalendar({ id: "equipe@group.calendar.google.com", summary: "Équipe MKL" }), false);
  const sync = readFileSync(new URL("../app/api/google/calendar/sync/route.js", import.meta.url), "utf8");
  assert.match(sync, /listGoogleEventsOnCalendars/);
  const settings = readFileSync(new URL("../app/components/google-calendar-settings.js", import.meta.url), "utf8");
  assert.match(settings, /Synchroniser les agendas cochés dans Google/);
  assert.doesNotMatch(settings, /calendarIds/);
  assert.doesNotMatch(settings, /Calendrier utilisé/);
  const agenda = readFileSync(new URL("../app/components/commercial-agenda.js", import.meta.url), "utf8");
  assert.match(agenda, /Agendas Google/);
  assert.match(agenda, /googleAgendaChoices/);
  assert.match(agenda, /type="color"/);
  assert.match(agenda, /agenda-event-title/);
  assert.doesNotMatch(agenda, /<b>\{hiddenBusy/);
  assert.equal(googleCalendarColor("equipe", { equipe: "#33b679" }), "#33b679");
  assert.equal(googleCalendarColor("equipe", {}, "#7986cb"), "#7986cb");
  assert.match(googleCalendarColor("chantier"), /^#[0-9a-f]{6}$/);
});

test("les agendas coches dans google se masquent dans le menu", () => {
  const calendars = [
    { id: "clim@gmail.com", summary: "Climholia", primary: true, selected: true },
    { id: "equipe@group.calendar.google.com", summary: "Équipe", primary: false, selected: true },
    { id: "fr.french#holiday@group.v.calendar.google.com", summary: "Jours fériés", primary: false, selected: false },
    { id: "22474a81d3eb695cf6dd7481f2a665@group.calendar.google.com", summary: "Entretien", onSidebar: true },
  ];
  assert.deepEqual(googleCalendarsToImport(calendars).map(item => item.id), [
    "clim@gmail.com",
    "equipe@group.calendar.google.com",
    "22474a81d3eb695cf6dd7481f2a665@group.calendar.google.com",
  ]);
  const menu = googleAgendaChoices(calendars, [
    { source: "google", googleCalendarId: "chantier@group.calendar.google.com", googleCalendarSummary: "Chantier" },
    { source: "google", googleCalendarId: "22474a81d3eb695cf6dd7481f2a665@group.calendar.google.com", googleCalendarSummary: "22474a81d3eb695cf6dd7481f2a665@group.calendar.google.com" },
  ]);
  assert.deepEqual(menu.map(item => item.summary), ["Climholia", "Chantier", "Entretien", "Équipe"]);
  assert.equal(menu.some(item => /22474a81/.test(item.summary)), false);
  const named = googleAgendaChoices([
    { id: "clim@gmail.com", summary: "clim@gmail.com", primary: true, selected: true },
    { id: "22474a81d3eb695cf6dd7481f2a665@group.calendar.google.com", summary: "Planning", selected: true },
  ], [
    { source: "google", googleCalendarId: "clim@gmail.com", googleCalendarSummary: "" },
  ]);
  assert.deepEqual(named.map(item => item.summary), ["clim@gmail.com", "Planning"]);
  const crm = { source: "", googleCalendarId: "clim@gmail.com" };
  const principal = { source: "google", googleCalendarId: "primary" };
  const equipe = { source: "google", googleCalendarId: "equipe@group.calendar.google.com" };
  const hidden = { "clim@gmail.com": true, primary: true };
  assert.equal(isGoogleAgendaCalendarShown(crm, hidden, menu), true);
  assert.equal(isGoogleAgendaCalendarShown(principal, hidden, menu), false);
  assert.equal(isGoogleAgendaCalendarShown(equipe, hidden, menu), true);
  const colleague = { source: "google", commercialId: "vendeur", googleCalendarId: "primary", googleCalendarSummary: "Vendeur" };
  assert.equal(isGoogleAgendaCalendarShown(colleague, hidden, menu, "responsable"), true);
  const ownMenu = googleAgendaChoices(calendars, [colleague], "responsable");
  assert.equal(ownMenu.some(item => item.summary === "Vendeur"), false);
});

test("deux rendez-vous a la meme heure se placent cote a cote", () => {
  const start = "2026-10-06T08:00:00.000Z";
  const packed = packAgendaColumns([
    { id: "a", start, duration: 60 },
    { id: "b", start, duration: 60 },
    { id: "c", start: "2026-10-06T12:00:00.000Z", duration: 60 },
  ]);
  assert.equal(packed.get("a").columns, 2);
  assert.equal(packed.get("b").columns, 2);
  assert.notEqual(packed.get("a").column, packed.get("b").column);
  assert.equal(packed.get("c").columns, 1);
  assert.equal(packed.get("c").column, 0);
});

test("l agenda principal google n est pas importe deux fois", () => {
  const aliases = googlePrimaryAliases({
    primaryId: "clim@gmail.com",
    accountCalendarId: "primary",
  });
  const rows = [
    { id: "11111111-1111-4111-8111-111111111111", source: "google", googleEventId: "evt-1", googleCalendarId: "primary" },
    { id: "22222222-2222-4222-8222-222222222222", source: "google", googleEventId: "evt-1", googleCalendarId: "clim@gmail.com" },
    { id: "33333333-3333-4333-8333-333333333333", source: "google", googleEventId: "evt-2", googleCalendarId: "equipe@group.calendar.google.com" },
  ];
  const kept = findStoredGoogleEvent(rows, "evt-1", "clim@gmail.com", aliases);
  assert.equal(kept.id, "11111111-1111-4111-8111-111111111111");
  const extras = extraGoogleCopies(rows, "evt-1", "clim@gmail.com", aliases, kept.id);
  assert.deepEqual(extras.map(item => item.id), ["22222222-2222-4222-8222-222222222222"]);
  assert.equal(findStoredGoogleEvent(rows, "evt-2", "clim@gmail.com", aliases), null);
  assert.equal(findStoredGoogleEvent(rows, "evt-2", "equipe@group.calendar.google.com", aliases).id, "33333333-3333-4333-8333-333333333333");
  const crm = { id: "44444444-4444-4444-8444-444444444444", source: "", googleEventId: "evt-1", googleCalendarId: "primary" };
  assert.equal(findStoredGoogleEvent([crm], "evt-1", "clim@gmail.com", aliases).id, crm.id);
  assert.deepEqual(extraGoogleCopies([crm], "evt-1", "clim@gmail.com", aliases, ""), []);
  const sync = readFileSync(new URL("../app/api/google/calendar/sync/route.js", import.meta.url), "utf8");
  assert.match(sync, /findStoredGoogleEvent/);
  assert.match(sync, /extraGoogleCopies/);
});

test("un clic sur la grille ouvre un creneau a cette heure", () => {
  assert.equal(minutesFromCanvasPoint(100, { top: 100, height: 676 }), 7 * 60);
  assert.equal(minutesFromCanvasPoint(100 + 52, { top: 100, height: 676 }), 8 * 60);
  assert.equal(nearestAgendaDuration(45), 30);
  assert.equal(nearestAgendaDuration(70), 60);
  assert.equal(nearestAgendaDuration(200), 180);
  const created = slotCreateDefaults(new Date(2026, 8, 25), 9 * 60, 11 * 60);
  assert.equal(created.appointmentDate, "2026-09-25");
  assert.equal(created.appointmentStart, "09:00");
  assert.equal(created.duration, "120");
  const draft = slotDraftLayout(9 * 60, 10 * 60);
  assert.ok(draft.heightPercent > 6 && draft.heightPercent < 9);
  const agenda = readFileSync(new URL("../app/components/commercial-agenda.js", import.meta.url), "utf8");
  assert.match(agenda, /google-agenda-bar/);
  assert.match(agenda, /beginSlot/);
  assert.match(agenda, /agenda-popover/);
  assert.match(agenda, /agenda-slot-draft/);
  assert.match(agenda, /Plus d’options/);
  assert.match(agenda, /Rendez-vous/);
});

test("l agenda retrouve la derniere configuration", () => {
  const saved = {
    hidden: { u1: true },
    colors: { u1: "#112233" },
    view: "day",
    anchor: "2026-10-12T10:00:00.000Z",
    filters: { commercialId: "u2", kind: "rappel", status: "Non statué" },
  };
  const layout = readAgendaLayout(saved);
  assert.equal(layout.view, "day");
  assert.equal(layout.anchor, "2026-10-12T10:00:00.000Z");
  assert.equal(layout.hidden.u1, true);
  assert.equal(layout.colors.u1, "#112233");
  assert.equal(layout.filters.kind, "rappel");
  assert.equal(layout.filters.status, "Non statué");
  const merged = mergeAgendaLayout(saved, { view: "month" });
  assert.equal(merged.view, "month");
  assert.equal(merged.hidden.u1, true);
  assert.equal(merged.anchor, saved.anchor);
  assert.equal(merged.filters.commercialId, "u2");
  const broken = readAgendaLayout({ view: "nope", anchor: "pas une date" });
  assert.equal(broken.view, "week");
  assert.equal(broken.anchor, "");
  const agenda = readFileSync(new URL("../app/components/commercial-agenda.js", import.meta.url), "utf8");
  assert.match(agenda, /readAgendaLayout/);
  assert.match(agenda, /chooseView\("day"\)/);
  assert.match(agenda, /initialView !== "table"/);
  assert.match(agenda, /writeStoredLayout\(\{ anchor:/);
});

test("le cron de rappels exige un secret", () => {
  const source = readFileSync(new URL("../app/api/cron/agenda-reminders/route.js", import.meta.url), "utf8");
  assert.match(source, /cronAuthorized\(request\)/);
  assert.doesNotMatch(source, /searchParams\.get\(["']secret/);
  const bell = readFileSync(new URL("../app/components/notification-bell.js", import.meta.url), "utf8");
  assert.match(bell, /\/api\/notifications/);
});
