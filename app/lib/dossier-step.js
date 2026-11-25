import { normalizeAgendaStatus } from "./appointment-status.js";

/** Étape affichée du dossier. Elle se calcule, elle ne réécrit aucun statut. */

const UNCLASSIFIED = new Set(["Non statué"]);

const CLASSIFIED_VISIT = new Set([
  "Client absent",
  "Client problématique",
  "Client non équipable",
  "RDV annulé définitivement",
  "Commande refusée",
  "RDV à repositionner",
  "RDV repositionné par le client",
  "RDV repositionné par le vendeur",
  "Nouveau RDV pour pièces",
  "Client en réflexion",
  "Réalisé",
  "Rappel effectué",
  "Confirmé",
  "Reporté",
  "Annulé",
  "Absence du prospect",
]);

const STEP_LABELS = {
  rdv_pris: "Rendez-vous pris",
  visite_a_classer: "Non statué",
  visite_classee: "Visite classée",
  devis_a_valider: "Devis à valider",
  devis_envoye: "Devis envoyé",
  signe: "Signé",
  installation: "Installation programmée",
  facture: "Facturé",
};

export function devisStatusAfterClientSend(status) {
  return String(status || "") === "À valider" ? "Envoyé" : String(status || "");
}

function appointmentStart(item) {
  const time = new Date(item?.start || item?.starts_at || "").getTime();
  return Number.isFinite(time) ? time : null;
}

function isGoogleOrBusy(item) {
  return item?.source === "google" || item?.kind === "busy" || item?.private;
}

export function isUnclassifiedRdv(item) {
  if (!item || isGoogleOrBusy(item)) return false;
  return UNCLASSIFIED.has(normalizeAgendaStatus(item.status));
}

export function rdvJourneyLabel(item, now = Date.now()) {
  if (!item) return "Aucun rendez-vous";
  const normalized = normalizeAgendaStatus(item.status);
  if (!isUnclassifiedRdv(item)) return normalized;
  const start = appointmentStart(item);
  if (start == null || start > Number(now)) return "Rendez-vous pris";
  return "Non statué";
}

export function isUnstatedVisit(item, now = Date.now()) {
  if (!isUnclassifiedRdv(item)) return false;
  const start = appointmentStart(item);
  return start != null && start <= Number(now);
}

function quoteKind(doc) {
  return doc?.kind || "Devis";
}

export function dossierStep({
  appointments = [],
  quotes = [],
  invoices = [],
  installations = [],
  now = Date.now(),
} = {}) {
  const visits = (appointments || []).filter(item => item && !isGoogleOrBusy(item));
  const liveQuotes = (quotes || []).filter(doc => quoteKind(doc) === "Devis" && doc.status !== "Annulé");
  const liveInvoices = (invoices || []).filter(doc => doc?.kind === "Facture" && doc.status !== "Annulé" && doc.status !== "Brouillon");
  const jobs = (installations || []).filter(Boolean);
  const at = Number(now);

  const signedOrder = visits.some(item => normalizeAgendaStatus(item.status) === "Commande signée");
  const signedQuote = liveQuotes.some(doc => doc.status === "Accepté");
  const sentQuote = liveQuotes.some(doc => doc.status === "Envoyé" || doc.status === "À relancer");
  const draftQuote = liveQuotes.some(doc => doc.status === "À valider" || doc.status === "Brouillon");
  const classified = visits.some(item => CLASSIFIED_VISIT.has(normalizeAgendaStatus(item.status)));
  const toClass = visits.some(item => isUnclassifiedRdv(item) && appointmentStart(item) != null && appointmentStart(item) <= at);
  const booked = visits.some(item => isUnclassifiedRdv(item) && (appointmentStart(item) == null || appointmentStart(item) > at));

  let id = "";
  if (liveInvoices.length) id = "facture";
  else if (jobs.length) id = "installation";
  else if (signedOrder || signedQuote) id = "signe";
  else if (sentQuote) id = "devis_envoye";
  else if (draftQuote) id = "devis_a_valider";
  else if (classified) id = "visite_classee";
  else if (toClass) id = "visite_a_classer";
  else if (booked) id = "rdv_pris";

  const signedSources = [
    signedQuote ? "Devis validé" : "",
    signedOrder ? "Commande signée" : "",
  ].filter(Boolean);

  return {
    id,
    label: STEP_LABELS[id] || "",
    detail: id === "signe" ? signedSources.join(" · ") : "",
  };
}

export function dossierStepForAppointment(item, {
  appointments = [],
  prospects = [],
  billing = [],
  installations = [],
  now = Date.now(),
} = {}) {
  const prospect = (prospects || []).find(row => String(row.id) === String(item?.prospectId || ""));
  const clientId = String(prospect?.clientId || item?.clientId || "");
  const related = (appointments || []).filter(row => {
    if (!row || isGoogleOrBusy(row)) return false;
    if (String(row.id) === String(item?.id)) return true;
    if (!clientId) return false;
    const other = (prospects || []).find(entry => String(entry.id) === String(row.prospectId || ""));
    return String(other?.clientId || "") === clientId;
  });
  const quotes = clientId
    ? (billing || []).filter(doc => String(doc.clientId || "") === clientId && quoteKind(doc) === "Devis")
    : [];
  const invoices = clientId
    ? (billing || []).filter(doc => String(doc.clientId || "") === clientId && doc.kind === "Facture")
    : [];
  const jobs = clientId
    ? (installations || []).filter(job => String(job.clientId || "") === clientId)
    : [];
  return dossierStep({
    appointments: related.length ? related : (item ? [item] : []),
    quotes,
    invoices,
    installations: jobs,
    now,
  });
}
