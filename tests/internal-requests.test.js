import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assignmentNotificationKey,
  availableRequestActions,
  decideRequestAction,
  formatRequestNumber,
  isRequestOverdue,
  isArchivedRequest,
  isHandledTicket,
  isTicketAtTerm,
  requestStatusesForList,
  ticketsAtTerm,
  openedNotificationKey,
  overdueNotificationKey,
  requestStatusMeta,
  shouldNoteOverdue,
  requestConcernsUser,
  shouldRecordFirstOpen,
  ticketPersonName,
  validateCreateInput,
} from "../app/lib/internal-requests.js";
import { grantedModules } from "../app/lib/roles.js";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const REQUESTER = "00000000-0000-4000-8000-000000000001";
const ASSIGNEE = "00000000-0000-4000-8000-000000000002";
const OTHER = "00000000-0000-4000-8000-000000000003";

function row(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    number: 12,
    status: "opened",
    requester_id: REQUESTER,
    assignee_id: ASSIGNEE,
    due_at: "2026-10-10T16:00:00.000Z",
    opened_at: null,
    overdue_noted_at: null,
    ...overrides,
  };
}

test("le numéro de demande suit MKL-DM-", () => {
  assert.equal(formatRequestNumber(1), "MKL-DM-00001");
  assert.equal(formatRequestNumber(12), "MKL-DM-00012");
  assert.equal(formatRequestNumber(0), "");
});

test("une demande se crée avec objet, description, responsable et échéance", () => {
  const missing = validateCreateInput({ title: "Prévisite" });
  assert.equal(missing.ok, false);
  assert.match(validateCreateInput({
    subject: "Autre",
    description: "À préciser.",
    assigneeIds: [ASSIGNEE],
    dueAt: "2026-10-06T15:00:00.000Z",
  }).error, /Précisez/);
  const created = validateCreateInput({
    subject: "Visite technique à programmer",
    description: "Le client veut un rendez-vous cette semaine.",
    assigneeIds: [ASSIGNEE, OTHER],
    dueAt: "2026-10-06T15:00:00.000Z",
  });
  assert.equal(created.ok, true);
  assert.deepEqual(created.value.assigneeIds, [ASSIGNEE, OTHER]);
  assert.equal(created.value.title, "Visite technique à programmer");
  const custom = validateCreateInput({
    subject: "Autre",
    otherTitle: "Relance assurance",
    description: "Le dossier est incomplet.",
    assigneeId: ASSIGNEE,
    dueAt: "2026-10-06T15:00:00.000Z",
  });
  assert.equal(custom.value.title, "Relance assurance");
  assert.equal(ticketPersonName("Camille Martin"), "Martin Camille");
});

test("la première ouverture n est enregistrée que sur la fiche du responsable", () => {
  const sent = row({ status: "sent", opened_at: null });
  assert.equal(shouldRecordFirstOpen(sent, ASSIGNEE), true);
  assert.equal(shouldRecordFirstOpen(sent, REQUESTER), false);
  assert.equal(shouldRecordFirstOpen({ ...sent, opened_at: "2026-10-03T09:00:00.000Z" }, ASSIGNEE), false);
  assert.equal(shouldRecordFirstOpen(row({ status: "opened" }), ASSIGNEE), false);
  const server = readFileSync(new URL("../app/lib/internal-requests-server.js", import.meta.url), "utf8");
  const listFn = server.slice(server.indexOf("export async function listInternalRequests"), server.indexOf("async function assertAssignee"));
  const detailFn = server.slice(server.indexOf("export async function getInternalRequest"), server.indexOf("export async function actOnInternalRequest"));
  assert.doesNotMatch(listFn, /shouldRecordFirstOpen/);
  assert.match(detailFn, /shouldRecordFirstOpen/);
});

test("seul le responsable prend en charge et fait avancer le traitement", () => {
  const opened = row();
  const taken = decideRequestAction(opened, "accept", { userId: ASSIGNEE, now: NOW });
  assert.equal(taken.ok, true);
  assert.equal(taken.patch.status, "accepted");
  assert.equal(taken.notifications[0].key, `request:${opened.id}:accepted:20261003120000`);
  assert.equal(decideRequestAction(opened, "accept", { userId: REQUESTER, now: NOW }).ok, false);
  assert.equal(decideRequestAction(opened, "accept", { userId: OTHER, canManage: true, now: NOW }).ok, false);
  assert.equal(decideRequestAction(row({ status: "sent" }), "accept", { userId: ASSIGNEE, now: NOW }).ok, false);
  assert.equal(decideRequestAction(row({ status: "sent" }), "start", { userId: ASSIGNEE, now: NOW }).ok, false);
});

