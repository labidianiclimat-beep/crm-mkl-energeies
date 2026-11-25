import { requireApiSession } from "../../../../../lib/api-auth";
import {
  PREVISIT_PHOTOS_BUCKET,
  normalizeCaption,
  normalizeComment,
  normalizeMarks,
  normalizeVisitKey,
  parseJpegBuffer,
  photoToUi,
} from "../../../../../lib/previsit-photos";
import {
  assertPhotoAccess,
  loadMarks,
  loadPhoto,
  replaceMarks,
} from "../../../../../lib/previsit-photo-store";
import {
  serviceDeleteObject,
  serviceRequest,
  serviceRoleConfigured,
  serviceUploadObject,
} from "../../../../../lib/supabase-server";

export const runtime = "nodejs";

export async function PATCH(request, { params }) {
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

    const form = await request.formData().catch(() => null);
    const body = form || await request.json();
    const patch = {
      updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    };
    if (form) {
      if (form.has("caption")) patch.caption = normalizeCaption(form.get("caption"));
      if (form.has("comment")) patch.comment = normalizeComment(form.get("comment"));
      if (form.has("clientId") && form.get("clientId")) patch.client_id = String(form.get("clientId"));
      const annotatedFile = form.get("annotated");
      if (annotatedFile?.arrayBuffer) {
        const annotated = parseJpegBuffer(Buffer.from(await annotatedFile.arrayBuffer()), "La photo annotée");
        await serviceUploadObject(PREVISIT_PHOTOS_BUCKET, photo.annotated_path, annotated, "image/jpeg");
        if (form.get("width")) patch.width = Number(form.get("width"));
        if (form.get("height")) patch.height = Number(form.get("height"));
      }
    } else {
      if ("caption" in body) patch.caption = normalizeCaption(body.caption);
      if ("comment" in body) patch.comment = normalizeComment(body.comment);
    }

    const rows = await serviceRequest(
      `/rest/v1/previsit_photos?id=eq.${encodeURIComponent(photo.id)}`,
      { method: "PATCH", headers: { Prefer: "return=representation" }, body: patch }
    );
    let marks = await loadMarks([photo.id]);
    const nextMarks = form ? form.get("marks") : body.marks;
    if (nextMarks != null) {
      const parsed = normalizeMarks(typeof nextMarks === "string" ? JSON.parse(nextMarks) : nextMarks);
      marks = await replaceMarks(photo.id, parsed);
    }
    return Response.json({ photo: photoToUi(rows?.[0] || photo, marks, key) });
  } catch (error) {
    const known = /photo|JPEG|équipement|Annotations|Prévisite|lourde/i.test(error.message || "");
    if (known) return Response.json({ error: error.message }, { status: 400 });
    console.error("Previsit photo patch error", error.message);
    return Response.json({ error: error.message || "Mise à jour de la photo impossible." }, { status: 502 });
  }
}

export async function DELETE(request, { params }) {
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
    await serviceRequest(`/rest/v1/previsit_photos?id=eq.${encodeURIComponent(photo.id)}`, { method: "DELETE" });
    await serviceDeleteObject(PREVISIT_PHOTOS_BUCKET, photo.original_path).catch(() => null);
    await serviceDeleteObject(PREVISIT_PHOTOS_BUCKET, photo.annotated_path).catch(() => null);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Previsit photo delete error", error.message);
    return Response.json({ error: "Suppression de la photo impossible." }, { status: 502 });
  }
}
