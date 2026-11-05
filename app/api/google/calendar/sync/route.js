import { requireApiSession } from "../../../../lib/api-auth";
import {
  applyGoogleSync,
  googleEventToRecord,
  googleOAuthConfigured,
  listGoogleCalendars,
  listGoogleEventsOnCalendars,
  loadGoogleAccount,
} from "../../../../lib/google-calendar";
import { extraGoogleCopies, findStoredGoogleEvent, googlePrimaryAliases, isAgendaUuid } from "../../../../lib/agenda";
import { APPOINTMENT_SELECT } from "../../../../lib/prospects";
import { commercialScopeQuery } from "../../../../lib/team-scope";
import { serviceRequest } from "../../../../lib/supabase-server";
import { withAppointmentNames } from "../../../../lib/profile-names";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const account = await loadGoogleAccount(auth.user.id).catch(() => null);
  let calendars = [];
  if (account?.status === "connected") {
    calendars = await listGoogleCalendars(account).catch(() => []);
  }
  return Response.json({
    configured: googleOAuthConfigured(),
    account: account
      ? {
          email: account.google_email,
          calendarId: account.calendar_id,
          status: account.status,
          lastSyncedAt: account.last_synced_at,
          lastError: account.last_error,
        }
      : null,
    calendars,
  });
}

export async function POST(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => ({}));
  const account = await loadGoogleAccount(auth.user.id);
  if (!account) return Response.json({ error: "Aucun compte Google connecté." }, { status: 400 });

  if (body.calendarId && !Array.isArray(body.calendarIds)) {
    await serviceRequest(
      `/rest/v1/google_calendar_accounts?id=eq.${encodeURIComponent(account.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: { calendar_id: body.calendarId, updated_at: new Date().toISOString() },
      }
    );
    account.calendar_id = body.calendarId;
  }

  const orgId = auth.profile.organization_id;
  let path = `/rest/v1/commercial_appointments?select=${APPOINTMENT_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&commercial_id=eq.${encodeURIComponent(auth.user.id)}&order=starts_at.asc`;
  path += await commercialScopeQuery(auth.profile, auth.user.id, ["commercial_id", "created_by", "manager_id"]);
  const rows = await serviceRequest(path).catch(() => []);
  const appointments = await withAppointmentNames(rows || []);
  let googleEvents = [];
  let readCalendars = [];
  let readErrors = [];
  try {
    const listed = await listGoogleEventsOnCalendars(account, {
      calendarIds: Array.isArray(body.calendarIds) ? body.calendarIds : (body.calendarId ? [body.calendarId] : undefined),
    });
    googleEvents = listed.events;
    readCalendars = listed.calendars;
    readErrors = listed.errors;
  } catch (error) {
    const message = String(error?.message || "Lecture des événements Google impossible.");
    await serviceRequest(
      `/rest/v1/google_calendar_accounts?id=eq.${encodeURIComponent(account.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: { last_error: message, status: "connected", updated_at: new Date().toISOString() },
      }
    ).catch(() => null);
    return Response.json({ error: message, synced: 0, pulled: 0, imported: 0, updated: 0, found: 0 }, { status: 502 });
  }
  let imported = 0;
  let updated = 0;
  let importError = readErrors.join(" · ");
  const primaryCalendar = readCalendars.find(item => item.primary);
  const aliases = googlePrimaryAliases({
    primaryId: primaryCalendar?.id,
    accountCalendarId: account.calendar_id,
  });
  const known = [...appointments];
  for (const event of googleEvents) {
    const calendarId = event._calendarId || account.calendar_id || "primary";
    const record = googleEventToRecord(event, {
      organizationId: orgId,
      commercialId: auth.user.id,
      calendarId,
      calendarSummary: event._calendarSummary || "",
    });
    if (!record) continue;
    const existing = findStoredGoogleEvent(known, event.id, calendarId, aliases);
    const extras = extraGoogleCopies(known, event.id, calendarId, aliases, existing?.id || "");
    for (const extra of extras) {
      try {
        await serviceRequest(
          `/rest/v1/commercial_appointments?id=eq.${encodeURIComponent(extra.id)}&organization_id=eq.${encodeURIComponent(orgId)}`,
          { method: "DELETE", headers: { Prefer: "return=minimal" } }
        );
        const index = known.findIndex(item => item.id === extra.id);
        if (index >= 0) known.splice(index, 1);
      } catch (error) {
        importError = String(error?.message || "Suppression du doublon Google impossible.");
      }
    }
    if (existing?.source === "google" && isAgendaUuid(existing.id)) {
      try {
        await serviceRequest(
          `/rest/v1/commercial_appointments?id=eq.${encodeURIComponent(existing.id)}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: {
              prospect_name: record.prospect_name,
              notes: record.notes,
              starts_at: record.starts_at,
              duration_minutes: record.duration_minutes,
              extra: record.extra,
              updated_at: new Date().toISOString(),
            },
          }
        );
        existing.googleCalendarId = calendarId;
        updated += 1;
      } catch (error) {
        importError = String(error?.message || "Mise à jour Google impossible.");
      }
      continue;
    }
    if (existing) continue;
    try {
      await serviceRequest("/rest/v1/commercial_appointments", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: record,
      });
      known.push({
        id: "",
        source: "google",
        googleEventId: event.id,
        googleCalendarId: calendarId,
      });
      imported += 1;
    } catch (error) {
      importError = String(error?.message || "Import Google impossible.");
    }
  }
  let synced = 0;
  let pulled = 0;
  for (const appointment of appointments) {
    if (appointment.source === "google") continue;
    // Un rendez-vous existant ne peut pas être déplacé, y compris depuis Google.
    const result = await applyGoogleSync(appointment, { crmUrl: process.env.APP_PUBLIC_URL || "" }).catch(() => null);
    if (result?.googleEventId || result?.status === "Synchronisé") synced += 1;
  }
  await serviceRequest(
    `/rest/v1/google_calendar_accounts?id=eq.${encodeURIComponent(account.id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: {
        last_synced_at: new Date().toISOString(),
        last_error: importError || null,
        status: "connected",
      },
    }
  ).catch(() => null);
  return Response.json({
    ok: true,
    synced,
    pulled,
    imported,
    updated,
    found: googleEvents.length,
    calendars: readCalendars.length,
    calendarId: account.calendar_id || "primary",
  });
}

export async function DELETE(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  await serviceRequest(
    `/rest/v1/google_calendar_accounts?user_id=eq.${encodeURIComponent(auth.user.id)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } }
  ).catch(() => null);
  return Response.json({ ok: true });
}
