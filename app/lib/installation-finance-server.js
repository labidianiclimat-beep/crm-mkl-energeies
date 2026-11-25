import { isMissingRelation } from "./article-taxonomy.js";
import { isInstallationSalesRole } from "./installation-finance.js";
import { serviceRequest } from "./supabase-server.js";

function quoteIds(ids) {
  return (ids || []).map(id => `"${String(id).replace(/"/g, "")}"`).join(",");
}

export function installationFinanceUnavailable(error) {
  const message = String(error?.message || error || "");
  return isMissingRelation(error, "installation_finances")
    || isMissingRelation(error, "installation_purchases")
    || /save_installation_finance/i.test(message);
}

export async function assertInstallationSalesCommercial(organizationId, commercialId) {
  if (!commercialId) return { ok: true };
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=id,role,active&organization_id=eq.${encodeURIComponent(organizationId)}&id=eq.${encodeURIComponent(commercialId)}&limit=1`
  );
  const profile = rows?.[0];
  if (!profile || profile.active === false) return { ok: false, error: "Commercial introuvable." };
  if (!isInstallationSalesRole(profile.role)) return { ok: false, error: "Choisissez un commercial." };
  return { ok: true };
}

export async function saveInstallationFinance({ organizationId, installationId, userId, parsed }) {
  await serviceRequest("/rest/v1/rpc/save_installation_finance", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: {
      p_org: organizationId,
      p_installation_id: installationId,
      p_commercial_id: parsed.commercialId,
      p_sale_cents: parsed.saleTtcCents,
      p_pose_cents: parsed.poseCents,
      p_purchases: parsed.purchases.map(line => ({ label: line.label, amountCents: line.amountCents })),
      p_user: userId || null,
    },
  });
}

export async function readInstallationFinances(organizationId) {
  const rows = await serviceRequest(
    `/rest/v1/installation_finances?select=id,installation_id,commercial_id,sale_ttc_cents,pose_cents&organization_id=eq.${encodeURIComponent(organizationId)}`
  );
  if (!rows?.length) return { rows: [], purchases: [], people: [] };
  const financeIds = quoteIds(rows.map(row => row.id));
  const commercialIds = quoteIds([...new Set(rows.map(row => row.commercial_id).filter(Boolean))]);
  const [purchases, people] = await Promise.all([
    serviceRequest(
      `/rest/v1/installation_purchases?select=id,finance_id,position,label,amount_cents&organization_id=eq.${encodeURIComponent(organizationId)}&finance_id=in.(${financeIds})&order=position.asc`
    ),
    commercialIds
      ? serviceRequest(`/rest/v1/profiles?select=id,full_name,email&id=in.(${commercialIds})`)
      : Promise.resolve([]),
  ]);
  return { rows, purchases: purchases || [], people: people || [] };
}

export async function readInstallationFinance(organizationId, installationId) {
  const rows = await serviceRequest(
    `/rest/v1/installation_finances?select=id,installation_id,commercial_id,sale_ttc_cents,pose_cents&organization_id=eq.${encodeURIComponent(organizationId)}&installation_id=eq.${encodeURIComponent(installationId)}&limit=1`
  );
  if (!rows?.length) return { rows: [], purchases: [], people: [] };
  const commercialIds = quoteIds(rows.map(row => row.commercial_id).filter(Boolean));
  const [purchases, people] = await Promise.all([
    serviceRequest(
      `/rest/v1/installation_purchases?select=id,finance_id,position,label,amount_cents&finance_id=eq.${encodeURIComponent(rows[0].id)}&order=position.asc`
    ),
    commercialIds
      ? serviceRequest(`/rest/v1/profiles?select=id,full_name,email&id=in.(${commercialIds})`)
      : Promise.resolve([]),
  ]);
  return { rows, purchases: purchases || [], people: people || [] };
}

export async function deleteInstallationFinance(organizationId, installationId) {
  await serviceRequest(
    `/rest/v1/installation_finances?organization_id=eq.${encodeURIComponent(organizationId)}&installation_id=eq.${encodeURIComponent(installationId)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } }
  );
}
