import { createHash } from "node:crypto";
import { isPdfBuffer } from "./client-documents.js";
import { normalizeRoleLabel } from "./roles.js";

/** Vente signée. Ce module ne parle à aucune base. */

export const SALE_PROOF_KINDS = ["devis_signe", "manuel"];
export const FUTURE_ELECTRONIC_PROOF = "electronique";
export const SALE_CONFIRM_ROLES = ["Superadmin", "Admin VIP", "Responsable commercial"];
export const SALE_REQUEST_ROLES = ["Commercial"];

const CONFIRM = new Set(SALE_CONFIRM_ROLES);
const REQUEST = new Set(SALE_REQUEST_ROLES);

export function canConfirmCommercialSale(profile) {
  return CONFIRM.has(normalizeRoleLabel(profile?.role));
}

export function canRequestCommercialSignature(profile) {
  return REQUEST.has(normalizeRoleLabel(profile?.role));
}

export function authorizeSaleAction(profile, action) {
  const name = String(action || "").trim();
  if (name === "demande" && canRequestCommercialSignature(profile)) return { ok: true, action: name };
  if (["confirmer", "annuler", "remplacer"].includes(name) && canConfirmCommercialSale(profile)) {
    return { ok: true, action: name };
  }
  return {
    ok: false,
    error: name === "demande"
      ? "Vous ne pouvez pas déposer de signature."
      : "Vous ne pouvez pas confirmer cette vente.",
  };
}

export function legacyAcceptedQuoteCountsAsSale() {
  return false;
}

/** Point d’extension. Aucun prestataire n’est branché. */
export function verifyElectronicSignature() {
  return {
    ok: false,
    code: "provider_absent",
    error: "La signature électronique n’est pas installée. Déposez le PDF signé par le client.",
  };
}

export function saleVerdict({ devisStatus = "", sale = null, appointmentStatus = "" } = {}) {
  if (sale?.status === "confirmee") return "Signée vérifiée";
  if (sale?.status === "demande") return "Signature à vérifier";
  if (sale?.status === "annulee") return "Signature annulée";
  if (sale?.status === "remplacee") return "Devis remplacé";
  if (String(devisStatus || "") === "Accepté") return "Acceptation historique non vérifiée";
  if (String(appointmentStatus || "") === "Commande signée") return "Commande signée sans preuve";
  return "";
}

export function proofDigest(proof = {}) {
  if (proof.bytes) return createHash("sha256").update(proof.bytes).digest("hex");
  const reference = String(proof.reference || "").trim();
  if (reference) return createHash("sha256").update(`${proof.kind}:${reference}`).digest("hex");
  return "";
}

function parisDay(now) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

function fail(error) {
  return { ok: false, error };
}

function isRepresentativeProof(proof = {}) {
  const kind = String(proof.kind || "").trim();
  if (kind === "representant" || proof.fromRepresentative === true) return true;
  const raw = String(proof.reference || "");
  return raw.startsWith("data:image") || raw.startsWith("data:application");
}

export function validateSaleProof(proof = {}, { action = "demande", now = Date.now() } = {}) {
  if (!proof || typeof proof !== "object") return fail("Le justificatif doit être le PDF signé.");
  if (isRepresentativeProof(proof)) {
    return fail("La signature du commercial ne constitue pas une preuve.");
  }
  const kind = String(proof.kind || "").trim();
  if (kind === FUTURE_ELECTRONIC_PROOF || kind === "electronique") return verifyElectronicSignature();
  if (!SALE_PROOF_KINDS.includes(kind)) return fail("Choisissez un justificatif reconnu.");
  if (action === "demande" && kind === "manuel") {
    return fail("La validation manuelle est réservée aux profils autorisés.");
  }
  const declared = String(proof.declaredSignatureDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(declared) || declared > parisDay(now)) {
    return fail("Indiquez la date de signature.");
  }
  if (!isPdfBuffer(proof.bytes)) {
    return fail("Le justificatif doit être le PDF signé.");
  }
  const digest = proofDigest(proof);
  if (!digest) return fail("Le justificatif est illisible.");
  return { ok: true, kind, declared, digest };
}

export function saleIdempotencyKey({ devisId, kind, digest }) {
  return createHash("sha256").update(`${devisId}|${kind}|${digest}`).digest("hex");
}

