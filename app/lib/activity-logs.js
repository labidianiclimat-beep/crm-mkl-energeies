/** Journal d’activité CRM — ÉTAPE 12. */

export const ACTIVITY_ACTIONS = {
  CLIENT_CREATE: "client.create",
  CLIENT_UPDATE: "client.update",
  CLIENT_DELETE: "client.delete",
  DEVIS_CREATE: "devis.create",
  DEVIS_UPDATE: "devis.update",
  DEVIS_PRICE_CHANGE: "devis.price_change",
  DEVIS_DISCOUNT_CHANGE: "devis.discount_change",
  DEVIS_VALIDATE: "devis.validate",
  DEVIS_DELETE: "devis.delete",
  USER_INVITE: "user.invite",
  USER_ROLE_CHANGE: "user.role_change",
  USER_PERMISSIONS_CHANGE: "user.permissions_change",
};

const CLIENT_TRACKED = [
  "type_client",
  "civilite",
  "nom",
  "prenom",
  "raison_sociale",
  "email",
  "telephone",
  "telephone_secondaire",
  "adresse",
  "code_postal",
  "ville",
  "statut",
  "commercial_id",
  "origine_lead",
  "notes",
];

/**
 * @param {Record<string, unknown>} before
 * @param {Record<string, unknown>} after
 * @param {string[]} keys
 */
export function pickChangedFields(before = {}, after = {}, keys = []) {
  const oldValue = {};
  const newValue = {};
  for (const key of keys) {
    const prev = before?.[key] ?? null;
    const next = after?.[key] ?? null;
    const same =
      prev === next ||
      (prev == null && next == null) ||
      String(prev ?? "") === String(next ?? "") ||
      (typeof prev === "object" &&
        typeof next === "object" &&
        JSON.stringify(prev) === JSON.stringify(next));
    if (same) continue;
    oldValue[key] = prev;
    newValue[key] = next;
  }
  return {
    changed: Object.keys(newValue).length > 0,
    oldValue,
    newValue,
  };
}

export function clientDiff(before, after) {
  return pickChangedFields(before, after, CLIENT_TRACKED);
}

export function clientLabel(row = {}) {
  const name = `${row.prenom || ""} ${row.nom || ""}`.trim();
  return name || row.raison_sociale || row.email || row.id || "Client";
}

export function devisPricingSnapshot(header = {}, lines = []) {
  return {
    total_ht: header.total_ht ?? null,
    total_tva: header.total_tva ?? null,
    total_ttc: header.total_ttc ?? null,
    remise_globale_type: header.remise_globale_type ?? null,
    remise_globale: header.remise_globale ?? null,
    lines: (lines || []).map(line => ({
      reference: line.reference || null,
      designation: line.designation || null,
      quantite: line.quantite ?? null,
      prix_unitaire_ht: line.prix_unitaire_ht ?? null,
      remise_type: line.remise_type ?? null,
      remise: line.remise ?? null,
      taux_tva: line.taux_tva ?? null,
      total_ht: line.total_ht ?? null,
    })),
  };
}

export function detectDevisSensitiveChanges(beforeHeader, afterHeader, beforeLines, afterLines) {
  const beforeSnap = devisPricingSnapshot(beforeHeader, beforeLines);
  const afterSnap = devisPricingSnapshot(afterHeader, afterLines);
  const priceChanged =
    Number(beforeSnap.total_ht) !== Number(afterSnap.total_ht) ||
    Number(beforeSnap.total_ttc) !== Number(afterSnap.total_ttc) ||
    JSON.stringify(beforeSnap.lines.map(l => [l.reference, l.prix_unitaire_ht, l.quantite, l.taux_tva, l.total_ht])) !==
      JSON.stringify(afterSnap.lines.map(l => [l.reference, l.prix_unitaire_ht, l.quantite, l.taux_tva, l.total_ht]));
  const discountChanged =
    String(beforeSnap.remise_globale_type || "") !== String(afterSnap.remise_globale_type || "") ||
    Number(beforeSnap.remise_globale || 0) !== Number(afterSnap.remise_globale || 0) ||
    JSON.stringify(beforeSnap.lines.map(l => [l.remise_type, l.remise])) !==
      JSON.stringify(afterSnap.lines.map(l => [l.remise_type, l.remise]));
  const statusChanged = String(beforeHeader?.statut || "") !== String(afterHeader?.statut || "");
  const validated =
    statusChanged &&
    ["Accepté", "À valider"].includes(String(afterHeader?.statut || "")) &&
    String(beforeHeader?.statut || "") !== String(afterHeader?.statut || "");
  return { priceChanged, discountChanged, statusChanged, validated, beforeSnap, afterSnap };
}

export function modulesEqual(a = [], b = []) {
  const left = [...(a || [])].map(String).sort();
  const right = [...(b || [])].map(String).sort();
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Construit l’enregistrement à persister (sans I/O).
 */
export function buildActivityLogEntry({
  organizationId,
  userId = null,
  userName = null,
  action,
  module,
  entityType = null,
  entityId = null,
  entityLabel = null,
  oldValue = null,
  newValue = null,
}) {
  if (!organizationId || !action || !module) {
    throw new Error("activity log incomplet");
  }
  return {
    organization_id: organizationId,
    user_id: userId || null,
    user_name: userName || null,
    action: String(action),
    module: String(module),
    entity_type: entityType || null,
    entity_id: entityId != null ? String(entityId) : null,
    entity_label: entityLabel || null,
    old_value: oldValue ?? null,
    new_value: newValue ?? null,
  };
}
