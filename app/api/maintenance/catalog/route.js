import { requireApiSession } from "../../../lib/api-auth";
import { articleToUi } from "../../../lib/articles";
import { brandToUi } from "../../../lib/brands";
import { maintenanceBrandCatalog } from "../../../lib/maintenance-catalog";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireApiSession(request, { module: "Maintenance" });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  }
  const orgId = encodeURIComponent(auth.profile.organization_id);
  try {
    const [brandRows, articleRows] = await Promise.all([
      serviceRequest(`/rest/v1/article_brands?select=id,name,actif&organization_id=eq.${orgId}&actif=eq.true&order=name.asc`),
      serviceRequest(`/rest/v1/articles?select=designation,marque,actif&organization_id=eq.${orgId}&actif=eq.true`),
    ]);
    const brands = maintenanceBrandCatalog(
      (brandRows || []).map(brandToUi),
      (articleRows || []).map(row => articleToUi(row)),
    );
    return Response.json({ brands });
  } catch (error) {
    console.error("Maintenance catalog error", error.message);
    return Response.json({ error: "Impossible de charger les marques." }, { status: 502 });
  }
}
