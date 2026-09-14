export const navModuleMap = {
  "Vue d’ensemble": "Tableau de bord",
};

export function moduleForNav(label) {
  return navModuleMap[label] || label;
}

const ADMIN_ROLES = ["Admin VIP", "Admin second"];

export function resolveAllowedModules(profile, roleDefaults) {
  if (!profile) return null;
  const role = profile.role;
  if (role && ADMIN_ROLES.includes(role) && roleDefaults?.[role]) {
    return roleDefaults[role];
  }
  if (profile.modules?.length) return profile.modules;
  if (role && roleDefaults?.[role]) return roleDefaults[role];
  return ["Tableau de bord"];
}

export function canAccessNav(allowedModules, label) {
  if (label === "Applications") return true;
  if (!allowedModules) return false;
  return allowedModules.includes(moduleForNav(label));
}
