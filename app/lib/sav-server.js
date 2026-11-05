import { canViewOrgWideCommercialData } from "./scoping.js";
import { serviceRequest } from "./supabase-server.js";
import { normalizeRoleLabel } from "./roles.js";
import { formatClientNumber } from "./client-number.js";
import {
  assignmentNotificationKey,
  formatSavNumber,
  isSavOverdue,
  isSavUuid,
  savCategoryLabel,
  savChannelLabel,
  savPersonName,
  savPriorityLabel,
  decideSavAction,
  eventLabel,
  savStatusMeta,
  shouldRecordFirstOpen,
  validateCreateInput,
} from "./sav.js";

const LIST_SELECT = "id,organization_id,number,client_id,subject,category,priority,channel,status,owner_id,created_by,due_at,opened_at,next_action,created_at,updated_at";
const DETAIL_SELECT = `${LIST_SELECT},caller_name,caller_phone,description,opened_by,accepted_at,accepted_by,scheduled_at,intervened_at,next_action_at,wait_reason,wait_for,wait_until,block_reason,result_comment,reviewed_by,reviewed_at,client_informed,client_informed_at,resolved_at,closed_at,cancelled_at,reopen_count`;

export const MISSING_SAV_MESSAGE = "Le SAV n’est pas encore activé. Collez le script supabase/migrations/20261003_sav.sql dans Supabase, puis rechargez.";

export function isMissingSavTable(error) {
  const message = String(error?.message || "");
  return /sav_cases|sav_events|sav_counters|schema cache|PGRST205|does not exist|Could not find/i.test(message);
}

function canSeeAllSav(profile) {
  return canViewOrgWideCommercialData(profile) || normalizeRoleLabel(profile?.role) === "Responsable technique";
}

function clientName(row) {
  return row?.raison_sociale || [row?.prenom, row?.nom].filter(Boolean).join(" ") || "Client";
}

