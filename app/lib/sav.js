/** Dossiers SAV — règles pures, sans accès base. */

export const SAV_MODULE = "SAV";
export const SAV_NUMBER_PREFIX = "MKL-SAV-";

export const SAV_STATUSES = [
  { id: "new", label: "Nouveau", tone: "gray" },
  { id: "to_qualify", label: "À qualifier", tone: "gray" },
  { id: "assigned", label: "Assigné", tone: "blue" },
  { id: "accepted", label: "Pris en charge", tone: "violet" },
  { id: "scheduled", label: "Intervention planifiée", tone: "blue" },
  { id: "in_progress", label: "En cours", tone: "orange" },
  { id: "waiting_client", label: "En attente client", tone: "yellow" },
  { id: "waiting_internal", label: "En attente interne", tone: "yellow" },
  { id: "blocked", label: "Bloqué", tone: "red" },
  { id: "to_review", label: "À contrôler", tone: "orange" },
  { id: "resolved", label: "Résolu", tone: "green" },
  { id: "closed", label: "Clôturé", tone: "darkgreen" },
  { id: "cancelled", label: "Annulé", tone: "darkgray" },
];

export const SAV_CATEGORIES = [
  { id: "panne", label: "Panne" },
  { id: "fuite", label: "Fuite" },
  { id: "dysfonctionnement", label: "Dysfonctionnement" },
  { id: "piece", label: "Pièce endommagée" },
  { id: "reglage", label: "Réglage" },
  { id: "erreur_installation", label: "Erreur d’installation" },
  { id: "demande_intervention", label: "Demande d’intervention" },
  { id: "reclamation", label: "Réclamation" },
  { id: "autre", label: "Autre" },
];

export const SAV_PRIORITIES = [
  { id: "low", label: "Basse" },
  { id: "normal", label: "Normale" },
  { id: "high", label: "Haute" },
  { id: "urgent", label: "Urgente" },
];

export const SAV_CHANNELS = [
  { id: "telephone", label: "Téléphone" },
  { id: "email", label: "Email" },
  { id: "visite", label: "Visite" },
  { id: "autre", label: "Autre" },
];

