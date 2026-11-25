import {
  actionPermissionCode,
  getRoleDefinition,
  modulePermissionCode,
  normalizeRoleLabel,
  profileHasPermission,
  profilePermissionCodes,
  roleModuleDefaults,
} from "./roles.js";
import { canAccessNav, canAccessWorkspace, moduleForNav, resolveAllowedModules } from "./access-control.js";
import { canViewOrgWideCommercialData } from "./scoping.js";
import { canDispatchProspects } from "./prospect-dispatch.js";

export const ADMIN_ROLES = ["Admin VIP", "Superadmin"];

const FIELD_SALES_ROLES = ["Commercial", "Responsable commercial"];

export function locksFieldSalesData(role) {
  return FIELD_SALES_ROLES.includes(normalizeRoleLabel(role));
}

export function canEditExistingAppointment(profile) {
  if (!profile?.active || !profile?.onboarding_completed_at) return false;
  return !locksFieldSalesData(profile.role);
}

export function canEditRecordedDirectory(profile) {
  if (!profile?.active || !profile?.onboarding_completed_at) return false;
  return isAdminRole(profile.role);
}

export function canEditExistingClient(profile) {
  return canEditRecordedDirectory(profile);
}

export function isAdminRole(role) {
  const definition = getRoleDefinition(role);
  if (definition) return Boolean(definition.isAdmin);
  return ADMIN_ROLES.includes(normalizeRoleLabel(role));
}

export function isAdminVip(role) {
  return normalizeRoleLabel(role) === "Admin VIP";
}

export function canConfirmEntretienImport(profile) {
  const role = profile?.realRole || profile?.role;
  if (isAdminRole(role)) return true;
  return normalizeRoleLabel(role) === "Direction";
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
  if (isAdminVip(profile.role)) return true;
  if (locksFieldSalesData(profile.role) && (action === "export_clients" || action === "delete_appointment")) {
    return false;
  }
  if (action === "delete_prospects") {
    return isAdminRole(profile.role) || normalizeRoleLabel(profile.role) === "Responsable prospection";
  }
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
        ["Responsable commercial", "Responsable prospection", "Responsable technique", "Direction"].includes(normalizeRoleLabel(profile.role))
      );
    case "dispatch_prospects":
      return canDispatchProspects(profile);
    case "manage_fleet":
      return isAdminRole(profile.role) || normalizeRoleLabel(profile.role) === "Responsable prospection";
    case "assign_fleet":
    case "validate_fleet":
    case "archive_fleet":
      return isAdminVip(profile.role);
    default:
      return false;
  }
}

export function canAccessApiModule(profile, moduleName) {
  return canAccessModule(profile, moduleName);
}

export function canListOrganizationUsers(profile) {
  return canAccessModule(profile, "Utilisateurs") || canPerformAction(profile, "manage_users");
}

export function listProfilePermissions(profile) {
  return profilePermissionCodes(profile);
}

export { moduleForNav, resolveAllowedModules, canAccessNav, canAccessWorkspace, normalizeRoleLabel, roleModuleDefaults };