/** Le montant contractuel est celui déjà enregistré sur le devis. */
export function assertRecordedAmount(recorded, submitted) {
  const column = recorded?.total_ttc;
  const amount = money(column != null && column !== "" ? column : recorded?.totalTtc);
  if (amount == null) return fail("Le montant du devis enregistré est indisponible.");
  if (submitted != null && submitted !== "" && money(submitted) !== amount) {
    return fail("Le montant envoyé ne correspond pas au devis enregistré.");
  }
  return { ok: true, amount, source: "devis.total_ttc" };
}

export function canReadSaleProof(profile, userId, sale) {
  if (!sale?.proofDigest) return false;
  if (canConfirmCommercialSale(profile)) return true;
  if (!canRequestCommercialSignature(profile)) return false;
  const reader = String(userId || "");
  return reader !== "" && [String(sale.commercialId || ""), String(sale.requestedBy || "")].includes(reader);
}

function contractualAmount(devis, submitted) {
  const amount = money(devis?.totalTtc ?? devis?.total_ttc);
  if (amount == null) return fail("Le montant du devis est indisponible.");
  if (submitted != null && submitted !== "" && money(submitted) !== amount) {
    return fail("Le montant ne correspond pas au devis.");
  }
  return { ok: true, amount };
}

export function saleSyncPlan(devis = {}) {
  const prospectId = String(devis.sourceProspectId || devis.prospectId || "").trim();
  return {
    devisStatus: "Accepté",
    opportunityStage: prospectId ? "Gagné" : null,
    linkState: prospectId ? "reliée" : "À rattacher",
    prospectId: prospectId || "",
    appointment: "inchangé",
    clientStatut: "inchangé",
    finance: "inchangé",
    installation: "inchangé",
  };
}

function snapshotSale({
  devis,
  actor,
  proof,
  digest,
  amount,
  status,
  now,
  sync,
}) {
  const id = saleIdempotencyKey({ devisId: devis.id, kind: proof.kind, digest });
  return {
    id,
    devisId: String(devis.id),
    commercialId: String(devis.commercialId || devis.commercial_id || ""),
    amountTtc: amount,
    amountSource: "devis.total_ttc",
    proofKind: proof.kind,
    proofDigest: digest,
    declaredSignatureDate: proof.declared || proof.declaredSignatureDate,
    proofReference: String(proof.reference || "").trim(),
    storagePath: proof.kind === "electronique"
      ? ""
      : `devis-signatures/${devis.organizationId || "org"}/${devis.id}/${digest}.pdf`,
    status,
    linkState: sync.linkState,
    prospectId: sync.prospectId,
    requestedBy: status === "demande" ? String(actor.id || "") : String(proof.requestedBy || ""),
    requestedByName: status === "demande" ? String(actor.name || actor.full_name || "") : String(proof.requestedByName || ""),
    requestedAt: status === "demande" ? new Date(now).toISOString() : proof.requestedAt || "",
    confirmedBy: status === "confirmee" ? String(actor.id || "") : "",
    confirmedByName: status === "confirmee" ? String(actor.name || actor.full_name || "") : "",
    confirmedAt: status === "confirmee" ? new Date(now).toISOString() : "",
    cancelledBy: "",
    cancelledAt: "",
    replacesDevisId: String(proof.replacesDevisId || ""),
  };
}

function withJournal(book, entry) {
  return { ...book, journal: [...book.journal, entry] };
}

function putSale(book, sale) {
  const sales = book.sales.filter(item => item.id !== sale.id);
  return { ...book, sales: [...sales, sale] };
}

export function emptySaleBook() {
  return { sales: [], journal: [] };
}

export function commercialSaleTotals(sales = []) {
  const confirmed = sales.filter(item => item.status === "confirmee");
  const cancelled = sales.filter(item => item.status === "annulee");
  const sum = rows => rows.reduce((total, item) => total + Number(item.amountTtc || 0), 0);
  return {
    brut: Math.round((sum(confirmed) + sum(cancelled)) * 100) / 100,
    net: Math.round(sum(confirmed) * 100) / 100,
  };
}

function replacedSale(book, devisId) {
  return (book?.sales || []).find(item => item.devisId === String(devisId || "") && item.status === "remplacee");
}

