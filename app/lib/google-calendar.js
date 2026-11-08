import { encryptSecret, decryptSecret } from "./google-token-crypto";
import {
  findOverlaps,
  googleEventPayload,
  googleCalendarsToImport,
  googleEventToRecord,
  isAuxiliaryGoogleCalendar,
  nextAvailableSlots,
} from "./agenda";
import { actorFromAuth, logActivity } from "./log-activity";
import { ACTIVITY_ACTIONS } from "./activity-logs";
import { sendMail } from "./send-mail";
import { serviceRequest } from "./supabase-server";
import { APPOINTMENT_SELECT, isMissingCommercialTable } from "./prospects";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR = "https://www.googleapis.com/calendar/v3";
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");
const DEFAULT_PROD_REDIRECT = "https://crm-mkl-energeies.vercel.app/api/google/calendar/callback";

export function googleOAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(request) {
  const explicit = String(process.env.GOOGLE_REDIRECT_URI || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (request) {
    try {
      const origin = new URL(request.url).origin.replace(/\/$/, "");
      if (origin.includes("localhost") || origin.includes("crm-mkl-energeies.vercel.app")) {
        return `${origin}/api/google/calendar/callback`;
      }
    } catch {}
  }
  return DEFAULT_PROD_REDIRECT;
}

export { encryptSecret, decryptSecret };

export function googleAuthUrl({ state, request }) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(request),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

export async function exchangeGoogleCode(code, request) {
  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(request),
      grant_type: "authorization_code",
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || "Échange OAuth Google impossible.");
  return data;
}

async function refreshGoogleToken(refreshToken) {
  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || "Rafraîchissement Google impossible.");
  return data;
}

export async function loadGoogleAccount(userId) {
  const rows = await serviceRequest(
    `/rest/v1/google_calendar_accounts?select=*&user_id=eq.${encodeURIComponent(userId)}&limit=1`
  ).catch(() => []);
  return rows?.[0] || null;
}

export async function listOrgGoogleAccounts(orgId) {
  const rows = await serviceRequest(
    `/rest/v1/google_calendar_accounts?organization_id=eq.${encodeURIComponent(orgId)}&select=id,user_id,google_email,calendar_id,status`
  ).catch(() => []);
  return (rows || []).filter(row => row.status !== "disconnected");
}

