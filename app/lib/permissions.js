import {
  actionPermissionCode,
  getRoleDefinition,
  modulePermissionCode,
  normalizeRoleLabel,
  profileHasPermission,
  profilePermissionCodes,
  roleModuleDefaults,
} from "./roles.js";
import { canAccessNav, moduleForNav, resolveAllowedModules } from "./access-control.js";
import { canViewOrgWideCommercialData } from "./scoping.js";

export const ADMIN_ROLES = ["Admin VIP", "Admin second"];

export function isAdminRole(role) {
  const definition = getRoleDefinition(role);
  if (definition) return Boolean(definition.isAdmin);
  return ADMIN_ROLES.includes(normalizeRoleLabel(role));
}

export function canAccessModule(profile, moduleName) {
  if (!profile?.active || !profile?.onboarding_completed_at) return false;
  if (isAdminRole(profile.role)) return true;
  return profileHasPermission(profile, modulePermissionCode(moduleName));
}

export function canAccessNavLabel(profile, label, roleDefaults) {
  const allowed = resolveAllowedModules(profile, roleDefaults || roleModuleDefaults());
  return canAccessNav(allowed, label);
}

export function canPerformAction(profile, action) {
  if (!profile?.active || !profile?.onboarding_completed_at) return false;
  const code = actionPermissionCode(action);
  if (profileHasPermission(profile, code)) return true;

  // Fallback legacy matrix (si catalogue non synchronisé)
  switch (action) {
    case "backup":
    case "export_clients":
    case "delete_appointment":
    case "manage_users":
    case "invite_users":
    case "delete_clients":
      return isAdminRole(profile.role);
    case "view_all_clients":
      return canViewOrgWideCommercialData(profile);
    case "send_mail":
      return (
        isAdminRole(profile.role) ||
        ["Responsable commercial", "Responsable technique", "Direction"].includes(normalizeRoleLabel(profile.role))
      );
    default:
      return false;
  }
}

export function canAccessApiModule(profile, moduleName) {
  return canAccessModule(profile, moduleName);
}

export function listProfilePermissions(profile) {
  return profilePermissionCodes(profile);
}

export { moduleForNav, resolveAllowedModules, canAccessNav, normalizeRoleLabel, roleModuleDefaults };