async function loadNames(ids) {
  const unique = [...new Set((ids || []).filter(isSavUuid))];
  if (!unique.length) return {};
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=id,full_name,email&id=in.(${unique.map(id => `"${id}"`).join(",")})`
  );
  return Object.fromEntries((rows || []).map(row => [row.id, savPersonName(row.full_name) || row.email || "—"]));
}

async function loadClients(ids) {
  const unique = [...new Set((ids || []).filter(isSavUuid))];
  if (!unique.length) return {};
  const select = "id,nom,prenom,raison_sociale,telephone,telephone_secondaire,client_number,adresse,code_postal,ville";
  let rows;
  try {
    rows = await serviceRequest(`/rest/v1/clients?select=${select}&id=in.(${unique.join(",")})`);
  } catch (error) {
    if (!/client_number/i.test(String(error?.message || ""))) throw error;
    rows = await serviceRequest(
      `/rest/v1/clients?select=id,nom,prenom,raison_sociale,telephone,telephone_secondaire&id=in.(${unique.join(",")})`
    );
  }
  return Object.fromEntries((rows || []).map(row => [row.id, {
    id: row.id,
    name: clientName(row),
    number: formatClientNumber(row.client_number) || "",
    phone: row.telephone || row.telephone_secondaire || "",
    address: row.adresse || "",
    postalCode: row.code_postal || "",
    city: row.ville || "",
  }]));
}

function presentCase(row, names, clients, now) {
  const meta = savStatusMeta(row.status);
  const client = clients[row.client_id] || null;
  return {
    id: row.id,
    number: row.number,
    reference: formatSavNumber(row.number),
    clientId: row.client_id,
    clientName: client?.name || "—",
    clientNumber: client?.number || "",
    clientPhone: client?.phone || "",
    clientAddress: client?.address || "",
    clientPostal: client?.postalCode || "",
    clientCity: client?.city || "",
    callerName: row.caller_name || "",
    callerPhone: row.caller_phone || "",
    subject: row.subject,
    description: row.description || "",
    category: row.category,
    categoryLabel: savCategoryLabel(row.category),
    priority: row.priority,
    priorityLabel: savPriorityLabel(row.priority),
    channel: row.channel,
    channelLabel: savChannelLabel(row.channel),
    status: row.status,
    statusLabel: meta.label,
    tone: meta.tone,
    ownerId: row.owner_id,
    ownerName: names[row.owner_id] || "—",
    createdBy: row.created_by,
    dueAt: row.due_at,
    openedAt: row.opened_at || null,
    openedByName: row.opened_by ? (names[row.opened_by] || "—") : "",
    nextAction: row.next_action || "",
    resultComment: row.result_comment || "",
    reviewedAt: row.reviewed_at || null,
    clientInformed: Boolean(row.client_informed),
    clientInformedAt: row.client_informed_at || null,
    scheduledAt: row.scheduled_at || null,
    waitReason: row.wait_reason || "",
    waitFor: row.wait_for || "",
    blockReason: row.block_reason || "",
    reopenCount: Number(row.reopen_count) || 0,
    overdue: isSavOverdue(row, now),
    unopened: !row.opened_at && row.status !== "closed" && row.status !== "cancelled",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function scopeFilter(auth) {
  if (canSeeAllSav(auth.profile)) return "";
  const id = auth.user.id;
  if (!isSavUuid(id)) return "&id=eq.00000000-0000-4000-8000-000000000000";
  return `&or=(owner_id.eq.${encodeURIComponent(id)},created_by.eq.${encodeURIComponent(id)})`;
}

async function loadPeople(orgId) {
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=id,full_name,role,active&organization_id=eq.${encodeURIComponent(orgId)}&active=eq.true&order=full_name.asc`
  );
  return (rows || [])
    .filter(row => normalizeRoleLabel(row.role) !== "Prospecteur terrain")
    .map(row => ({ id: row.id, name: savPersonName(row.full_name) || "Sans nom" }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function listSavCases(auth) {
  const orgId = auth.profile.organization_id;
  const now = new Date();
  const path = `/rest/v1/sav_cases?select=${LIST_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}${scopeFilter(auth)}&order=updated_at.desc&limit=200`;
  const [rows, people] = await Promise.all([serviceRequest(path), loadPeople(orgId)]);
  const names = await loadNames((rows || []).flatMap(row => [row.owner_id, row.created_by]));
  const clients = await loadClients((rows || []).map(row => row.client_id));
  return {
    cases: (rows || []).map(row => presentCase(row, names, clients, now)),
    people,
    me: { id: auth.user.id, canSeeAll: canSeeAllSav(auth.profile) },
  };
}

export async function searchSavClients(auth, query) {
  const term = String(query || "").trim().replace(/[%*,.()]/g, "").slice(0, 60);
  if (term.length < 2) return [];
  const orgId = auth.profile.organization_id;
  const digits = term.replace(/^MKL-CL-/i, "").replace(/\D/g, "");
  const filters = [`nom.ilike.*${term}*`, `prenom.ilike.*${term}*`, `raison_sociale.ilike.*${term}*`];
  if (digits) filters.push(`client_number.eq.${Number(digits)}`);
  const base = `/rest/v1/clients?organization_id=eq.${encodeURIComponent(orgId)}&or=(${filters.join(",")})&limit=8`;
  let rows;
  try {
    rows = await serviceRequest(`${base}&select=id,nom,prenom,raison_sociale,telephone,telephone_secondaire,client_number,adresse,code_postal,ville`);
  } catch (error) {
    if (!/client_number/i.test(String(error?.message || ""))) throw error;
    const plain = filters.filter(item => !item.startsWith("client_number")).join(",");
    rows = await serviceRequest(
      `/rest/v1/clients?select=id,nom,prenom,raison_sociale,telephone,telephone_secondaire&organization_id=eq.${encodeURIComponent(orgId)}&or=(${plain})&limit=8`
    );
  }
  return (rows || []).map(row => ({
    id: row.id,
    name: clientName(row),
    clientNumber: row.client_number || null,
    phone: row.telephone || row.telephone_secondaire || "",
    address: row.adresse || "",
    postalCode: row.code_postal || "",
    city: row.ville || "",
  }));
}

async function assertOwner(orgId, ownerId) {
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=id,organization_id,role,active&id=eq.${encodeURIComponent(ownerId)}&limit=1`
  );
  const profile = rows?.[0];
  if (!profile || String(profile.organization_id) !== String(orgId) || !profile.active) {
    return { ok: false, error: "Responsable introuvable." };
  }
  if (normalizeRoleLabel(profile.role) === "Prospecteur terrain") {
    return { ok: false, error: "Ce profil ne reçoit pas les dossiers SAV." };
  }
  return { ok: true };
}

async function loadClient(clientId) {
  try {
    const rows = await serviceRequest(
      `/rest/v1/clients?select=id,organization_id,nom,prenom,raison_sociale,telephone,telephone_secondaire,client_number,adresse,code_postal,ville&id=eq.${encodeURIComponent(clientId)}&limit=1`
    );
    return rows?.[0] || null;
  } catch (error) {
    if (!/client_number/i.test(String(error?.message || ""))) throw error;
    const rows = await serviceRequest(
      `/rest/v1/clients?select=id,organization_id,nom,prenom,raison_sociale,telephone,telephone_secondaire&id=eq.${encodeURIComponent(clientId)}&limit=1`
    );
    return rows?.[0] || null;
  }
}

async function writeEvent(orgId, caseId, authorId, event) {
  await serviceRequest("/rest/v1/sav_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: {
      organization_id: orgId,
      case_id: caseId,
      author_id: authorId || null,
      kind: event.kind,
      from_status: event.from || null,
      to_status: event.to || null,
      reason: event.reason || null,
      payload: event.payload || {},
    },
  });
}

async function notifyUsers(orgId, items) {
  for (const item of items || []) {
    await serviceRequest("/rest/v1/crm_notifications", {
      method: "POST",
      headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
      body: {
        organization_id: orgId,
        user_id: item.userId,
        title: item.title,
        body: item.body || null,
        kind: "sav",
        unique_key: item.key,
      },
    }).catch(() => null);
  }
}

export async function createSavCase(auth, body) {
  const parsed = validateCreateInput(body);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  const owner = await assertOwner(auth.profile.organization_id, parsed.value.ownerId);
  if (!owner.ok) return { ok: false, status: 400, error: owner.error };
  const client = await loadClient(parsed.value.clientId);
  if (!client || String(client.organization_id) !== String(auth.profile.organization_id)) {
    return { ok: false, status: 400, error: "Client introuvable." };
  }
  const hasPhone = Boolean(client.telephone || client.telephone_secondaire);
  const inserted = await serviceRequest("/rest/v1/sav_cases", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      organization_id: auth.profile.organization_id,
      client_id: parsed.value.clientId,
      caller_name: parsed.value.callerName || null,
      caller_phone: hasPhone ? null : (parsed.value.callerPhone || null),
      subject: parsed.value.subject,
      description: parsed.value.description,
      category: parsed.value.category,
      priority: parsed.value.priority,
      channel: parsed.value.channel,
      status: "new",
      owner_id: parsed.value.ownerId,
      created_by: auth.user.id,
      due_at: parsed.value.dueAt,
    },
  });
  const row = Array.isArray(inserted) ? inserted[0] : inserted;
  if (!row?.id) return { ok: false, status: 502, error: "Le dossier n’a pas été enregistré." };
  await writeEvent(auth.profile.organization_id, row.id, auth.user.id, { kind: "created", to: "new" });
  if (parsed.value.ownerId !== auth.user.id) {
    const reference = formatSavNumber(row.number) || "SAV";
    await notifyUsers(auth.profile.organization_id, [{
      userId: parsed.value.ownerId,
      key: assignmentNotificationKey(row.id, parsed.value.ownerId),
      title: `${reference} vous est assigné`,
      body: parsed.value.subject,
    }]);
  }
  return getSavCase(auth, row.id, { skipOpen: true });
}

async function loadRow(auth, id) {
  if (!isSavUuid(id)) return null;
  const rows = await serviceRequest(
    `/rest/v1/sav_cases?select=${DETAIL_SELECT}&id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}&limit=1`
  );
  return rows?.[0] || null;
}

function canSee(auth, row) {
  if (!row) return false;
  if (canSeeAllSav(auth.profile)) return true;
  return String(row.owner_id) === String(auth.user.id) || String(row.created_by) === String(auth.user.id);
}

export async function getSavCase(auth, id, { skipOpen = false } = {}) {
  let row = await loadRow(auth, id);
  if (!row || !canSee(auth, row)) return { ok: false, status: 404, error: "Dossier introuvable." };
  const now = new Date();
  if (!skipOpen && shouldRecordFirstOpen(row)) {
    const updated = await serviceRequest(
      `/rest/v1/sav_cases?id=eq.${encodeURIComponent(row.id)}&opened_at=is.null`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: { opened_at: now.toISOString(), opened_by: auth.user.id, updated_at: now.toISOString() },
      }
    );
    const opened = Array.isArray(updated) ? updated[0] : null;
    if (opened) {
      row = opened;
      await writeEvent(auth.profile.organization_id, row.id, auth.user.id, { kind: "opened", from: row.status, to: row.status });
    }
  }
  const events = await serviceRequest(
    `/rest/v1/sav_events?select=id,author_id,kind,from_status,to_status,reason,created_at&case_id=eq.${encodeURIComponent(row.id)}&order=created_at.asc`
  );
  const names = await loadNames([row.owner_id, row.created_by, row.opened_by, ...(events || []).map(item => item.author_id)]);
  const clients = await loadClients([row.client_id]);
  const nameOf = personId => names[personId] || "—";
  return {
    ok: true,
    case: {
      ...presentCase(row, names, clients, now),
      events: (events || []).map(item => ({
        id: item.id,
        kind: item.kind,
        label: eventLabel(item.kind),
        reason: item.reason || "",
        authorName: item.author_id ? nameOf(item.author_id) : "CRM",
        createdAt: item.created_at,
      })),
    },
  };
}

export async function actOnSavCase(auth, id, body = {}) {
  const row = await loadRow(auth, id);
  if (!row || !canSee(auth, row)) return { ok: false, status: 404, error: "Dossier introuvable." };
  const action = String(body.action || "").trim();
  if (action === "reassign") {
    const owner = await assertOwner(auth.profile.organization_id, body.ownerId || body.owner_id);
    if (!owner.ok) return { ok: false, status: 400, error: owner.error };
  }
  const decision = decideSavAction(row, action, {
    userId: auth.user.id,
    canManage: canSeeAllSav(auth.profile),
    input: body,
  });
  if (!decision.ok) return { ok: false, status: 400, error: decision.error };
  if (Object.keys(decision.patch).length) {
    await serviceRequest(`/rest/v1/sav_cases?id=eq.${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: decision.patch,
    });
  }
  await writeEvent(auth.profile.organization_id, row.id, auth.user.id, decision.event);
  await notifyUsers(auth.profile.organization_id, decision.notifications);
  return getSavCase(auth, row.id, { skipOpen: true });
}
