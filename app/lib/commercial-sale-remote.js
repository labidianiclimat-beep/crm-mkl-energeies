import { signatureRemoteAllowed } from "./commercial-sale-target.js";
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

function objectName(storagePath) {
  return String(storagePath || "").replace(/^devis-signatures\//, "");
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

export async function readRemoteSaleBook(organizationId) {
  assertRemote(false);
  const rows = await serviceRequest(
    `/rest/v1/devis_signatures?select=*&organization_id=eq.${encodeURIComponent(organizationId)}`
  );
  const devisIds = [...new Set((rows || []).map(row => row.devis_id).filter(Boolean))];
  const journal = devisIds.length
    ? await serviceRequest(
      `/rest/v1/devis_signature_journal?select=*&devis_id=in.(${devisIds.map(id => encodeURIComponent(id)).join(",")})&order=at.asc`
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

export async function readRemoteSalePdf(storagePath) {
  assertRemote(false);
  const name = objectName(storagePath);
  if (!name || name.includes("..")) return null;
  return serviceDownloadObject("devis-signatures", name);
}

export async function commitRemoteSale({ sale, action, actorId, reason = null, bytes = null }) {
  assertRemote(true);
  const name = objectName(sale?.storagePath);
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