async function googleAccessToken(account) {
  if (!account?.refresh_token_enc && !account?.access_token_enc) {
    throw new Error("Compte Google déconnecté.");
  }
  const expires = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  if (account.access_token_enc && expires > Date.now() + 60000) {
    return decryptSecret(account.access_token_enc);
  }
  const refreshed = await refreshGoogleToken(decryptSecret(account.refresh_token_enc));
  const token = refreshed.access_token;
  await serviceRequest(
    `/rest/v1/google_calendar_accounts?id=eq.${encodeURIComponent(account.id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: {
        access_token_enc: encryptSecret(token),
        token_expires_at: new Date(Date.now() + Number(refreshed.expires_in || 3600) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
        last_error: null,
        status: "connected",
      },
    }
  ).catch(() => null);
  return token;
}

async function googleFetch(account, path, { method = "GET", body } = {}) {
  const token = await googleAccessToken(account);
  const response = await fetch(`${GOOGLE_CALENDAR}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || `Google Calendar ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function fetchCalendarListPage(account, extraParams = {}) {
  const items = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ maxResults: "250", ...extraParams });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await googleFetch(account, `/users/me/calendarList?${params}`);
    items.push(...(data.items || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken && items.length < 500);
  return items;
}

export async function listGoogleCalendars(account) {
  let lastError = null;
  const visible = await fetchCalendarListPage(account).catch(error => {
    lastError = error;
    return [];
  });
  const hidden = await fetchCalendarListPage(account, { showHidden: "true" }).catch(error => {
    lastError = lastError || error;
    return [];
  });
  const visibleById = new Map();
  for (const item of visible) if (item?.id) visibleById.set(item.id, item);
  const byId = new Map();
  for (const item of [...hidden, ...visible]) {
    if (item?.id) byId.set(item.id, item);
  }
  const calendars = [...byId.values()].map(item => {
    const onSidebar = visibleById.has(item.id);
    const summary = item.summaryOverride || item.summary || "";
    return {
      id: item.id,
      summary: summary || item.id,
      primary: Boolean(item.primary),
      selected: item.selected === true || (onSidebar && item.selected !== false && item.hidden !== true),
      onSidebar,
      accessRole: item.accessRole || "",
      hidden: Boolean(item.hidden) && !onSidebar,
      backgroundColor: /^#[0-9a-f]{6}$/i.test(item.backgroundColor || "") ? item.backgroundColor : "",
    };
  });
  if (!calendars.length && lastError) throw lastError;
  if (!calendars.some(item => item.primary || item.id === "primary" || item.id === account.calendar_id)) {
    calendars.unshift({
      id: account.calendar_id || "primary",
      summary: "Mon agenda",
      primary: true,
      selected: true,
      accessRole: "owner",
    });
  }
  return calendars.sort((a, b) => Number(b.primary) - Number(a.primary) || a.summary.localeCompare(b.summary, "fr"));
}

export { googleEventToRecord };

export async function listGoogleEvents(account, { timeMin, timeMax, maxItems = 400, calendarId, orderBy = "startTime" } = {}) {
  const encodedCalendarId = encodeURIComponent(calendarId || account.calendar_id || "primary");
  const min = timeMin || new Date(Date.now() - 30 * 86400000).toISOString();
  const max = timeMax || new Date(Date.now() + 120 * 86400000).toISOString();
  const items = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      timeMin: min,
      timeMax: max,
      singleEvents: "true",
      maxResults: "250",
    });
    if (orderBy) params.set("orderBy", orderBy);
    if (pageToken) params.set("pageToken", pageToken);
    const data = await googleFetch(account, `/calendars/${encodedCalendarId}/events?${params}`);
    items.push(...(data.items || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken && items.length < maxItems);
  const unique = [];
  const seen = new Set();
  for (const item of items) {
    if (!item?.id || item.status === "cancelled" || seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
}

export async function listGoogleEventsOnCalendars(account, { calendarIds } = {}) {
  const listed = await listGoogleCalendars(account);
  const calendars = googleCalendarsToImport(listed, calendarIds);
  const events = [];
  const errors = [];
  for (const calendar of calendars) {
    try {
      const rows = await listGoogleEvents(account, { calendarId: calendar.id, maxItems: 800 });
      events.push(...rows.map(event => ({
        ...event,
        _calendarId: calendar.id,
        _calendarSummary: calendar.summary,
      })));
    } catch (error) {
      errors.push(`${calendar.summary || calendar.id} : ${error?.message || "illisible"}`);
    }
  }
  if (!events.length && errors.length && errors.length === calendars.length) {
    throw new Error(errors[0]);
  }
  return { events, calendars, errors };
}

function shiftIsoDate(date, { years = 0, months = 0 } = {}) {
  const next = new Date(date);
  if (years) next.setFullYear(next.getFullYear() + years);
  if (months) next.setMonth(next.getMonth() + months);
  return next;
}

function mergeCalendarEvents(target, rows, seen) {
  for (const item of rows || []) {
    if (!item?.id || item.status === "cancelled" || seen.has(item.id)) continue;
    seen.add(item.id);
    target.push(item);
  }
}

async function eventsInRange(account, calendarId, from, to, maxItems = 2500) {
  try {
    return await listGoogleEvents(account, {
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      maxItems,
      calendarId,
    });
  } catch (error) {
    const message = String(error?.message || "");
    if (!/orderBy|Bad Request|invalid/i.test(message)) throw error;
    return listGoogleEvents(account, {
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      maxItems,
      calendarId,
      orderBy: "",
    });
  }
}

export async function listGoogleEventsHistory(account, { years = 8, futureYears = 2, calendarId } = {}) {
  const now = new Date();
  const recentFrom = new Date(now.getTime() - 60 * 86400000);
  const recentTo = new Date(now.getTime() + 21 * 86400000);
  const historyStart = shiftIsoDate(now, { years: -Number(years || 8) });
  const historyEnd = shiftIsoDate(now, { years: Number(futureYears || 2) });
  const unique = [];
  const seen = new Set();
  mergeCalendarEvents(unique, await eventsInRange(account, calendarId, recentFrom, recentTo, 8000), seen);
  if (historyEnd > recentTo) {
    mergeCalendarEvents(unique, await eventsInRange(account, calendarId, recentTo, historyEnd, 2500), seen);
  }
  let cursor = recentFrom;
  while (cursor > historyStart) {
    const prev = shiftIsoDate(cursor, { months: -12 });
    const chunkMin = prev > historyStart ? prev : historyStart;
    const rows = await eventsInRange(account, calendarId, chunkMin, cursor, 4000);
    mergeCalendarEvents(unique, rows, seen);
    if (rows.length >= 4000) {
      const tailFrom = new Date(cursor.getTime() - 90 * 86400000);
      if (tailFrom > chunkMin) {
        mergeCalendarEvents(unique, await eventsInRange(account, calendarId, tailFrom, cursor, 2500), seen);
      }
    }
    cursor = chunkMin;
  }
  return unique;
}

const SKIP_CALENDAR = isAuxiliaryGoogleCalendar;

export async function listGoogleEventsHistoryFromAccount(account, { years = 8, calendarIds } = {}) {
  const listed = await listGoogleCalendars(account).catch(() => []);
  const wanted = [...new Set((calendarIds || []).map(id => String(id || "").trim()).filter(Boolean))];
  const byId = new Map();
  for (const calendar of listed) {
    if (SKIP_CALENDAR(calendar)) continue;
    byId.set(calendar.id, calendar);
  }
  if (!byId.size) {
    byId.set(account.calendar_id || "primary", { id: account.calendar_id || "primary", summary: "Agenda", primary: true });
  }
  for (const id of wanted) {
    if (!byId.has(id)) byId.set(id, { id, summary: id, primary: id === "primary" || id === account.calendar_id });
  }
  const calendars = wanted.length ? wanted.map(id => byId.get(id)).filter(Boolean) : [...byId.values()];
  const events = [];
  const errors = [];
  for (const calendar of calendars) {
    try {
      const rows = await listGoogleEventsHistory(account, { years, calendarId: calendar.id });
      events.push(...rows.map(event => ({
        ...event,
        _calendarId: calendar.id,
        _calendarSummary: calendar.summary,
      })));
    } catch (error) {
      const message = String(error?.message || "illisible");
      const hint = /insufficient|forbidden|403/i.test(message)
        ? "pas le droit de voir le détail (occupé/libre seulement)"
        : /not found|404/i.test(message)
          ? "agenda introuvable pour ce compte Google"
          : message;
      errors.push({ id: calendar.id, summary: calendar.summary, error: hint });
    }
  }
  return { events, calendars, errors };
}

export async function syncAppointmentToGoogle(appointment, { crmUrl = "" } = {}) {
  if (!appointment?.commercialId) return { status: "none" };
  const account = await loadGoogleAccount(appointment.commercialId);
  if (!account || account.status === "disconnected") {
    return { status: "Compte Google déconnecté" };
  }
  try {
    const payload = googleEventPayload(appointment, { crmUrl });
    const calendarId = encodeURIComponent(account.calendar_id || "primary");
    let event;
    if (appointment.googleEventId) {
      event = await googleFetch(account, `/calendars/${calendarId}/events/${encodeURIComponent(appointment.googleEventId)}`, {
        method: "PATCH",
        body: payload,
      });
    } else {
      event = await googleFetch(account, `/calendars/${calendarId}/events`, {
        method: "POST",
        body: payload,
      });
    }
    return {
      status: "Synchronisé",
      googleEventId: event.id,
      googleCalendarId: account.calendar_id || "primary",
      lastSyncedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "Erreur de synchronisation",
      syncError: String(error?.message || error),
    };
  }
}

export async function deleteGoogleEvent(appointment) {
  if (!appointment?.googleEventId || !appointment.commercialId) return { status: "none" };
  const account = await loadGoogleAccount(appointment.commercialId);
  if (!account || account.status === "disconnected") return { status: "none" };
  try {
    const calendarId = encodeURIComponent(appointment.googleCalendarId || account.calendar_id || "primary");
    await googleFetch(account, `/calendars/${calendarId}/events/${encodeURIComponent(appointment.googleEventId)}`, {
      method: "DELETE",
    });
    return { status: "deleted" };
  } catch {
    return { status: "Erreur de synchronisation" };
  }
}

export async function pullGoogleEvent(appointment) {
  if (!appointment?.googleEventId || !appointment.commercialId) return null;
  const account = await loadGoogleAccount(appointment.commercialId);
  if (!account || account.status === "disconnected") return null;
  try {
    const calendarId = encodeURIComponent(appointment.googleCalendarId || account.calendar_id || "primary");
    const event = await googleFetch(account, `/calendars/${calendarId}/events/${encodeURIComponent(appointment.googleEventId)}`);
    const start = event.start?.dateTime || event.start?.date;
    const end = event.end?.dateTime || event.end?.date;
    if (!start) return null;
    const duration = end
      ? Math.max(15, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
      : appointment.duration;
    return { start, duration, lastSyncedAt: new Date().toISOString(), status: "Synchronisé" };
  } catch (error) {
    return { status: "Erreur de synchronisation", syncError: String(error?.message || error) };
  }
}

export async function loadBusyGoogleSlots(userId, timeMin, timeMax) {
  const account = await loadGoogleAccount(userId);
  if (!account || account.status === "disconnected") return [];
  try {
    const events = await listGoogleEvents(account, { timeMin, timeMax });
    return events.map(event => {
      const record = googleEventToRecord(event, {
        commercialId: userId,
        calendarId: account.calendar_id || "primary",
      });
      if (!record) return null;
      return {
        id: `google:${event.id}`,
        start: record.starts_at,
        duration: record.duration_minutes,
        commercialId: userId,
        status: "Planifié",
        kind: "busy",
        prospectName: record.prospect_name,
        subject: record.extra.subject,
        address: record.extra.address,
        notes: record.notes || "",
        source: "google",
        private: false,
        googleEventId: event.id,
      };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

export async function writeAppointmentHistory({ orgId, appointmentId, auth, field, oldValue, newValue, action }) {
  if (!appointmentId) return;
  const oldStored = oldValue === undefined ? null : oldValue;
  const newStored = newValue === undefined ? null : newValue;
  if (JSON.stringify(oldStored ?? null) === JSON.stringify(newStored ?? null)) return;
  const body = {
    organization_id: orgId,
    appointment_id: appointmentId,
    user_id: auth?.user?.id || null,
    user_name: auth?.profile?.full_name || auth?.profile?.email || null,
    field,
    action: action || null,
    old_value: oldStored,
    new_value: newStored,
  };
  try {
    await serviceRequest("/rest/v1/appointment_history", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body,
    });
  } catch (error) {
    if (!/action/i.test(String(error?.message || ""))) return;
    const { action: _ignored, ...rest } = body;
    await serviceRequest("/rest/v1/appointment_history", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: rest,
    }).catch(() => null);
  }
}

async function profileEmail(userId) {
  if (!userId) return "";
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=email&id=eq.${encodeURIComponent(userId)}&limit=1`
  ).catch(() => []);
  return rows?.[0]?.email || "";
}

