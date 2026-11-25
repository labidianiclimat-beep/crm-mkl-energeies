import { COMPANY_STATE_KEY, DEFAULT_COMPANY, sanitizeCompany } from "./company";
import { serviceRequest } from "./supabase-server";

export async function loadCompany(organizationId) {
  const rows = await serviceRequest(
    `/rest/v1/crm_state?select=state_value&organization_id=eq.${encodeURIComponent(organizationId)}&state_key=eq.${encodeURIComponent(COMPANY_STATE_KEY)}&limit=1`
  );
  const stored = rows?.[0]?.state_value;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return { ...DEFAULT_COMPANY };
  }
  return sanitizeCompany(stored);
}
