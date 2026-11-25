import { requireApiSession } from "../../../lib/api-auth";
import { FLEET_ACTIVITY_ACTIONS, FLEET_DOCUMENTS_BUCKET } from "../../../lib/fleet";
import { logFleet, requireFleetSession, requireVehicleAccess } from "../../../lib/fleet-api";
import { deleteDocumentRow, documentToUi, getDocumentRow, insertDocument, storagePathForFleetFile, syncFleetAlerts, upsertOpenDeadline } from "../../../lib/fleet-store";
import { serviceDeleteObject, serviceDownloadObject, serviceRoleConfigured, serviceUploadObject } from "../../../lib/supabase-server";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 6 * 1024 * 1024;

function extensionFor(mime, name = "") {
  const fromName = String(name).split(".").pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  if (String(mime).includes("pdf")) return "pdf";
  if (String(mime).includes("jpeg") || String(mime).includes("jpg")) return "jpg";
  if (String(mime).includes("png")) return "png";
  return "bin";
}

export async function GET(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "Document introuvable." }, { status: 404 });
    const session = await requireFleetSession(auth);
    if (!session.ok) return Response.json({ error: session.error }, { status: session.status });
    const row = await getDocumentRow(session.orgId, id);
    if (!row) return Response.json({ error: "Document introuvable." }, { status: 404 });
    const access = await requireVehicleAccess(auth, row.vehicle_id);
    if (!access.ok) return Response.json({ error: "Document introuvable." }, { status: 404 });
    const bytes = await serviceDownloadObject(FLEET_DOCUMENTS_BUCKET, row.storage_path);
    const filename = `${String(row.title || row.kind).replace(/[^\w.-]+/g, "-")}.${extensionFor(row.mime_type, row.storage_path)}`;
    return new Response(Uint8Array.from(bytes), {
      headers: {
        "Content-Type": row.mime_type || "application/octet-stream",
        "Content-Disposition": `${url.searchParams.get("preview") === "1" ? "inline" : "attachment"}; filename="${filename}"`,
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json({ error: error.message || "Téléchargement impossible." }, { status: 404 });
  }
}

export async function POST(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  try {
    const form = await request.formData();
    const vehicleId = String(form.get("vehicleId") || "");
    const access = await requireVehicleAccess(auth, vehicleId, { write: true });
    if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
    if (!access.caps.canOperate && !access.caps.assignedVehicleIds.includes(vehicleId)) {
      return Response.json({ error: "Action non autorisée." }, { status: 403 });
    }
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return Response.json({ error: "Ajoutez un fichier." }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX_FILE_BYTES) {
      return Response.json({ error: "Le fichier dépasse 6 Mo." }, { status: 400 });
    }
    const documentId = crypto.randomUUID();
    const ext = extensionFor(file.type, file.name);
    const storagePath = storagePathForFleetFile({
      organizationId: access.orgId,
      vehicleId,
      documentId,
      ext,
    });
    await serviceUploadObject(FLEET_DOCUMENTS_BUCKET, storagePath, bytes, file.type || "application/octet-stream");
    const row = await insertDocument(access.orgId, {
      id: documentId,
      vehicle_id: vehicleId,
      assignment_id: form.get("assignmentId") || null,
      incident_id: form.get("incidentId") || null,
      expense_id: form.get("expenseId") || null,
      kind: String(form.get("kind") || "autre"),
      title: String(form.get("title") || file.name || "Document").slice(0, 120),
      doc_date: form.get("docDate") || null,
      expires_on: form.get("expiresOn") || null,
      mime_type: file.type || "application/octet-stream",
      file_size: bytes.length,
      storage_path: storagePath,
      created_by: auth.user.id,
    });
    if (row.kind === "controle" && row.expires_on) {
      await upsertOpenDeadline(access.orgId, {
        vehicleId,
        kind: "controle",
        title: "Contrôle technique",
        dueOn: row.expires_on,
      });
      await syncFleetAlerts(access.orgId);
    }
    await logFleet(auth, FLEET_ACTIVITY_ACTIONS.DOCUMENT_UPLOAD, access.vehicle, { newValue: { kind: row.kind, title: row.title } });
    return Response.json({ document: documentToUi(row) });
  } catch (error) {
    return Response.json({ error: error.message || "Dépôt impossible." }, { status: 400 });
  }
}

export async function DELETE(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const session = await requireFleetSession(auth);
    if (!session.ok) return Response.json({ error: session.error }, { status: session.status });
    if (!session.caps.canOperate) return Response.json({ error: "Action non autorisée." }, { status: 403 });
    const { id } = await request.json();
    const row = await getDocumentRow(session.orgId, id);
    if (!row) return Response.json({ error: "Document introuvable." }, { status: 404 });
    await serviceDeleteObject(FLEET_DOCUMENTS_BUCKET, row.storage_path).catch(() => null);
    await deleteDocumentRow(session.orgId, id);
    await logFleet(auth, FLEET_ACTIVITY_ACTIONS.DOCUMENT_DELETE, { id: row.vehicle_id, plate: row.title }, { oldValue: { id } });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message || "Suppression impossible." }, { status: 400 });
  }
}
