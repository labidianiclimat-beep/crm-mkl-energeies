import { parseXlsxBuffer } from "./xlsx-rows.js";
import { classifyAgendaTitle, applyColumnMap, CLIENT_IMPORT_TARGETS } from "./entretien.js";
import { normalizePhone, normalizeText } from "./clients.js";

export const ENTRETIEN_SHEET = {
  id: "19uwcTBkcTcCTS30D_SChhRrKJBD4fY5zrEoPZ1sDi2A",
  gid: "2027831146",
  url: "https://docs.google.com/spreadsheets/d/19uwcTBkcTcCTS30D_SChhRrKJBD4fY5zrEoPZ1sDi2A/edit?gid=2027831146#gid=2027831146",
};

export const SOURCE_KIND = {
  yildiz: "yildiz",
  rebecca: "rebecca",
  sheet: "sheet",
};

const HEADER_ALIASES = {
  name: ["nom du client", "designation client", "client", "nom", "nom client", "designation"],
  prenom: ["prenom du client", "prenom"],
  address: ["adresse client", "adresse", "rue"],
  postal: ["code postal", "cp"],
  city: ["ville"],
  equipment: ["type d'instal", "type d instal", "type installation", "type materiel", "materiel"],
  phone: ["coordonnees", "telephone", "tel", "portable"],
  email: ["mail", "email", "e-mail", "courriel"],
  amountHt: ["montant ht net", "montant ht", "prix ht", "prix unitaire ht", "ht"],
  amountTva: ["tva 10", "tva"],
  amountTtc: ["ttc"],
  contractNumber: ["n contrat", "n° contrat", "no contrat", "numero contrat", "n°contrat"],
  subscribedOn: ["date souscription contrat", "date souscription"],
  signedOn: ["date contrat signe", "date contrat signé"],
  signed: ["contrat signe", "contrat signé"],
  installStatus: ["statut instal", "statut installation"],
  installedOn: ["date instal", "date installation"],
  origin: ["origine", "source"],
  notes: ["nrp", "notes", "observation"],
  invoiceDate: ["date du document", "date facture", "date facturation", "date de facturation", "facture le", "date intervention", "date"],
  invoiceNumber: ["numero du document", "n document", "n facture", "no facture", "numero facture", "num facture"],
  label: ["libelle du produit", "designation 1re ligne", "designation"],
  docType: ["type de document"],
  reference: ["reference du produit"],
  kind: ["entretien autre"],
};

export function excelSerialToIso(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    let year = slash[3];
    if (year.length === 2) year = `20${year}`;
    const y = Number(year);
    if (y < 1990 || y > 2040) return "";
    return `${String(y).padStart(4, "0")}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
  }
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 30000 || number > 60000) return "";
  const utc = Date.UTC(1899, 11, 30) + Math.round(number) * 86400000;
  return new Date(utc).toISOString().slice(0, 10);
}

export function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`´’]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function splitPersonName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { nom: "", prenom: "" };
  if (parts.length === 1) return { nom: parts[0], prenom: "" };
  return { nom: parts.slice(0, -1).join(" "), prenom: parts.at(-1) };
}

export function parseFrenchAddress(value) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  const match = raw.match(/^(.*?)[\s,]+(\d{5})\s+(.+)$/);
  if (!match) return { adresse: raw, codePostal: "", ville: "" };
  return {
    adresse: match[1].trim(),
    codePostal: match[2],
    ville: match[3].trim(),
  };
}

export function personMatchKey({ nom, prenom, adresse, codePostal, ville } = {}) {
  const name = normalizeKey(`${nom || ""} ${prenom || ""}`);
  const place = normalizeKey(`${codePostal || ""} ${ville || ""} ${String(adresse || "").slice(0, 24)}`);
  return `${name}|${place}`;
}

export function identityKeyFromClient(client = {}) {
  return personMatchKey({
    nom: client.nom || client.lastName,
    prenom: client.prenom || client.firstName,
    adresse: client.adresse || client.address,
    codePostal: client.code_postal || client.postalCode,
    ville: client.ville || client.city,
  });
}

export function clientIdentityKey(client = {}, fallbackId = "") {
  const identity = identityKeyFromClient(client);
  return identity && !identity.startsWith("|") ? identity : fallbackId;
}

