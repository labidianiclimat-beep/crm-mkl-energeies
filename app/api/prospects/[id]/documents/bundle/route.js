import { requireApiSession } from "../../../../../lib/api-auth";
import {
  CLIENT_DOCUMENTS_BUCKET,
  isPersistedClientId,
  mergedDownloadName,
  normalizeDocumentIds,
} from "../../../../../lib/client-documents";
import { mergeStoredPdfs } from "../../../../../lib/jpeg-pdf";
import { isProspectDispatcher } from "../../../../../lib/prospect-dispatch";
import { canAccessScopedRow } from "../../../../../lib/scoping";
import {
  serviceDownloadObject,
  serviceRequest,
  serviceRoleConfigured,
} from "../../../../../lib/supabase-server";
import { loadTeamMemberIds } from "../../../../../lib/team-scope";

export const runtime = "nodejs";

const PROSPECT_SELECT = "id,organization_id,name,commercial_id,created_by";
const DOCUMENT_SELECT =
  "id,organization_id,prospect_id,kind,title,page_count,file_size,mime_type,storage_path,created_by,created_at";

async function assertProspectAccess(auth, prospectId) {
  if (!isPersistedClientId(prospectId)) return { error: "Prospect introuvable.", status: 404 };
  const rows = await serviceRequest(
    `/rest/v1/commercial_opportunities?select=${PROSPECT_SELECT}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}&id=eq.${encodeURIComponent(prospectId)}&limit=1`
  );
  const row = rows?.[0];
  if (!row) return { error: "Prospect introuvable.", status: 404 };
  const forDispatch = isProspectDispatcher(auth.profile);
  const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id, { forDispatch });
  if (!canAccessScopedRow(auth.profile, auth.user.id, row, teamIds || [], { forDispatch })) {
    return { error: "Prospect introuvable.", status: 404 };
  }
  return { row };
}

export async function POST(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Prospects" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const access = await assertProspectAccess(auth, id);
    if (access.error) return Response.json({ error: access.error }, { status: access.status });

    const body = await request.json().catch(() => ({}));
    const ids = normalizeDocumentIds(body.ids);
    const listed = await serviceRequest(
      `/rest/v1/prospect_documents?select=${DOCUMENT_SELECT}&prospect_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(access.row.organization_id)}&id=in.(${ids.map(item => `"${item}"`).join(",")})`
    );
    const byId = Object.fromEntries((listed || []).map(row => [row.id, row]));
    const documents = ids.map(item => byId[item]).filter(Boolean);
    if (documents.length !== ids.length) {
      return Response.json({ error: "Un document sélectionné est introuvable." }, { status: 404 });
    }

    const pdfs = [];
    for (const document of documents) {
      pdfs.push(await serviceDownloadObject(CLIENT_DOCUMENTS_BUCKET, document.storage_path));
    }
    const merged = await mergeStoredPdfs(pdfs);
    const filename = mergedDownloadName(documents).replace(/"/g, "");
    return new Response(Uint8Array.from(merged), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const known = /sélectionnez|maximum|PDF sans photo/i.test(error.message || "");
    if (known) return Response.json({ error: error.message }, { status: 400 });
    console.error("Prospect documents bundle error", error.message);
    return Response.json({ error: "Téléchargement groupé impossible." }, { status: 502 });
  }
}
