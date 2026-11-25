import { extraOf } from "./prospects.js";
import { splitPersonName } from "./devis.js";

const COMPANY_PREFIX = /^(sci|earl|sasu?|sarl|eurl|gaec|scea|sa)\b/i;

export function isConvertedProspect(prospect) {
  if (!prospect) return false;
  const extra = extraOf(prospect);
  return Boolean(prospect.clientId || extra.clientId || extra.client_id);
}

export function visibleProspects(prospects, { includeConverted = false } = {}) {
  if (includeConverted) return prospects || [];
  return (prospects || []).filter(item => !isConvertedProspect(item));
}

export function clientStatusForDocumentKind(kind) {
  return String(kind || "") === "Facture" ? "Client" : "Devis en cours";
}

export function prospectToClientPayload(prospect, { documentKind } = {}) {
  const extra = extraOf(prospect);
  const name = String(prospect?.name || "").trim();
  const isCompany = COMPANY_PREFIX.test(name);
  const split = splitPersonName(name);
  const lastName = isCompany ? "" : (split.lastName || split.firstName || name);
  const firstName = isCompany ? "" : (split.lastName ? split.firstName : (split.firstName || name));
  return {
    customerType: isCompany ? "Entreprise" : "Particulier",
    civilite: String(prospect?.civilite || extra.civilite || "").trim(),
    company: isCompany ? name : String(prospect?.company || "").trim(),
    firstName,
    lastName,
    phone: String(prospect?.landline || extra.landline || "").trim() || prospect?.phone || extra.phone || "",
    mobile: String(prospect?.landline || extra.landline || "").trim()
      ? (prospect?.phone || extra.phone || "")
      : (prospect?.mobile || extra.mobile || ""),
    email: prospect?.email || extra.email || "",
    address: prospect?.address || extra.address || extra.adresse || "",
    addressComplement: prospect?.addressComplement || extra.addressComplement || extra.complement_adresse || "",
    postalCode: prospect?.postalCode || extra.postalCode || extra.code_postal || "",
    city: prospect?.city || extra.city || "",
    projectType: prospect?.type || prospect?.project_type || extra.type || "",
    source: prospect?.source || extra.source || "",
    notes: prospect?.notes || extra.notes || "",
    prospectorId: prospect?.prospectorId || extra.prospectorId || extra.prospector_id || "",
    prospector: prospect?.prospector || extra.prospector || "",
    commercialId: prospect?.commercialId || prospect?.commercial_id || "",
    status: clientStatusForDocumentKind(documentKind),
    consent: true,
    housingType: prospect?.housingType || extra.housingType || extra.housing_type || "",
    constructionYear: prospect?.constructionYear || extra.constructionYear || extra.construction_year || "",
    occupancy: prospect?.occupancy || extra.occupancy || "",
  };
}

export function convertedProspectExtra(existing, clientId, { documentKind, documentId } = {}) {
  return {
    ...extraOf({ extra: existing }),
    clientId: String(clientId || ""),
    convertedAt: new Date().toISOString(),
    convertedByKind: documentKind || "",
    convertedDocumentId: documentId || "",
  };
}
