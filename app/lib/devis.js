import { canViewOrgWideCommercialData } from "./scoping.js";

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

export function computeDocumentTotals(document) {
  const defaultTax = Number(document?.tax ?? document?.tax_default ?? 20);
  const items = Array.isArray(document?.items) ? document.items : [];
  const lines = (items.length ? items : [{ name: document?.label, qty: 1, unit: document?.amount || 0, tax: defaultTax }]).map(
    item => ({ ...item, ...computeLineTotals(item, defaultTax) })
  );
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
    ...(row.extra && typeof row.extra === "object" ? row.extra : {}),
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
      date_creation: input.date || input.date_creation || new Date().toISOString().slice(0, 10),
      date_validite: input.due || input.date_validite || null,
      date_livraison: input.deliveryDate || input.date_livraison || null,
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
      extra: {
        pvStudyAuto: Boolean(input.pvStudyAuto),
      },
      created_by: createdBy || null,
      updated_at: new Date().toISOString(),
    },
    lines: items.map((item, index) => lineToDb(item, index, Number(input.tax ?? 20))),
  };
}

export function validateDevisPayload(header, lines) {
  const errors = [];
  if (!DEVIS_KINDS.includes(header.kind)) errors.push("Type de document invalide.");
  const allowed = statusesForKind(header.kind);
  if (!allowed.includes(header.statut)) errors.push("Statut invalide.");
  if (!header.client_id && !header.client_name) errors.push("Sélectionnez un client.");
  if (!header.date_creation) errors.push("La date d’émission est obligatoire.");
  if (!Array.isArray(lines) || !lines.length) errors.push("Ajoutez au moins une ligne au document.");
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
  if (["Admin VIP", "Admin second", "Responsable commercial", "Direction", "Secrétariat"].includes(profile.role)) return true;
  const modules = profile.modules || [];
  return ["Devis", "Factures", "Factures pro forma"].some(module => modules.includes(module));
}

export function canViewAllDevis(profile) {
  return canViewOrgWideCommercialData(profile);
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