test("l attente, le blocage, l annulation et la réouverture exigent un motif", () => {
  const current = row({ status: "in_progress" });
  assert.match(decideRequestAction(current, "wait", { userId: ASSIGNEE, input: { waitFor: "le client" }, now: NOW }).error, /motif/);
  assert.match(decideRequestAction(current, "block", { userId: ASSIGNEE, input: {}, now: NOW }).error, /motif/);
  assert.match(decideRequestAction(current, "cancel", { userId: REQUESTER, input: {}, now: NOW }).error, /motif/);
  const waiting = decideRequestAction(current, "wait", {
    userId: ASSIGNEE,
    input: { reason: "Devis en relecture", waitFor: "la direction", waitUntil: "2026-10-08" },
    now: NOW,
  });
  assert.equal(waiting.ok, true);
  assert.equal(waiting.patch.status, "waiting");
  assert.equal(waiting.event.reason, "Devis en relecture");
  const blocked = decideRequestAction(current, "block", { userId: ASSIGNEE, input: { reason: "Pièce manquante" }, now: NOW });
  assert.equal(blocked.patch.status, "blocked");
  assert.match(decideRequestAction(row({ status: "response_sent" }), "reopen", { userId: REQUESTER, input: {}, now: NOW }).error, /motif/);
});

test("traiter une demande exige un résultat, puis le demandeur clôture", () => {
  const current = row({ status: "in_progress" });
  assert.match(decideRequestAction(current, "complete", { userId: ASSIGNEE, input: {}, now: NOW }).error, /résultat/);
  const done = decideRequestAction(current, "complete", { userId: ASSIGNEE, input: { result: "Prévisite posée jeudi." }, now: NOW });
  assert.equal(done.patch.status, "completed");
  assert.equal(done.event.reason, "Prévisite posée jeudi.");
  const answered = row({ status: "completed" });
  const response = decideRequestAction(answered, "respond", { userId: ASSIGNEE, now: NOW });
  assert.equal(response.patch.status, "response_sent");
  assert.match(response.notifications[0].key, /^request:.+:response:/);
  const ready = row({ status: "response_sent" });
  assert.equal(decideRequestAction(ready, "close", { userId: ASSIGNEE, now: NOW }).ok, false);
  const closed = decideRequestAction(ready, "close", { userId: REQUESTER, now: NOW });
  assert.equal(closed.patch.status, "closed");
  const reopened = decideRequestAction(row({ status: "closed" }), "reopen", { userId: REQUESTER, input: { reason: "Il manque la photo." }, now: NOW });
  assert.equal(reopened.patch.status, "in_progress");
  assert.equal(reopened.event.kind, "reopened");
});

test("la fenêtre de connexion ne reprend que les tickets à terme", () => {
  const late = { id: "a", status: "in_progress", dueAt: "2026-10-01T08:00:00.000Z", title: "En retard" };
  const today = { id: "b", status: "sent", dueAt: "2026-10-03T18:00:00.000Z", title: "Aujourd’hui" };
  const later = { id: "c", status: "opened", dueAt: "2026-10-04T08:00:00.000Z", title: "Demain" };
  const closed = { id: "d", status: "closed", dueAt: "2026-10-01T08:00:00.000Z", title: "Clôturé" };
  const answered = { id: "f", status: "response_sent", dueAt: "2026-10-01T08:00:00.000Z", title: "Répondu" };
  const done = { id: "g", status: "completed", dueAt: "2026-10-01T08:00:00.000Z", title: "Traité" };
  const openEnded = { id: "e", status: "accepted", title: "Sans échéance" };
  assert.equal(isTicketAtTerm(late, NOW), true);
  assert.equal(isTicketAtTerm(today, NOW), true);
  assert.equal(isTicketAtTerm(later, NOW), false);
  assert.equal(isTicketAtTerm(closed, NOW), false);
  assert.equal(isTicketAtTerm(answered, NOW), false);
  assert.equal(isTicketAtTerm(done, NOW), false);
  assert.equal(isTicketAtTerm(openEnded, NOW), false);
  assert.deepEqual(ticketsAtTerm([later, today, closed, answered, done, late, openEnded], NOW).map(item => item.id), ["a", "b"]);
  assert.equal(isArchivedRequest("response_sent"), true);
  assert.equal(isArchivedRequest("completed"), false);
  assert.equal(isHandledTicket("completed"), true);
  assert.deepEqual(requestStatusesForList(false).map(item => item.id), ["sent", "opened", "accepted", "in_progress", "waiting", "blocked", "completed"]);
  assert.deepEqual(requestStatusesForList(true).map(item => item.id), ["response_sent", "closed", "cancelled"]);
});

