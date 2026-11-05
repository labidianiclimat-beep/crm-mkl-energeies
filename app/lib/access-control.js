import { grantedModules, normalizeRoleLabel } from "./roles.js";

export const navModuleMap = {
  "Vue d’ensemble": "Tableau de bord",
  "Études photovoltaïques": "Photovoltaïque administratif",
  "Rendez-vous commerciaux": "Agenda commercial",
  "Suivi commerciaux": "Agenda commercial",
  "Note de dimensionnement": "Études thermiques",
};

export const VIP_ONLY_NAV = ["Entreprise", "Journal d’activités"];

export function isVipOnlyNav(label) {
  return VIP_ONLY_NAV.includes(label);
}

export function moduleForNav(label) {
  return navModuleMap[label] || label;
}

export function resolveAllowedModules(profile, roleDefaults) {
  if (!profile) return null;
  return grantedModules(profile, roleDefaults);
}

export function canAccessNav(allowedModules, label) {
  if (label === "Applications") return true;
  if (isVipOnlyNav(label)) return false;
  if (!allowedModules) return false;
  if (label === "Grilles tarifaires PDF") {
    return allowedModules.includes("Grilles tarifaires PDF")
      || allowedModules.includes("Gestion des articles")
      || allowedModules.includes("Devis");
  }
  if (moduleForNav(label) === "Simulateur photovoltaïque") {
    return allowedModules.includes("Simulateur photovoltaïque")
      || allowedModules.includes("Études thermiques");
  }
  return allowedModules.includes(moduleForNav(label));
}

/** Titre affiché. Le module ouvert reste « Maintenance ». */
export function workspaceTitle(label, role) {
  if (label !== "Maintenance") return label;
  const normalized = normalizeRoleLabel(role);
  if (normalized === "Technicien") return "Mon agenda";
  if (normalized === "Secrétariat" || normalized === "Direction") return "Maintenance et agenda";
  return "Maintenance";
}

/** Le technicien n’a que l’espace Opérations : les autres pastilles répètent les mêmes applications. */
export function homeFamiliesForRole(families, role) {
  if (normalizeRoleLabel(role) !== "Technicien") return families;
  return (families || []).filter(family => family.name === "Opérations");
}

export function canAccessWorkspace(allowedModules, label, profile) {
  if (isVipOnlyNav(label)) {
    return normalizeRoleLabel(profile?.role) === "Admin VIP";
  }
  if (label === "Photovoltaïque administratif" && normalizeRoleLabel(profile?.role) === "Commercial") {
    return false;
  }
  return canAccessNav(allowedModules, label);
}