export function preferKeyedClients(rows = [], { clients = [], keyedClientIds = [] } = {}) {
  const keyed = new Set(keyedClientIds);
  const byId = Object.fromEntries((clients || []).map(client => [client.id, client]));
  const groups = new Map();
  for (const row of rows || []) {
    const key = clientIdentityKey(byId[row.client_id], row.client_id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].map(bucket => (
    bucket.find(row => keyed.has(row.client_id)) || bucket[0]
  ));
}

export function keepEntretienPilotageRows(rows = [], { keyedClientIds = [], visitClientIds = [] } = {}) {
  const keyed = new Set(keyedClientIds);
  const visits = new Set(visitClientIds);
  if (!keyed.size) return rows || [];
  return (rows || []).filter(row => keyed.has(row.client_id) || visits.has(row.client_id));
}

export function pickImportedContracts(contracts = [], { clients = [], keys = [] } = {}) {
  const byId = Object.fromEntries((clients || []).map(client => [client.id, client]));
  const identityOf = clientId => clientIdentityKey(byId[clientId], clientId);
  const byClient = new Map();
  const byIdentity = new Map();
  for (const row of contracts || []) {
    if (!row?.client_id) continue;
    const currentClient = byClient.get(row.client_id);
    if (!currentClient || String(row.updated_at || "") > String(currentClient.updated_at || "")) {
      byClient.set(row.client_id, row);
    }
    const identity = identityOf(row.client_id);
    const currentIdentity = byIdentity.get(identity);
    if (!currentIdentity || String(row.updated_at || "") > String(currentIdentity.updated_at || "")) {
      byIdentity.set(identity, row);
    }
  }
  return (keys || []).filter(key => key?.client_id && key?.import_key).map(key => {
    const contract = byClient.get(key.client_id) || byIdentity.get(identityOf(key.client_id));
    if (contract) {
      return { ...contract, client_id: key.client_id, import_key: key.import_key };
    }
    return {
      id: `missing:${key.import_key}`,
      client_id: key.client_id,
      import_key: key.import_key,
      number: null,
      frequency: "Annuelle",
      amount: null,
      status: "inconnu",
      notes: "Fiche importée, contrat Excel à rattacher",
    };
  });
}

function headerIndex(headers = []) {
  const map = {};
  headers.forEach((label, index) => {
    const key = normalizeKey(label);
    if (key) map[key] = index;
  });
  return map;
}

function pickColumn(indexMap, aliases) {
  for (const alias of aliases) {
    if (indexMap[alias] != null) return indexMap[alias];
  }
  return -1;
}

export function detectColumnMap(headers = []) {
  const indexMap = headerIndex(headers);
  const columnMap = {};
  for (const [target, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = pickColumn(indexMap, aliases);
    if (index >= 0) columnMap[target] = index;
  }
  return columnMap;
}

function cell(row, index) {
  if (index == null || index < 0) return "";
  return String(row?.[index] ?? "").trim();
}

function money(value) {
  const raw = String(value || "").replace(/\s/g, "").replace(",", ".");
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function yesNo(value) {
  const key = normalizeKey(value);
  if (["oui", "yes", "o", "1", "true", "signe"].includes(key)) return true;
  if (["non", "no", "n", "0", "false"].includes(key)) return false;
  return null;
}

function applySourceColumnFallbacks(columnMap, source) {
  const map = { ...columnMap };
  if (map.name == null && source === SOURCE_KIND.yildiz) {
    map.name = 1;
    map.address ??= 2;
    map.equipment ??= 3;
    map.phone ??= 5;
    map.email ??= 6;
    map.amountHt ??= 7;
    map.amountTva ??= 8;
    map.amountTtc ??= 9;
    map.origin ??= 10;
    map.installedOn ??= 11;
    map.notes ??= 12;
  }
  if (map.name == null && source === SOURCE_KIND.rebecca) {
    map.contractNumber ??= 1;
    map.name = 2;
    map.address ??= 3;
    map.equipment ??= 4;
    map.phone ??= 5;
    map.origin ??= 7;
    map.amountHt ??= 8;
    map.amountTva ??= 9;
    map.amountTtc ??= 10;
    map.subscribedOn ??= 11;
    map.installStatus ??= 12;
    map.signed ??= 13;
    map.signedOn ??= 14;
  }
  return map;
}

export function rowToContract(row, columnMap, { source, sheet, line } = {}) {
  const name = cell(row, columnMap.name);
  if (!name) return null;
  const { nom, prenom } = splitPersonName(name);
  const parsedAddress = parseFrenchAddress(cell(row, columnMap.address));
  const phone = cell(row, columnMap.phone);
  const email = cell(row, columnMap.email).replace(",", ".").replace(/\s+/g, "");
  const amountHt = money(cell(row, columnMap.amountHt));
  return {
    source,
    sheet,
    line,
    displayName: name,
    nom,
    prenom,
    ...parsedAddress,
    phone,
    email: email.includes("@") ? email : "",
    equipment: cell(row, columnMap.equipment),
    amountHt,
    amountTva: money(cell(row, columnMap.amountTva)),
    amountTtc: money(cell(row, columnMap.amountTtc)),
    contractNumber: String(cell(row, columnMap.contractNumber) || "").replace(/\.0$/, ""),
    subscribedOn: excelSerialToIso(cell(row, columnMap.subscribedOn)),
    signedOn: excelSerialToIso(cell(row, columnMap.signedOn)),
    signed: yesNo(cell(row, columnMap.signed)),
    installStatus: cell(row, columnMap.installStatus),
    installedOn: excelSerialToIso(cell(row, columnMap.installedOn)),
    origin: cell(row, columnMap.origin),
    notes: cell(row, columnMap.notes),
    invoiceDate: excelSerialToIso(cell(row, columnMap.invoiceDate)),
    invoiceNumber: String(cell(row, columnMap.invoiceNumber) || "").replace(/\.0$/, ""),
    matchKey: personMatchKey({ nom, prenom, ...parsedAddress }),
  };
}

export function rowsFromXlsx(buffer, source) {
  const parsed = parseXlsxBuffer(buffer);
  const out = [];
  for (const sheet of parsed.sheets || []) {
    const table = (sheet.rows || []).filter(row => row.some(Boolean));
    if (!table.length) continue;
    const headers = table[0];
    const columnMap = applySourceColumnFallbacks(detectColumnMap(headers), source);
    table.slice(1).forEach((row, index) => {
      const item = rowToContract(row, columnMap, { source, sheet: sheet.name, line: index + 2 });
      if (item) out.push(item);
    });
  }
  return out;
}

export function inspectXlsxMapping(buffer, source) {
  const parsed = parseXlsxBuffer(buffer);
  const sheet = (parsed.sheets || []).find(item => (item.rows || []).some(row => row.some(Boolean)));
  if (!sheet) return { source, sheet: "", headers: [], columnMap: {} };
  const table = (sheet.rows || []).filter(row => row.some(Boolean));
  return {
    source,
    sheet: sheet.name,
    headers: table[0] || [],
    columnMap: applySourceColumnFallbacks(detectColumnMap(table[0] || []), source),
  };
}

export function shouldImportGoogleEvent(draft) {
  if (!draft?.google_event_id) return false;
  if (!String(draft.title || "").trim()) return false;
  if (draft.nature_proposed === "installation" && draft.nature_status !== "ambigu") return false;
  return true;
}

function mergeRecord(base, extra) {
  const next = { ...base };
  for (const [key, value] of Object.entries(extra || {})) {
    if (value === "" || value == null || value === false && next[key]) continue;
    if (next[key] == null || next[key] === "") next[key] = value;
  }
  if (extra?.contractNumber) next.contractNumber = extra.contractNumber;
  if (extra?.signed != null) next.signed = extra.signed;
  if (extra?.signedOn) next.signedOn = extra.signedOn;
  if (extra?.subscribedOn) next.subscribedOn = extra.subscribedOn;
  next.sources = [...new Set([...(base.sources || [base.source]), extra?.source].filter(Boolean))];
  return next;
}

export function mergeImportRecords(groups = []) {
  const byKey = new Map();
  for (const list of groups) {
    for (const item of list || []) {
      const current = byKey.get(item.matchKey);
      byKey.set(item.matchKey, current ? mergeRecord(current, item) : { ...item, sources: [item.source] });
    }
  }
  return [...byKey.values()];
}

export function matchCrmClient(record, clients = []) {
  const name = normalizeKey(`${record.nom || ""} ${record.prenom || ""}`);
  const phone = normalizePhone(record.phone);
  const email = String(record.email || "").toLowerCase();
  const postal = normalizeKey(record.codePostal);
  const hits = [];
  for (const client of clients || []) {
    const clientName = normalizeKey(`${client.lastName || client.nom || ""} ${client.firstName || client.prenom || ""} ${client.name || ""} ${client.company || client.raison_sociale || ""}`);
    const reasons = [];
    if (email && normalizeText(client.email) === email) reasons.push("email");
    const clientPhone = normalizePhone(client.phone || client.telephone || "");
    const clientMobile = normalizePhone(client.mobile || client.telephone_secondaire || "");
    if (phone && (phone === clientPhone || phone === clientMobile)) reasons.push("telephone");
    const clientIdentity = normalizeKey(`${client.lastName || client.nom || ""} ${client.firstName || client.prenom || ""}`);
    const postalMatch = postal && postal === normalizeKey(client.postalCode || client.code_postal);
    if (name && clientIdentity && (clientIdentity === name || clientName.includes(name)) && postalMatch) {
      reasons.push("nom + code postal");
    }
    if (!reasons.length) continue;
    hits.push({ client, reasons });
  }
  if (hits.length === 1) return { status: "linked", client: hits[0].client, reasons: hits[0].reasons };
  if (hits.length > 1) return { status: "review", candidates: hits.slice(0, 5) };
  return { status: "created" };
}

export function previewEntretienImport({ yildiz = [], rebecca = [], sheet = [], clients = [] } = {}) {
  const merged = mergeImportRecords([yildiz, rebecca, sheet]);
  const items = merged.map(record => {
    const match = matchCrmClient(record, clients);
    return {
      ...record,
      matchStatus: match.status,
      matchReasons: match.reasons || [],
      clientId: match.client?.id || null,
      clientName: match.client?.name || "",
      candidateCount: match.candidates?.length || 0,
    };
  });
  const counts = {
    total: items.length,
    yildiz: yildiz.length,
    rebecca: rebecca.length,
    sheet: sheet.length,
    linked: items.filter(item => item.matchStatus === "linked").length,
    created: items.filter(item => item.matchStatus === "created").length,
    review: items.filter(item => item.matchStatus === "review").length,
    signed: items.filter(item => item.signed === true).length,
    unsigned: items.filter(item => item.signed === false).length,
  };
  return { counts, items };
}

export function invoiceInterventionDate(record = {}) {
  return record.invoiceDate || record.subscribedOn || record.signedOn || record.installedOn || "";
}

export function historicalInvoiceNumber(record = {}) {
  const raw = String(record.invoiceNumber || "").trim();
  const day = invoiceInterventionDate(record);
  if (/^f[-_ ]/i.test(raw)) return `ENT-HIST-${raw.replace(/\s+/g, "")}`.slice(0, 80);
  if (raw) return `ENT-HIST-${raw}-${day || "sans-date"}`.slice(0, 80);
  if (!day || !record.matchKey) return "";
  return `ENT-HIST-${String(record.matchKey).slice(0, 40)}-${day}`.slice(0, 80);
}

export function isEntretienInvoiceLine(record = {}) {
  if (normalizeKey(record.docType) === "avoir") return false;
  const blob = normalizeKey(`${record.label || ""} ${record.kind || ""} ${record.reference || ""} ${record.equipment || ""}`);
  return /entretien|maintenance/.test(blob);
}

export function blankClientFill(existing = {}, incoming = {}) {
  const patch = {};
  const fill = (column, value) => {
    if (String(existing[column] || "").trim()) return;
    const next = String(value || "").trim();
    if (next) patch[column] = next;
  };
  fill("prenom", incoming.prenom);
  fill("telephone", incoming.phone);
  fill("email", incoming.email);
  fill("adresse", incoming.adresse);
  fill("code_postal", incoming.codePostal);
  fill("ville", incoming.ville);
  return patch;
}

export function invoiceVisitDraft(record, { clientId, userId, date } = {}) {
  const day = date || invoiceInterventionDate(record);
  const number = historicalInvoiceNumber(record);
  const place = [record.adresse, record.codePostal, record.ville].filter(Boolean).join(" ");
  const at = new Date().toISOString();
  return {
    source: "facture_indice",
    title: `Entretien facturé ${record.displayName || record.nom || ""}`.trim(),
    location: place,
    description: number,
    scheduled_start: day ? `${day}T12:00:00.000Z` : null,
    client_id: clientId || null,
    client_link_status: clientId ? "valide" : "non_rapproche",
    client_linked_at: clientId ? at : null,
    client_linked_by: clientId ? userId || null : null,
    nature_proposed: "entretien",
    nature_status: "valide",
    nature_validated: "entretien",
    nature_validated_at: at,
    nature_validated_by: userId || null,
    realization_status: "confirme",
    realization_date: day,
    realization_basis: "autre",
    realization_note: `Date de facturation retenue comme intervention${number ? ` (${number})` : ""}.`,
    realization_recorded_at: at,
    realization_recorded_by: userId || null,
    signals: ["facture"],
  };
}

function invoiceSlotKey(record) {
  return [
    record.matchKey || "",
    invoiceInterventionDate(record),
    String(record.invoiceNumber || record.contractNumber || "").trim(),
  ].join("|");
}

export function rowsFromInvoiceBuffer(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return rowsFromInvoiceWorkbook(bytes);
  const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
  return recordsFromInvoiceTable(csvToRows(text, detectCsvDelimiter(text)));
}

function detectCsvDelimiter(text) {
  const header = String(text || "").split(/\r?\n/).find(line => line.trim()) || "";
  const commas = (header.match(/,/g) || []).length;
  const semis = (header.match(/;/g) || []).length;
  return semis > commas ? ";" : ",";
}

export function csvToRows(text = "", delimiter = ",") {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  return lines.map(line => {
    const cells = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const ch = line[index];
      if (ch === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else quoted = !quoted;
      } else if (ch === delimiter && !quoted) {
        cells.push(current.trim());
        current = "";
      } else current += ch;
    }
    cells.push(current.trim());
    return cells;
  });
}

function invoiceColumnMap(headers = []) {
  const columnMap = detectColumnMap(headers);
  if (columnMap.name == null) {
    columnMap.name = headers.findIndex(label => {
      const key = normalizeKey(label);
      return key === "nom du client" || key === "nom" || key.includes("client");
    });
  }
  if (columnMap.invoiceDate == null) {
    columnMap.invoiceDate = headers.findIndex(label => normalizeKey(label) === "date");
  }
  return columnMap;
}

function invoiceRecordFromRow(row, columnMap, { sheet, line } = {}) {
  const prenomCol = cell(row, columnMap.prenom);
  const nameCell = cell(row, columnMap.name);
  if (!nameCell && !prenomCol) return null;
  const split = prenomCol ? { nom: nameCell, prenom: prenomCol } : splitPersonName(nameCell);
  const street = cell(row, columnMap.address);
  const postal = cell(row, columnMap.postal);
  const city = cell(row, columnMap.city);
  const parsed = postal
    ? { adresse: street, codePostal: postal, ville: city }
    : parseFrenchAddress(street);
  const record = {
    source: "invoice",
    sheet,
    line,
    displayName: prenomCol ? `${prenomCol} ${nameCell}`.trim() : nameCell,
    nom: split.nom,
    prenom: split.prenom,
    ...parsed,
    phone: cell(row, columnMap.phone),
    email: cell(row, columnMap.email),
    equipment: cell(row, columnMap.equipment),
    amountHt: money(cell(row, columnMap.amountHt)),
    amountTva: money(cell(row, columnMap.amountTva)),
    amountTtc: money(cell(row, columnMap.amountTtc)),
    invoiceDate: excelSerialToIso(cell(row, columnMap.invoiceDate)),
    invoiceNumber: String(cell(row, columnMap.invoiceNumber) || "").replace(/\.0$/, ""),
    label: cell(row, columnMap.label),
    docType: cell(row, columnMap.docType),
    reference: cell(row, columnMap.reference),
    kind: cell(row, columnMap.kind),
    matchKey: personMatchKey({ nom: split.nom, prenom: split.prenom, ...parsed }),
  };
  if (!isEntretienInvoiceLine(record)) return null;
  return record;
}

export function recordsFromInvoiceTable(rows = [], { sheet = "factures" } = {}) {
  if (!rows.length) return { records: [], skipped: 0 };
  const columnMap = invoiceColumnMap(rows[0]);
  const records = [];
  let skipped = 0;
  rows.slice(1).forEach((row, index) => {
    if (!row.some(Boolean)) return;
    const item = invoiceRecordFromRow(row, columnMap, { sheet, line: index + 2 });
    if (item) records.push(item);
    else if (cell(row, columnMap.name) || cell(row, columnMap.prenom)) skipped += 1;
  });
  return { records, skipped };
}

export function rowsFromInvoiceWorkbook(buffer) {
  const parsed = parseXlsxBuffer(buffer);
  const records = [];
  let skipped = 0;
  for (const sheet of parsed.sheets || []) {
    const table = (sheet.rows || []).filter(row => row.some(Boolean));
    if (!table.length) continue;
    const parsedSheet = recordsFromInvoiceTable(table, { sheet: sheet.name });
    records.push(...parsedSheet.records);
    skipped += parsedSheet.skipped;
  }
  return { records, skipped };
}

export function inspectInvoiceMapping(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const parsed = parseXlsxBuffer(bytes);
    const sheet = (parsed.sheets || []).find(item => (item.rows || []).some(row => row.some(Boolean)));
    const table = (sheet?.rows || []).filter(row => row.some(Boolean));
    return {
      sheet: sheet?.name || "",
      headers: table[0] || [],
      columnMap: invoiceColumnMap(table[0] || []),
    };
  }
  const text = bytes.toString("utf8");
  const rows = csvToRows(text, detectCsvDelimiter(text));
  return { sheet: "csv", headers: rows[0] || [], columnMap: invoiceColumnMap(rows[0] || []) };
}

function clientNameTokens(client = {}) {
  return nameTokens(`${client.lastName || client.nom || ""} ${client.firstName || client.prenom || ""} ${client.name || ""} ${client.company || client.raison_sociale || ""}`);
}

export function matchInvoiceClient(record = {}, clients = []) {
  const wanted = [...new Set(nameTokens(`${record.displayName || ""} ${record.nom || ""} ${record.prenom || ""}`))];
  const postal = normalizeKey(record.codePostal);
  if (wanted.length < 2 && !postal) {
    const token = wanted[0];
    const hits = token ? (clients || []).filter(client => clientNameTokens(client).includes(token)) : [];
    if (hits.length === 1) return { status: "linked", client: hits[0], reasons: ["nom"] };
    return { status: "review", reasons: [hits.length ? "plusieurs fiches" : "nom incomplet"] };
  }
  const hits = [];
  for (const client of clients || []) {
    const tokens = clientNameTokens(client);
    const nameOk = wanted.length >= 2 && wanted.every(token => tokens.includes(token));
    const clientPostal = normalizeKey(client.postalCode || client.code_postal || client.codePostal);
    if (postal && clientPostal && postal !== clientPostal) continue;
    if (!nameOk) continue;
    if (postal && !clientPostal && wanted.length < 2) continue;
    hits.push(client);
  }
  if (hits.length === 1) return { status: "linked", client: hits[0], reasons: postal ? ["nom", "code postal"] : ["nom"] };
  if (hits.length > 1) return { status: "review", reasons: ["plusieurs fiches"], candidates: hits.slice(0, 5) };
  if (wanted.length < 2) return { status: "review", reasons: ["nom incomplet"] };
  return { status: "created", reasons: [] };
}

export function previewInvoiceImport({ rows = [], clients = [] } = {}) {
  const bySlot = new Map();
  for (const row of rows || []) {
    if (!isEntretienInvoiceLine(row) || !invoiceInterventionDate(row)) continue;
    const key = invoiceSlotKey(row);
    const current = bySlot.get(key);
    if (!current) {
      bySlot.set(key, { ...row, sources: [row.source || "invoice"] });
      continue;
    }
    const merged = mergeRecord(current, row);
    const amounts = [current.amountHt, row.amountHt].map(Number).filter(value => Number.isFinite(value));
    merged.amountHt = amounts.length ? amounts.reduce((sum, value) => sum + value, 0) : merged.amountHt;
    bySlot.set(key, merged);
  }
  const ordered = [...bySlot.values()].sort((a, b) => Number(Boolean(b.codePostal)) - Number(Boolean(a.codePostal)));
  const pool = [...(clients || [])];
  const items = ordered.map(record => {
    const match = matchInvoiceClient(record, pool);
    const interventionOn = invoiceInterventionDate(record);
    const existing = match.client || {};
    if (match.status === "created") {
      pool.push({
        id: `new:${record.matchKey}|${record.codePostal || ""}`,
        nom: record.nom,
        prenom: record.prenom,
        lastName: record.nom,
        firstName: record.prenom,
        name: record.displayName,
        postalCode: record.codePostal,
        address: record.adresse,
        city: record.ville,
        phone: record.phone,
        email: record.email,
      });
    }
    const clientId = match.status === "linked" ? match.client?.id || null : match.status === "created" ? pool.at(-1)?.id || null : null;
    return {
      ...record,
      matchStatus: match.status,
      matchReasons: match.reasons || [],
      clientId: String(clientId || "").startsWith("new:") ? null : clientId,
      provisionalId: String(clientId || "").startsWith("new:") ? clientId : "",
      clientName: match.client?.name || record.displayName || "",
      candidateCount: match.candidates?.length || 0,
      interventionOn,
      externalNumber: historicalInvoiceNumber(record),
      fillFields: match.status === "linked" ? Object.keys(blankClientFill({
        prenom: existing.firstName || existing.prenom,
        telephone: existing.phone || existing.telephone,
        email: existing.email,
        adresse: existing.address || existing.adresse,
        code_postal: existing.postalCode || existing.code_postal,
        ville: existing.city || existing.ville,
      }, record)) : [],
    };
  });
  const counts = {
    total: items.length,
    lines: rows.length,
    linked: items.filter(item => item.matchStatus === "linked").length,
    created: items.filter(item => item.matchStatus === "created").length,
    review: items.filter(item => item.matchStatus === "review").length,
    interventions: items.filter(item => item.matchStatus !== "review").length,
    filled: items.filter(item => item.fillFields.length).length,
  };
  return { counts, items };
}

export function historicalInvoiceFromRecord(record, { clientId, importRowId } = {}) {
  return {
    origin: "historique",
    external_number: record.contractNumber ? `ENT-XLS-${record.contractNumber}` : null,
    invoice_date: record.subscribedOn || record.signedOn || record.installedOn || null,
    amount_ht: record.amountHt,
    amount_tva: record.amountTva,
    amount_ttc: record.amountTtc,
    client_id: clientId || null,
    client_link_status: clientId ? "valide" : "non_rapproche",
    payment_status: "inconnu",
    visit_date_hint: null,
    document_ref: (record.sources || [record.source]).filter(Boolean).join(", "),
    devis_id: null,
    import_row_id: importRowId || null,
    notes: [record.equipment, record.notes].filter(Boolean).join(" — "),
  };
}

export function googleEventToVisitDraft(event, { organizationId, userId, calendarId, calendarSummary } = {}) {
  const start = event?.start?.dateTime || event?.start?.date || null;
  const end = event?.end?.dateTime || event?.end?.date || null;
  const classified = classifyAgendaTitle(`${event?.summary || ""} ${event?.description || ""} ${event?.location || ""} ${calendarSummary || event?._calendarSummary || ""}`);
  const title = String(event?.summary || "").trim() || String(event?.location || "").trim() || "Sans titre";
  return {
    organization_id: organizationId,
    technician_id: userId || null,
    source: "google",
    title,
    location: event?.location || "",
    description: event?.description || "",
    scheduled_start: start,
    scheduled_end: end,
    google_user_id: userId || null,
    google_calendar_id: calendarId || "primary",
    google_event_id: event?.id || null,
    ical_uid: event?.iCalUID || event?.icaluid || null,
    google_status: event?.status || "",
    google_updated_at: event?.updated || null,
    signals: classified.matched || [],
    client_id: null,
    client_link_status: "non_rapproche",
    nature_proposed: classified.natureProposed,
    nature_status: classified.natureStatus,
    nature_validated: null,
    realization_status: "inconnu",
    realization_date: null,
    realization_basis: null,
    realization_note: "",
    realization_recorded_at: null,
    realization_recorded_by: null,
  };
}

const NAME_STOP = new Set(["de", "du", "des", "la", "le", "les", "et", "en"]);

function hasWord(haystack, token) {
  if (!token) return false;
  return String(haystack || "").split(/\s+/).includes(token);
}

function nameTokens(value) {
  return normalizeKey(value).split(/\s+/).filter(part => part.length > 2 && !NAME_STOP.has(part));
}

export function scoreImportedClient(text, client = {}) {
  const haystack = normalizeKey(text);
  if (!haystack) return { client, score: 0, reasons: [] };
  const last = normalizeKey(client.lastName || client.nom || "");
  const first = normalizeKey(client.firstName || client.prenom || "");
  const postal = normalizeKey(client.code_postal || client.postalCode || client.codePostal || "");
  const city = normalizeKey(client.ville || client.city || "");
  const address = normalizeKey(client.adresse || client.address || "");
  const reasons = [];
  let score = 0;
  const lastTokens = nameTokens(last);
  if (lastTokens.length && lastTokens.every(token => hasWord(haystack, token))) {
    score += 3;
    reasons.push("nom");
  }
  if (first.length > 2 && hasWord(haystack, first)) {
    score += 1;
    reasons.push("prenom");
  }
  if (postal.length === 5 && hasWord(haystack, postal)) {
    score += 3;
    reasons.push("cp");
  }
  const cityTokens = nameTokens(city);
  if (cityTokens.length && cityTokens.every(token => hasWord(haystack, token))) {
    score += 2;
    reasons.push("ville");
  }
  const streetHits = address.split(" ").filter(part => (
    part.length > 3
    && !/^(rue|avenue|impasse|route|chemin|place|allee|boulevard|residence|lotissement)$/.test(part)
    && hasWord(haystack, part)
  )).length;
  if (streetHits) {
    score += Math.min(2, streetHits);
    reasons.push("adresse");
  }
  return { client, score, reasons };
}

export function isShortLastName(client = {}) {
  return nameTokens(client.lastName || client.nom || "").join("").length < 4;
}

export function suggestClientForTitle(title, clients = [], extraText = "") {
  const text = normalizeKey(`${title || ""} ${extraText || ""}`);
  if (!text) return null;
  const scored = (clients || [])
    .map(client => scoreImportedClient(text, client))
    .filter(item => {
      if (item.score < 3) return false;
      if (!item.reasons.includes("nom") && !item.reasons.includes("adresse")) return false;
      if (isShortLastName(item.client) && item.reasons.includes("nom") && !item.reasons.includes("prenom") && !item.reasons.includes("cp") && !item.reasons.includes("adresse")) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.score - a.score || b.reasons.length - a.reasons.length);
  if (!scored.length) return null;
  const best = scored[0];
  const tied = scored.filter(item => item.score === best.score && item.client?.id !== best.client?.id);
  if (tied.length && !best.reasons.includes("cp") && !best.reasons.includes("adresse")) return null;
  return best.client;
}

export function visitStillMatchesClient(visit = {}, client = {}) {
  const link = visit.client_link_status || visit.clientLinkStatus;
  if (link === "valide") return true;
  if (link === "rejete" || !client) return false;
  return Boolean(suggestClientForTitle(visit.title, [client], `${visit.location || ""} ${visit.description || ""}`));
}

export function effectiveVisitClientId(visit = {}, clientsById = {}) {
  const clientId = visit.client_id || visit.clientId;
  if (!clientId) return null;
  const link = visit.client_link_status || visit.clientLinkStatus;
  if (link === "rejete") return null;
  const client = clientsById[clientId];
  if (link === "valide") return clientId;
  if (!client || !visitStillMatchesClient(visit, client)) return null;
  return clientId;
}

export function isUnlistedEntretienVisit(visit = {}, importedIds = new Set()) {
  const status = visit.nature_status || visit.natureStatus;
  if (status === "ecarte") return false;
  const nature = visit.nature_validated || visit.natureValidated || visit.nature_proposed || visit.natureProposed || "";
  const blob = normalizeKey(`${visit.title || ""} ${visit.location || ""} ${nature} ${JSON.stringify(visit.signals || [])}`);
  const looksEntretien = nature === "entretien" || /entretien|maintenance|visite annuelle/.test(blob);
  if (!looksEntretien) return false;
  const clientId = visit.client_id || visit.clientId;
  return !clientId || !importedIds.has(clientId);
}

export function visitStatsByClient(visits = [], { today, clientsById = {}, includeSamples = true } = {}) {
  const dayLimit = today || new Date().toISOString().slice(0, 10);
  const byClient = new Map();
  const hasClients = Object.keys(clientsById).length > 0;
  for (const visit of visits || []) {
    const clientId = hasClients
      ? effectiveVisitClientId(visit, clientsById)
      : (visit.client_id || visit.clientId);
    if (!clientId) continue;
    const status = visit.nature_status || visit.natureStatus;
    if (status === "ecarte") continue;
    const nature = visit.nature_validated || visit.natureValidated || visit.nature_proposed || visit.natureProposed || "";
    if (nature === "installation" || nature === "depannage" || nature === "visite_technique") continue;
    const confirmed = visit.realization_status === "confirme" || visit.realizationStatus === "confirme";
    const day = String(confirmed ? (visit.realization_date || visit.realizationDate || "") : (visit.scheduled_start || visit.scheduledStart || "")).slice(0, 10);
    if (!day || day > dayLimit) continue;
    const current = byClient.get(clientId) || { count: 0, lastOn: "", samples: [] };
    current.count += 1;
    if (day > current.lastOn) current.lastOn = day;
    if (includeSamples && current.samples.length < 8) {
      current.samples.push({
        id: visit.id,
        title: visit.title || "Sans titre",
        location: visit.location || "",
        scheduled_start: visit.scheduled_start || visit.scheduledStart || "",
      });
    }
    byClient.set(clientId, current);
  }
  return byClient;
}

export function visitDay(visit = {}) {
  const confirmed = visit.realization_status === "confirme" || visit.realizationStatus === "confirme";
  return String(confirmed
    ? (visit.realization_date || visit.realizationDate || "")
    : (visit.scheduled_start || visit.scheduledStart || "")).slice(0, 10);
}

export function pickLatestReviewByClient(visits = [], { today } = {}) {
  const dayLimit = today || new Date().toISOString().slice(0, 10);
  const byClient = new Map();
  const ranked = [...(visits || [])].sort((a, b) => visitDay(b).localeCompare(visitDay(a)));
  for (const visit of ranked) {
    const clientId = visit.client_id || visit.clientId;
    if (!clientId) continue;
    const current = byClient.get(clientId);
    if (!current) {
      byClient.set(clientId, visit);
      continue;
    }
    const currentPast = visitDay(current) && visitDay(current) <= dayLimit;
    const visitPast = visitDay(visit) && visitDay(visit) <= dayLimit;
    if (!currentPast && visitPast) byClient.set(clientId, visit);
  }
  return [...byClient.values()].sort((a, b) => visitDay(b).localeCompare(visitDay(a)));
}

export function compareSheetToStock(sheetRows = [], stock = []) {
  const stockKeys = new Set(stock.map(item => item.matchKey));
  const stockNames = new Set(stock.map(item => normalizeKey(item.displayName)));
  const onlySheet = [];
  const matched = [];
  for (const row of sheetRows) {
    if (stockKeys.has(row.matchKey) || stockNames.has(normalizeKey(row.displayName))) matched.push(row);
    else onlySheet.push(row);
  }
  const sheetKeys = new Set(sheetRows.map(item => item.matchKey));
  const onlyStock = stock.filter(item => !sheetKeys.has(item.matchKey) && !sheetRows.some(row => normalizeKey(row.displayName) === normalizeKey(item.displayName)));
  return {
    sheetCount: sheetRows.length,
    stockCount: stock.length,
    matched: matched.length,
    onlySheet: onlySheet.length,
    onlyStock: onlyStock.length,
    onlySheetSample: onlySheet.slice(0, 25),
    onlyStockSample: onlyStock.slice(0, 25),
  };
}

export function recordsFromTable(rows = [], source = SOURCE_KIND.sheet) {
  if (!rows.length) return [];
  const columnMap = detectColumnMap(rows[0]);
  if (columnMap.name == null) {
    columnMap.name = rows[0].findIndex(cell => normalizeKey(cell).includes("client") || normalizeKey(cell) === "nom");
  }
  return rows.slice(1).map((row, index) => rowToContract(row, columnMap, { source, sheet: "sheet", line: index + 2 })).filter(Boolean);
}

export function sheetExportUrl({ id = ENTRETIEN_SHEET.id, gid = ENTRETIEN_SHEET.gid } = {}) {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

export async function fetchSheetCsv(fetcher = fetch, options = {}) {
  const url = sheetExportUrl(options);
  const response = await fetcher(url, { redirect: "follow" });
  const text = await response.text();
  if (!response.ok || /sign-in|accounts\.google/i.test(text.slice(0, 800))) {
    const error = new Error("Le Google Sheet est privé. Partagez-le en lecteur ou déposez un export Excel.");
    error.code = "sheet_private";
    throw error;
  }
  return text;
}

void applyColumnMap;
void CLIENT_IMPORT_TARGETS;
void classifyAgendaTitle;
