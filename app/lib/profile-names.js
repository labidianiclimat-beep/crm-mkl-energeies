import { appointmentToUi, extraOf, isUuid, prospectorIdOf, prospectToUi } from "./prospects";
import { serviceRequest } from "./supabase-server";

export async function loadProfileNames(ids) {
  const unique = [...new Set((ids || []).filter(id => isUuid(id)))];
  if (!unique.length) return {};
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=id,full_name,email&id=in.(${unique.map(id => `"${id}"`).join(",")})`
  );
  return Object.fromEntries((rows || []).map(row => [row.id, row.full_name || row.email || ""]));
}

export async function withProspectNames(rows) {
  const names = await loadProfileNames((rows || []).flatMap(row => [
    row.commercial_id,
    row.created_by,
    prospectorIdOf({ ...row, extra: extraOf(row) }),
  ]));
  return (rows || []).map(row => prospectToUi(row, names));
}

export async function withAppointmentNames(rows) {
  const names = await loadProfileNames((rows || []).flatMap(row => [row.commercial_id, row.manager_id]));
  return (rows || []).map(row => appointmentToUi(row, names));
}
