import { matchesPersonListQuery } from "./directory-search.js";
import { canViewOrgWideCommercialData } from "./scoping.js";
import { deniesFinancialAccess } from "./prospect-dispatch.js";
import { normalizeRoleLabel } from "./roles.js";

export const DEVIS_KINDS = ["Devis", "Facture", "Pro forma"];

/** Statuts métier pour les devis (ÉTAPE 7). */
export const DEVIS_QUOTE_STATUSES = [
  "Brouillon",
  "À valider",
  "Envoyé",
  "À relancer",
  "Accepté",
  "Refusé",
  "Expiré",
  "Annulé",
];

/** Statuts pour factures / pro forma. */
export const INVOICE_STATUSES = [
  "Brouillon",
  "Envoyée",
  "À payer",
  "Payée",
  "Annulé",
];

export const DEVIS_STATUSES = [...new Set([...DEVIS_QUOTE_STATUSES, ...INVOICE_STATUSES])];

export function statusesForKind(kind) {
  if (kind === "Facture" || kind === "Pro forma") return INVOICE_STATUSES;
  return DEVIS_QUOTE_STATUSES;
}

export function statusTone(status) {
  if (["Accepté", "Payée"].includes(status)) return "ok";
  if (["Refusé", "Annulé", "Expiré"].includes(status)) return "bad";
  return "wait";
}

/** Libellé affiché. Le statut enregistré reste « Accepté ». */
export function quoteStatusLabel(status) {
  return status === "Accepté" ? "Validé" : status || "";
}

export function quoteClientPerson(doc, clients = []) {
  const client = (clients || []).find(item =>
    (doc?.clientId != null && item?.id != null && String(item.id) === String(doc.clientId))
    || (doc?.client && item?.name && doc.client === item.name)
  ) || {};
  return {
    ...client,
    name: [doc?.client, client.name, client.contact].filter(Boolean).join(" "),
    firstName: client.firstName || "",
    lastName: client.lastName || "",
  };
}

export function quoteMatchesClientQuery(doc, clients, query) {
  return matchesPersonListQuery(quoteClientPerson(doc, clients), query);
}

export function quoteArticleRefs(document) {
  const codes = (document?.items || [])
    .map(item => String(item.code || item.reference || "").trim())
    .filter(Boolean);
  return [...new Set(codes)].join(" · ") || "—";
}

export function computeLineTotals(item, defaultTax = 20) {
  const tax = Number(item.tax ?? item.taux_tva ?? defaultTax);
  const qty = Number(item.qty ?? item.quantite ?? 0);
  const unit = Number(item.unit ?? item.prix_unitaire_ht ?? 0);
  const grossHT = qty * unit;
  const grossTTC = grossHT * (1 + tax / 100);
  const discountValue = Math.max(0, Number(item.discountValue ?? item.remise ?? 0));
  const discountType = item.discountType || item.remise_type || "percent";
  const discountTTC =
    discountType === "amount"
      ? Math.min(grossTTC, discountValue)
      : (grossTTC * Math.min(100, discountValue)) / 100;
  const totalTTC = Math.max(0, grossTTC - discountTTC);
  const totalHT = totalTTC / (1 + tax / 100);
  return {
    tax,
    qty,
    unit,
    grossHT,
    grossTTC,
    discountTTC,
    totalHT,
    totalTTC,
    totalTva: totalTTC - totalHT,
  };
}

export const ELECTRICITY_OPERATORS = [
  { id: "reseda", name: "réséda", title: "Mandat spécial de représentation pour le raccordement au réseau public de distribution d’électricité géré par réséda" },
  { id: "ume", name: "SAEML UME", title: "Mandat de représentation pour le raccordement d’un site de consommation ou de production au réseau public géré par SAEML UME" },
  { id: "ser", name: "Strasbourg Électricité Réseaux", title: "Mandat de représentation pour le raccordement d’un site de consommation ou de production au réseau public géré par Strasbourg Électricité Réseaux" },
  { id: "enedis", name: "Enedis", title: "Mandat de représentation pour le raccordement d’une installation de production au réseau public de distribution géré par Enedis" },
];

export const DEVIS_FINANCIERS = [
  "Sans financement",
  "Sofinco",
  "Domofinance",
  "Franfinance",
  "Crédit Agricole",
  "Autre financeur",
];

