import { dueReminders } from "./agenda.js";
import { notifyUser } from "./google-calendar.js";
import { APPOINTMENT_SELECT, appointmentToUi } from "./prospects.js";
import { serviceRequest } from "./supabase-server.js";

function extraOf(row) {
  const extra = row?.extra;
  if (extra && typeof extra === "object" && !Array.isArray(extra)) return extra;
  return {};
}

function reminderLabel(offset) {
  const minutes = Number(offset);
  if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440} j`;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}

export async function dispatchDueReminders({ commercialId, now = Date.now() } = {}) {
  const from = new Date(now - 60 * 60000).toISOString();
  const to = new Date(now + 8 * 86400000).toISOString();
  let path = `/rest/v1/commercial_appointments?select=${APPOINTMENT_SELECT}&starts_at=gte.${encodeURIComponent(from)}&starts_at=lte.${encodeURIComponent(to)}&order=starts_at.asc`;
  if (commercialId) path += `&commercial_id=eq.${encodeURIComponent(commercialId)}`;
  const rows = await serviceRequest(path).catch(() => []);
  const due = dueReminders((rows || []).map(row => appointmentToUi(row)), now);
  let sent = 0;
  for (const { appointment, offset } of due) {
    const row = (rows || []).find(item => item.id === appointment.id);
    if (!row?.organization_id || !appointment.commercialId) continue;
    const uniqueKey = `remind:${appointment.id}:${offset}`;
    const kindLabel = appointment.kind === "rappel" ? "Rappel téléphonique" : "Rendez-vous";
    await notifyUser({
      orgId: row.organization_id,
      userId: appointment.commercialId,
      appointmentId: appointment.id,
      title: `${kindLabel} dans ${reminderLabel(offset)}`,
      body: `${appointment.prospectName || "Prospect"} — ${appointment.subject || appointment.city || ""}`.trim(),
      uniqueKey,
      sendEmail: appointment.notifyEmail !== false,
    });
    const extra = extraOf(row);
    extra.notifiedAt = {
      ...(extra.notifiedAt && typeof extra.notifiedAt === "object" ? extra.notifiedAt : {}),
      ...(appointment.notifiedAt || {}),
      [String(offset)]: new Date(now).toISOString(),
    };
    await serviceRequest(
      `/rest/v1/commercial_appointments?id=eq.${encodeURIComponent(appointment.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: { extra, updated_at: new Date().toISOString() },
      }
    ).catch(() => null);
    sent += 1;
  }
  return { sent, checked: (rows || []).length };
}
