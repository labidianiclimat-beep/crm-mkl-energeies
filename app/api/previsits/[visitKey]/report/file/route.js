import { requireApiSession } from "../../../../../lib/api-auth";
import { CLIENT_DOCUMENTS_BUCKET } from "../../../../../lib/client-documents";
import { normalizeVisitKey } from "../../../../../lib/previsit-photos";
import { assertVisitPhotoAccess, loadReport } from "../../../../../lib/previsit-photo-store";
import { serviceDownloadObject, serviceRequest, serviceRoleConfigured } from "../../../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Visites techniques" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    const { visitKey } = await params;
    const key = normalizeVisitKey(visitKey);
    const report = await loadReport(auth.profile.organization_id, key);
    if (!report?.document_id) return Response.json({ error: "Aucun rapport PDF pour cette prévisite." }, { status: 404 });
    const access = await assertVisitPhotoAccess(auth, report.client_id);
    if (access.error) return Response.json({ error: access.error }, { status: access.status });
    const rows = await serviceRequest(
      `/rest/v1/client_documents?select=id,storage_path,title&id=eq.${encodeURIComponent(report.document_id)}&limit=1`
    );
    const document = rows?.[0];
    if (!document) return Response.json({ error: "Rapport introuvable." }, { status: 404 });
    const pdf = await serviceDownloadObject(CLIENT_DOCUMENTS_BUCKET, document.storage_path);
    return new Response(Uint8Array.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(document.title || "previsite")}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Previsit report file error", error.message);
    return Response.json({ error: "Lecture du PDF impossible." }, { status: 502 });
  }
}
