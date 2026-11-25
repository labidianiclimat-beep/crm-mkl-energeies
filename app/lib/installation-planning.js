import { addDaysIso, weekRange } from "./entretien-agenda.js";
import { normalizeRoleLabel } from "./roles.js";

export function isSubcontractor(team) {
  return String(team?.kind || "") === "sous-traitant";
}

export function isFinishedInstallation(item) {
  return String(item?.status || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") === "termine";
}

export const SUBCONTRACTOR_SPECIALTIES = [
  "PAC et climatisation",
  "Photovoltaïque",
  "Ballons thermodynamiques",
  "Isolation",
  "Fenêtre",
  "Installation polyvalente",
  "Autre",
];

export const SUBCONTRACTOR_DOCUMENTS = [
  { id: "contrat", label: "Contrat d’entreprise", short: "Contrat" },
  { id: "decennale", label: "Assurance décennale", short: "Décennale" },
  { id: "urssaf", label: "Attestation URSSAF", short: "URSSAF" },
  { id: "rge", label: "Attestation RGE", short: "RGE" },
  { id: "kbis", label: "KBIS", short: "KBIS" },
];

export const SUBCONTRACTOR_DOC_MAX_BYTES = 1.8 * 1024 * 1024;

export const INSTALLATION_CHECKS = [
  { id: "dossier", label: "Dossier installation", short: "Dossier" },
  { id: "financement", label: "Financement", short: "Financement" },
  { id: "commande", label: "Matériel commandé", short: "Commandé" },
  { id: "arrivee", label: "Matériel arrivé", short: "Arrivé" },
  { id: "fournitures", label: "Petites fournitures", short: "Fournitures" },
  { id: "clientAvis", label: "Client avisé", short: "Avisé" },
];

export const INSTALLATION_CHECK_STATES = ["non", "pb", "oui"];

export function canEditInstallation(role) {
  const label = normalizeRoleLabel(role);
  return label === "Secrétariat" || label === "Responsable technique" || label === "Superadmin" || label === "Admin VIP";
}

export function installationCheckValue(item, id) {
  const value = item?.checks?.[id];
  const raw = value && typeof value === "object" ? value.state : value;
  if (raw === true || raw === "oui" || raw === "Oui") return "oui";
  if (raw === "pb" || raw === "PB") return "pb";
  return "non";
}

export function personInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(part => part && !/^(de|du|des|d|le|la|von|van)$/i.test(part));
  if (!parts.length) return "";
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`;
  return letters.toLocaleUpperCase("fr-FR").normalize("NFD").replace(/\p{M}/gu, "");
}

export function installationCheckStamp(item, id) {
  const value = item?.checks?.[id];
  if (!value || typeof value !== "object") return { initials: "", by: "" };
  return {
    initials: String(value.initials || "").trim().slice(0, 3),
    by: String(value.by || "").trim(),
  };
}

export function installationCheckReady(item, id) {
  return installationCheckValue(item, id) === "oui";
}

export function installationChecksComplete(item) {
  return INSTALLATION_CHECKS.every(check => installationCheckValue(item, check.id) === "oui");
}

/** Chantier non terminé, dans les 7 jours, dont une pastille n'est pas verte. */
export function installationAlertsWithinWeek(item, todayIso) {
  if (!item || isFinishedInstallation(item) || installationChecksComplete(item)) return false;
  const day = installationDay(item);
  const today = String(todayIso || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  return day >= today && day <= addDaysIso(today, 7);
}

export function installationCheckLabel(value) {
  if (value === "oui") return "Oui";
  if (value === "pb") return "PB";
  return "Non";
}

export function installationChecksFromForm(input = {}, { previous = {}, actorName = "" } = {}) {
  const initials = personInitials(actorName);
  const by = String(actorName || "").trim();
  return Object.fromEntries(INSTALLATION_CHECKS.map(check => {
    const raw = String(input[`check_${check.id}`] || "").trim().toLowerCase();
    const value = raw === "oui" ? "oui" : raw === "pb" ? "pb" : "non";
    const before = installationCheckValue({ checks: previous }, check.id);
    const stamp = installationCheckStamp({ checks: previous }, check.id);
    if (value === "oui") {
      if (before === "oui" && stamp.initials) return [check.id, { state: "oui", initials: stamp.initials, by: stamp.by }];
      if (before !== "oui" && initials) return [check.id, { state: "oui", initials, by }];
      return [check.id, "oui"];
    }
    return [check.id, value];
  }));
}

export function contractorDocumentReady(doc) {
  const name = Boolean(String(doc?.name || "").trim());
  if (!name) return false;
  if (String(doc?.data || "").startsWith("data:")) return true;
  return /\/subcontractors\/[^/]+\/(contrat|decennale|urssaf|rge|kbis)$/.test(String(doc?.path || ""));
}

export function installationTeamsEmbedFiles(teams) {
  return (Array.isArray(teams) ? teams : []).some(team =>
    Object.values(team?.documents || {}).some(doc => String(doc?.data || "").startsWith("data:"))
  );
}

export function contractorDocumentCount(documents = {}) {
  return SUBCONTRACTOR_DOCUMENTS.filter(item => contractorDocumentReady(documents?.[item.id])).length;
}

/** Le chantier le plus récent (date de début, puis création) passe devant. */
export function compareInstallationsRecent(a, b) {
  const start = String(b?.start || "").localeCompare(String(a?.start || ""));
  if (start) return start;
  const created = String(b?.created || "").localeCompare(String(a?.created || ""));
  if (created) return created;
  return String(b?.id || "").localeCompare(String(a?.id || ""));
}

export function installationDay(item) {
  const raw = String(item?.start || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10)) && !raw.includes("T")) return raw.slice(0, 10);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function installationAssignees(item) {
  const listed = Array.isArray(item?.assignees) ? item.assignees : [];
  const fromList = listed
    .map(entry => ({
      id: String(entry?.id || entry?.teamId || entry?.contractorId || ""),
      name: String(entry?.name || "").trim(),
      kind: entry?.kind || "",
      specialty: entry?.specialty || "",
    }))
    .filter(entry => entry.id);
  const unique = [];
  const seen = new Set();
  for (const entry of fromList) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    unique.push(entry);
  }
  if (unique.length) return unique;
  const id = String(item?.contractorId || item?.teamId || "");
  if (!id) return [{ id: "unassigned", name: "", kind: "", specialty: "" }];
  return [{
    id,
    name: String(item?.contractorName || "").trim(),
    kind: "sous-traitant",
    specialty: "",
  }];
}

export function installationAssigneeLabel(item) {
  const names = installationAssignees(item).map(entry => entry.name).filter(Boolean);
  return names.join(" · ");
}

export function installationBoards(installations = [], contractors = [], anchor) {
  const week = weekRange(anchor);
  const byId = new Map((contractors || []).map(team => [String(team.id), team]));
  const groups = new Map();
  for (const item of installations || []) {
    const day = installationDay(item);
    if (!week.days.includes(day)) continue;
    for (const assignee of installationAssignees(item)) {
      const key = assignee.id || "unassigned";
      if (!groups.has(key)) {
        const team = byId.get(key);
        groups.set(key, {
          id: key,
          name: team?.name || assignee.name || item?.contractorName || (key === "unassigned" ? "Sans équipe" : "Équipe"),
          items: [],
        });
      }
      groups.get(key).items.push(item);
    }
  }
  const boards = [...groups.values()]
    .map(group => ({
      id: group.id,
      name: group.name,
      columns: week.days.map(day => ({
        day,
        items: group.items
          .filter(item => installationDay(item) === day)
          .sort(compareInstallationsRecent),
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return { week, boards, shiftWeek: days => addDaysIso(week.start, days) };
}
