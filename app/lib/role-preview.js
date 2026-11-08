import { extractGrantedActions, getRoleDefinition, isAdminVipRole, sanitizeGrantedModules } from "./roles.js";

export const ROLE_PREVIEW_HEADER = "x-mkl-user-preview";
export const ROLE_PREVIEW_COOKIE = "mkl-user-preview";
export const ROLE_PREVIEW_STORAGE = "mkl-user-preview";
const LEGACY_ROLE_COOKIE = "mkl-role-preview";
const LEGACY_ROLE_STORAGE = "mkl-role-preview";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizePreviewUserId(value) {
  const raw = String(value || "").trim();
  return UUID_RE.test(raw) ? raw.toLowerCase() : "";
}

export function previewableRoles() {
  return [];
}

export function sanitizePreviewRole() {
  return "";
}

export function canPreviewTarget(target) {
  if (!target) return false;
  const turnedOff = target.active === false || target.active === "false";
  if (!turnedOff) return true;
  if (target.authStatus === "En attente d’envoi") return true;
  return !target.onboarding_completed_at && target.authStatus !== "Inactif";
}

export function applyUserPreview(profile, target) {
  if (!profile) return profile;
  if (!isAdminVipRole(profile.role)) {
    return stripPreview(profile);
  }
  const targetId = sanitizePreviewUserId(target?.id);
  if (!targetId || targetId === String(profile.id || "").toLowerCase()) {
    return stripPreview(profile);
  }
  if (target.organization_id && profile.organization_id && String(target.organization_id) !== String(profile.organization_id)) {
    return stripPreview(profile);
  }
  if (!canPreviewTarget(target)) {
    return stripPreview(profile);
  }
  const role = String(target.role || "").trim() || "Commercial";
  const definition = getRoleDefinition(role);
  const sourceModules = Array.isArray(target.modules) && target.modules.length
    ? target.modules
    : (definition?.modules || []);
  const modules = sanitizeGrantedModules(sourceModules, { role });
  const actions = extractGrantedActions([...(target.actions || []), ...(target.modules || []), ...(definition?.actions || [])]);
  const previewName = String(target.full_name || target.email || "Utilisateur").trim();
  return {
    ...profile,
    id: target.id,
    role: definition?.label || role,
    modules,
    actions,
    manager: target.manager || "",
    zone: target.zone || "",
    specialties: Array.isArray(target.specialties) ? target.specialties : [],
    postal_code: target.postal_code || target.postalCode || "",
    city: target.city || "",
    dispatch_available: target.dispatch_available !== false,
    full_name: previewName,
    previewRole: previewName,
    previewUserId: target.id,
    previewUserName: previewName,
    realRole: "Admin VIP",
    realUserId: profile.id,
    realUserName: profile.full_name || profile.email || "Admin VIP",
  };
}

export function applyRolePreview(profile, targetOrRole) {
  if (targetOrRole && typeof targetOrRole === "object") {
    return applyUserPreview(profile, targetOrRole);
  }
  return stripPreview(profile);
}

export function withRolePreview(profile, target) {
  return applyRolePreview(profile, target);
}

function stripPreview(profile) {
  if (!profile) return profile;
  const {
    previewRole: _previewRole,
    previewUserId: _previewUserId,
    previewUserName: _previewUserName,
    realRole: _realRole,
    realUserId: _realUserId,
    realUserName: _realUserName,
    ...rest
  } = profile;
  return rest;
}

export function readPreviewUserIdFromRequest(request) {
  const header = request?.headers?.get?.(ROLE_PREVIEW_HEADER) || "";
  const fromHeader = sanitizePreviewUserId(header);
  if (fromHeader) return fromHeader;
  const cookieHeader = request?.headers?.get?.("cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)mkl-user-preview=([^;]*)/);
  try {
    return sanitizePreviewUserId(decodeURIComponent(match?.[1] || ""));
  } catch {
    return "";
  }
}

export function readPreviewRoleFromRequest(request) {
  return readPreviewUserIdFromRequest(request);
}

export function readStoredPreviewUserId() {
  if (typeof window === "undefined") return "";
  try {
    return sanitizePreviewUserId(window.localStorage.getItem(ROLE_PREVIEW_STORAGE) || "");
  } catch {
    return "";
  }
}

export function readStoredPreviewRole() {
  return readStoredPreviewUserId();
}

export function rolePreviewHeaders(headers = {}) {
  const next = headers instanceof Headers ? headers : new Headers(headers);
  const userId = readStoredPreviewUserId();
  if (userId) next.set(ROLE_PREVIEW_HEADER, userId);
  return next;
}

function writePreviewCookie(userId) {
  if (typeof document === "undefined") return;
  const maxAge = userId ? 34560000 : 0;
  document.cookie = `${ROLE_PREVIEW_COOKIE}=${encodeURIComponent(userId)}; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
  document.cookie = `${LEGACY_ROLE_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`;
}

export function setUserPreview(userId) {
  const id = sanitizePreviewUserId(userId);
  if (typeof window === "undefined") return id;
  try {
    if (id) window.localStorage.setItem(ROLE_PREVIEW_STORAGE, id);
    else window.localStorage.removeItem(ROLE_PREVIEW_STORAGE);
    window.localStorage.removeItem(LEGACY_ROLE_STORAGE);
  } catch {}
  writePreviewCookie(id);
  return id;
}

export function setRolePreview(userId) {
  return setUserPreview(userId);
}

export function clearRolePreview() {
  setUserPreview("");
}
