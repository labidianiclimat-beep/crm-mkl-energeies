import { requireApiSession } from "../../../../../../lib/api-auth";
import { PREVISIT_PHOTOS_BUCKET, normalizeVisitKey } from "../../../../../../lib/previsit-photos";
import { assertPhotoAccess, loadPhoto } from "../../../../../../lib/previsit-photo-store";
import { serviceDownloadObject, serviceRoleConfigured } from "../../../../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Visites techniques" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    const { visitKey, photoId } = await params;
    const key = normalizeVisitKey(visitKey);
    const photo = await loadPhoto(auth.profile.organization_id, photoId);
    if (!photo || photo.visit_key !== key) return Response.json({ error: "Photo introuvable." }, { status: 404 });
    const access = await assertPhotoAccess(auth, photo);
    if (access.error) return Response.json({ error: access.error }, { status: access.status });
    const kind = new URL(request.url).searchParams.get("kind") === "original" ? "original" : "annotated";
    const path = kind === "original" ? photo.original_path : photo.annotated_path;
    const bytes = await serviceDownloadObject(PREVISIT_PHOTOS_BUCKET, path);
    return new Response(Uint8Array.from(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("Previsit photo file error", error.message);
    return Response.json({ error: "Lecture de la photo impossible." }, { status: 502 });
  }
}
