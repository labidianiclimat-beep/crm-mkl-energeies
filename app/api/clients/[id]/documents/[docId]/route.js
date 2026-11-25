import { requireApiSession } from "../../../../../lib/api-auth";
import { ACTIVITY_ACTIONS, clientLabel } from "../../../../../lib/activity-logs";
import {
  CLIENT_DOCUMENTS_BUCKET,
  isPersistedClientId,
} from "../../../../../lib/client-documents";
import { extractJpegsFromPdf } from "../../../../../lib/jpeg-pdf";
import { actorFromAuth, logActivity } from "../../../../../lib/log-activity";
import { canAccessScopedRow } from "../../../../../lib/scoping";
import {
  serviceDeleteObject,
  serviceDownloadObject,
  serviceRequest,
  serviceRoleConfigured,
} from "../../../../../lib/supabase-server";
import { loadTeamMemberIds } from "../../../../../lib/team-scope";

export const runtime = "nodejs";

const CLIENT_SELECT =
  "id,organization_id,type_client,civilite,nom,prenom,raison_sociale,email,statut,commercial_id,created_by";
const DOCUMENT_SELECT =
  "id,organization_id,client_id,kind,title,page_count,file_size,mime_type,storage_path,created_by,created_at";

async function loadAccessibleDocument(auth, clientId, docId) {
  if (!isPersistedClientId(clientId) || !isPersistedClientId(docId)) return { status: 404 };
  const documents = await serviceRequest(
    `/rest/v1/client_documents?select=${DOCUMENT_SELECT}&id=eq.${encodeURIComponent(docId)}&client_id=eq.${encodeURIComponent(clientId)}&limit=1`
  );
  const document = documents?.[0];
  if (!document) return { status: 404 };

  const clients = await serviceRequest(
    `/rest/v1/clients?select=${CLIENT_SELECT}&id=eq.${encodeURIComponent(clientId)}&limit=1`
  );
  const client = clients?.[0];
  if (!client) return { status: 404 };

  const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id);
  if (!canAccessScopedRow(auth.profile, auth.user.id, client, teamIds || [])) {
    return { status: 404 };
  }
  return { document, client };
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
    const auth = await requireApiSession(request, { module: "Clients" });
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
    console.error("Client document download error", error.message);
    return Response.json({ error: "Impossible d’ouvrir le document." }, { status: 502 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Clients" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id, docId } = await params;
    const loaded = await loadAccessibleDocument(auth, id, docId);
    if (!loaded.document) return Response.json({ error: "Document introuvable." }, { status: 404 });

    await serviceDeleteObject(CLIENT_DOCUMENTS_BUCKET, loaded.document.storage_path);
    await serviceRequest(`/rest/v1/client_documents?id=eq.${encodeURIComponent(docId)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    await logActivity({
      ...actorFromAuth(auth),
      action: ACTIVITY_ACTIONS.CLIENT_DOCUMENT_DELETE,
      module: "Clients",
      entityType: "client",
      entityId: id,
      entityLabel: clientLabel(loaded.client),
      oldValue: {
        documentId: loaded.document.id,
        kind: loaded.document.kind,
        title: loaded.document.title,
      },
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Client document delete error", error.message);
    return Response.json({ error: "Suppression impossible." }, { status: 502 });
  }
}