export async function notifyUser({ orgId, userId, appointmentId, title, body, uniqueKey, email, sendEmail = false }) {
  if (!userId) return;
  await serviceRequest("/rest/v1/crm_notifications", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: {
      organization_id: orgId,
      user_id: userId,
      appointment_id: appointmentId || null,
      title,
      body: body || "",
      channel: "crm",
      kind: "agenda",
      unique_key: uniqueKey || null,
    },
  }).catch(() => null);
  const to = email || (sendEmail ? await profileEmail(userId) : "");
  if (sendEmail && to) {
    await sendMail({
      to,
      subject: title,
      html: `<p>${body || title}</p>`,
    }).catch(() => null);
  }
}

export async function assertNoConflict({ orgId, record, excludeId, force, canOverride, commercialId, allowStack = false }) {
  if (!commercialId || allowStack) return { overlaps: [], suggestions: [] };
  const rows = await serviceRequest(
    `/rest/v1/commercial_appointments?select=${APPOINTMENT_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&commercial_id=eq.${encodeURIComponent(commercialId)}&order=starts_at.asc`
  ).catch(() => []);
  const busy = await loadBusyGoogleSlots(
    commercialId,
    new Date(Date.now() - 86400000).toISOString(),
    new Date(Date.now() + 14 * 86400000).toISOString()
  );
  const all = [...(rows || []).map(row => ({
    id: row.id,
    start: row.starts_at,
    duration: row.duration_minutes,
    commercialId: row.commercial_id,
    status: row.status,
  })), ...busy];
  const overlaps = findOverlaps(all, {
    start: record.starts_at,
    duration: record.duration_minutes,
    commercialId,
  }, { excludeId });
  if (!overlaps.length) return { overlaps: [], suggestions: [] };
  if (force && canOverride) return { overlaps, suggestions: [], allowed: true };
  const suggestions = nextAvailableSlots(all, {
    commercialId,
    duration: record.duration_minutes,
    from: new Date(record.starts_at),
  }).map(date => date.toISOString());
  const error = new Error("Ce créneau chevauche un autre rendez-vous ou une période occupée.");
  error.status = 409;
  error.overlaps = overlaps.map(item => ({
    id: item.id || null,
    start: item.start,
    prospectName: item.prospectName || "Occupé",
  }));
  error.suggestions = suggestions;
  throw error;
}

