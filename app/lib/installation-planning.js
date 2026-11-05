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
  return label === "Secrétariat" || label === "Superadmin" || label === "Admin VIP";
}

export function installationCheckValue(item, id) {
  const value = item?.checks?.[id];
  if (value === true || value === "oui" || value === "Oui") return "oui";
  if (value === "pb" || value === "PB") return "pb";
  return "non";
}

export function installationCheckReady(item, id) {
  return installationCheckValue(item, id) === "oui";
}

export function installationCheckLabel(value) {
  if (value === "oui") return "Oui";
  if (value === "pb") return "PB";
  return "Non";
}

export function installationChecksFromForm(input = {}) {
  return Object.fromEntries(INSTALLATION_CHECKS.map(check => {
    const raw = String(input[`check_${check.id}`] || "").trim().toLowerCase();
    const value = raw === "oui" ? "oui" : raw === "pb" ? "pb" : "non";
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
          .sort((a, b) => String(a.start).localeCompare(String(b.start))),
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return { week, boards, shiftWeek: days => addDaysIso(week.start, days) };
}
