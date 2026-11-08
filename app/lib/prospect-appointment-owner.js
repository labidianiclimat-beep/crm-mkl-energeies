import { extraOf, isUuid } from "./prospects.js";

const EARLY_STAGES = new Set(["", "Nouveau", "À contacter"]);

/**
 * Le commercial du rendez-vous devient le commercial de la fiche prospect.
 * Une fiche déjà passée client, ou déjà à ce commercial, ne bouge pas.
 * Un stade avancé (étude, devis, gagné) n’est pas ramené à « Rendez-vous planifié ».
 */
export function prospectOwnerPatch(prospect, commercialId, now = new Date().toISOString()) {
  const next = String(commercialId || "").trim();
  if (!prospect || !isUuid(next)) return null;
  const extra = extraOf(prospect);
  if (prospect.clientId || extra.clientId || extra.client_id) return null;
  const current = String(prospect.commercial_id || prospect.commercialId || "").trim();
  if (current === next) return null;
  const stage = String(prospect.stage || "").trim();
  const patch = {
    commercial_id: next,
    updated_at: now,
  };
  if (EARLY_STAGES.has(stage)) patch.stage = "Rendez-vous planifié";
  return patch;
}