test("le retard est un indicateur, pas un statut", () => {
  const late = row({ status: "in_progress", due_at: "2026-10-01T08:00:00.000Z" });
  assert.equal(isRequestOverdue(late, NOW), true);
  assert.equal(late.status, "in_progress");
  assert.equal(requestStatusMeta("overdue").id, "overdue");
  assert.equal(REQUEST_STATUS_IS_STORED("overdue"), false);
  assert.equal(isRequestOverdue(row({ status: "closed", due_at: "2026-10-01T08:00:00.000Z" }), NOW), false);
  assert.equal(shouldNoteOverdue(late, NOW), true);
  assert.equal(shouldNoteOverdue({ ...late, overdue_noted_at: NOW.toISOString() }, NOW), false);
  assert.equal(overdueNotificationKey(late.id, ASSIGNEE), `request:${late.id}:overdue:${ASSIGNEE}`);
});

function REQUEST_STATUS_IS_STORED(status) {
  return ["sent", "opened", "accepted", "in_progress", "waiting", "blocked", "completed", "response_sent", "closed", "cancelled"].includes(status);
}

test("réassigner ou changer l échéance laisse une trace avec l ancien et le nouveau", () => {
  const current = row({ status: "accepted" });
  assert.match(decideRequestAction(current, "reassign", { userId: REQUESTER, input: { assigneeId: OTHER }, now: NOW }).error, /motif/);
  const moved = decideRequestAction(current, "reassign", {
    userId: REQUESTER,
    input: { assigneeId: OTHER, reason: "Mauvaise personne" },
    now: NOW,
  });
  assert.equal(moved.ok, true);
  assert.equal(moved.event.kind, "reassigned");
  assert.deepEqual(moved.event.payload, { from: [ASSIGNEE], to: [OTHER] });
  assert.equal(moved.notifications[0].key, assignmentNotificationKey(current.id, OTHER).replace(`assigned:${OTHER}`, `assigned:${OTHER}:20261003120000`) || moved.notifications[0].key);
  assert.match(moved.notifications[0].key, new RegExp(`assigned:${OTHER}:`));
  assert.match(decideRequestAction(current, "due", { userId: ASSIGNEE, input: { dueAt: "2026-10-20T10:00:00.000Z" }, now: NOW }).error, /motif/);
  const shifted = decideRequestAction(current, "due", {
    userId: ASSIGNEE,
    input: { dueAt: "2026-10-20T10:00:00.000Z", reason: "Client absent" },
    now: NOW,
  });
  assert.equal(shifted.event.kind, "due_changed");
  assert.equal(shifted.event.payload.from, current.due_at);
  assert.equal(shifted.patch.due_at, "2026-10-20T10:00:00.000Z");
  assert.equal(shifted.patch.overdue_noted_at, null);
});

test("un message est refusé sans texte et notifie l autre personne", () => {
  const current = row();
  assert.equal(decideRequestAction(current, "comment", { userId: OTHER, canParticipate: false, input: { body: "Vu" }, now: NOW }).ok, false);
  assert.match(decideRequestAction(current, "comment", { userId: ASSIGNEE, canParticipate: true, input: { body: "  " }, now: NOW }).error, /message/);
  const reply = decideRequestAction(current, "comment", { userId: ASSIGNEE, canParticipate: true, input: { body: "Je passe jeudi." }, now: NOW });
  assert.equal(reply.ok, true);
  assert.equal(reply.event.kind, "commented");
  assert.equal(reply.notifications[0].userId, REQUESTER);
  assert.match(reply.notifications[0].key, /^request:.+:comment:/);
});

