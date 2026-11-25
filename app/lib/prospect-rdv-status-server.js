import { listAllRowsByIds } from "./supabase-list.js";
import { withProspectRdvStatuses } from "./prospects.js";

const APPOINTMENT_STATUS_SELECT = "id,opportunity_id,status,starts_at,extra,updated_at";

export async function attachProspectRdvStatuses(orgId, prospects) {
  const list = Array.isArray(prospects) ? prospects : [];
  const ids = list.map(item => item?.id).filter(Boolean);
  if (!ids.length) return list;
  const rows = await listAllRowsByIds(
    `/rest/v1/commercial_appointments?select=${APPOINTMENT_STATUS_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&order=starts_at.desc.nullslast`,
    ids,
    { column: "opportunity_id" }
  );
  return withProspectRdvStatuses(list, rows);
}
