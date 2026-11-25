import { requireApiSession } from "../../../../lib/api-auth";
import { ACTIVITY_ACTIONS, clientLabel } from "../../../../lib/activity-logs";
import {
  CLIENT_DOCUMENTS_BUCKET,
  documentToUi,
  isPersistedClientId,
  normalizeDocumentKind,
  normalizeDocumentTitle,
  buildStoredDocument,
  storagePathForDocument,
} from "../../../../lib/client-documents";
import { actorFromAuth, logActivity } from "../../../../lib/log-activity";
import { canAccessScopedRow } from "../../../../lib/scoping";
import {
  serviceDeleteObject,
  serviceRequest,
  serviceRoleConfigured,
  serviceUploadObject,
} from "../../../../lib/supabase-server";
import { loadTeamMemberIds } from "../../../../lib/team-scope";

export const runtime = "nodejs";

const CLIENT_SELECT =
  "id,organization_id,type_client,civilite,nom,prenom,raison_sociale,email,statut,commercial_id,created_by";
const DOCUMENT_SELECT =
  "id,organization_id,client_id,kind,title,page_count,file_size,mime_type,storage_path,created_by,created_at";

async function loadClient(id) {
  const rows = await serviceRequest(
    `/rest/v1/clients?select=${CLIENT_SELECT}&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return rows?.[0] || null;
}

async function assertClientAccess(auth, clientId) {
  if (!isPersistedClientId(clientId)) {
    return { error: "Client introuvable.", status: 404 };
  }
  const row = await loadClient(clientId);
  if (!row) return { error: "Client introuvable.", status: 404 };
  const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id);
  if (!canAccessScopedRow(auth.profile, auth.user.id, row, teamIds || [])) {
    return { error: "Client introuvable ou accès refusé.", status: 404 };
  }
  return { row };
}

async function readJpegPages(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const files = form.getAll("pages").filter(value => value && typeof value.arrayBuffer === "function");
    const pages = await Promise.all(files.map(async file => Buffer.from(await file.arrayBuffer())));
    return {
      kind: form.get("kind"),
      title: form.get("title"),
      pages,
    };
  }

  const body = await request.json();
  return {
    kind: body.kind,
    title: body.title,
    pages: (body.pages || []).map(item => Buffer.from(String(item), "base64")),
  };
}

export async function GET(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Clients" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const access = await assertClientAccess(auth, id);
    if (access.error) return Response.json({ error: access.error }, { status: access.status });

    const rows = await serviceRequest(
      `/rest/v1/client_documents?select=${DOCUMENT_SELECT}&client_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(access.row.organization_id)}&order=created_at.desc`
    );
    return Response.json({ documents: (rows || []).map(documentToUi) });
  } catch (error) {
    console.error("Client documents list error", error.message);
    return Response.json({ error: "Impossible de charger les documents." }, { status: 502 });
  }
}

export async function POST(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Clients" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const access = await assertClientAccess(auth, id);
    if (access.error) return Response.json({ error: access.error }, { status: access.status });

    const payload = await readJpegPages(request);
    const kind = normalizeDocumentKind(payload.kind);
    const title = normalizeDocumentTitle(payload.title, kind);
    const stored = buildStoredDocument(payload.pages);
    const pdf = stored.pdf;
    const documentId = crypto.randomUUID();
    const storagePath = storagePathForDocument({
      organizationId: access.row.organization_id,
      clientId: id,
      documentId,
    });

    await serviceUploadObject(CLIENT_DOCUMENTS_BUCKET, storagePath, pdf, "application/pdf");

    try {
      const rows = await serviceRequest("/rest/v1/client_documents", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: {
          id: documentId,
          organization_id: access.row.organization_id,
          client_id: id,
          kind,
          title,
          page_count: stored.pageCount,
          file_size: pdf.length,
          mime_type: "application/pdf",
          storage_path: storagePath,
          created_by: auth.user.id,
        },
      });
      const created = rows?.[0];
      await logActivity({
        ...actorFromAuth(auth),
        action: ACTIVITY_ACTIONS.CLIENT_DOCUMENT_UPLOAD,
        module: "Clients",
        entityType: "client",
        entityId: id,
        entityLabel: clientLabel(access.row),
        newValue: { documentId, kind, title, pageCount: stored.pageCount },
      });
      return Response.json({ document: documentToUi(created) }, { status: 201 });
    } catch (error) {
      await serviceDeleteObject(CLIENT_DOCUMENTS_BUCKET, storagePath).catch(() => null);
      throw error;
    }
  } catch (error) {
    const known = /type de document|photo|pages|JPEG|PDF|taille|lourde/i.test(error.message || "");
    if (known) return Response.json({ error: error.message }, { status: 400 });
    console.error("Client documents upload error", error.message);
    return Response.json({ error: error.message || "Enregistrement du document impossible." }, { status: 502 });
  }
}