test("la clé d assignation et d ouverture ne change pas d une lecture à l autre", () => {
  const id = row().id;
  assert.equal(assignmentNotificationKey(id, ASSIGNEE), `request:${id}:assigned:${ASSIGNEE}`);
  assert.equal(openedNotificationKey(id), `request:${id}:opened`);
});

test("les actions proposées suivent le rôle", () => {
  const opened = row();
  assert.deepEqual(availableRequestActions(opened, { userId: ASSIGNEE }), ["accept", "cancel", "reassign", "due", "comment"]);
  assert.ok(availableRequestActions(opened, { userId: REQUESTER }).includes("cancel"));
  assert.equal(availableRequestActions(opened, { userId: REQUESTER }).includes("accept"), false);
  assert.equal(availableRequestActions(row({ status: "response_sent" }), { userId: REQUESTER }).includes("close"), true);
});

test("un ticket n’est visible que pour son demandeur et ses destinataires", () => {
  const item = row();
  assert.equal(requestConcernsUser(item, REQUESTER), true);
  assert.equal(requestConcernsUser(item, ASSIGNEE), true);
  assert.equal(requestConcernsUser({ ...item, assignee_ids: [OTHER] }, OTHER), true);
  assert.equal(requestConcernsUser(item, OTHER), false);
  assert.equal(requestConcernsUser(item, ""), false);
  const server = readFileSync(new URL("../app/lib/internal-requests-server.js", import.meta.url), "utf8");
  const listFn = server.slice(server.indexOf("export async function listInternalRequests"), server.indexOf("async function assertAssignee"));
  const seeFn = server.slice(server.indexOf("function canSee"), server.indexOf("async function loadClientRow"));
  assert.match(listFn, /requestConcernsUser/);
  assert.match(listFn, /canSeeAll: false/);
  assert.match(listFn, /canSeeTeam: false/);
  assert.doesNotMatch(listFn, /teamIds == null/);
  assert.match(seeFn, /requestConcernsUser/);
  assert.doesNotMatch(seeFn, /canManageRequests/);
  assert.doesNotMatch(seeFn, /loadTeamMemberIds/);
  const moduleUi = readFileSync(new URL("../app/components/internal-requests-module.js", import.meta.url), "utf8");
  const welcome = readFileSync(new URL("../app/components/ticket-term-welcome.js", import.meta.url), "utf8");
  assert.match(moduleUi, /requestConcernsUser/);
  assert.doesNotMatch(moduleUi, /Toutes/);
  assert.doesNotMatch(moduleUi, />Équipe</);
  assert.match(welcome, /requestConcernsUser/);
});

test("les profils existants voient le module, pas le prospecteur terrain", () => {
  const commercial = grantedModules({
    role: "Commercial",
    modules: ["Prospects"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  });
  assert.ok(commercial.includes("Tickets internes"));
  const prospector = grantedModules({
    role: "Prospecteur terrain",
    modules: ["Prospects"],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
  });
  assert.deepEqual(prospector, ["Prospects"]);
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const moduleUi = readFileSync(new URL("../app/components/internal-requests-module.js", import.meta.url), "utf8");
  assert.match(page, /InternalRequestsModule/);
  assert.match(moduleUi, /aria-label="Filtrer par destinataire"/);
  assert.match(moduleUi, /aria-label="Filtrer par demandeur"/);
  assert.match(moduleUi, /aria-label="Filtrer par statut"/);
  assert.match(moduleUi, /Archives/);
  assert.match(moduleUi, /requestStatusesForList\(tab === "archive"\)/);
  const notes = readFileSync(new URL("../app/api/notifications/route.js", import.meta.url), "utf8");
  assert.match(notes, /withoutHandledTickets/);
  assert.doesNotMatch(page, /usesCommercialHome/);
  const sql = readFileSync(new URL("../supabase/migrations/20261003_internal_requests.sql", import.meta.url), "utf8");
  assert.match(sql, /grant select, insert on public.internal_request_events/);
  assert.doesNotMatch(sql, /grant update on public.internal_request_events/);
});