const STATUS_IDS = new Set(SAV_STATUSES.map(item => item.id));
const CATEGORY_IDS = new Set(SAV_CATEGORIES.map(item => item.id));
const PRIORITY_IDS = new Set(SAV_PRIORITIES.map(item => item.id));
const CHANNEL_IDS = new Set(SAV_CHANNELS.map(item => item.id));
const FINISHED = new Set(["closed", "cancelled"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function formatSavNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return "";
  return `${SAV_NUMBER_PREFIX}${String(number).padStart(5, "0")}`;
}

export function savStatusMeta(status) {
  return SAV_STATUSES.find(item => item.id === status) || { id: status || "", label: status || "—", tone: "gray" };
}

export function savCategoryLabel(id) {
  return SAV_CATEGORIES.find(item => item.id === id)?.label || id || "—";
}

export function savPriorityLabel(id) {
  return SAV_PRIORITIES.find(item => item.id === id)?.label || "Normale";
}

export function savChannelLabel(id) {
  return SAV_CHANNELS.find(item => item.id === id)?.label || "Téléphone";
}

export function isSavUuid(value) {
  return UUID_RE.test(String(value || "").trim());
}

export function savPersonName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(1).join(" ")} ${parts[0]}`;
}

export function isSavOverdue(row, now = new Date()) {
  if (!row?.due_at || FINISHED.has(row.status)) return false;
  const due = new Date(row.due_at).getTime();
  const clock = new Date(now).getTime();
  if (Number.isNaN(due) || Number.isNaN(clock)) return false;
  return due < clock;
}

export function shouldRecordFirstOpen(row) {
  return Boolean(row?.id) && !row.opened_at && STATUS_IDS.has(row.status) && !FINISHED.has(row.status);
}

export function validateCreateInput(body = {}) {
  const clientId = String(body.clientId || body.client_id || "").trim();
  const subject = String(body.subject || "").trim();
  const description = String(body.description || "").trim();
  const category = String(body.category || "").trim();
  const priority = String(body.priority || "normal").trim();
  const channel = String(body.channel || "telephone").trim();
  const ownerId = String(body.ownerId || body.owner_id || "").trim();
  const callerName = String(body.callerName || body.caller_name || "").trim();
  const callerPhone = String(body.callerPhone || body.caller_phone || "").trim();
  const dueRaw = body.dueAt || body.due_at || "";
  if (!isSavUuid(clientId)) return { ok: false, error: "Choisissez un client." };
  if (!subject) return { ok: false, error: "Indiquez le motif de l’appel." };
  if (subject.length > 180) return { ok: false, error: "Le motif est trop long." };
  if (!description) return { ok: false, error: "Décrivez l’appel." };
  if (description.length > 2000) return { ok: false, error: "La description est trop longue." };
  if (!CATEGORY_IDS.has(category)) return { ok: false, error: "Choisissez une catégorie." };
  if (!PRIORITY_IDS.has(priority)) return { ok: false, error: "Choisissez une urgence." };
  if (!CHANNEL_IDS.has(channel)) return { ok: false, error: "Choisissez un canal." };
  if (!isSavUuid(ownerId)) return { ok: false, error: "Choisissez un responsable." };
  const due = new Date(dueRaw);
  if (!dueRaw || Number.isNaN(due.getTime())) return { ok: false, error: "Indiquez une échéance." };
  if (callerName.length > 120) return { ok: false, error: "Le nom de l’appelant est trop long." };
  if (callerPhone && !/^[0-9 +\-.]{6,20}$/.test(callerPhone)) return { ok: false, error: "Le numéro de téléphone est invalide." };
  return {
    ok: true,
    value: {
      clientId,
      subject,
      description,
      category,
      priority,
      channel,
      ownerId,
      callerName,
      callerPhone,
      dueAt: due.toISOString(),
    },
  };
}

export function assignmentNotificationKey(id, ownerId) {
  return `sav:${id}:assigned:${ownerId}`;
}

const WORK_STATUSES = ["accepted", "scheduled", "in_progress", "waiting_client", "waiting_internal", "blocked"];
const ACTION_IDS = ["accept", "schedule", "start", "wait", "block", "report", "submit", "control", "inform", "resolve", "close", "reopen", "cancel", "reassign", "due"];

function fail(error) {
  return { ok: false, error };
}

function text(value) {
  return String(value || "").trim();
}

function stampOf(now) {
  return new Date(now).toISOString().replace(/\D/g, "").slice(0, 14);
}

export function eventLabel(kind) {
  const labels = {
    created: "Appel enregistré",
    opened: "Dossier ouvert",
    accepted: "Pris en charge",
    scheduled: "Intervention planifiée",
    status: "Statut mis à jour",
    waiting: "Mise en attente",
    blocked: "Blocage",
    reported: "Compte rendu",
    submitted: "Envoyé au contrôle",
    reviewed: "Contrôle effectué",
    informed: "Client informé",
    resolved: "Résolu",
    closed: "Clôturé",
    reopened: "Rouvert",
    cancelled: "Annulé",
    reassigned: "Réassigné",
    due_changed: "Échéance modifiée",
  };
  return labels[kind] || "Événement";
}

export function rowForRules(view = {}) {
  return {
    id: view.id,
    number: view.number,
    subject: view.subject,
    status: view.status,
    owner_id: view.ownerId ?? view.owner_id,
    created_by: view.createdBy ?? view.created_by,
    due_at: view.dueAt ?? view.due_at,
    opened_at: view.openedAt ?? view.opened_at,
    result_comment: view.resultComment ?? view.result_comment ?? "",
    reviewed_at: view.reviewedAt ?? view.reviewed_at ?? null,
    client_informed: view.clientInformed ?? view.client_informed ?? false,
    client_informed_at: view.clientInformedAt ?? view.client_informed_at ?? null,
    reopen_count: view.reopenCount ?? view.reopen_count ?? 0,
  };
}

export function decideSavAction(row, action, { userId, canManage = false, input = {}, now = new Date() } = {}) {
  if (!row || !STATUS_IDS.has(row.status)) return fail("Dossier introuvable.");
  if (!userId) return fail("Session expirée. Reconnectez-vous avec votre email et votre PIN.");
  const isOwner = String(row.owner_id) === String(userId);
  const isCreator = String(row.created_by) === String(userId);
  const reason = text(input.reason);
  const result = text(input.result);
  const stamp = stampOf(now);
  const reference = formatSavNumber(row.number) || "SAV";
  const notifications = [];
  const storedResult = text(row.result_comment);

  function tell(targetId, key, title, body) {
    if (!targetId || String(targetId) === String(userId)) return;
    notifications.push({ userId: String(targetId), key, title, body });
  }

  function done(patch, event) {
    return { ok: true, patch: { ...patch, updated_at: new Date(now).toISOString() }, event, notifications };
  }

  if (FINISHED.has(row.status) && action !== "reopen") {
    return fail(row.status === "cancelled" ? "Ce dossier est annulé." : "Ce dossier est clôturé.");
  }

  if (action === "accept") {
    if (!isOwner) return fail("Seul le responsable peut prendre en charge le dossier.");
    if (!["new", "to_qualify", "assigned"].includes(row.status)) return fail("Ce dossier est déjà pris en charge.");
    tell(row.created_by, `sav:${row.id}:accepted:${stamp}`, `${reference} pris en charge`, row.subject || "");
    return done(
      { status: "accepted", accepted_at: new Date(now).toISOString(), accepted_by: userId, next_action: "Planifier ou démarrer l’intervention" },
      { kind: "accepted", from: row.status, to: "accepted" },
    );
  }

  if (action === "schedule") {
    if (!isOwner) return fail("Seul le responsable peut planifier l’intervention.");
    if (!["accepted", "in_progress", "waiting_client", "waiting_internal", "blocked"].includes(row.status)) return fail("Le dossier ne peut pas être planifié.");
    const scheduled = new Date(input.scheduledAt || input.scheduled_at || "");
    if (Number.isNaN(scheduled.getTime())) return fail("Indiquez la date d’intervention.");
    return done(
      { status: "scheduled", scheduled_at: scheduled.toISOString(), next_action: "Intervention planifiée", next_action_at: scheduled.toISOString(), wait_reason: null, wait_for: null, wait_until: null, block_reason: null },
      { kind: "scheduled", from: row.status, to: "scheduled" },
    );
  }

  if (action === "start") {
    if (!isOwner) return fail("Seul le responsable peut démarrer l’intervention.");
    if (!["accepted", "scheduled", "waiting_client", "waiting_internal", "blocked"].includes(row.status)) return fail("Le dossier ne peut pas passer en cours.");
    return done(
      { status: "in_progress", next_action: "Rédiger le compte rendu", wait_reason: null, wait_for: null, wait_until: null, block_reason: null },
      { kind: "status", from: row.status, to: "in_progress" },
    );
  }

  if (action === "wait") {
    if (!isOwner) return fail("Seul le responsable peut mettre le dossier en attente.");
    if (!["accepted", "scheduled", "in_progress", "blocked"].includes(row.status)) return fail("Le dossier ne peut pas être mis en attente.");
    const waitFor = text(input.waitFor || input.wait_for);
    const waitUntilRaw = input.waitUntil || input.wait_until || "";
    const waitUntil = new Date(waitUntilRaw);
    const side = input.side === "internal" ? "internal" : "client";
    if (!reason) return fail("Indiquez le motif de l’attente.");
    if (!waitFor) return fail("Indiquez qui ou quoi est attendu.");
    if (!waitUntilRaw || Number.isNaN(waitUntil.getTime())) return fail("Indiquez une date de relance.");
    const status = side === "internal" ? "waiting_internal" : "waiting_client";
    tell(row.created_by, `sav:${row.id}:waiting:${stamp}`, `${reference} en attente`, reason);
    return done(
      { status, wait_reason: reason, wait_for: waitFor, wait_until: waitUntil.toISOString().slice(0, 10), next_action: waitFor, next_action_at: waitUntil.toISOString(), block_reason: null },
      { kind: "waiting", from: row.status, to: status, reason, payload: { waitFor, side } },
    );
  }

  if (action === "block") {
    if (!isOwner) return fail("Seul le responsable peut bloquer le dossier.");
    if (!["accepted", "scheduled", "in_progress", "waiting_client", "waiting_internal"].includes(row.status)) return fail("Le dossier ne peut pas être bloqué.");
    if (!reason) return fail("Indiquez le motif du blocage.");
    tell(row.created_by, `sav:${row.id}:blocked:${stamp}`, `${reference} bloqué`, reason);
    return done(
      { status: "blocked", block_reason: reason, next_action: "Débloquer le dossier", wait_reason: null, wait_for: null, wait_until: null },
      { kind: "blocked", from: row.status, to: "blocked", reason },
    );
  }

  if (action === "report") {
    if (!isOwner) return fail("Seul le responsable peut rédiger le compte rendu.");
    if (!["accepted", ...WORK_STATUSES].includes(row.status)) return fail("Le compte rendu n’est pas encore possible.");
    if (!result) return fail("Rédigez le compte rendu d’intervention.");
    const intervened = new Date(input.intervenedAt || input.intervened_at || now);
    if (Number.isNaN(intervened.getTime())) return fail("Indiquez la date d’intervention.");
    const status = ["accepted", "scheduled"].includes(row.status) ? "in_progress" : row.status;
    return done(
      { status, result_comment: result, intervened_at: intervened.toISOString(), next_action: "Envoyer au contrôle" },
      { kind: "reported", from: row.status, to: status, reason: result },
    );
  }

  if (action === "submit") {
    if (!isOwner) return fail("Seul le responsable peut envoyer le dossier au contrôle.");
    if (!["accepted", "scheduled", "in_progress", "blocked"].includes(row.status)) return fail("Le dossier ne peut pas être envoyé au contrôle.");
    const report = result || storedResult;
    if (!report) return fail("Le compte rendu d’intervention est obligatoire.");
    return done(
      { status: "to_review", result_comment: report, next_action: "Contrôle du dossier" },
      { kind: "submitted", from: row.status, to: "to_review", reason: report },
    );
  }

  if (action === "control") {
    if (!canManage) return fail("Seul un responsable SAV peut contrôler le dossier.");
    if (row.status !== "to_review") return fail("Le dossier n’est pas à contrôler.");
    if (!storedResult && !result) return fail("Le compte rendu d’intervention est obligatoire.");
    if (row.reviewed_at) return fail("Le contrôle est déjà enregistré.");
    return done(
      { reviewed_by: userId, reviewed_at: new Date(now).toISOString(), next_action: "Résoudre puis informer le client" },
      { kind: "reviewed", from: row.status, to: "to_review" },
    );
  }

  if (action === "inform") {
    if (!canManage && !isCreator && !isOwner) return fail("Vous ne pouvez pas noter l’information du client.");
    if (FINISHED.has(row.status) || row.status === "new") return fail("Le client ne peut pas encore être informé.");
    if (row.client_informed && row.client_informed_at) return fail("Le client est déjà informé.");
    return done(
      { client_informed: true, client_informed_at: new Date(now).toISOString() },
      { kind: "informed", from: row.status, to: row.status },
    );
  }

  if (action === "resolve") {
    if (!isOwner && !canManage) return fail("Seul le responsable peut résoudre le dossier.");
    if (row.status !== "to_review") return fail("Le dossier doit d’abord être contrôlé.");
    if (!row.reviewed_at) return fail("Le contrôle n’est pas encore fait.");
    if (!storedResult && !result) return fail("Indiquez le résultat obtenu.");
    tell(row.created_by, `sav:${row.id}:resolved:${stamp}`, `${reference} résolu`, storedResult || result);
    return done(
      { status: "resolved", result_comment: storedResult || result, resolved_at: new Date(now).toISOString(), next_action: "Informer le client puis clôturer" },
      { kind: "resolved", from: row.status, to: "resolved", reason: storedResult || result },
    );
  }

  if (action === "close") {
    if (!canManage && !isCreator) return fail("Seul le secrétariat ou un responsable SAV peut clôturer.");
    if (row.status !== "resolved") return fail("Le dossier se clôture une fois résolu.");
    if (!storedResult) return fail("Le résultat est obligatoire.");
    if (!row.reviewed_at) return fail("Le contrôle est obligatoire.");
    if (!row.client_informed || !row.client_informed_at) return fail("Indiquez que le client a été informé.");
    tell(row.owner_id, `sav:${row.id}:closed:${stamp}`, `${reference} clôturé`, "Le dossier est clôturé.");
    return done(
      { status: "closed", closed_at: new Date(now).toISOString(), next_action: null },
      { kind: "closed", from: row.status, to: "closed" },
    );
  }

  if (action === "reopen") {
    if (!canManage) return fail("Seul un responsable SAV peut rouvrir le dossier.");
    if (!["resolved", "closed"].includes(row.status)) return fail("Ce dossier ne peut pas être rouvert.");
    if (!reason) return fail("Indiquez le motif de la réouverture.");
    tell(row.owner_id, `sav:${row.id}:reopened:${stamp}`, `${reference} rouvert`, reason);
    return done(
      {
        status: "in_progress",
        reopen_count: (Number(row.reopen_count) || 0) + 1,
        reopen_reason: reason,
        closed_at: null,
        resolved_at: null,
        reviewed_at: null,
        reviewed_by: null,
        client_informed: false,
        client_informed_at: null,
        next_action: "Reprendre l’intervention",
      },
      { kind: "reopened", from: row.status, to: "in_progress", reason },
    );
  }

  if (action === "cancel") {
    if (!isOwner && !isCreator && !canManage) return fail("Vous ne pouvez pas annuler ce dossier.");
    if (!reason) return fail("Indiquez le motif de l’annulation.");
    const target = isOwner ? row.created_by : row.owner_id;
    tell(target, `sav:${row.id}:cancelled:${stamp}`, `${reference} annulé`, reason);
    return done(
      { status: "cancelled", cancel_reason: reason, cancelled_at: new Date(now).toISOString(), next_action: null },
      { kind: "cancelled", from: row.status, to: "cancelled", reason },
    );
  }

  if (action === "reassign") {
    if (!canManage && !isCreator) return fail("Vous ne pouvez pas réassigner ce dossier.");
    if (!reason) return fail("Indiquez le motif de la réassignation.");
    const nextOwner = String(input.ownerId || input.owner_id || "").trim();
    if (!isSavUuid(nextOwner)) return fail("Choisissez un responsable.");
    if (nextOwner === String(row.owner_id)) return fail("Cette personne est déjà responsable.");
    const status = ["new", "to_qualify"].includes(row.status) ? "assigned" : row.status;
    tell(nextOwner, `sav:${row.id}:assigned:${nextOwner}:${stamp}`, `${reference} vous est assigné`, reason);
    return done(
      { owner_id: nextOwner, status, accepted_at: status === "assigned" ? null : row.accepted_at, accepted_by: status === "assigned" ? null : row.accepted_by },
      { kind: "reassigned", from: row.status, to: status, reason, payload: { from: row.owner_id, to: nextOwner } },
    );
  }

  if (action === "due") {
    if (!isOwner && !isCreator && !canManage) return fail("Vous ne pouvez pas modifier l’échéance.");
    if (!reason) return fail("Indiquez le motif du changement d’échéance.");
    const due = new Date(input.dueAt || input.due_at || "");
    if (Number.isNaN(due.getTime())) return fail("Indiquez une échéance.");
    if (row.due_at && new Date(row.due_at).getTime() === due.getTime()) return fail("L’échéance est déjà celle-ci.");
    tell(isOwner ? row.created_by : row.owner_id, `sav:${row.id}:due:${stamp}`, `Échéance modifiée · ${reference}`, reason);
    return done(
      { due_at: due.toISOString(), overdue_noted_at: null },
      { kind: "due_changed", reason, payload: { from: row.due_at || null, to: due.toISOString() } },
    );
  }

  return fail("Action inconnue.");
}

export function availableSavActions(row, { userId, canManage = false } = {}) {
  const probeOwner = "00000000-0000-4000-8000-000000000099";
  const input = {
    reason: "motif",
    result: "Compte rendu de l’intervention.",
    waitFor: "une pièce",
    waitUntil: "2026-12-01",
    side: "client",
    scheduledAt: "2026-12-02T09:00:00.000Z",
    dueAt: "2026-12-15T10:00:00.000Z",
    ownerId: String(row?.owner_id) === probeOwner ? "00000000-0000-4000-8000-000000000098" : probeOwner,
  };
  return ACTION_IDS.filter(action => decideSavAction(row, action, { userId, canManage, input, now: new Date("2026-10-03T12:00:00.000Z") }).ok);
}