export function requestCommercialSignature(book, { actor, devis, proof, now = Date.now() } = {}) {
  if (!canRequestCommercialSignature(actor)) return fail("Vous ne pouvez pas déposer de signature.");
  if (replacedSale(book, devis?.id)) return fail("Ce devis a été remplacé et ne peut plus être confirmé.");
  const checked = validateSaleProof(proof, { action: "demande", now });
  if (!checked.ok) return checked;
  const amount = contractualAmount(devis, proof.amountTtc);
  if (!amount.ok) return amount;
  const sync = saleSyncPlan(devis);
  const sale = snapshotSale({
    devis,
    actor,
    proof: { ...proof, kind: checked.kind, declared: checked.declared },
    digest: checked.digest,
    amount: amount.amount,
    status: "demande",
    now,
    sync,
  });
  const current = book || emptySaleBook();
  const existing = current.sales.find(item => item.devisId === sale.devisId && item.status === "demande");
  if (existing?.id === sale.id) {
    return {
      ok: true,
      identical: true,
      sale: existing,
      sync: { ...sync, devisStatus: "inchangé", opportunityStage: null },
      book: withJournal(current, journalEntry("demande_identique", actor, existing, now)),
    };
  }
  if (existing) return fail("Une demande est déjà en cours pour ce devis.");
  const live = current.sales.find(item => item.devisId === sale.devisId && item.status === "confirmee");
  if (live) return fail("Cette vente est déjà confirmée.");
  const next = putSale(current, sale);
  return {
    ok: true,
    sale,
    sync: { ...sync, devisStatus: "inchangé", opportunityStage: null },
    book: withJournal(next, journalEntry("demande", actor, sale, now)),
  };
}

export function confirmCommercialSale(book, { actor, devis, proof, now = Date.now() } = {}) {
  if (!canConfirmCommercialSale(actor)) return fail("Vous ne pouvez pas confirmer cette vente.");
  const current = book || emptySaleBook();
  if (replacedSale(current, devis?.id)) return fail("Ce devis a été remplacé et ne peut plus être confirmé.");
  const pending = current.sales.find(item => item.devisId === String(devis?.id || "") && item.status === "demande");
  if (!proof) {
    if (pending) return promote(current, pending, { actor, devis, now });
    const live = current.sales.find(item => item.devisId === String(devis?.id || "") && item.status === "confirmee");
    return fail(live ? "Cette vente est déjà confirmée." : "Le justificatif doit être le PDF signé.");
  }
  const checked = validateSaleProof(proof, { action: "confirmer", now });
  if (!checked.ok) return checked;
  const amount = contractualAmount(devis, proof.amountTtc);
  if (!amount.ok) return amount;
  const sync = saleSyncPlan(devis);
  const sale = snapshotSale({
    devis,
    actor,
    proof: { ...proof, kind: checked.kind, declared: checked.declared, requestedBy: pending?.requestedBy, requestedAt: pending?.requestedAt },
    digest: checked.digest,
    amount: amount.amount,
    status: "confirmee",
    now,
    sync,
  });
  const same = current.sales.find(item => item.id === sale.id && item.status === "confirmee");
  if (same) {
    return {
      ok: true,
      identical: true,
      sale: same,
      sync,
      book: withJournal(current, journalEntry("confirmation_identique", actor, same, now)),
    };
  }
  const other = current.sales.find(item => item.devisId === sale.devisId && item.status === "confirmee");
  if (other) return fail("Cette vente est déjà confirmée.");
  let next = current;
  if (pending && pending.id !== sale.id) return fail("Le justificatif ne correspond pas à la demande.");
  if (pending) next = { ...next, sales: next.sales.filter(item => item.id !== pending.id) };
  next = putSale(next, sale);
  return {
    ok: true,
    sale,
    sync,
    book: withJournal(next, journalEntry("confirmation", actor, sale, now)),
  };
}

function promote(book, pending, { actor, devis, now }) {
  const amount = contractualAmount(devis);
  if (!amount.ok) return amount;
  const sync = saleSyncPlan(devis);
  const sale = {
    ...pending,
    status: "confirmee",
    amountTtc: amount.amount,
    amountSource: "devis.total_ttc",
    linkState: sync.linkState,
    prospectId: sync.prospectId,
    confirmedBy: String(actor.id || ""),
    confirmedByName: String(actor.name || actor.full_name || ""),
    confirmedAt: new Date(now).toISOString(),
  };
  const next = putSale(book, sale);
  return {
    ok: true,
    sale,
    sync,
    book: withJournal(next, journalEntry("confirmation", actor, sale, now)),
  };
}

