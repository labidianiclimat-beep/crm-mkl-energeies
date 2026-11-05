import { requireApiSession } from "../../../../../lib/api-auth";
import { ACTIVITY_ACTIONS } from "../../../../../lib/activity-logs";
import {
  CLIENT_DOCUMENTS_BUCKET,
  isPersistedClientId,
} from "../../../../../lib/client-documents";
import { extractJpegsFromPdf } from "../../../../../lib/jpeg-pdf";
import { actorFromAuth, logActivity } from "../../../../../lib/log-activity";
import { isProspectDispatcher } from "../../../../../lib/prospect-dispatch";
import { canAccessScopedRow } from "../../../../../lib/scoping";
import {
  serviceDeleteObject,
  serviceDownloadObject,
  serviceRequest,
  serviceRoleConfigured,
} from "../../../../../lib/supabase-server";
import { loadTeamMemberIds } from "../../../../../lib/team-scope";

export const runtime = "nodejs";

const PROSPECT_SELECT = "id,organization_id,name,commercial_id,created_by";
const DOCUMENT_SELECT =
  "id,organization_id,prospect_id,kind,title,page_count,file_size,mime_type,storage_path,created_by,created_at";

async function loadAccessibleDocument(auth, prospectId, docId) {
  if (!isPersistedClientId(prospectId) || !isPersistedClientId(docId)) return { status: 404 };
  const documents = await serviceRequest(
    `/rest/v1/prospect_documents?select=${DOCUMENT_SELECT}&id=eq.${encodeURIComponent(docId)}&prospect_id=eq.${encodeURIComponent(prospectId)}&limit=1`
  );
  const document = documents?.[0];
  if (!document) return { status: 404 };

  const prospects = await serviceRequest(
    `/rest/v1/commercial_opportunities?select=${PROSPECT_SELECT}&id=eq.${encodeURIComponent(prospectId)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}&limit=1`
  );
  const prospect = prospects?.[0];
  if (!prospect) return { status: 404 };

  const forDispatch = isProspectDispatcher(auth.profile);
  const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id, { forDispatch });
  if (!canAccessScopedRow(auth.profile, auth.user.id, prospect, teamIds || [], { forDispatch })) {
    return { status: 404 };
  }
  return { document, prospect };
}

function downloadName(document) {
  const slug = String(document.title || document.kind || "document")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${slug || "document"}.pdf`;
}

export async function GET(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Prospects" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id, docId } = await params;
    const loaded = await loadAccessibleDocument(auth, id, docId);
    if (!loaded.document) return Response.json({ error: "Document introuvable." }, { status: 404 });

    const pdf = await serviceDownloadObject(CLIENT_DOCUMENTS_BUCKET, loaded.document.storage_path);
    const preview = new URL(request.url).searchParams.get("preview") === "1";
    if (preview) {
      const jpeg = extractJpegsFromPdf(pdf)[0];
      return new Response(Uint8Array.from(jpeg), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "private, max-age=120",
        },
      });
    }
    return new Response(Uint8Array.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${downloadName(loaded.document)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Prospect document download error", error.message);
    return Response.json({ error: "Impossible d’ouvrir le document." }, { status: 502 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Prospects" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id, docId } = await params;
    const loaded = await loadAccessibleDocument(auth, id, docId);
    if (!loaded.document) return Response.json({ error: "Document introuvable." }, { status: 404 });

    await serviceDeleteObject(CLIENT_DOCUMENTS_BUCKET, loaded.document.storage_path);
    await serviceRequest(`/rest/v1/prospect_documents?id=eq.${encodeURIComponent(docId)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    await logActivity({
      ...actorFromAuth(auth),
      action: ACTIVITY_ACTIONS.PROSPECT_DOCUMENT_DELETE,
      module: "Prospects",
      entityType: "prospect",
      entityId: id,
      entityLabel: loaded.prospect.name,
      oldValue: {
        documentId: loaded.document.id,
        kind: loaded.document.kind,
        title: loaded.document.title,
      },
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Prospect document delete error", error.message);
    return Response.json({ error: "Suppression impossible." }, { status: 502 });
  }
}
