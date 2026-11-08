import { requireApiSession } from "../../lib/api-auth";
import { COMPANY_STATE_KEY, sanitizeCompany, validateCompanyPayload } from "../../lib/company";
import { loadCompany } from "../../lib/company-store";
import { isAdminVip } from "../../lib/permissions";
import { serviceRequest, serviceRoleConfigured } from "../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }
    return Response.json({ company: await loadCompany(auth.profile.organization_id) });
  } catch (error) {
    console.error("Company read error", error.message);
    return Response.json({ error: "Impossible de charger l’entreprise." }, { status: 502 });
  }
}

export async function PUT(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!isAdminVip(auth.profile.role)) {
      return Response.json({ error: "La fiche entreprise est réservée à l’Admin VIP." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const body = await request.json();
    const company = sanitizeCompany(body.company || body);
    const errors = validateCompanyPayload(company);
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    await serviceRequest("/rest/v1/crm_state?on_conflict=organization_id,state_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: {
        organization_id: auth.profile.organization_id,
        state_key: COMPANY_STATE_KEY,
        state_value: company,
        updated_by: auth.profile.id,
        updated_at: new Date().toISOString(),
      },
    });
    return Response.json({ company });
  } catch (error) {
    console.error("Company write error", error.message);
    return Response.json({ error: "Enregistrement de l’entreprise impossible." }, { status: 502 });
  }
}
