import { canAccessScopedRow } from "./scoping";
import { isPersistedId } from "./previsit-photos";
import { serviceRequest } from "./supabase-server";
import { loadTeamMemberIds } from "./team-scope";

const CLIENT_SELECT =
  "id,organization_id,type_client,civilite,nom,prenom,raison_sociale,email,statut,commercial_id,created_by";
export const PHOTO_SELECT =
  "id,organization_id,visit_key,client_id,caption,comment,sort_order,taken_at,original_path,annotated_path,width,height,created_by,updated_by,created_at,updated_at";
export const MARK_SELECT = "id,photo_id,equipment_type,x,y,scale,rotation,sort_order";

export async function loadClientRow(clientId) {
  if (!isPersistedId(clientId)) return null;
  const rows = await serviceRequest(
    `/rest/v1/clients?select=${CLIENT_SELECT}&id=eq.${encodeURIComponent(clientId)}&limit=1`
  );
  return rows?.[0] || null;
}

export async function assertVisitPhotoAccess(auth, clientId) {
  if (!clientId) return { ok: true, client: null };
  const row = await loadClientRow(clientId);
  if (!row) return { error: "Client introuvable.", status: 404 };
  const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id);
  if (!canAccessScopedRow(auth.profile, auth.user.id, row, teamIds || [])) {
    return { error: "Client introuvable ou accès refusé.", status: 404 };
  }
  return { ok: true, client: row };
}

export async function assertVisitPhotosAccess(auth, photos = []) {
  const clientIds = [...new Set((photos || []).map(photo => photo?.client_id).filter(Boolean))];
  for (const clientId of clientIds) {
    const access = await assertVisitPhotoAccess(auth, clientId);
    if (access.error) return access;
  }
  return { ok: true };
}

export async function assertPhotoAccess(auth, photo) {
  if (!photo) return { error: "Photo introuvable.", status: 404 };
  if (photo.client_id) return assertVisitPhotoAccess(auth, photo.client_id);
  const siblings = await loadVisitPhotos(photo.organization_id, photo.visit_key);
  return assertVisitPhotosAccess(auth, siblings);
}

export async function loadVisitPhotos(orgId, visitKey) {
  return serviceRequest(
    `/rest/v1/previsit_photos?select=${PHOTO_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&visit_key=eq.${encodeURIComponent(visitKey)}&order=sort_order.asc,created_at.asc`
  );
}

export async function loadPhoto(orgId, photoId) {
  const rows = await serviceRequest(
    `/rest/v1/previsit_photos?select=${PHOTO_SELECT}&id=eq.${encodeURIComponent(photoId)}&organization_id=eq.${encodeURIComponent(orgId)}&limit=1`
  );
  return rows?.[0] || null;
}

export async function loadMarks(photoIds = []) {
  if (!photoIds.length) return [];
  const filter = photoIds.map(id => `"${id}"`).join(",");
  return serviceRequest(
    `/rest/v1/previsit_photo_marks?select=${MARK_SELECT}&photo_id=in.(${filter})&order=sort_order.asc`
  );
}

export async function replaceMarks(photoId, marks) {
  await serviceRequest(`/rest/v1/previsit_photo_marks?photo_id=eq.${encodeURIComponent(photoId)}`, {
    method: "DELETE",
  });
  if (!marks.length) return [];
  return serviceRequest("/rest/v1/previsit_photo_marks", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: marks.map(mark => ({
      photo_id: photoId,
      equipment_type: mark.equipmentType,
      x: mark.x,
      y: mark.y,
      scale: mark.scale,
      rotation: mark.rotation,
      sort_order: mark.sortOrder,
    })),
  });
}

export async function loadReport(orgId, visitKey) {
  const rows = await serviceRequest(
    `/rest/v1/previsit_reports?select=id,organization_id,visit_key,client_id,document_id,generated_by,generated_at&organization_id=eq.${encodeURIComponent(orgId)}&visit_key=eq.${encodeURIComponent(visitKey)}&limit=1`
  );
  return rows?.[0] || null;
}
