/** Tickets internes — règles pures, sans accès base. */

export const REQUEST_MODULE = "Tickets internes";
export const REQUEST_NUMBER_PREFIX = "MKL-DM-";

export const REQUEST_STATUSES = [
  { id: "sent", label: "Envoyé", tone: "gray" },
  { id: "opened", label: "Ouvert", tone: "blue" },
  { id: "accepted", label: "Pris en charge", tone: "violet" },
  { id: "in_progress", label: "En cours", tone: "orange" },
  { id: "waiting", label: "En attente", tone: "yellow" },
  { id: "blocked", label: "Bloqué", tone: "red" },
  { id: "completed", label: "Traité", tone: "lightgreen" },
  { id: "response_sent", label: "Réponse envoyée", tone: "green" },
  { id: "closed", label: "Validé et clôturé", tone: "darkgreen" },
  { id: "cancelled", label: "Annulé", tone: "darkgray" },
];

const STATUS_IDS = new Set(REQUEST_STATUSES.map(item => item.id));
const FINISHED = new Set(["closed", "cancelled"]);
const ARCHIVED = new Set(["response_sent", "closed", "cancelled"]);
const HANDLED = new Set(["completed", "response_sent", "closed", "cancelled"]);

export function isArchivedRequest(status) {
  return ARCHIVED.has(status);
}

export function isHandledTicket(status) {
  return HANDLED.has(status);
}

export function requestStatusesForList(archive = false) {
  return REQUEST_STATUSES.filter(item => isArchivedRequest(item.id) === archive);
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function formatRequestNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return "";
  return `${REQUEST_NUMBER_PREFIX}${String(number).padStart(5, "0")}`;
}

export function requestStatusMeta(status) {
  return REQUEST_STATUSES.find(item => item.id === status) || { id: status || "", label: status || "—", tone: "gray" };
}

export function isRequestOverdue(row, now = new Date()) {
  if (!row?.due_at || FINISHED.has(row.status)) return false;
  const due = new Date(row.due_at).getTime();
  const clock = new Date(now).getTime();
  if (Number.isNaN(due) || Number.isNaN(clock)) return false;
  return due < clock;
}

export function parisCalendarDay(value, timeZone = "Europe/Paris") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function ticketDueAt(row) {
  return row?.dueAt || row?.due_at || "";
}

export function isTicketAtTerm(row, now = new Date()) {
  if (!row || isHandledTicket(row.status)) return false;
  const due = ticketDueAt(row);
  if (!due) return false;
  const dueDay = parisCalendarDay(due);
  const today = parisCalendarDay(now);
  if (!dueDay || !today) return false;
  return dueDay <= today;
}

export function ticketsAtTerm(requests = [], now = new Date()) {
  return (requests || [])
    .filter(row => isTicketAtTerm(row, now))
    .sort((a, b) => String(ticketDueAt(a)).localeCompare(String(ticketDueAt(b))));
}

export const TICKET_SUBJECTS = [
  "Installation à planifier",
  "Entretien à programmer",
  "Commande matériel",
  "Documents à fournir",
  "Kilométrage véhicule",
  "Devis à préparer",
  "Visite technique à programmer",
];

export const TICKET_SUBJECT_OTHER = "Autre";

