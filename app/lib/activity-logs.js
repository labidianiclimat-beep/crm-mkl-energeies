/** Journal d’activité CRM — ÉTAPE 12. */

export const ACTIVITY_ACTIONS = {
  CLIENT_CREATE: "client.create",
  CLIENT_UPDATE: "client.update",
  CLIENT_DELETE: "client.delete",
  CLIENT_DOCUMENT_UPLOAD: "client.document_upload",
  CLIENT_DOCUMENT_DELETE: "client.document_delete",
  PROSPECT_DOCUMENT_UPLOAD: "prospect.document_upload",
  PROSPECT_DOCUMENT_DELETE: "prospect.document_delete",
  DEVIS_CREATE: "devis.create",
  DEVIS_UPDATE: "devis.update",
  DEVIS_PRICE_CHANGE: "devis.price_change",
  DEVIS_DISCOUNT_CHANGE: "devis.discount_change",
  DEVIS_VALIDATE: "devis.validate",
  DEVIS_DELETE: "devis.delete",
  USER_INVITE: "user.invite",
  USER_ROLE_CHANGE: "user.role_change",
  USER_PERMISSIONS_CHANGE: "user.permissions_change",
  USER_EMAIL_CHANGE: "user.email_change",
  USER_ACTIVE_CHANGE: "user.active_change",
  PROSPECT_CREATE: "prospect.create",
  PROSPECT_UPDATE: "prospect.update",
  PROSPECT_DELETE: "prospect.delete",
  PROSPECT_ASSIGN: "prospect.assign",
  PROSPECT_REASSIGN: "prospect.reassign",
  APPOINTMENT_CREATE: "appointment.create",
  APPOINTMENT_UPDATE: "appointment.update",
  APPOINTMENT_DELETE: "appointment.delete",
  SESSION_LOGIN: "session.login",
  SESSION_LOGOUT: "session.logout",
  FLEET_VEHICLE_CREATE: "fleet.vehicle_create",
  FLEET_VEHICLE_UPDATE: "fleet.vehicle_update",
  FLEET_VEHICLE_ARCHIVE: "fleet.vehicle_archive",
  FLEET_VEHICLE_STATUS: "fleet.vehicle_status",
  FLEET_ASSIGNMENT_PREPARE: "fleet.assignment_prepare",
  FLEET_ASSIGNMENT_VALIDATE: "fleet.assignment_validate",
  FLEET_ASSIGNMENT_REJECT: "fleet.assignment_reject",
  FLEET_ASSIGNMENT_CHANGE: "fleet.assignment_change",
  FLEET_ASSIGNMENT_RELEASE: "fleet.assignment_release",
  FLEET_MILEAGE_SUBMIT: "fleet.mileage_submit",
  FLEET_MILEAGE_VALIDATE: "fleet.mileage_validate",
  FLEET_MILEAGE_REJECT: "fleet.mileage_reject",
  FLEET_EXPENSE_CREATE: "fleet.expense_create",
  FLEET_EXPENSE_VALIDATE: "fleet.expense_validate",
  FLEET_EXPENSE_REJECT: "fleet.expense_reject",
  FLEET_INCIDENT_CREATE: "fleet.incident_create",
  FLEET_INCIDENT_UPDATE: "fleet.incident_update",
  FLEET_INCIDENT_CLOSE: "fleet.incident_close",
  FLEET_DOCUMENT_UPLOAD: "fleet.document_upload",
  FLEET_DOCUMENT_DELETE: "fleet.document_delete",
  ENTRETIEN_IMPORT: "entretien.import",
  ENTRETIEN_CALENDAR_PULL: "entretien.calendar_pull",
  ENTRETIEN_VISIT_REVIEW: "entretien.visit_review",
  INSTALLATION_FINANCE_SAVE: "chantier.finance_save",
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

export const ACTION_LABELS = {
  "client.create": "Création client",
  "client.update": "Modification client",
  "client.delete": "Suppression client",
  "client.document_upload": "Document client ajouté",
  "client.document_delete": "Document client supprimé",
  "prospect.document_upload": "Document prospect ajouté",
  "prospect.document_delete": "Document prospect supprimé",
  "devis.create": "Création devis",
  "devis.update": "Modification devis",
  "devis.price_change": "Modification prix",
  "devis.discount_change": "Modification remise",
  "devis.validate": "Validation devis",
  "devis.delete": "Suppression devis",
  "user.invite": "Invitation utilisateur",
  "user.role_change": "Changement de rôle",
  "user.permissions_change": "Changement de permissions",
  "user.email_change": "Changement d’identifiant",
  "user.active_change": "Activation utilisateur",
  "prospect.create": "Création prospect",
  "prospect.update": "Modification prospect",
  "prospect.delete": "Suppression prospect",
  "prospect.assign": "Affectation prospect",
  "prospect.reassign": "Réaffectation prospect",
  "appointment.create": "Création rendez-vous",
  "appointment.update": "Modification rendez-vous",
  "appointment.delete": "Suppression rendez-vous",
  "session.login": "Connexion",
  "session.logout": "Déconnexion",
  "fleet.vehicle_create": "Création véhicule",
  "fleet.vehicle_update": "Modification véhicule",
  "fleet.vehicle_archive": "Archivage véhicule",
  "fleet.vehicle_status": "Changement de statut véhicule",
  "fleet.assignment_prepare": "Préparation d’affectation",
  "fleet.assignment_validate": "Validation d’affectation",
  "fleet.assignment_reject": "Rejet d’affectation",
  "fleet.assignment_change": "Changement de conducteur",
  "fleet.assignment_release": "Voiture rendue disponible",
  "fleet.mileage_submit": "Relevé kilométrique",
  "fleet.mileage_validate": "Validation kilométrage",
  "fleet.mileage_reject": "Rejet kilométrage",
  "fleet.expense_create": "Dépense véhicule",
  "fleet.expense_validate": "Validation dépense",
  "fleet.expense_reject": "Rejet dépense",
  "fleet.incident_create": "Déclaration d’incident",
  "fleet.incident_update": "Suivi d’incident",
  "fleet.incident_close": "Clôture d’incident",
  "fleet.document_upload": "Document véhicule ajouté",
  "fleet.document_delete": "Document véhicule supprimé",
  "entretien.import": "Import contrats d’entretien",
  "entretien.calendar_pull": "Lecture agenda entretien",
  "entretien.visit_review": "Revue visite d’entretien",
  "chantier.finance_save": "Montants de chantier enregistrés",
};

export function actionLabel(action) {
  return ACTION_LABELS[action] || String(action || "");
}

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
