import {
  computeDocumentTotals,
  defaultQuoteDeliveryDate,
  defaultQuoteValidityDate,
  DEVIS_FINANCIERS,
  ELECTRICITY_OPERATORS,
  splitPersonName,
  todayIsoDate,
} from "./devis.js";
import { housingFromPerson } from "./housing.js";

export { HOUSING_TYPES, OCCUPANCY_TYPES } from "./housing.js";

export { DEVIS_FINANCIERS, ELECTRICITY_OPERATORS };

export const WIZARD_STEPS = [
  { id: "client", label: "Client" },
  { id: "products", label: "Produits" },
  { id: "conditions", label: "Conditions" },
  { id: "finance", label: "Financement" },
  { id: "summary", label: "Récapitulatif" },
];

export const FINANCE_MODES = [
  { id: "cash", label: "Paiement comptant" },
  { id: "installments", label: "Paiement en plusieurs fois par MKL ÉNERGIES" },
  { id: "credit", label: "Crédit affecté par un organisme partenaire" },
  { id: "to_define", label: "Financement à définir" },
  { id: "none", label: "Aucun financement renseigné" },
];

export const FINANCE_STATUSES = ["À constituer", "Envoyé", "En attente", "Accepté", "Refusé", "Annulé"];

export const PAYMENT_METHODS = ["Virement", "Chèque", "Carte bancaire", "Espèces", "Prélèvement"];

export const CGV_VERSION = "2026-09";

export const CGV_TEXT = `Conditions générales de vente MKL Énergies — version ${CGV_VERSION}.
L’offre est valable 30 jours. Un acompte peut être demandé à la commande. Les délais de livraison et d’installation sont indicatifs. Les travaux sont réalisés selon les règles de l’art et la réglementation applicable. Toute modification du projet après acceptation peut faire l’objet d’un avenant.`;

export function isPhotovoltaicItems(items = []) {
  return (items || []).some(item =>
    `${item.name || ""} ${item.category || ""} ${item.subcategory || ""} ${item.code || ""}`.toLowerCase().includes("photovolta")
  );
}

export function isPreparedFreeLine(item) {
  return Boolean(item?.free) && !String(item?.name || "").trim();
}

export function filledQuoteItems(items = []) {
  return (items || []).filter(item => !isPreparedFreeLine(item));
}

export function createPreparedFreeLine(tax = 20) {
  return {
    id: `free-${Date.now()}`,
    articleId: null,
    code: "",
    name: "",
    description: "",
    lineComment: "",
    qty: 1,
    unit: 0,
    tax,
    discountType: "percent",
    discountValue: 0,
    free: true,
  };
}

export function withPreparedFreeLine(items = [], tax = 20) {
  const list = [...(items || [])];
  if (!list.some(isPreparedFreeLine)) list.push(createPreparedFreeLine(tax));
  return list;
}

export function emptyWizardState({
  currentUserId = "",
  currentUserName = "",
  mustAssignCommercial = false,
  client = null,
  prospect = null,
} = {}) {
  const issueDate = todayIsoDate();
  const rep = splitPersonName(mustAssignCommercial ? "" : currentUserName);
  const housing = housingFromPerson(client || prospect || {});
  return {
    step: 0,
    draftId: null,
    number: "",
    status: "Brouillon",
    clientId: client?.id || "",
    prospectId: prospect?.id || "",
    clientSnapshot: client || prospect || null,
    createdClientId: null,
    siteDifferent: false,
    siteAddress: "",
    siteComplement: "",
    sitePostalCode: "",
    siteCity: "",
    housingType: housing.housingType,
    constructionYear: housing.constructionYear,
    occupancy: housing.occupancy,
    items: withPreparedFreeLine([], 20),
    tax: 20,
    globalDiscountType: "percent",
    globalDiscountValue: 0,
    date: issueDate,
    due: defaultQuoteValidityDate(issueDate),
    deliveryDate: defaultQuoteDeliveryDate(issueDate),
    installDelay: "",
    commercialId: mustAssignCommercial ? (client?.commercialId || prospect?.commercialId || "") : currentUserId || "",
    representativeLastName: rep.lastName,
    representativeFirstName: rep.firstName,
    representativeSignature: "",
    electricityOperator: "",
    pvPowerKwp: "",
    label: "",
    internalRef: "",
    conditionsReglement: "Acompte à la commande, solde à la fin des travaux",
    acompte: 0,
    depositPercent: "",
    paymentMethod: "Virement",
    offerValidityNote: "30 jours",
    specialConditions: "",
    freeNote: "",
    internalComment: "",
    cgvAttached: false,
    printCerfaTva: false,
    printHeatPumpFicheIds: [],
    printCommercialDocIds: [],
    financeMode: "none",
    financier: "Sans financement",
    financedAmount: "",
    financeMonths: "",
    monthlyPayment: "",
    financeNominalRate: "",
    financeTaeg: "",
    financeTaea: "",
    firstMonthlyPayment: "",
    personalContribution: "",
    financeFileNumber: "",
    financeStatus: "À constituer",
    installmentCount: 3,
    installmentAmount: "",
    installmentDates: [],
    cashSchedule: "Acompte à la commande, solde à la réception",
  };
}

