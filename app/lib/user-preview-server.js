import { serviceRequest } from "./supabase-server.js";
import { applyUserPreview, readPreviewUserIdFromRequest, sanitizePreviewUserId } from "./role-preview.js";
import { isAdminVipRole } from "./roles.js";

const TARGET_SELECT = "id,organization_id,full_name,email,role,modules,active,onboarding_completed_at,manager,zone,specialties,postal_code,city,dispatch_available";

export async function loadPreviewTarget(orgId, userId) {
  const id = sanitizePreviewUserId(userId);
  if (!id || !orgId) return null;
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=${TARGET_SELECT}&id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(orgId)}&limit=1`
  );
  return rows?.[0] || null;
}

export async function withUserPreview(profile, request) {
  if (!profile || !isAdminVipRole(profile.role)) return profile;
  const userId = readPreviewUserIdFromRequest(request);
  if (!userId) return profile;
  try {
    const target = await loadPreviewTarget(profile.organization_id, userId);
    return applyUserPreview(profile, target);
  } catch (error) {
    console.warn("user preview", error?.message || error);
    return profile;
  }
}