export function ticketPersonName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(1).join(" ")} ${parts[0]}`;
}

export function requestAssigneeIds(row) {
  const listed = Array.isArray(row?.assignee_ids) ? row.assignee_ids : (Array.isArray(row?.assigneeIds) ? row.assigneeIds : []);
  const ids = [...listed, row?.assignee_id, row?.assigneeId]
    .map(id => String(id || "").trim())
    .filter(isRequestUuid);
  return [...new Set(ids)];
}

export function requestConcernsUser(row, userId) {
  const id = String(userId || "").trim().toLowerCase();
  if (!UUID_RE.test(id) || !row) return false;
  const requester = String(row.requester_id || row.requesterId || "").trim().toLowerCase();
  if (requester === id) return true;
  return requestAssigneeIds(row).some(item => item.toLowerCase() === id);
}

export function shouldRecordFirstOpen(row, userId) {
  if (!row || row.opened_at) return false;
  if (row.status !== "sent") return false;
  return requestAssigneeIds(row).includes(String(userId || ""));
}

export function shouldNoteOverdue(row, now = new Date()) {
  return isRequestOverdue(row, now) && !row?.overdue_noted_at;
}

export function isRequestUuid(value) {
  return UUID_RE.test(String(value || "").trim());
}

function assigneeIdsFrom(body = {}) {
  const raw = Array.isArray(body.assigneeIds) ? body.assigneeIds : (body.assigneeId || body.assignee_id ? [body.assigneeId || body.assignee_id] : []);
  return [...new Set(raw.map(id => String(id || "").trim()).filter(isRequestUuid))];
}

export function validateCreateInput(body = {}) {
  const subject = String(body.subject || body.title || "").trim();
  const otherTitle = String(body.otherTitle || body.other_title || "").trim();
  const description = String(body.description || "").trim();
  const assigneeIds = assigneeIdsFrom(body);
  const dueRaw = body.dueAt || body.due_at || "";
  const priority = body.priority === "urgent" ? "urgent" : "normal";
  const clientRaw = String(body.clientId || body.client_id || "").trim();
  let title = subject;
  if (subject === TICKET_SUBJECT_OTHER) {
    if (!otherTitle) return { ok: false, error: "Précisez l’objet." };
    if (otherTitle.length > 180) return { ok: false, error: "L’objet est trop long." };
    title = otherTitle;
  } else if (!TICKET_SUBJECTS.includes(subject)) {
    return { ok: false, error: "Choisissez un objet." };
  }
  if (!description) return { ok: false, error: "Décrivez le ticket." };
  if (description.length > 8000) return { ok: false, error: "La description est trop longue." };
  if (!assigneeIds.length) return { ok: false, error: "Choisissez au moins un destinataire." };
  const due = new Date(dueRaw);
  if (!dueRaw || Number.isNaN(due.getTime())) return { ok: false, error: "Indiquez une échéance." };
  if (clientRaw && !isRequestUuid(clientRaw)) return { ok: false, error: "Client introuvable." };
  return {
    ok: true,
    value: {
      title,
      description,
      assigneeId: assigneeIds[0],
      assigneeIds,
      dueAt: due.toISOString(),
      priority,
      clientId: clientRaw || null,
    },
  };
}

function fail(error) {
  return { ok: false, error };
}

function stampOf(now) {
  return new Date(now).toISOString().replace(/\D/g, "").slice(0, 14);
}

function text(value) {
  return String(value || "").trim();
}

export function decideRequestAction(row, action, { userId, canManage = false, canParticipate = false, input = {}, now = new Date() } = {}) {
  if (!row || !STATUS_IDS.has(row.status)) return fail("Ticket introuvable.");
  if (!userId) return fail("Session expirée. Reconnectez-vous avec votre email et votre PIN.");
  const isAssignee = requestAssigneeIds(row).includes(String(userId));
  const isRequester = String(row.requester_id) === String(userId);
  const reason = text(input.reason);
  const result = text(input.result);
  const stamp = stampOf(now);
  const reference = formatRequestNumber(row.number) || "Ticket";
  const notifications = [];

  function tell(targetId, key, title, body) {
    if (!targetId || String(targetId) === String(userId)) return;
    notifications.push({ userId: String(targetId), key, title, body });
  }

  function done(patch, event) {
    return { ok: true, patch: { ...patch, updated_at: new Date(now).toISOString() }, event, notifications };
  }

  if (action === "comment") {
    const body = text(input.body);
    if (!canParticipate && !isAssignee && !isRequester && !canManage) return fail("Accès refusé à ce ticket.");
    if (!body) return fail("Écrivez un message.");
    if (body.length > 4000) return fail("Le message est trop long.");
    if (isAssignee) tell(row.requester_id, `request:${row.id}:comment:${stamp}`, `Message sur ${reference}`, body.slice(0, 180));
    for (const id of requestAssigneeIds(row)) {
      if (String(id) === String(userId)) continue;
      if (isAssignee && String(id) === String(row.requester_id)) continue;
      tell(id, `request:${row.id}:comment:${stamp}:${id}`, `Message sur ${reference}`, body.slice(0, 180));
    }
    if (!isAssignee && !isRequester) tell(row.requester_id, `request:${row.id}:comment:${stamp}:requester`, `Message sur ${reference}`, body.slice(0, 180));
    return done({}, { kind: "commented", reason: body });
  }

  if (FINISHED.has(row.status) && action !== "reopen") {
    return fail(row.status === "cancelled" ? "Ce ticket est annulé." : "Ce ticket est clôturé.");
  }

    if (["accept", "start", "wait", "block", "complete", "respond"].includes(action) && !isAssignee) {
    return fail("Seul un destinataire du ticket peut faire avancer le traitement.");
  }

  if (action === "accept") {
    if (row.status !== "opened") return fail("Le ticket doit d’abord être ouvert.");
    tell(row.requester_id, `request:${row.id}:accepted:${stamp}`, `${reference} pris en charge`, "Le responsable a pris le ticket en charge.");
    return done(
      { status: "accepted", accepted_at: new Date(now).toISOString(), wait_reason: null, wait_for: null, wait_until: null, block_reason: null },
      { kind: "accepted", from: row.status, to: "accepted" },
    );
  }

  if (action === "start") {
    if (!["accepted", "waiting", "blocked"].includes(row.status)) return fail("Le ticket ne peut pas passer en cours.");
    return done(
      { status: "in_progress", wait_reason: null, wait_for: null, wait_until: null, block_reason: null },
      { kind: "status", from: row.status, to: "in_progress" },
    );
  }

  if (action === "wait") {
    if (!["accepted", "in_progress", "blocked"].includes(row.status)) return fail("Le ticket ne peut pas être mis en attente.");
    const waitFor = text(input.waitFor || input.wait_for);
    const waitUntilRaw = input.waitUntil || input.wait_until || "";
    const waitUntil = new Date(waitUntilRaw);
    if (!reason) return fail("Indiquez le motif de l’attente.");
    if (!waitFor) return fail("Indiquez qui ou quoi est attendu.");
    if (!waitUntilRaw || Number.isNaN(waitUntil.getTime())) return fail("Indiquez une date de relance.");
    tell(row.requester_id, `request:${row.id}:waiting:${stamp}`, `${reference} en attente`, reason);
    return done(
      {
        status: "waiting",
        wait_reason: reason,
        wait_for: waitFor,
        wait_until: waitUntil.toISOString().slice(0, 10),
        block_reason: null,
      },
      { kind: "waiting", from: row.status, to: "waiting", reason, payload: { waitFor, waitUntil: waitUntil.toISOString().slice(0, 10) } },
    );
  }

  if (action === "block") {
    if (!["accepted", "in_progress", "waiting"].includes(row.status)) return fail("Le ticket ne peut pas être bloqué.");
    if (!reason) return fail("Indiquez le motif du blocage.");
    tell(row.requester_id, `request:${row.id}:blocked:${stamp}`, `${reference} bloquée`, reason);
    return done(
      { status: "blocked", block_reason: reason, wait_reason: null, wait_for: null, wait_until: null },
      { kind: "blocked", from: row.status, to: "blocked", reason },
    );
  }

  if (action === "complete") {
    if (!["accepted", "in_progress", "waiting", "blocked"].includes(row.status)) return fail("Le ticket ne peut pas être marqué traité.");
    if (!result) return fail("Indiquez le résultat du traitement.");
    tell(row.requester_id, `request:${row.id}:completed:${stamp}`, `${reference} traitée`, result.slice(0, 180));
    return done(
      { status: "completed", result_comment: result, completed_at: new Date(now).toISOString() },
      { kind: "completed", from: row.status, to: "completed", reason: result },
    );
  }

  if (action === "respond") {
    if (row.status !== "completed") return fail("Envoyez la réponse une fois le ticket traité.");
    tell(row.requester_id, `request:${row.id}:response:${stamp}`, `Réponse sur ${reference}`, "La réponse est prête à être validée.");
    return done(
      { status: "response_sent", response_sent_at: new Date(now).toISOString() },
      { kind: "response_sent", from: row.status, to: "response_sent" },
    );
  }

  if (action === "close") {
    if (row.status !== "response_sent") return fail("Le ticket se clôture après l’envoi de la réponse.");
    if (!isRequester && !canManage) return fail("Seul le demandeur peut valider et clôturer.");
    for (const id of requestAssigneeIds(row)) tell(id, `request:${row.id}:closed:${stamp}:${id}`, `${reference} clôturé`, "Le demandeur a validé et clôturé le ticket.");
    return done(
      { status: "closed", closed_at: new Date(now).toISOString() },
      { kind: "closed", from: row.status, to: "closed" },
    );
  }

  if (action === "reopen") {
    if (!["response_sent", "closed"].includes(row.status)) return fail("Ce ticket ne peut pas être rouvert.");
    if (!isRequester && !canManage) return fail("Seul le demandeur peut rouvrir le ticket.");
    if (!reason) return fail("Indiquez le motif de la réouverture.");
    for (const id of requestAssigneeIds(row)) tell(id, `request:${row.id}:reopened:${stamp}:${id}`, `${reference} rouvert`, reason);
    return done(
      { status: "in_progress", closed_at: null, block_reason: null, wait_reason: null, wait_for: null, wait_until: null },
      { kind: "reopened", from: row.status, to: "in_progress", reason },
    );
  }

  if (action === "cancel") {
    if (FINISHED.has(row.status)) return fail("Ce ticket ne peut plus être annulé.");
    if (!isRequester && !isAssignee && !canManage) return fail("Vous ne pouvez pas annuler ce ticket.");
    if (!reason) return fail("Indiquez le motif de l’annulation.");
    if (isRequester) {
      for (const id of requestAssigneeIds(row)) tell(id, `request:${row.id}:cancelled:${stamp}:${id}`, `${reference} annulé`, reason);
    } else {
      tell(row.requester_id, `request:${row.id}:cancelled:${stamp}`, `${reference} annulé`, reason);
    }
    return done(
      { status: "cancelled", cancel_reason: reason, cancelled_at: new Date(now).toISOString() },
      { kind: "cancelled", from: row.status, to: "cancelled", reason },
    );
  }

  if (action === "reassign") {
    if (FINISHED.has(row.status)) return fail("Ce ticket ne peut plus être réassigné.");
    if (!isRequester && !isAssignee && !canManage) return fail("Vous ne pouvez pas réassigner ce ticket.");
    if (!reason) return fail("Indiquez le motif de la réassignation.");
    const nextIds = assigneeIdsFrom(input);
    if (!nextIds.length) return fail("Choisissez au moins un destinataire.");
    const currentIds = requestAssigneeIds(row);
    const samePeople = nextIds.length === currentIds.length && nextIds.every(id => currentIds.includes(id));
    if (samePeople) return fail("Ces personnes sont déjà destinataires.");
    for (const id of nextIds) {
      if (!currentIds.includes(id)) tell(id, `request:${row.id}:assigned:${id}:${stamp}`, `${reference} vous est assigné`, reason);
    }
    for (const id of currentIds) {
      if (!nextIds.includes(id)) tell(id, `request:${row.id}:unassigned:${stamp}:${id}`, `${reference} réassigné`, reason);
    }
    return done(
      { assignee_id: nextIds[0], assignee_ids: nextIds, status: row.status === "sent" ? "sent" : row.status, opened_at: row.status === "sent" ? null : row.opened_at },
      { kind: "reassigned", reason, payload: { from: currentIds, to: nextIds } },
    );
  }

  if (action === "due") {
    if (FINISHED.has(row.status)) return fail("L’échéance d’un ticket terminé ne se modifie plus.");
    if (!isRequester && !isAssignee && !canManage) return fail("Vous ne pouvez pas modifier l’échéance.");
    if (!reason) return fail("Indiquez le motif du changement d’échéance.");
    const due = new Date(input.dueAt || input.due_at || "");
    if (Number.isNaN(due.getTime())) return fail("Indiquez une échéance.");
    const nextDue = due.toISOString();
    if (row.due_at && new Date(row.due_at).getTime() === due.getTime()) return fail("L’échéance est déjà celle-ci.");
    if (isAssignee) tell(row.requester_id, `request:${row.id}:due:${stamp}`, `Échéance modifiée · ${reference}`, reason);
    else for (const id of requestAssigneeIds(row)) tell(id, `request:${row.id}:due:${stamp}:${id}`, `Échéance modifiée · ${reference}`, reason);
    return done(
      { due_at: nextDue, overdue_noted_at: null },
      { kind: "due_changed", reason, payload: { from: row.due_at || null, to: nextDue } },
    );
  }

  return fail("Action inconnue.");
}

const ACTION_IDS = ["accept", "start", "wait", "block", "complete", "respond", "close", "reopen", "cancel", "reassign", "due", "comment"];

export function availableRequestActions(row, { userId, canManage = false, canParticipate = true } = {}) {
  const probeAssignee = "00000000-0000-4000-8000-000000000099";
  const input = {
    reason: "motif",
    result: "résultat",
    waitFor: "un document",
    waitUntil: "2026-12-01",
    assigneeIds: requestAssigneeIds(row).includes(probeAssignee) ? ["00000000-0000-4000-8000-000000000098"] : [probeAssignee],
    dueAt: row?.due_at ? new Date(new Date(row.due_at).getTime() + 86400000).toISOString() : "2026-12-15T10:00:00.000Z",
    body: "message",
  };
  return ACTION_IDS.filter(action => decideRequestAction(row, action, { userId, canManage, canParticipate, input, now: new Date("2026-10-03T12:00:00.000Z") }).ok);
}

export function eventLabel(kind) {
  const labels = {
    created: "Ticket envoyé",
    opened: "Ouvert par le responsable",
    accepted: "Pris en charge",
    status: "Statut mis à jour",
    waiting: "Mise en attente",
    blocked: "Blocage",
    completed: "Traitement terminé",
    response_sent: "Réponse envoyée",
    closed: "Validé et clôturé",
    reopened: "Rouvert",
    cancelled: "Annulé",
    reassigned: "Réassigné",
    due_changed: "Échéance modifiée",
    commented: "Message",
    overdue: "Passé en retard",
  };
  return labels[kind] || "Événement";
}

export function rowForRules(view = {}) {
  return {
    id: view.id,
    number: view.number,
    status: view.status,
    assignee_id: view.assigneeId ?? view.assignee_id,
    assignee_ids: view.assigneeIds ?? view.assignee_ids,
    requester_id: view.requesterId ?? view.requester_id,
    due_at: view.dueAt ?? view.due_at,
    opened_at: view.openedAt ?? view.opened_at,
    organization_id: view.organizationId ?? view.organization_id,
    overdue_noted_at: view.overdueNotedAt ?? view.overdue_noted_at,
  };
}

export function assignmentNotificationKey(id, assigneeId) {
  return `request:${id}:assigned:${assigneeId}`;
}

export function openedNotificationKey(id) {
  return `request:${id}:opened`;
}

export function overdueNotificationKey(id, userId) {
  return userId ? `request:${id}:overdue:${userId}` : `request:${id}:overdue`;
}