export function documentToWizardState(doc, { clients = [], prospects = [] } = {}) {
  if (!doc) return emptyWizardState();
  const hidden = new Set((doc.hiddenLines || []).map(Number));
  const client = clients.find(item => String(item.id) === String(doc.clientId))
    || prospects.find(item => String(item.id) === String(doc.prospectId || doc.sourceProspectId))
    || (doc.clientId || doc.client
      ? {
          id: doc.clientId,
          name: doc.client,
          firstName: doc.client,
        }
      : null);
  return {
    ...emptyWizardState(),
    step: 0,
    draftId: doc.id && String(doc.id).includes("-") ? doc.id : null,
    number: doc.number || "",
    status: doc.status || "Brouillon",
    clientId: doc.clientId || "",
    prospectId: doc.prospectId || doc.sourceProspectId || "",
    clientSnapshot: client,
    siteDifferent: Boolean(doc.siteDifferent),
    siteAddress: doc.siteAddress || "",
    siteComplement: doc.siteComplement || "",
    sitePostalCode: doc.sitePostalCode || "",
    siteCity: doc.siteCity || "",
    housingType: doc.housingType || housingFromPerson(client).housingType,
    constructionYear: doc.constructionYear || housingFromPerson(client).constructionYear,
    occupancy: doc.occupancy || housingFromPerson(client).occupancy,
    printCerfaTva: Boolean(doc.printCerfaTva),
    printHeatPumpFicheIds: Array.isArray(doc.printHeatPumpFicheIds) ? doc.printHeatPumpFicheIds : [],
    printCommercialDocIds: Array.isArray(doc.printCommercialDocIds) ? doc.printCommercialDocIds : [],
    items: withPreparedFreeLine((doc.items || []).map((item, index) => ({
      ...item,
      id: item.id || Date.now() + index,
      hiddenOnPrint: hidden.has(index),
      lineComment: item.lineComment || item.description || "",
    })), Number(doc.tax ?? 20)),
    tax: Number(doc.tax ?? 20),
    globalDiscountType: doc.globalDiscountType || "percent",
    globalDiscountValue: Number(doc.globalDiscountValue || 0),
    date: doc.date || todayIsoDate(),
    due: doc.due || defaultQuoteValidityDate(doc.date),
    deliveryDate: doc.deliveryDate || defaultQuoteDeliveryDate(doc.date),
    installDelay: doc.installDelay || "",
    commercialId: doc.commercialId || "",
    representativeLastName: doc.representativeLastName || "",
    representativeFirstName: doc.representativeFirstName || "",
    representativeSignature: doc.representativeSignature || "",
    electricityOperator: doc.electricityOperator || "",
    pvPowerKwp: doc.pvPowerKwp || "",
    label: doc.label || "",
    internalRef: doc.internalRef || "",
    conditionsReglement: doc.conditionsReglement || "",
    acompte: Number(doc.acompte || 0),
    depositPercent: doc.depositPercent || "",
    paymentMethod: doc.paymentMethod || "Virement",
    offerValidityNote: doc.offerValidityNote || "30 jours",
    specialConditions: doc.specialConditions || "",
    freeNote: doc.freeNote || "",
    internalComment: doc.internalComment || "",
    cgvAttached: false,
    financeMode: doc.financeMode || (doc.financier && doc.financier !== "Sans financement" ? "credit" : "none"),
    financier: doc.financier || "Sans financement",
    financedAmount: doc.financedAmount ?? "",
    financeMonths: doc.financeMonths ?? "",
    monthlyPayment: doc.monthlyPayment ?? "",
    financeNominalRate: doc.financeNominalRate ?? "",
    financeTaeg: doc.financeTaeg ?? "",
    financeTaea: doc.financeTaea ?? "",
    firstMonthlyPayment: doc.firstMonthlyPayment ?? "",
    personalContribution: doc.personalContribution ?? "",
    financeFileNumber: doc.financeFileNumber || "",
    financeStatus: doc.financeStatus || "À constituer",
    installmentCount: Number(doc.installmentCount || 3),
    installmentAmount: doc.installmentAmount ?? "",
    installmentDates: Array.isArray(doc.installmentDates) ? doc.installmentDates : [],
    cashSchedule: doc.cashSchedule || "",
  };
}

