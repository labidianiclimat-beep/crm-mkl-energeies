import { requireApiSession } from "../../../../lib/api-auth";
import {
  MAX_PREVISIT_PHOTOS,
  PREVISIT_PHOTOS_BUCKET,
  normalizeCaption,
  normalizeComment,
  normalizeMarks,
  normalizeVisitKey,
  parseJpegBuffer,
  photoToUi,
  storagePathForPhoto,
} from "../../../../lib/previsit-photos";
import {
  assertVisitPhotoAccess,
  assertVisitPhotosAccess,
  loadMarks,
  loadVisitPhotos,
  replaceMarks,
} from "../../../../lib/previsit-photo-store";
import {
  serviceDeleteObject,
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
    const photos = await loadVisitPhotos(auth.profile.organization_id, key);
    const access = await assertVisitPhotosAccess(auth, photos);
    if (access.error) return Response.json({ error: access.error }, { status: access.status });
    const marks = await loadMarks(photos.map(item => item.id));
    return Response.json({
      photos: photos.map(photo => photoToUi(photo, marks.filter(mark => mark.photo_id === photo.id), key)),
    });
  } catch (error) {
    const known = /Prévisite introuvable/i.test(error.message || "");
    if (known) return Response.json({ error: error.message }, { status: 400 });
    console.error("Previsit photos list error", error.message);
    return Response.json({ error: "Impossible de charger les photos." }, { status: 502 });
  }
}

export async function POST(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Visites techniques" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    const { visitKey } = await params;
    const key = normalizeVisitKey(visitKey);
    const form = await request.formData();
    const clientId = String(form.get("clientId") || "").trim() || null;
    const access = await assertVisitPhotoAccess(auth, clientId);
    if (access.error) return Response.json({ error: access.error }, { status: access.status });

    const existing = await loadVisitPhotos(auth.profile.organization_id, key);
    if (existing.length >= MAX_PREVISIT_PHOTOS) {
      return Response.json({ error: `${MAX_PREVISIT_PHOTOS} photos maximum par prévisite.` }, { status: 400 });
    }

    const originalFile = form.get("original");
    const annotatedFile = form.get("annotated");
    if (!originalFile?.arrayBuffer || !annotatedFile?.arrayBuffer) {
      return Response.json({ error: "Ajoutez la photo originale et la photo annotée." }, { status: 400 });
    }
    const original = parseJpegBuffer(Buffer.from(await originalFile.arrayBuffer()), "La photo originale");
    const annotated = parseJpegBuffer(Buffer.from(await annotatedFile.arrayBuffer()), "La photo annotée");
    const marks = normalizeMarks(JSON.parse(String(form.get("marks") || "[]")));
    const photoId = crypto.randomUUID();
    const originalPath = storagePathForPhoto({ organizationId: auth.profile.organization_id, visitKey: key, photoId, kind: "original" });
    const annotatedPath = storagePathForPhoto({ organizationId: auth.profile.organization_id, visitKey: key, photoId, kind: "annotated" });

    await serviceUploadObject(PREVISIT_PHOTOS_BUCKET, originalPath, original, "image/jpeg");
    await serviceUploadObject(PREVISIT_PHOTOS_BUCKET, annotatedPath, annotated, "image/jpeg");

    try {
      const rows = await serviceRequest("/rest/v1/previsit_photos", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: {
          id: photoId,
          organization_id: auth.profile.organization_id,
          visit_key: key,
          client_id: clientId,
          caption: normalizeCaption(form.get("caption")),
          comment: normalizeComment(form.get("comment")),
          sort_order: existing.length,
          taken_at: form.get("takenAt") || new Date().toISOString(),
          original_path: originalPath,
          annotated_path: annotatedPath,
          width: Number(form.get("width") || 0),
          height: Number(form.get("height") || 0),
          created_by: auth.user.id,
          updated_by: auth.user.id,
        },
      });
      const created = rows?.[0];
      const savedMarks = await replaceMarks(photoId, marks);
      return Response.json({ photo: photoToUi(created, savedMarks, key) }, { status: 201 });
    } catch (error) {
      await serviceDeleteObject(PREVISIT_PHOTOS_BUCKET, originalPath).catch(() => null);
      await serviceDeleteObject(PREVISIT_PHOTOS_BUCKET, annotatedPath).catch(() => null);
      throw error;
    }
  } catch (error) {
    const known = /photo|JPEG|équipement|Annotations|Prévisite|lourde|maximum/i.test(error.message || "");
    if (known) return Response.json({ error: error.message }, { status: 400 });
    console.error("Previsit photo upload error", error.message);
    return Response.json({ error: error.message || "Envoi de la photo impossible." }, { status: 502 });
  }
}
