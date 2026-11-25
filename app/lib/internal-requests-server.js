import { canViewOrgWideCommercialData } from "./scoping.js";
import { canAccessScopedRow } from "./scoping.js";
import { loadTeamMemberIds } from "./team-scope.js";
import { serviceRequest } from "./supabase-server.js";
import { normalizeRoleLabel } from "./roles.js";
import {
  assignmentNotificationKey,
  decideRequestAction,
  eventLabel,
  formatRequestNumber,
  isRequestOverdue,
  isRequestUuid,
  openedNotificationKey,
  overdueNotificationKey,
  requestAssigneeIds,
  requestConcernsUser,
  requestStatusMeta,
  shouldNoteOverdue,
  shouldRecordFirstOpen,
  ticketPersonName,
  validateCreateInput,
} from "./internal-requests.js";

const LIST_SELECT = "id,organization_id,number,title,status,priority,requester_id,assignee_id,assignee_ids,client_id,due_at,opened_at,overdue_noted_at,wait_reason,block_reason,created_at,updated_at";
const DETAIL_SELECT = `${LIST_SELECT},description,accepted_at,completed_at,response_sent_at,closed_at,cancelled_at,wait_for,wait_until,result_comment,cancel_reason`;

export const MISSING_REQUESTS_MESSAGE = "Les tickets internes ne sont pas encore activés. Collez le script supabase/migrations/20261003_internal_requests.sql dans Supabase, puis rechargez.";
export const MISSING_ASSIGNEES_MESSAGE = "Les destinataires multiples ne sont pas encore activés. Collez aussi supabase/migrations/20261003_internal_request_assignees.sql dans Supabase, puis rechargez.";

export function isMissingAssigneeColumn(error) {
  return /assignee_ids/i.test(String(error?.message || ""));
}

export function isMissingRequestsTable(error) {
  const message = String(error?.message || "");
  if (isMissingAssigneeColumn(error)) return false;
  return /internal_requests|internal_request_|schema cache|PGRST205|does not exist|Could not find/i.test(message);
}

function canManageRequests(profile) {
  return canViewOrgWideCommercialData(profile);
}