export function wizardTotals(state) {
  return computeDocumentTotals({
    items: filledQuoteItems(state.items),
    tax: state.tax,
    globalDiscountType: state.globalDiscountType,
    globalDiscountValue: state.globalDiscountValue,
  });
}

export function wizardAcompte(state, totalTTC) {
  const percent = Number(state.depositPercent || 0);
  if (percent > 0) return Number(((Number(totalTTC) * percent) / 100).toFixed(2));
  return Math.max(0, Number(state.acompte || 0));
}

export function financePrintable(state) {
  return ["installments", "credit"].includes(state.financeMode)
    || (state.financeMode === "cash" && Number(state.acompte || state.depositPercent || 0) > 0);
}

export function financeConsistencyError(state, totalTTC) {
  const total = Number(totalTTC || 0);
  if (state.financeMode === "none" || state.financeMode === "to_define") return "";
  if (state.financeMode === "cash") {
    const acompte = wizardAcompte(state, total);
    if (acompte > total + 0.05) return "L’acompte ne peut pas dépasser le total TTC.";
    return "";
  }
  if (state.financeMode === "installments") {
    const acompte = wizardAcompte(state, total);
    const count = Math.max(1, Number(state.installmentCount || 0));
    const each = Number(state.installmentAmount || 0);
    if (acompte > total + 0.05) return "L’acompte ne peut pas dépasser le total TTC.";
    if (each > 0 && Math.abs(acompte + each * count - total) > 1) {
      return "Acompte + échéances doivent correspondre au total TTC.";
    }
    return "";
  }
  if (state.financeMode === "credit") {
    return "";
  }
  return "";
}

export function stepErrors(stepId, state, { mustAssignCommercial = false } = {}) {
  const errors = [];
  const totals = wizardTotals(state);
  if (stepId === "client") {
    if (!state.clientId && !state.prospectId) errors.push("Sélectionnez ou créez un client.");
    if (state.siteDifferent) {
      if (!String(state.siteAddress || "").trim() || !String(state.sitePostalCode || "").trim() || !String(state.siteCity || "").trim()) {
        errors.push("Complétez l’adresse du chantier.");
      }
    }
  }
  if (stepId === "products") {
    if (!filledQuoteItems(state.items).some(item => String(item.name || "").trim())) errors.push("Ajoutez au moins un article ou un groupe.");
  }
  if (stepId === "conditions") {
    if (!state.date) errors.push("La date d’émission est obligatoire.");
    if (!state.due) errors.push("La date de validité est obligatoire.");
    if (!state.deliveryDate) errors.push("Le délai de livraison est obligatoire.");
    if (isPhotovoltaicItems(filledQuoteItems(state.items))) {
      if (!state.electricityOperator) errors.push("Choisissez le gestionnaire de réseau (mandat de raccordement).");
      if (!Number(state.pvPowerKwp)) errors.push("Indiquez la puissance à raccorder (kWc).");
    }
  }
  if (stepId === "finance") {
    if (!FINANCE_MODES.some(mode => mode.id === state.financeMode)) errors.push("Choisissez un mode de financement.");
    const financeError = financeConsistencyError(state, totals.totalTTC);
    if (financeError) errors.push(financeError);
  }
  if (stepId === "summary") {
    for (const step of ["client", "products", "conditions", "finance"]) {
      errors.push(...stepErrors(step, state, { mustAssignCommercial }));
    }
  }
  return [...new Set(errors)];
}

