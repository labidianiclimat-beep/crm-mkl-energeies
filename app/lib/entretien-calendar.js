const OWN_CALENDAR_IDS = new Set(["primary"]);

export function clientsToCalendarUi(rows) {
  return (rows || []).map(row => ({
    id: row.id,
    lastName: row.nom,
    firstName: row.prenom,
    nom: row.nom,
    prenom: row.prenom,
    name: `${row.prenom || ""} ${row.nom || ""}`.trim() || row.raison_sociale,
    adresse: row.adresse,
    address: row.adresse,
    code_postal: row.code_postal,
    postalCode: row.code_postal,
    ville: row.ville,
    city: row.ville,
  }));
}

export function isOwnCalendarId(id, account) {
  const value = String(id || "").trim();
  if (!value || OWN_CALENDAR_IDS.has(value)) return true;
  return Boolean(account && [account.calendar_id, account.google_email].filter(Boolean).includes(value));
}

export async function persistEntretienWatchlist() {
  return { googleDisabled: true };
}

export async function pullEntretienAccount() {
  return {
    created: 0,
    updated: 0,
    skipped: 0,
    matched: 0,
    unlisted: 0,
    found: 0,
    calendars: 0,
    errors: [],
    read: [],
    googleDisabled: true,
  };
}

export async function loadEntretienMatchPool() {
  return { allClients: [], keyedClients: [] };
}

export async function pullSavedEntretienCalendars() {
  return {
    owners: 0,
    found: 0,
    created: 0,
    updated: 0,
    skipped: true,
    googleDisabled: true,
    reason: "Maintenance n’interroge plus Google Agenda.",
  };
}