export const WIZARD_EXTRA_KEYS = [
  "financeMode",
  "depositPercent",
  "paymentMethod",
  "installDelay",
  "specialConditions",
  "internalComment",
  "internalRef",
  "siteDifferent",
  "siteAddress",
  "siteComplement",
  "sitePostalCode",
  "siteCity",
  "housingType",
  "constructionYear",
  "occupancy",
  "cgvAttached",
  "cgvVersion",
  "financeStatus",
  "financeFileNumber",
  "personalContribution",
  "installmentCount",
  "installmentDates",
  "installmentAmount",
  "cashSchedule",
  "hiddenLines",
  "offerValidityNote",
  "printCerfaTva",
  "printHeatPumpFicheIds",
  "printCommercialDocIds",
];

function collectExtra(input = {}) {
  const fromDb = input.extra && typeof input.extra === "object" && !Array.isArray(input.extra) ? { ...input.extra } : {};
  const picked = { ...fromDb };
  for (const key of WIZARD_EXTRA_KEYS) {
    if (input[key] !== undefined) picked[key] = input[key];
  }
  return {
    ...picked,
    pvStudyAuto: Boolean(input.pvStudyAuto ?? picked.pvStudyAuto),
    representativeLastName: String(input.representativeLastName || picked.representativeLastName || "").trim(),
    representativeFirstName: String(input.representativeFirstName || picked.representativeFirstName || "").trim(),
    representativeSignature: String(input.representativeSignature || picked.representativeSignature || "").trim(),
    financeNominalRate: optionalNumber(input.financeNominalRate ?? picked.financeNominalRate),
    financeTaeg: optionalNumber(input.financeTaeg ?? picked.financeTaeg),
    financeTaea: optionalNumber(input.financeTaea ?? picked.financeTaea),
    firstMonthlyPayment: optionalNumber(input.firstMonthlyPayment ?? picked.firstMonthlyPayment),
    ...(input.sourceQuoteId || picked.sourceQuoteId
      ? {
          sourceQuoteId: input.sourceQuoteId || picked.sourceQuoteId,
          sourceQuoteNumber: String(input.sourceQuoteNumber || picked.sourceQuoteNumber || ""),
        }
      : {}),
    ...(input.prospectId || input.sourceProspectId || picked.sourceProspectId
      ? { sourceProspectId: String(input.prospectId || input.sourceProspectId || picked.sourceProspectId) }
      : {}),
    printCerfaTva: Boolean(input.printCerfaTva ?? picked.printCerfaTva),
    printHeatPumpFicheIds: Array.isArray(input.printHeatPumpFicheIds)
      ? input.printHeatPumpFicheIds
      : Array.isArray(picked.printHeatPumpFicheIds)
        ? picked.printHeatPumpFicheIds
        : undefined,
    printCommercialDocIds: Array.isArray(input.printCommercialDocIds)
      ? input.printCommercialDocIds
      : Array.isArray(picked.printCommercialDocIds)
        ? picked.printCommercialDocIds
        : undefined,
  };
}

export function joinAddressParts(...parts) {
  return parts.map(part => String(part || "").trim()).filter(Boolean).join(" ");
}

export function quoteBillingAddress(customer = {}) {
  return joinAddressParts(customer.address, customer.postalCode, customer.city);
}

/** Adresse de chantier seulement quand elle est différente de celle du client. */
export function quoteWorksiteAddress(doc = {}) {
  if (!doc?.siteDifferent) return "";
  const street = joinAddressParts(doc.siteAddress, doc.siteComplement);
  return joinAddressParts(street, doc.sitePostalCode, doc.siteCity);
}

export function quoteBundleKey(item) {
  if (!item) return "";
  if (item.bundleId != null && String(item.bundleId).trim()) return `id:${String(item.bundleId)}`;
  if (String(item.bundleName || "").trim()) return `name:${String(item.bundleName).trim()}`;
  return "";
}

export function quoteBundleHeading(item) {
  return String(item?.bundleHeading || item?.bundleName || "").trim();
}

export function isQuoteBundleStart(items = [], index) {
  const item = items[index];
  const key = quoteBundleKey(item);
  if (!key) return false;
  if (index <= 0) return true;
  return quoteBundleKey(items[index - 1]) !== key;
}

export function setQuoteBundleHeading(items = [], index, title) {
  const key = quoteBundleKey(items[index]);
  const heading = String(title || "").trim();
  if (!key) return Array.isArray(items) ? [...items] : [];
  return items.map(item => (quoteBundleKey(item) === key ? { ...item, bundleName: heading, bundleHeading: heading } : item));
}