export async function applyGoogleSync(appointmentUi, { crmUrl } = {}) {
  const result = await syncAppointmentToGoogle(appointmentUi, { crmUrl });
  if (!appointmentUi?.id || result.status === "none") return result;
  const extra = {
    ...(appointmentUi.extra && typeof appointmentUi.extra === "object" ? appointmentUi.extra : {}),
    kind: appointmentUi.kind,
    subject: appointmentUi.subject,
    address: appointmentUi.address,
    phone: appointmentUi.phone,
    priority: appointmentUi.priority,
    meetingMode: appointmentUi.meetingMode,
    reminderOffsets: appointmentUi.reminderOffsets,
    notifyCrm: appointmentUi.notifyCrm,
    notifyEmail: appointmentUi.notifyEmail,
    notifyGoogle: appointmentUi.notifyGoogle,
    appointmentType: appointmentUi.appointmentType,
    commercial: appointmentUi.commercial,
    manager: appointmentUi.manager,
    googleEventId: result.googleEventId || appointmentUi.googleEventId || "",
    googleCalendarId: result.googleCalendarId || appointmentUi.googleCalendarId || "primary",
    syncStatus: result.status,
    syncError: result.syncError || "",
    lastSyncedAt: result.lastSyncedAt || appointmentUi.lastSyncedAt || "",
    notifiedAt: appointmentUi.notifiedAt || {},
  };
  await serviceRequest(
    `/rest/v1/commercial_appointments?id=eq.${encodeURIComponent(appointmentUi.id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: {
        extra,
        updated_at: new Date().toISOString(),
      },
    }
  ).catch(() => null);
  return result;
}

export async function logAppointmentActivity(auth, action, appointment, extra = {}) {
  await logActivity({
    ...actorFromAuth(auth),
    action: ACTIVITY_ACTIONS[action] || action,
    module: "Agenda commercial",
    entityType: "appointment",
    entityId: appointment?.id,
    entityLabel: appointment?.prospectName || appointment?.prospect_name,
    ...extra,
  });
}

export { isMissingCommercialTable };
