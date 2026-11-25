import { requireApiSession } from "../../../../lib/api-auth";
import {
  CLIENT_DOCUMENTS_BUCKET,
  normalizeDocumentKind,
  normalizeDocumentTitle,
  storagePathForDocument,
} from "../../../../lib/client-documents";
import { jpegPagesToPdf } from "../../../../lib/jpeg-pdf";
import { normalizeVisitKey } from "../../../../lib/previsit-photos";
import { assertReportPhotos, parseReportJpegPages } from "../../../../lib/previsit-photo-report";
import {
  assertVisitPhotoAccess,
  assertVisitPhotosAccess,
  loadReport,
  loadVisitPhotos,
} from "../../../../lib/previsit-photo-store";
import { isPersistedId } from "../../../../lib/previsit-photos";
import {
  serviceRequest,
  serviceRoleConfigured,
  serviceUploadObject,
} from "../../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Visites techniques" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    const { visitKey } = await params;
    const key = normalizeVisitKey(visitKey);
    const report = await loadReport(auth.profile.organization_id, key);
    return Response.json({ report: report || null });
  } catch (error) {
    return Response.json({ error: error.message || "Rapport introuvable." }, { status: 400 });
  }
}

export async function POST(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Visites techniques" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    const { visitKey } = await params;
    const key = normalizeVisitKey(visitKey);
    const photos = await loadVisitPhotos(auth.profile.organization_id, key);
    assertReportPhotos(photos);
    const form = await request.formData();
    const clientId = String(form.get("clientId") || photos[0]?.client_id || "").trim();
    if (!isPersistedId(clientId)) {
      return Response.json({ error: "Rattachez un client avant de générer le PDF." }, { status: 400 });
    }
    const access = await assertVisitPhotoAccess(auth, clientId);
    if (access.error) return Response.json({ error: access.error }, { status: access.status });
    const bundleAccess = await assertVisitPhotosAccess(auth, photos);
    if (bundleAccess.error) return Response.json({ error: bundleAccess.error }, { status: bundleAccess.status });

    const files = form.getAll("pages").filter(value => value && typeof value.arrayBuffer === "function");
    const pages = parseReportJpegPages(await Promise.all(files.map(async file => Buffer.from(await file.arrayBuffer()))));
    const pdf = jpegPagesToPdf(pages);
    const existing = await loadReport(auth.profile.organization_id, key);
    const documentId = existing?.document_id || crypto.randomUUID();
    const storagePath = storagePathForDocument({
      organizationId: auth.profile.organization_id,
      clientId,
      documentId,
    });
    await serviceUploadObject(CLIENT_DOCUMENTS_BUCKET, storagePath, pdf, "application/pdf");
    const kind = normalizeDocumentKind("Rapport de prévisite");
    const title = normalizeDocumentTitle(form.get("title") || `Prévisite ${key}`, kind);

    if (existing?.document_id) {
      await serviceRequest(`/rest/v1/client_documents?id=eq.${encodeURIComponent(existing.document_id)}`, {
        method: "PATCH",
        body: { title, page_count: pages.length, file_size: pdf.length, storage_path: storagePath },
      });
    } else {
      await serviceRequest("/rest/v1/client_documents", {
        method: "POST",
        body: {
          id: documentId,
          organization_id: auth.profile.organization_id,
          client_id: clientId,
          kind,
          title,
          page_count: pages.length,
          file_size: pdf.length,
          mime_type: "application/pdf",
          storage_path: storagePath,
          created_by: auth.user.id,
        },
      });
    }

    const reportBody = {
      organization_id: auth.profile.organization_id,
      visit_key: key,
      client_id: clientId,
      document_id: documentId,
      generated_by: auth.user.id,
      generated_at: new Date().toISOString(),
    };
    if (existing) {
      await serviceRequest(`/rest/v1/previsit_reports?id=eq.${encodeURIComponent(existing.id)}`, {
        method: "PATCH",
        body: reportBody,
      });
    } else {
      await serviceRequest("/rest/v1/previsit_reports", { method: "POST", body: reportBody });
    }

    return Response.json({
      documentId,
      downloadUrl: `/api/clients/${clientId}/documents/${documentId}`,
    });
  } catch (error) {
    const known = /photo|JPEG|client|pages|taille|lourde|type de document/i.test(error.message || "");
    if (known) return Response.json({ error: error.message }, { status: 400 });
    console.error("Previsit report error", error.message);
    return Response.json({ error: error.message || "Génération du PDF impossible." }, { status: 502 });
  }
}