export function computeDocumentTotals(document) {
  const defaultTax = Number(document?.tax ?? document?.tax_default ?? 20);
  const items = Array.isArray(document?.items) ? document.items : [];
  const source = items.length
    ? items
    : Number(document?.amount || 0) > 0
      ? [{ name: document?.label, qty: 1, unit: document?.amount || 0, tax: defaultTax }]
      : [];
  const lines = source.map(item => ({ ...item, ...computeLineTotals(item, defaultTax) }));
  const beforeGlobalTTC = lines.reduce((sum, line) => sum + line.totalTTC, 0);
  const beforeGlobalHT = lines.reduce((sum, line) => sum + line.totalHT, 0);
  const globalValue = Math.max(0, Number(document?.globalDiscountValue ?? document?.remise_globale ?? 0));
  const globalType = document?.globalDiscountType || document?.remise_globale_type || "percent";
  const globalDiscountTTC =
    globalType === "amount"
      ? Math.min(beforeGlobalTTC, globalValue)
      : (beforeGlobalTTC * Math.min(100, globalValue)) / 100;
  const totalTTC = Math.max(0, beforeGlobalTTC - globalDiscountTTC);
  // Remise globale proportionnelle au mix HT/TTC (multi-TVA)
  const htShare = beforeGlobalTTC > 0 ? beforeGlobalHT / beforeGlobalTTC : 1 / (1 + defaultTax / 100);
  const totalHT = Math.max(0, beforeGlobalHT - globalDiscountTTC * htShare);
  return {
    lines,
    beforeGlobalHT,
    beforeGlobalTTC,
    globalDiscountTTC,
    totalHT,
    totalTTC,
    taxAmount: totalTTC - totalHT,
  };
}

export function lineToDb(item, index, defaultTax = 20) {
  const totals = computeLineTotals(item, defaultTax);
  const rawArticleId = item.articleId || item.article_id || null;
  const articleId =
    rawArticleId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(rawArticleId))
      ? String(rawArticleId)
      : null;
  return {
    article_id: articleId,
    reference: String(item.code || item.reference || "").trim() || null,
    designation: String(item.name || item.designation || "Ligne").trim(),
    description: String(item.description || "").trim() || null,
    quantite: totals.qty,
    unite: String(item.measureUnit || item.unite || "Unité").trim() || "Unité",
    prix_unitaire_ht: totals.unit,
    remise_type: item.discountType || item.remise_type || "percent",
    remise: Number(item.discountValue ?? item.remise ?? 0),
    taux_tva: totals.tax,
    total_ht: Number(totals.totalHT.toFixed(2)),
    total_tva: Number(totals.totalTva.toFixed(2)),
    total_ttc: Number(totals.totalTTC.toFixed(2)),
    categorie: item.category || item.categorie || null,
    sous_categorie: item.subcategory || item.sous_categorie || null,
    bundle_id: item.bundleId != null ? String(item.bundleId) : null,
    bundle_name: item.bundleName || null,
    ordre: Number(item.ordre ?? index),
  };
}

export function firstMonthlyDelayChoices(value) {
  const current = value === "" || value == null ? "" : String(value);
  const choices = ["", "30", "180"];
  if (current && !choices.includes(current)) choices.push(current);
  return choices;
}

export function firstMonthlyDelayLabel(value) {
  const days = Number(value);
  if (value === "" || value == null || !Number.isFinite(days) || days <= 0) return "—";
  return `${days} JRS`;
}

