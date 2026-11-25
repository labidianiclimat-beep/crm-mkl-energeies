import { requireApiSession } from "../../../lib/api-auth";
import { downloadPvImage, isOwnedStoragePath } from "../../../lib/pv-study-assets";
import { serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const auth = await requireApiSession(request, { module: "Photovoltaïque administratif" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const path = new URL(request.url).searchParams.get("path") || "";
    if (!isOwnedStoragePath(auth.profile.organization_id, path)) {
      return Response.json({ error: "Image introuvable." }, { status: 404 });
    }

    const bytes = await downloadPvImage(auth.profile.organization_id, path);
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("PV study asset error", error.message);
    return Response.json({ error: "Image d’étude indisponible." }, { status: error.status || 502 });
  }
}
