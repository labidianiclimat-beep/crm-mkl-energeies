import { isAdminRole } from "./permissions.js";
import { normalizeRoleLabel } from "./roles.js";

export const PV_SOFT_STUDY = "soft";
export const PV_COMPLETE_STUDY = "complete";

export function pvStudyKind(project = {}) {
  return project.studyKind === PV_COMPLETE_STUDY || project.completeStudy
    ? (project.studyKind === PV_COMPLETE_STUDY ? PV_COMPLETE_STUDY : PV_SOFT_STUDY)
    : PV_SOFT_STUDY;
}

export function isCompletePvStudy(project = {}) {
  return Boolean(project.completeStudy) || project.studyKind === PV_COMPLETE_STUDY;
}

export function canCreateSoftPvStudy(profile) {
  if (!profile?.active || !profile?.onboarding_completed_at) return false;
  const role = normalizeRoleLabel(profile.role);
  return isAdminRole(role)
    || ["Commercial", "Responsable commercial", "Direction", "Secrétariat"].includes(role);
}

export function canCreateCompletePvStudy(profile) {
  if (!profile?.active || !profile?.onboarding_completed_at) return false;
  const role = normalizeRoleLabel(profile.role);
  return isAdminRole(role) || role === "Responsable technique";
}

export function canOpenSolarDossier(profile) {
  if (!profile?.active || !profile?.onboarding_completed_at) return false;
  const role = normalizeRoleLabel(profile.role);
  return isAdminRole(role)
    || ["Responsable technique", "Direction", "Responsable commercial", "Secrétariat"].includes(role);
}
