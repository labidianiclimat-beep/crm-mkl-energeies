export const CLIENT_PORTAL_FIELDS = [
  { id: "edfLogin", label: "Identifiant EDF" },
  { id: "edfPassword", label: "Mdp EDF" },
  { id: "mprLogin", label: "Identifiant MPR" },
  { id: "mprPassword", label: "Mdp MPR" },
];

export function emptyClientPortalAccess() {
  return {
    edfLogin: "",
    edfLoginOn: false,
    edfPassword: "",
    edfPasswordOn: false,
    mprLogin: "",
    mprLoginOn: false,
    mprPassword: "",
    mprPasswordOn: false,
  };
}

export function normalizeClientPortalAccess(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const next = emptyClientPortalAccess();
  for (const field of CLIENT_PORTAL_FIELDS) {
    next[field.id] = String(source[field.id] || "").trim().slice(0, 120);
    next[`${field.id}On`] = Boolean(source[`${field.id}On`]);
  }
  return next;
}
