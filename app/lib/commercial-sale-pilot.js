import { canConfirmCommercialSale, canRequestCommercialSignature } from "./commercial-sale.js";
import { isSignatureUuid } from "./commercial-sale-target.js";
import { normalizeRoleLabel } from "./roles.js";

/** L’aperçu d’un autre compte ne devient jamais l’auteur d’une signature. */
export function signatureActorIdentity(auth = {}) {
  const profile = auth.profile || {};
  if (profile.realRole && profile.realUserId) {
    return {
      userId: String(auth.realUserId || profile.realUserId || "").trim().toLowerCase(),
      profile: { ...profile, id: profile.realUserId, role: profile.realRole },
    };
  }
  return {
    userId: String(auth.realUserId || auth.user?.id || profile.id || "").trim().toLowerCase(),
    profile,
  };
}

export function sameSignatureOrganization(profile, recorded) {
  const actorOrg = String(profile?.organization_id || profile?.organizationId || "").trim().toLowerCase();
  const devisOrg = String(recorded?.organizationId || recorded?.organization_id || "").trim().toLowerCase();
  return Boolean(actorOrg && devisOrg && actorOrg === devisOrg);
}

function ownerOf(record) {
  return String(record?.commercialId || record?.commercial_id || "").trim().toLowerCase();
}

/**
 * En mode pilote, seul le commercial désigné dépose sur ses devis,
 * et seul le responsable désigné confirme les preuves de ce commercial.
 * Hors pilote, les rôles habituels restent valables pour ce devis.
 */
export function signaturePermissions({
  mode = "",
  profile,
  userId,
  devis,
  sale = null,
  pilot = { valid: false },
} = {}) {
  if (mode === "pilote") {
    const id = String(userId || "").trim().toLowerCase();
    const devisOwner = ownerOf(devis);
    const saleOwner = ownerOf(sale);
    const configured = pilot?.valid === true && isSignatureUuid(pilot.commercialId) && isSignatureUuid(pilot.managerId);
    const proofOwner = saleOwner || devisOwner;
    const proofOfPilot = configured && proofOwner === pilot.commercialId;
    const commercial = configured
      && id === pilot.commercialId
      && canRequestCommercialSignature(profile)
      && devisOwner === id
      && proofOfPilot;
    const manager = configured
      && id === pilot.managerId
      && normalizeRoleLabel(profile?.role) === "Responsable commercial"
      && proofOfPilot;
    return { read: commercial || manager, request: commercial, confirm: manager };
  }
  return {
    read: true,
    request: canRequestCommercialSignature(profile),
    confirm: canConfirmCommercialSale(profile),
  };
}
