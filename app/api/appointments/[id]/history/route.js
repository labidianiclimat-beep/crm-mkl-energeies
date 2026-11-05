import { requireApiSession } from "../../../../lib/api-auth";
import { canViewAppointmentHistory, presentAppointmentHistoryEntry } from "../../../../lib/agenda";
import { APPOINTMENT_SELECT, isUuid } from "../../../../lib/prospects";
import { canAccessScopedRow } from "../../../../lib/scoping";
import { loadTeamMemberIds } from "../../../../lib/team-scope";
import { serviceRequest } from "../../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  const auth = await requireApiSession(request, { module: "Agenda commercial" });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!canViewAppointmentHistory(auth.profile)) {
    return Response.json({ error: "L’historique des rendez-vous est réservé à l’admin VIP et au superadmin." }, { status: 403 });
  }
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Identifiant invalide." }, { status: 400 });
  const rows = await serviceRequest(
    `/rest/v1/commercial_appointments?select=${APPOINTMENT_SELECT}&id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}&limit=1`
  ).catch(() => []);
  const existing = rows?.[0];
  const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id);
  if (!existing || !canAccessScopedRow(auth.profile, auth.user.id, {
    organization_id: existing.organization_id,
    commercial_id: existing.commercial_id || existing.manager_id,
    created_by: existing.created_by,
  }, teamIds || [])) {
    return Response.json({ error: "Rendez-vous introuvable." }, { status: 404 });
  }
  let history = [];
  try {
    history = await serviceRequest(
      `/rest/v1/appointment_history?select=id,field,action,old_value,new_value,user_name,created_at&appointment_id=eq.${encodeURIComponent(id)}&order=created_at.desc`
    );
  } catch (error) {
    if (!/action/i.test(String(error?.message || ""))) throw error;
    history = await serviceRequest(
      `/rest/v1/appointment_history?select=id,field,old_value,new_value,user_name,created_at&appointment_id=eq.${encodeURIComponent(id)}&order=created_at.desc`
    );
  }
  return Response.json({ history: (history || []).map(presentAppointmentHistoryEntry) });
}
