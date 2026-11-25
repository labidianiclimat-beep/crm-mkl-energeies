import { normalizeRoleLabel } from "./roles.js";

export const COMMERCIAL_HOME_MODULES = [
  "Agenda commercial",
  "Devis",
  "Études thermiques",
  "Photovoltaïque administratif",
];

export const COMMERCIAL_HOME_APPS = [
  {
    id: "rdv",
    label: "Suivi",
    subtitle: "Liste et statuts",
    target: "Suivi commerciaux",
    color: "#405fae",
  },
  {
    id: "agenda",
    label: "Agenda",
    subtitle: "Mon calendrier",
    target: "Agenda commercial",
    color: "#314d93",
  },
  {
    id: "devis",
    label: "Devis",
    subtitle: "Offres commerciales",
    target: "Devis",
    color: "#ffcc00",
  },
  {
    id: "thermal",
    label: "Étude thermique",
    subtitle: "Déperditions et PAC",
    target: "Études thermiques",
    color: "#314d93",
  },
  {
    id: "pv",
    label: "Étude PV",
    subtitle: "Première étude chez le client",
    target: "Études photovoltaïques",
    color: "#405fae",
  },
  {
    id: "fleet",
    label: "Mon véhicule",
    subtitle: "Kilométrage et incidents",
    target: "Parc automobile",
    color: "#314d93",
  },
];

export function usesCommercialHome(role) {
  return normalizeRoleLabel(role) === "Commercial";
}

export function withCommercialHomeModules(modules = [], role) {
  if (!usesCommercialHome(role)) return [...modules];
  const next = [...modules];
  for (const module of COMMERCIAL_HOME_MODULES) {
    if (!next.includes(module)) next.push(module);
  }
  return next;
}

export function commercialHomeFirstName(name = "") {
  const first = String(name || "").trim().split(/\s+/)[0];
  return first || "Commercial";
}
