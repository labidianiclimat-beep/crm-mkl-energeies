import { commitRemoteSale } from "./commercial-sale-remote.js";
import { COMMERCIAL_SALE_PRODUCTION_WRITE, signatureRemoteAllowed } from "./commercial-sale-target.js";

export { COMMERCIAL_SALE_PRODUCTION_WRITE };

export async function commitDevisSignatureInDatabase(payload) {
  if (!payload || !signatureRemoteAllowed(process.env, { write: true })) {
    throw new Error("Écriture production interdite tant que l’autorisation n’est pas donnée.");
  }
  return commitRemoteSale(payload);
}