export function wizardToPayload(state, { status = "Brouillon", statusComment = "" } = {}) {
  const items = filledQuoteItems(state.items).map((item, index) => ({
    ...item,
    ordre: index,
    description: item.lineComment || item.description || "",
  }));
  const totals = computeDocumentTotals({
    items,
    tax: state.tax,
    globalDiscountType: state.globalDiscountType,
    globalDiscountValue: state.globalDiscountValue,
  });
  const acompte = wizardAcompte(state, totals.totalTTC);
  const financier = state.financeMode === "credit"
    ? (state.financier && state.financier !== "Sans financement" ? state.financier : "Autre financeur")
    : "Sans financement";
  return {
    kind: "Devis",
    clientId: state.clientId || null,
    prospectId: state.prospectId || null,
    client: state.clientSnapshot?.company || state.clientSnapshot?.name || "",
    commercialId: state.commercialId || "",
    status,
    statusComment,
    date: state.date,
    due: state.due,
    deliveryDate: state.deliveryDate,
    tax: state.tax,
    globalDiscountType: state.globalDiscountType,
    globalDiscountValue: Number(state.globalDiscountValue || 0),
    freeNote: state.freeNote || "",
    label: state.label || items.map(item => item.name).filter(Boolean).join(", ") || "Devis",
    items,
    financier,
    financedAmount: state.financeMode === "credit" ? Number(totals.totalTTC.toFixed(2)) : "",
    financeMonths: state.financeMode === "credit" || state.financeMode === "installments" ? state.financeMonths || state.installmentCount : "",
    monthlyPayment: state.financeMode === "credit" ? state.monthlyPayment : state.installmentAmount,
    financeNominalRate: "",
    financeTaeg: state.financeMode === "credit" ? state.financeTaeg : "",
    financeTaea: state.financeMode === "credit" ? state.financeTaea : "",
    firstMonthlyPayment: state.financeMode === "credit" ? state.firstMonthlyPayment : "",
    electricityOperator: state.electricityOperator || "",
    pvPowerKwp: state.pvPowerKwp || "",
    representativeLastName: state.representativeLastName || "",
    representativeFirstName: state.representativeFirstName || "",
    representativeSignature: state.representativeSignature || "",
    conditionsReglement: state.conditionsReglement || "",
    acompte,
    financeMode: state.financeMode,
    depositPercent: state.depositPercent,
    paymentMethod: state.paymentMethod,
    installDelay: state.installDelay,
    specialConditions: state.specialConditions,
    internalComment: state.internalComment,
    internalRef: state.internalRef,
    siteDifferent: state.siteDifferent,
    siteAddress: state.siteAddress,
    siteComplement: state.siteComplement,
    sitePostalCode: state.sitePostalCode,
    siteCity: state.siteCity,
    housingType: state.housingType,
    constructionYear: state.constructionYear,
    occupancy: state.occupancy,
    cgvAttached: false,
    cgvVersion: "",
    printCerfaTva: Boolean(state.printCerfaTva),
    printHeatPumpFicheIds: [],
    printCommercialDocIds: Array.isArray(state.printCommercialDocIds) ? state.printCommercialDocIds : undefined,
    financeStatus: state.financeStatus,
    financeFileNumber: state.financeFileNumber,
    personalContribution: state.personalContribution,
    installmentCount: state.installmentCount,
    installmentDates: state.installmentDates,
    installmentAmount: state.installmentAmount,
    cashSchedule: state.cashSchedule,
    hiddenLines: items.map((item, index) => (item.hiddenOnPrint ? index : null)).filter(index => index != null),
    offerValidityNote: state.offerValidityNote,
  };
}

export const OPEN_QUOTE_STATUSES = ["Brouillon", "À valider", "Envoyé", "À relancer"];

export function findDraftsForRecipient(documents, { clientId, prospectId, statuses = ["Brouillon"] } = {}) {
  return (documents || []).filter(item => {
    if (item?.kind !== "Devis" || !statuses.includes(item?.status)) return false;
    if (clientId && String(item.clientId) === String(clientId)) return true;
    if (prospectId && String(item.prospectId || item.sourceProspectId) === String(prospectId)) return true;
    return false;
  });
}

export function suggestInstallmentAmount(totalTTC, acompte, count) {
  const rest = Math.max(0, Number(totalTTC || 0) - Number(acompte || 0));
  const n = Math.max(1, Number(count || 1));
  return Number((rest / n).toFixed(2));
}
