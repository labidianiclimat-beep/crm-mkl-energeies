import { formatFrDate, sameClientRecord } from "./client-followup.js";

export function sameProspectRecord(doc, prospect) {
  if (!doc || !prospect) return false;
  const id = prospect.id != null ? String(prospect.id) : "";
  if (id && [doc.prospectId, doc.sourceProspectId, doc.clientId].some(value => value != null && String(value) === id)) {
    return true;
  }
  return Boolean(prospect.name && doc.client && doc.client === prospect.name);
}

function matchesPerson(doc, person, kind) {
  return kind === "prospect" ? sameProspectRecord(doc, person) : sameClientRecord(doc, person);
}

function creationDate(doc) {
  return doc?.createdAt || doc?.created || doc?.date || doc?.noteDate || doc?.signatureDate || "";
}

function documentTime(value) {
  const raw = String(value || "").trim();
  const french = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  const time = french
    ? Date.UTC(Number(french[3]), Number(french[2]) - 1, Number(french[1]))
    : new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

function matchesThermal(study, person, kind) {
  if (matchesPerson(study, person, kind)) return true;
  if (!person) return false;
  return Boolean(
    study.lastName
    && person.lastName
    && study.lastName === person.lastName
    && (study.firstName || "") === (person.firstName || "")
  );
}

export function documentsForRecord({
  person,
  kind = "client",
  billing = [],
  contracts = [],
  visits = [],
  installations = [],
  pvProjects = [],
  thermalStudies = [],
  pvSimulations = [],
} = {}) {
  if (!person) return [];
  return [
    ...billing.filter(doc => matchesPerson(doc, person, kind)).map(doc => ({
      id: `b-${doc.id}`,
      kind: doc.kind || "Document",
      title: doc.number,
      detail: doc.label,
      date: creationDate(doc),
      status: doc.status,
      href: doc.pvStudyId ? `/pv-study?id=${doc.pvStudyId}` : null,
      download: "devis",
      source: doc,
    })),
    ...pvProjects.filter(doc => matchesPerson(doc, person, kind)).map(doc => ({
      id: `pv-${doc.id}`,
      kind: "Étude photovoltaïque",
      title: doc.number || `ETUDE-PV-${doc.id}`,
      detail: doc.project || doc.power,
      date: creationDate(doc),
      status: doc.status,
      href: `/pv-study?id=${doc.id}`,
      download: "href",
    })),
    ...thermalStudies.filter(study => matchesThermal(study, person, kind)).map(study => {
      const sizing = study.kind === "dimensionnement";
      return {
        id: sizing ? `nd-${study.id}` : `th-${study.id}`,
        kind: sizing ? "Note de dimensionnement" : "Étude thermique",
        title: study.number || (sizing ? `ND-${study.id}` : `ETH-${study.id}`),
        detail: sizing
          ? (study.equipmentLabel || "Déperditions")
          : (study.powerDynamicKw ? `${study.powerDynamicKw} kW · ${study.energyKwh || ""} kWh` : "Déperditions"),
        date: creationDate(study),
        status: study.status,
        href: sizing ? `/note-dimensionnement?id=${study.id}` : `/etude-thermique?id=${study.id}`,
        download: sizing ? "sizing" : "thermal",
        source: study,
      };
    }),
    ...pvSimulations.filter(study => matchesThermal(study, person, kind)).map(study => ({
      id: `spv-${study.id}`,
      kind: "Simulateur photovoltaïque",
      title: study.number || `SPV-${study.id}`,
      detail: study.production ? `${Number(study.production).toLocaleString("fr-FR")} kWh` : "Production estimée",
      date: creationDate(study),
      status: study.status,
      href: `/simulateur-pv?id=${study.id}`,
      download: "simulator",
      source: study,
    })),
    ...visits.filter(visit => matchesPerson(visit, person, kind)).map(visit => ({
      id: `v-${visit.id}`,
      kind: "Prévisite technique",
      title: visit.number || `PRE-${String(visit.id).slice(-6)}`,
      detail: visit.project || visit.quoteNumber || visit.status,
      date: creationDate(visit),
      status: visit.status,
      href: `/previsite?id=${visit.id}`,
      download: "previsit-report",
      visitKey: String(visit.id),
      source: visit,
    })),
    ...contracts.filter(doc => matchesPerson(doc, person, kind)).map(doc => ({
      id: `c-${doc.id}`,
      kind: "Contrat d’entretien",
      title: doc.number,
      detail: doc.type,
      date: creationDate(doc),
      status: doc.status,
      href: `/maintenance-contract?id=${doc.id}`,
      download: "href",
    })),
    ...installations.filter(doc => matchesPerson(doc, person, kind)).map(doc => ({
      id: `i-${doc.id}`,
      kind: "Chantier / installation",
      title: doc.number || `CHANTIER-${doc.id}`,
      detail: doc.type || doc.project,
      date: creationDate(doc),
      status: doc.status,
      source: doc,
    })),
  ].map(doc => ({
    ...doc,
    pdfFilename: documentPdfFilename(doc, person),
  })).sort((a, b) => documentTime(b.date) - documentTime(a.date));
}

export function documentDateLabel(value) {
  return formatFrDate(value);
}

export function readablePdfFilename(parts = []) {
  const base = (Array.isArray(parts) ? parts : [parts])
    .map(part => String(part || "").trim())
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w .'’-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  const name = base || "document";
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

function namedPerson(source = {}, person = {}) {
  const pair = item => [item?.lastName, item?.firstName].map(value => String(value || "").trim()).filter(Boolean);
  const onDocument = pair(source);
  if (onDocument.length === 2) return onDocument.join(" ");
  const written = String(source.client || source.name || "").trim();
  if (written) return written;
  const onFiche = pair(person);
  if (onFiche.length === 2) return onFiche.join(" ");
  return String(person.name || "").trim();
}

export function documentPdfFilename(doc = {}, person = {}) {
  const source = doc.source || {};
  const who = namedPerson(source, person);
  const number = String(doc.title || source.number || "").trim();
  const unique = number && number !== who ? number : "";
  return readablePdfFilename([doc.kind || "Document", who, unique]);
}