async function loadNames(ids) {
  const unique = [...new Set((ids || []).filter(isRequestUuid))];
  if (!unique.length) return {};
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=id,full_name,email&id=in.(${unique.map(id => `"${id}"`).join(",")})`
  );
  return Object.fromEntries((rows || []).map(row => [row.id, ticketPersonName(row.full_name) || row.email || "—"]));
}

function presentRequest(row, names, now, extras = {}) {
  const meta = requestStatusMeta(row.status);
  return {
    id: row.id,
    number: row.number,
    reference: formatRequestNumber(row.number),
    title: row.title,
    description: row.description || "",
    status: row.status,
    statusLabel: meta.label,
    tone: meta.tone,
    priority: row.priority === "urgent" ? "urgent" : "normal",
    requesterId: row.requester_id,
    assigneeId: requestAssigneeIds(row)[0] || row.assignee_id,
    assigneeIds: requestAssigneeIds(row),
    requesterName: names[row.requester_id] || "—",
    assigneeName: requestAssigneeIds(row).map(id => names[id]).filter(Boolean).join(", ") || "—",
    clientId: row.client_id || null,
    dueAt: row.due_at,
    openedAt: row.opened_at || null,
    overdue: isRequestOverdue(row, now),
    waitReason: row.wait_reason || "",
    waitFor: row.wait_for || "",
    waitUntil: row.wait_until || "",
    blockReason: row.block_reason || "",
    resultComment: row.result_comment || "",
    cancelReason: row.cancel_reason || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extras,
  };
}

function scopeFilter(auth) {
  const id = String(auth?.user?.id || "").trim();
  if (!isRequestUuid(id)) return "&id=eq.00000000-0000-4000-8000-000000000000";
  return `&or=(requester_id.eq.${id},assignee_id.eq.${id},assignee_ids.cs.{${id}})`;
}

async function loadPeople(orgId) {
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=id,full_name,role,active&organization_id=eq.${encodeURIComponent(orgId)}&active=eq.true&order=full_name.asc`
  );
  return (rows || [])
    .filter(row => normalizeRoleLabel(row.role) !== "Prospecteur terrain")
    .map(row => ({ id: row.id, name: ticketPersonName(row.full_name) || "Sans nom" }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function listInternalRequests(auth) {
  const orgId = auth.profile.organization_id;
  const now = new Date();
  const path = `/rest/v1/internal_requests?select=${LIST_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}${scopeFilter(auth)}&order=updated_at.desc&limit=200`;
  const [loaded, people] = await Promise.all([serviceRequest(path), loadPeople(orgId)]);
  const rows = (loaded || []).filter(row => requestConcernsUser(row, auth.user.id));
  const names = await loadNames(rows.flatMap(row => [row.requester_id, ...requestAssigneeIds(row)]));
  return {
    requests: rows.map(row => presentRequest(row, names, now)),
    people,
    me: {
      id: auth.user.id,
      canSeeAll: false,
      canSeeTeam: false,
    },
  };
}

async function assertAssignee(orgId, assigneeId) {
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=id,organization_id,role,active&id=eq.${encodeURIComponent(assigneeId)}&limit=1`
  );
  const profile = rows?.[0];
  if (!profile || String(profile.organization_id) !== String(orgId) || !profile.active) {
    return { ok: false, error: "Responsable introuvable." };
  }
  if (normalizeRoleLabel(profile.role) === "Prospecteur terrain") {
    return { ok: false, error: "Ce profil ne reçoit pas les tickets internes." };
  }
  return { ok: true };
}

async function assertClient(auth, clientId) {
  if (!clientId) return { ok: true };
  const rows = await serviceRequest(
    `/rest/v1/clients?select=id,organization_id,commercial_id,created_by&id=eq.${encodeURIComponent(clientId)}&limit=1`
  );
  const client = rows?.[0];
  if (!client || String(client.organization_id) !== String(auth.profile.organization_id)) {
    return { ok: false, error: "Client introuvable." };
  }
  const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id);
  if (!canAccessScopedRow(auth.profile, auth.user.id, client, teamIds || [])) {
    return { ok: false, error: "Ce client n’est pas accessible." };
  }
  return { ok: true };
}

async function writeEvent(orgId, requestId, authorId, event) {
  await serviceRequest("/rest/v1/internal_request_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: {
      organization_id: orgId,
      request_id: requestId,
      author_id: authorId || null,
      kind: event.kind,
      from_status: event.from || null,
      to_status: event.to || null,
      reason: event.reason || null,
      payload: event.payload || {},
    },
  });
}

async function notifyUsers(orgId, requestId, items) {
  for (const item of items || []) {
    const payload = {
      organization_id: orgId,
      user_id: item.userId,
      title: item.title,
      body: item.body || null,
      kind: "request",
      unique_key: item.key,
      request_id: requestId,
    };
    try {
      await serviceRequest("/rest/v1/crm_notifications", {
        method: "POST",
        headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
        body: payload,
      });
    } catch (error) {
      if (!/request_id/i.test(String(error?.message || ""))) continue;
      const { request_id, ...rest } = payload;
      await serviceRequest("/rest/v1/crm_notifications", {
        method: "POST",
        headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
        body: rest,
      }).catch(() => null);
    }
  }
}

export async function createInternalRequest(auth, body) {
  const parsed = validateCreateInput(body);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  for (const assigneeId of parsed.value.assigneeIds) {
    const assignee = await assertAssignee(auth.profile.organization_id, assigneeId);
    if (!assignee.ok) return { ok: false, status: 400, error: assignee.error };
  }
  const client = await assertClient(auth, parsed.value.clientId);
  if (!client.ok) return { ok: false, status: 400, error: client.error };
  const inserted = await serviceRequest("/rest/v1/internal_requests", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      organization_id: auth.profile.organization_id,
      title: parsed.value.title,
      description: parsed.value.description,
      status: "sent",
      priority: parsed.value.priority,
      requester_id: auth.user.id,
      assignee_id: parsed.value.assigneeIds[0],
      assignee_ids: parsed.value.assigneeIds,
      client_id: parsed.value.clientId,
      due_at: parsed.value.dueAt,
    },
  });
  const row = Array.isArray(inserted) ? inserted[0] : inserted;
  if (!row?.id) return { ok: false, status: 502, error: "Le ticket n’a pas été enregistré." };
  await writeEvent(auth.profile.organization_id, row.id, auth.user.id, { kind: "created", to: "sent" });
  const reference = formatRequestNumber(row.number) || "Ticket";
  await notifyUsers(auth.profile.organization_id, row.id, parsed.value.assigneeIds.filter(id => id !== auth.user.id).map(userId => ({
    userId,
    key: assignmentNotificationKey(row.id, userId),
    title: `${reference} vous est assigné`,
    body: parsed.value.title,
  })));
  return getInternalRequest(auth, row.id);
}

async function loadRow(auth, id) {
  if (!isRequestUuid(id)) return null;
  const rows = await serviceRequest(
    `/rest/v1/internal_requests?select=${DETAIL_SELECT}&id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}&limit=1`
  );
  return rows?.[0] || null;
}

function canSee(auth, row) {
  return requestConcernsUser(row, auth?.user?.id);
}

async function loadClientRow(clientId) {
  const withNumber = "id,organization_id,nom,prenom,raison_sociale,client_number,commercial_id,created_by";
  try {
    const rows = await serviceRequest(
      `/rest/v1/clients?select=${withNumber}&id=eq.${encodeURIComponent(clientId)}&limit=1`
    );
    return rows?.[0] || null;
  } catch (error) {
    if (!/client_number/i.test(String(error?.message || ""))) throw error;
    const rows = await serviceRequest(
      `/rest/v1/clients?select=id,organization_id,nom,prenom,raison_sociale,commercial_id,created_by&id=eq.${encodeURIComponent(clientId)}&limit=1`
    );
    return rows?.[0] || null;
  }
}

async function clientView(auth, clientId) {
  if (!clientId) return null;
  const client = await loadClientRow(clientId);
  if (!client) return null;
  const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id);
  if (!canAccessScopedRow(auth.profile, auth.user.id, client, teamIds || [])) return null;
  const name = client.raison_sociale || [client.prenom, client.nom].filter(Boolean).join(" ") || "Client";
  return { id: client.id, name, number: client.client_number || null };
}

async function noteOverdue(auth, row) {
  const now = new Date();
  if (!shouldNoteOverdue(row, now)) return row;
  const updated = await serviceRequest(
    `/rest/v1/internal_requests?id=eq.${encodeURIComponent(row.id)}&overdue_noted_at=is.null`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: { overdue_noted_at: now.toISOString(), updated_at: now.toISOString() },
    }
  );
  const next = Array.isArray(updated) ? updated[0] : null;
  if (!next) return { ...row, overdue_noted_at: row.overdue_noted_at || now.toISOString() };
  await writeEvent(auth.profile.organization_id, row.id, null, { kind: "overdue" });
  const reference = formatRequestNumber(row.number) || "Ticket";
  const seen = new Set();
  const items = [...requestAssigneeIds(row), row.requester_id].filter(id => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map(userId => ({
    userId,
    key: overdueNotificationKey(row.id, userId),
    title: `${reference} est en retard`,
    body: row.title,
  }));
  await notifyUsers(auth.profile.organization_id, row.id, items);
  return next;
}

export async function getInternalRequest(auth, id, { skipOpen = false } = {}) {
  let row = await loadRow(auth, id);
  if (!row || !(await canSee(auth, row))) return { ok: false, status: 404, error: "Ticket introuvable." };
  const now = new Date();
  if (!skipOpen && shouldRecordFirstOpen(row, auth.user.id)) {
    const updated = await serviceRequest(
      `/rest/v1/internal_requests?id=eq.${encodeURIComponent(row.id)}&opened_at=is.null&status=eq.sent`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: { status: "opened", opened_at: now.toISOString(), updated_at: now.toISOString() },
      }
    );
    const opened = Array.isArray(updated) ? updated[0] : null;
    if (opened) {
      row = opened;
      await writeEvent(auth.profile.organization_id, row.id, auth.user.id, { kind: "opened", from: "sent", to: "opened" });
      const reference = formatRequestNumber(row.number) || "Ticket";
      await notifyUsers(auth.profile.organization_id, row.id, [{
        userId: row.requester_id,
        key: openedNotificationKey(row.id),
        title: `${reference} a été ouvert`,
        body: row.title,
      }]);
    }
  }
  row = await noteOverdue(auth, row);
  const [events, messages, client] = await Promise.all([
    serviceRequest(`/rest/v1/internal_request_events?select=id,author_id,kind,from_status,to_status,reason,payload,created_at&request_id=eq.${encodeURIComponent(row.id)}&order=created_at.asc`),
    serviceRequest(`/rest/v1/internal_request_messages?select=id,author_id,body,created_at&request_id=eq.${encodeURIComponent(row.id)}&order=created_at.asc`),
    clientView(auth, row.client_id),
  ]);
  const names = await loadNames([
    row.requester_id,
    ...requestAssigneeIds(row),
    ...(events || []).map(item => item.author_id),
    ...(messages || []).map(item => item.author_id),
  ]);
  const nameOf = personId => names[personId] || "—";
  return {
    ok: true,
    request: presentRequest(row, names, now, {
      client,
      events: (events || []).map(item => ({
        id: item.id,
        kind: item.kind,
        label: eventLabel(item.kind),
        fromStatus: item.from_status,
        toStatus: item.to_status,
        reason: item.reason || "",
        authorName: item.author_id ? nameOf(item.author_id) : "CRM",
        createdAt: item.created_at,
      })),
      messages: (messages || []).map(item => ({
        id: item.id,
        body: item.body,
        authorName: nameOf(item.author_id),
        mine: String(item.author_id) === String(auth.user.id),
        createdAt: item.created_at,
      })),
    }),
  };
}

export async function actOnInternalRequest(auth, id, body = {}) {
  const row = await loadRow(auth, id);
  if (!row || !(await canSee(auth, row))) return { ok: false, status: 404, error: "Ticket introuvable." };
  const action = String(body.action || "").trim();
  if (action === "reassign") {
    const ids = Array.isArray(body.assigneeIds) && body.assigneeIds.length ? body.assigneeIds : [body.assigneeId || body.assignee_id];
    for (const assigneeId of ids) {
      const assignee = await assertAssignee(auth.profile.organization_id, assigneeId);
      if (!assignee.ok) return { ok: false, status: 400, error: assignee.error };
    }
  }
  const decision = decideRequestAction(row, action, {
    userId: auth.user.id,
    canManage: canManageRequests(auth.profile),
    canParticipate: true,
    input: body,
  });
  if (!decision.ok) return { ok: false, status: 400, error: decision.error };
  if (action === "comment") {
    await serviceRequest("/rest/v1/internal_request_messages", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: {
        organization_id: auth.profile.organization_id,
        request_id: row.id,
        author_id: auth.user.id,
        body: String(body.body || "").trim(),
      },
    });
  }
  if (Object.keys(decision.patch).length) {
    await serviceRequest(`/rest/v1/internal_requests?id=eq.${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: decision.patch,
    });
  }
  await writeEvent(auth.profile.organization_id, row.id, auth.user.id, decision.event);
  await notifyUsers(auth.profile.organization_id, row.id, decision.notifications);
  return getInternalRequest(auth, row.id, { skipOpen: true });
}