function optionalNumber(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function lineToUi(row) {
  if (!row) return null;
  return {
    id: row.id,
    articleId: row.article_id || null,
    code: row.reference || "",
    name: row.designation || "",
    description: row.description || "",
    qty: Number(row.quantite || 0),
    measureUnit: row.unite || "Unité",
    unit: Number(row.prix_unitaire_ht || 0),
    discountType: row.remise_type || "percent",
    discountValue: Number(row.remise || 0),
    tax: Number(row.taux_tva ?? 20),
    category: row.categorie || "",
    subcategory: row.sous_categorie || "",
    bundleId: row.bundle_id || null,
    bundleName: row.bundle_name || "",
    ordre: row.ordre,
  };
}

export function devisToUi(row, lines = []) {
  if (!row) return null;
  const items = (lines || []).map(lineToUi).filter(Boolean);
  const acompte = Number(row.acompte || 0);
  const extra = row.extra && typeof row.extra === "object" ? row.extra : {};
  return {
    id: row.id,
    kind: row.kind || "Devis",
    number: row.numero_devis,
    clientId: row.client_id || null,
    client: row.client_name || "",
    commercialId: row.commercial_id || null,
    status: row.statut || "Brouillon",
    date: row.date_creation,
    due: row.date_validite || "",
    deliveryDate: row.date_livraison || "",
    amount: Number(row.total_ht || 0),
    taxAmount: Number(row.total_tva || 0),
    totalTTC: Number(row.total_ttc || 0),
    tax: Number(row.tax_default ?? 20),
    globalDiscountType: row.remise_globale_type || "percent",
    globalDiscountValue: Number(row.remise_globale || 0),
    acompte,
    resteAPayer: Number(row.reste_a_payer ?? Number(row.total_ttc || 0) - acompte),
    conditionsReglement: row.conditions_reglement || "",
    freeNote: row.observations || "",
    label: row.label || "",
    financier: row.financier || "",
    financedAmount: row.financed_amount != null ? Number(row.financed_amount) : "",
    financeMonths: row.finance_months || "",
    monthlyPayment: row.monthly_payment != null ? Number(row.monthly_payment) : "",
    electricityOperator: row.electricity_operator || "",
    pvPowerKwp: row.pv_power_kwp != null ? Number(row.pv_power_kwp) : "",
    pvStudyId: row.pv_study_id || null,
    items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    ...extra,
    financeNominalRate: optionalNumber(extra.financeNominalRate) ?? "",
    financeTaeg: optionalNumber(extra.financeTaeg) ?? "",
    financeTaea: optionalNumber(extra.financeTaea) ?? "",
    firstMonthlyPayment: optionalNumber(extra.firstMonthlyPayment) ?? "",
  };
}

export function formToDevisRecord(input, { organizationId, createdBy, defaultCommercialId } = {}) {
  const kind = String(input.kind || "Devis").trim();
  const totals = computeDocumentTotals(input);
  const acompte = Math.max(0, Number(input.acompte || 0));
  const items = Array.isArray(input.items)
    ? input.items
    : typeof input.items === "string"
      ? JSON.parse(input.items || "[]")
      : [];

  return {
    header: {
      organization_id: organizationId,
      kind,
      numero_devis: String(input.number || input.numero_devis || "").trim() || null,
      client_id: input.clientId || input.client_id || null,
      client_name: String(input.client || input.client_name || "").trim() || null,
      commercial_id: input.commercialId || input.commercial_id || defaultCommercialId || null,
      statut: String(input.status || input.statut || "Brouillon").trim(),
      date_creation: input.date || input.date_creation || todayIsoDate(),
      date_validite: input.due || input.date_validite || null,
      date_livraison:
        kind === "Devis"
          ? input.deliveryDate ||
            input.date_livraison ||
            defaultQuoteDeliveryDate(input.date || input.date_creation)
          : input.deliveryDate || input.date_livraison || null,
      total_ht: Number(totals.totalHT.toFixed(2)),
      total_tva: Number(totals.taxAmount.toFixed(2)),
      total_ttc: Number(totals.totalTTC.toFixed(2)),
      remise_globale_type: input.globalDiscountType || "percent",
      remise_globale: Number(input.globalDiscountValue || 0),
      acompte,
      reste_a_payer: Number(Math.max(0, totals.totalTTC - acompte).toFixed(2)),
      conditions_reglement: String(input.conditionsReglement || input.conditions_reglement || "").trim() || null,
      observations: String(input.freeNote || input.observations || "").trim() || null,
      label: String(input.label || items.map(i => i.name).filter(Boolean).join(", ") || "Document").trim(),
      tax_default: Number(input.tax ?? 20),
      financier: String(input.financier || "").trim() || null,
      financed_amount: input.financedAmount !== "" && input.financedAmount != null ? Number(input.financedAmount) : null,
      finance_months: input.financeMonths !== "" && input.financeMonths != null ? Number(input.financeMonths) : null,
      monthly_payment: input.monthlyPayment !== "" && input.monthlyPayment != null ? Number(input.monthlyPayment) : null,
      electricity_operator: String(input.electricityOperator || "").trim() || null,
      pv_power_kwp: input.pvPowerKwp !== "" && input.pvPowerKwp != null ? Number(input.pvPowerKwp) : null,
      pv_study_id: input.pvStudyId || input.pv_study_id || null,
      extra: collectExtra(input),
      created_by: createdBy || null,
      updated_at: new Date().toISOString(),
    },
    lines: items.map((item, index) => lineToDb(item, index, Number(input.tax ?? 20))),
  };
}

function addDaysIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const QUOTE_DELIVERY_LEAD_DAYS = 45;
export const QUOTE_VALIDITY_DAYS = 30;

export function splitPersonName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function defaultQuoteValidityDate(issueDate) {
  return addCalendarDaysIso(issueDate || todayIsoDate(), QUOTE_VALIDITY_DAYS);
}

export function todayIsoDate() {
  return addDaysIso(0);
}

export function addCalendarDaysIso(isoDate, days) {
  const [year, month, day] = String(isoDate || "").slice(0, 10).split("-").map(Number);
  const date =
    year && month && day ? new Date(year, month - 1, day) : new Date();
  date.setDate(date.getDate() + Number(days || 0));
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function defaultQuoteDeliveryDate(issueDate) {
  return addCalendarDaysIso(issueDate || todayIsoDate(), QUOTE_DELIVERY_LEAD_DAYS);
}

/** Copie un document pour POST /api/devis : nouveau numéro, nouvelles dates, lignes sans id. */
export function cloneDocumentForCreate(document, { kind, status, labelSuffix = "", copyPvStudy = false } = {}) {
  const nextKind = kind || document?.kind || "Devis";
  const invoicing = (nextKind === "Facture" || nextKind === "Pro forma") && document?.kind === "Devis";
  const items = Array.isArray(document?.items)
    ? document.items.map(item => {
        if (!item || typeof item !== "object") return item;
        const { id, ...rest } = item;
        return rest;
      })
    : [];
  if (!items.length && Number(document?.amount || 0) > 0) {
    items.push({
      name: document.label || "Ligne",
      qty: 1,
      unit: Number(document.amount || 0),
      tax: Number(document.tax ?? 20),
    });
  }
  const label = `${document?.label || ""}${labelSuffix}`.trim();
  return {
    kind: nextKind,
    clientId: document?.clientId || null,
    client: document?.client || "",
    status: status || (nextKind === "Facture" ? "À payer" : "Brouillon"),
    date: todayIsoDate(),
    due: nextKind === "Facture" || nextKind === "Pro forma"
      ? addDaysIso(15)
      : defaultQuoteValidityDate(todayIsoDate()),
    deliveryDate: nextKind === "Devis" ? defaultQuoteDeliveryDate(todayIsoDate()) : "",
    tax: Number(document?.tax ?? 20),
    globalDiscountType: document?.globalDiscountType || "percent",
    globalDiscountValue: Number(document?.globalDiscountValue || 0),
    freeNote: document?.freeNote || "",
    label: label || (invoicing ? `Facture — ${document?.number || "devis"}` : "Document"),
    items,
    financier: document?.financier || "",
    financedAmount: document?.financedAmount ?? "",
    financeMonths: document?.financeMonths ?? "",
    monthlyPayment: document?.monthlyPayment ?? "",
    financeNominalRate: document?.financeNominalRate ?? "",
    financeTaeg: document?.financeTaeg ?? "",
    financeTaea: document?.financeTaea ?? "",
    firstMonthlyPayment: document?.firstMonthlyPayment ?? "",
    electricityOperator: document?.electricityOperator || "",
    pvPowerKwp: document?.pvPowerKwp ?? "",
    pvStudyId: copyPvStudy ? document?.pvStudyId || null : null,
    pvStudyAuto: false,
    commercialId: document?.commercialId || null,
    sourceQuoteId: invoicing ? document.id : null,
    sourceQuoteNumber: invoicing ? document.number || "" : "",
    ...(nextKind === "Devis"
      ? {
          representativeLastName: document?.representativeLastName || "",
          representativeFirstName: document?.representativeFirstName || "",
          representativeSignature: document?.representativeSignature || "",
        }
      : {}),
  };
}

export function normalizeQuoteNumber(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function findQuoteByNumber(documents, query) {
  const needle = normalizeQuoteNumber(query);
  if (!needle) return null;
  const quotes = (documents || []).filter(item => item?.kind === "Devis" && item.number);
  const ranked = quotes
    .map(item => {
      const number = normalizeQuoteNumber(item.number);
      if (number === needle) return { item, score: 3 };
      if (number.endsWith(needle) || needle.endsWith(number)) return { item, score: 2 };
      if (number.includes(needle) || needle.includes(number)) return { item, score: 1 };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  if (ranked[0].score === 3) return ranked[0].item;
  const best = ranked.filter(row => row.score === ranked[0].score);
  return best.length === 1 ? best[0].item : null;
}

export function validateDevisPayload(header, lines) {
  const errors = [];
  if (!DEVIS_KINDS.includes(header.kind)) errors.push("Type de document invalide.");
  const allowed = statusesForKind(header.kind);
  if (!allowed.includes(header.statut)) errors.push("Statut invalide.");
  if (!header.client_id && !header.client_name) errors.push("Sélectionnez un client.");
  if (!header.date_creation) errors.push("La date d’émission est obligatoire.");
  const isDraft = header.statut === "Brouillon";
  if (!isDraft && (!Array.isArray(lines) || !lines.length)) errors.push("Ajoutez au moins une ligne au document.");
  for (const line of lines || []) {
    if (!line.designation) errors.push("Chaque ligne doit avoir une désignation.");
    if (Number(line.quantite) < 0) errors.push("Quantité invalide.");
    if (Number(line.prix_unitaire_ht) < 0) errors.push("Prix unitaire invalide.");
  }
  return errors;
}

export function historyToUi(row) {
  if (!row) return null;
  return {
    id: row.id,
    devisId: row.devis_id,
    from: row.ancien_statut || null,
    to: row.nouveau_statut,
    userId: row.utilisateur_id || null,
    date: row.date,
    comment: row.commentaire || "",
  };
}

export function canManageDevis(profile) {
  if (!profile) return false;
  if (deniesFinancialAccess(profile)) return false;
  if (["Admin VIP", "Superadmin", "Responsable commercial", "Direction", "Secrétariat"].includes(normalizeRoleLabel(profile.role))) return true;
  const modules = profile.modules || [];
  return ["Devis", "Factures", "Factures pro forma"].some(module => modules.includes(module));
}

/** Prix, TVA et remises : admins, direction, responsable commercial. */
export function canEditDevisPricing(profile) {
  return ["Admin VIP", "Superadmin", "Direction", "Responsable commercial"].includes(
    normalizeRoleLabel(profile?.role)
  );
}

export function canViewAllDevis(profile) {
  return canViewOrgWideCommercialData(profile);
}

/** Rôles qui peuvent porter le CA d’un devis. */
export const DEVIS_OWNER_ROLES = ["Commercial", "Responsable commercial"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDevisOwnerRole(role) {
  return DEVIS_OWNER_ROLES.includes(normalizeRoleLabel(role));
}

/** Secrétariat / direction / admins choisissent un commercial, ou laissent l’affaire à attribuer. */
export function mustAssignDevisCommercial(profile) {
  return ["Secrétariat", "Admin VIP", "Superadmin", "Direction"].includes(
    normalizeRoleLabel(profile?.role)
  );
}

export function isUnassignedDevis(document) {
  return !isDevisCommercialId(document?.commercialId || document?.commercial_id);
}

export function isDevisCommercialId(value) {
  return UUID_RE.test(String(value || "").trim());
}

export function resolveDevisOwnerId(profile, userId, requestedId, fallbackId = "") {
  if (mustAssignDevisCommercial(profile)) {
    if (requestedId !== undefined && requestedId !== null) {
      const requested = String(requestedId).trim();
      if (isDevisCommercialId(requested) && requested !== String(userId || "")) return requested;
      return "";
    }
    const fallback = String(fallbackId || "").trim();
    if (isDevisCommercialId(fallback) && fallback !== String(userId || "")) return fallback;
    return "";
  }
  return String(userId || "").trim();
}

export function devisCommercialRequiredError() {
  return "";
}

export function formatDevisNumber(prefix, year, sequence) {
  return `${prefix}-${year}-${String(sequence).padStart(6, "0")}`;
}

export function isLockedDevisStatus(status) {
  return ["Accepté", "Payée", "Annulé"].includes(status);
}

export function kindToModule(kind) {
  if (kind === "Facture") return "Factures";
  if (kind === "Pro forma") return "Factures pro forma";
  return "Devis";
}

/** Vendeurs et responsables commerciaux consultent les devis sans les transformer en facture. */
export function canInvoiceQuote(profile) {
  const role = normalizeRoleLabel(profile?.role);
  if (["Commercial", "Responsable commercial"].includes(role)) return false;
  if (["Admin VIP", "Superadmin", "Direction", "Secrétariat"].includes(role)) return true;
  return (profile?.modules || []).includes("Factures");
}
