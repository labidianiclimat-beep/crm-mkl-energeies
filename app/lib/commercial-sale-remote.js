import { isSignatureUuid, signatureRemoteAllowed } from "./commercial-sale-target.js";
import {
  serviceDeleteObject,
  serviceDownloadObject,
  serviceRequest,
  serviceUploadObject,
} from "./supabase-server.js";

function assertRemote(write) {
  if (!signatureRemoteAllowed(process.env, { write })) {
    throw new Error("Écriture production interdite tant que l’autorisation n’est pas donnée.");
  }
}

export function signatureObjectName(sale, organizationId) {
  const digest = String(sale?.proofDigest || "").trim().toLowerCase();
  const devisId = String(sale?.devisId || "").trim().toLowerCase();
  const org = String(organizationId || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(digest) || !isSignatureUuid(devisId) || !isSignatureUuid(org)) return null;
  const expected = `${org}/${devisId}/${digest}.pdf`;
  const actual = String(sale?.storagePath || "").replace(/^devis-signatures\//, "").trim().toLowerCase();
  if (actual !== expected || actual.includes("..") || actual.includes("\\")) return null;
  return expected;
}

function mapSale(row) {
  if (!row) return null;
  return {
    id: row.idempotency_key || row.id,
    devisId: row.devis_id,
    commercialId: row.commercial_id || "",
    amountTtc: Number(row.amount_ttc),
    amountSource: "devis.total_ttc",
    proofKind: row.proof_kind,
    proofDigest: row.proof_digest,
    declaredSignatureDate: row.declared_signature_on,
    storagePath: row.storage_path || "",
    status: row.status,
    linkState: row.link_state,
    prospectId: row.prospect_id || "",
    requestedBy: row.requested_by || "",
    requestedByName: row.requested_by_name || "",
    confirmedBy: row.confirmed_by || "",
    confirmedByName: row.confirmed_by_name || "",
    confirmedAt: row.confirmed_at || "",
    cancelReason: row.cancel_reason || "",
  };
}

export async function readRemoteSaleBook(organizationId, { devisIds = [] } = {}) {
  assertRemote(false);
  const org = String(organizationId || "").trim().toLowerCase();
  const ids = [...new Set(devisIds.map(id => String(id || "").trim().toLowerCase()).filter(isSignatureUuid))];
  if (!isSignatureUuid(org) || !ids.length) return { sales: [], journal: [] };
  const list = ids.map(id => encodeURIComponent(id)).join(",");
  const rows = await serviceRequest(
    `/rest/v1/devis_signatures?select=id,idempotency_key,devis_id,commercial_id,amount_ttc,proof_kind,proof_digest,declared_signature_on,storage_path,status,link_state,prospect_id,requested_by,requested_by_name,confirmed_by,confirmed_by_name,confirmed_at,cancel_reason&organization_id=eq.${encodeURIComponent(org)}&devis_id=in.(${list})`
  );
  const devisIdsFound = [...new Set((rows || []).map(row => row.devis_id).filter(Boolean))];
  const journal = devisIdsFound.length
    ? await serviceRequest(
      `/rest/v1/devis_signature_journal?select=action,at,actor_id,actor_name,devis_id,signature_id,amount_ttc,reason&devis_id=in.(${devisIdsFound.map(id => encodeURIComponent(id)).join(",")})&order=at.asc`
    )
    : [];
  return {
    sales: (rows || []).map(mapSale),
    journal: (journal || []).map(entry => ({
      action: entry.action,
      at: entry.at,
      actorId: entry.actor_id || "",
      actorName: entry.actor_name || "",
      devisId: entry.devis_id,
      saleId: entry.signature_id || "",
      amountTtc: entry.amount_ttc,
      reason: entry.reason || "",
    })),
  };
}

export async function readRemoteSalePdf(sale, organizationId) {
  assertRemote(false);
  const name = signatureObjectName(sale, organizationId);
  if (!name) return null;
  return serviceDownloadObject("devis-signatures", name);
}

export async function commitRemoteSale({ sale, action, actorId, reason = null, bytes = null }) {
  assertRemote(true);
  const name = signatureObjectName(sale, sale?.organizationId);
  let uploaded = false;
  if (bytes && name && action !== "annuler") {
    await serviceUploadObject("devis-signatures", name, bytes, "application/pdf");
    uploaded = true;
  }
  try {
    return await serviceRequest("/rest/v1/rpc/commit_devis_signature", {
      method: "POST",
      body: {
        p_devis_id: sale.devisId,
        p_action: action,
        p_actor_id: actorId,
        p_proof_kind: sale.proofKind || null,
        p_declared_signature_on: sale.declaredSignatureDate || null,
        p_proof_digest: sale.proofDigest || null,
        p_idempotency_key: sale.id,
        p_storage_path: sale.storagePath || null,
        p_reason: reason || sale.cancelReason || null,
        p_replaces_devis_id: sale.replacesDevisId || null,
      },
    });
  } catch (error) {
    if (uploaded) await serviceDeleteObject("devis-signatures", name).catch(() => {});
    throw error;
  }
}
