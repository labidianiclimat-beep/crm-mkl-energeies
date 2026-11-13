import { restAsUser, serviceRequest, serviceRoleConfigured } from "./supabase-server.js";

const DEVIS_AMOUNT_SELECT = "id,organization_id,kind,numero_devis,commercial_id,statut,total_ttc,extra";

/** Relit la ligne devis. Le champ totalTtc envoyé par le navigateur n’est pas lu. */
export function recordedDevisFromRow(row) {
  if (!row || typeof row !== "object" || !row.id) return null;
  const extra = row.extra && typeof row.extra === "object" && !Array.isArray(row.extra) ? row.extra : {};
  const amount = Number(row.total_ttc);
  return {
    id: String(row.id),
    organizationId: String(row.organization_id || ""),
    kind: String(row.kind || ""),
    numero: String(row.numero_devis || ""),
    label: String(row.numero_devis || ""),
    commercialId: row.commercial_id ? String(row.commercial_id) : "",
    sourceProspectId: String(extra.sourceProspectId || "").trim(),
    status: String(row.statut || ""),
    totalTtc: Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null,
  };
}

export async function loadRecordedDevis(id, accessToken, { query } = {}) {
  const path = `/rest/v1/devis?select=${DEVIS_AMOUNT_SELECT}&id=eq.${encodeURIComponent(id)}&limit=1`;
  const rows = typeof query === "function" ? await query(path) : await readDevisRows(path, accessToken);
  return recordedDevisFromRow(Array.isArray(rows) ? rows[0] : null);
}

async function readDevisRows(path, accessToken) {
  if (serviceRoleConfigured()) return serviceRequest(path);
  return restAsUser(path, accessToken);
}
