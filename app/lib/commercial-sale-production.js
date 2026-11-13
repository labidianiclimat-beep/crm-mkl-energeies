import { commitRemoteSale } from "./commercial-sale-remote.js";
import { signatureAccess } from "./commercial-sale-target.js";

/** La production reste fermée. Seul le projet de recette peut recevoir la transaction. */
export const COMMERCIAL_SALE_PRODUCTION_WRITE = false;

export async function commitDevisSignatureInDatabase(payload) {
  const access = signatureAccess();
  if (!payload || COMMERCIAL_SALE_PRODUCTION_WRITE !== false || access.target !== "recette" || !access.writes) {
    throw new Error("Écriture production interdite tant que l’autorisation n’est pas donnée.");
  }
  return commitRemoteSale(payload);
}
