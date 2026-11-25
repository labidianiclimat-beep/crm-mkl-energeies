import { requireApiSession } from "../../lib/api-auth";
import { dispatchDueReminders } from "../../lib/agenda-reminders";
import { isHandledTicket } from "../../lib/internal-requests";
import { serviceRequest, serviceRoleConfigured } from "../../lib/supabase-server";

async function withoutHandledTickets(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const ids = [...new Set(list.map(row => String(row?.request_id || "")).filter(Boolean))];
  if (!ids.length) return list;
  const filter = ids.map(id => `"${id.replace(/"/g, "")}"`).join(",");
  let requests = [];
  try {
    requests = await serviceRequest(`/rest/v1/internal_requests?select=id,status&id=in.(${filter})`);
  } catch {
    return list;
  }
  const handled = new Set((requests || []).filter(row => isHandledTicket(row.status)).map(row => String(row.id)));
  return list.filter(row => !row.request_id || !handled.has(String(row.request_id)));
}

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) {
    return Response.json({ notifications: [] });
  }
  try {
    await dispatchDueReminders({ commercialId: auth.user.id }).catch(() => null);
    const base = `/rest/v1/crm_notifications?select=id,title,body,kind,read_at,appointment_id,created_at&user_id=eq.${encodeURIComponent(auth.user.id)}&order=created_at.desc&limit=40`;
    let rows;
    try {
      rows = await serviceRequest(base.replace("appointment_id,created_at", "appointment_id,request_id,created_at"));
    } catch {
      rows = await serviceRequest(base);
    }
    return Response.json({ notifications: await withoutHandledTickets(rows) });
  } catch {
    return Response.json({ notifications: [] });
  }
}

export async function PATCH(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => ({}));
  const now = new Date().toISOString();
  if (body.all === true) {
    await serviceRequest(
      `/rest/v1/crm_notifications?user_id=eq.${encodeURIComponent(auth.user.id)}&read_at=is.null`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: { read_at: now },
      }
    ).catch(() => null);
    return Response.json({ ok: true });
  }
  const id = body.id;
  if (!id) return Response.json({ error: "Notification introuvable." }, { status: 400 });
  await serviceRequest(
    `/rest/v1/crm_notifications?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(auth.user.id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: { read_at: now },
    }
  ).catch(() => null);
  return Response.json({ ok: true });
}