export function cancelCommercialSale(book, { actor, devisId, reason = "", now = Date.now() } = {}) {
  if (!canConfirmCommercialSale(actor)) return fail("Vous ne pouvez pas confirmer cette vente.");
  const current = book || emptySaleBook();
  const sale = current.sales.find(item => item.devisId === String(devisId || "") && (item.status === "confirmee" || item.status === "annulee"));
  if (!sale) return fail("Aucune vente confirmée pour ce devis.");
  if (sale.status === "annulee") {
    return {
      ok: true,
      identical: true,
      sale,
      book: withJournal(current, journalEntry("annulation_identique", actor, sale, now)),
    };
  }
  const motif = String(reason || "").trim();
  if (motif.length < 3) return fail("Indiquez le motif d’annulation.");
  const cancelled = {
    ...sale,
    status: "annulee",
    cancelReason: motif,
    cancelledBy: String(actor.id || ""),
    cancelledAt: new Date(now).toISOString(),
  };
  return {
    ok: true,
    sale: cancelled,
    sync: {
      devisStatus: "inchangé",
      opportunityStage: null,
      appointment: "inchangé",
      clientStatut: "inchangé",
      finance: "inchangé",
      installation: "inchangé",
    },
    book: withJournal(putSale(current, cancelled), journalEntry("annulation", actor, cancelled, now)),
  };
}

export function replaceCommercialSale(book, { actor, devis, proof, replacesDevisId, now = Date.now() } = {}) {
  if (!canConfirmCommercialSale(actor)) return fail("Vous ne pouvez pas confirmer cette vente.");
  const previousId = String(replacesDevisId || proof?.replacesDevisId || "").trim();
  const current = book || emptySaleBook();
  const previous = current.sales.find(item => item.devisId === previousId && item.status === "confirmee");
  if (!previous) return fail("Le devis remplacé n’a pas de vente confirmée.");
  if (String(devis?.id || "") === previousId) return fail("Un devis ne peut pas se remplacer lui-même.");
  const carried = proof?.bytes || proof?.kind ? { ...proof, replacesDevisId: previousId } : null;
  const created = confirmCommercialSale(current, {
    actor,
    devis,
    proof: carried,
    now,
  });
  if (!created.ok) return created;
  const replaced = { ...previous, status: "remplacee", replacedByDevisId: String(devis.id) };
  const next = putSale(created.book, replaced);
  return {
    ok: true,
    sale: { ...created.sale, replacesDevisId: previousId },
    replaced,
    sync: created.sync,
    book: withJournal(next, journalEntry("remplacement", actor, created.sale, now)),
  };
}

function journalEntry(action, actor, sale, now) {
  return {
    action,
    at: new Date(now).toISOString(),
    actorId: String(actor?.id || ""),
    actorName: String(actor?.name || actor?.full_name || ""),
    devisId: sale.devisId,
    saleId: sale.id,
    status: sale.status,
    amountTtc: sale.amountTtc,
    reason: sale.cancelReason || "",
  };
}

export function saleForDevis(book, devisId) {
  const rows = (book?.sales || []).filter(item => item.devisId === String(devisId || ""));
  return rows.find(item => item.status === "confirmee")
    || rows.find(item => item.status === "demande")
    || rows.find(item => item.status === "annulee")
    || null;
}

export function executeSaleAction(book, { action, actor, devis, proof, reason, replacesDevisId, now } = {}) {
  if (action === "demande") return requestCommercialSignature(book, { actor, devis, proof, now });
  if (action === "confirmer") return confirmCommercialSale(book, { actor, devis, proof, now });
  if (action === "annuler") return cancelCommercialSale(book, { actor, devisId: devis?.id, reason, now });
  if (action === "remplacer") return replaceCommercialSale(book, { actor, devis, proof, replacesDevisId, now });
  return fail("Action inconnue.");
}

export async function applySaleSync(sync = {}, adapters = {}) {
  if (typeof adapters.client === "function") {
    return { ok: false, error: "La fiche client ne change pas lors d’une signature.", clientCalled: false };
  }
  let devisApplied = false;
  if (sync.devisStatus === "Accepté" && typeof adapters.devis === "function") {
    try {
      await adapters.devis({ statut: "Accepté" });
      devisApplied = true;
    } catch (error) {
      return { ok: false, step: "devis", error: String(error?.message || error), devisApplied: false, clientCalled: false };
    }
  }
  if (sync.opportunityStage && typeof adapters.opportunity === "function") {
    try {
      await adapters.opportunity({ stage: sync.opportunityStage, prospectId: sync.prospectId });
    } catch (error) {
      return { ok: false, step: "opportunite", error: String(error?.message || error), devisApplied, clientCalled: false };
    }
  }
  return { ok: true, devisApplied, clientCalled: false, appointment: "inchangé", clientStatut: "inchangé" };
}
