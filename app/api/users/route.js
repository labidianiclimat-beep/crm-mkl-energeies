import { requireApiSession } from "../../lib/api-auth";
import { canListOrganizationUsers } from "../../lib/permissions";
import { profileToDirectoryUser, profileToUiUser } from "../../lib/users";
import { listAllRows } from "../../lib/supabase-list";
import { serviceRoleConfigured } from "../../lib/supabase-server";
import { rememberOrgPayload } from "../../lib/org-payload-cache";

export const runtime = "nodejs";

const SELECT =
  "id,organization_id,full_name,email,role,modules,manager,active,zone,specialties,postal_code,city,dispatch_available,onboarding_completed_at";

export async function GET(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const orgId = auth.profile.organization_id;
    const manage = canListOrganizationUsers(auth.profile);
    const { payload } = await rememberOrgPayload(
      "users",
      `${orgId}:${manage ? "manage" : "dir"}`,
      async () => {
        const rows = await listAllRows(
          `/rest/v1/profiles?select=${SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&order=full_name.asc`
        );
        return {
          users: (rows || []).map(row => (manage ? profileToUiUser(row) : profileToDirectoryUser(row))),
          directory: !manage,
        };
      },
      { ttlMs: 45_000 }
    );
    return Response.json(payload, {
      headers: { "Cache-Control": "private, max-age=20" },
    });
  } catch (error) {
    console.error("Users list error", error.message);
    return Response.json({ error: "Liste des utilisateurs indisponible." }, { status: 502 });
  }
}
