import { requireApiSession } from "../../lib/api-auth";
import { SUBCONTRACTOR_DOCUMENTS, SUBCONTRACTOR_DOC_MAX_BYTES } from "../../lib/installation-planning";
import { CLIENT_DOCUMENTS_BUCKET } from "../../lib/client-documents";
import { recordTableConfig } from "../../lib/record-table-kinds";
import { serviceDownloadObject, serviceRoleConfigured, serviceUploadObject } from "../../lib/supabase-server";

export const runtime = "nodejs";

const DOC_IDS = new Set(SUBCONTRACTOR_DOCUMENTS.map(item => item.id));
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);
const MODULE = recordTableConfig("installation_teams").module;

function safeTeamId(value) {
  const raw = String(value ?? "").trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(raw) ? raw : "";
}

function ownedPath(organizationId, path) {
  const normalized = String(path || "").replace(/^\/+/, "");
  const prefix = `${organizationId}/subcontractors/`;
  if (!organizationId || !normalized.startsWith(prefix) || normalized.includes("..")) return "";
  const rest = normalized.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]{1,80}\/(contrat|decennale|urssaf|rge|kbis)$/.test(rest)) return "";
  return normalized;
}

function parseDataUrl(value) {
  const match = String(value || "").match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return { error: "Document illisible." };
  const contentType = match[1].toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) return { error: "Déposez un PDF ou une image." };
  const encoded = match[2].replace(/\s/g, "");
  if (Math.floor(encoded.length * 3 / 4) > SUBCONTRACTOR_DOC_MAX_BYTES) {
    return { error: "Document trop lourd (1,8 Mo maximum)." };
  }
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > SUBCONTRACTOR_DOC_MAX_BYTES) {
    return { error: "Document trop lourd (1,8 Mo maximum)." };
  }
  return { contentType, bytes };
}

function downloadName(value) {
  const name = String(value || "document").replace(/[\r\n"]/g, "").slice(0, 120);
  return name || "document";
}

export async function POST(request) {
  const auth = await requireApiSession(request, { module: MODULE });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  }
  try {
    const body = await request.json();
    const teamId = safeTeamId(body.teamId);
    const docId = DOC_IDS.has(body.docId) ? body.docId : "";
    const name = String(body.name || "").trim().slice(0, 180);
    if (!teamId || !docId || !name) {
      return Response.json({ error: "Document incomplet." }, { status: 400 });
    }
    const parsed = parseDataUrl(body.data);
    if (parsed.error) return Response.json({ error: parsed.error }, { status: 400 });
    const path = `${auth.profile.organization_id}/subcontractors/${teamId}/${docId}`;
    await serviceUploadObject(CLIENT_DOCUMENTS_BUCKET, path, parsed.bytes, parsed.contentType);
    return Response.json({ path, name });
  } catch (error) {
    console.error("Subcontractor document upload error", error.message);
    return Response.json({ error: "Le document du sous-traitant n’a pas pu être envoyé." }, { status: 502 });
  }
}

export async function GET(request) {
  const auth = await requireApiSession(request, { module: MODULE });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  }
  try {
    const url = new URL(request.url);
    const path = ownedPath(auth.profile.organization_id, url.searchParams.get("path"));
    if (!path) return Response.json({ error: "Document introuvable." }, { status: 404 });
    const bytes = await serviceDownloadObject(CLIENT_DOCUMENTS_BUCKET, path);
    const name = downloadName(url.searchParams.get("name"));
    return new Response(Uint8Array.from(bytes), {
      headers: {
        "Content-Type": name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json({ error: "Téléchargement impossible." }, { status: 404 });
  }
}
