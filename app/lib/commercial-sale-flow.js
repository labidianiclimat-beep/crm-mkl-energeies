import {
  assertRecordedAmount,
  authorizeSaleAction,
  canConfirmCommercialSale,
  canReadSaleProof,
  canRequestCommercialSignature,
  commercialSaleTotals,
  executeSaleAction,
  saleForDevis,
  saleVerdict,
} from "./commercial-sale.js";

function submittedAmount(body = {}) {
  if (body?.devis && Object.prototype.hasOwnProperty.call(body.devis, "totalTtc")) return body.devis.totalTtc;
  if (Object.prototype.hasOwnProperty.call(body, "amountTtc")) return body.amountTtc;
  if (body?.proof && Object.prototype.hasOwnProperty.call(body.proof, "amountTtc")) return body.proof.amountTtc;
  return undefined;
}

function pdfBytes(body = {}, maxBytes) {
  const raw = String(body.pdfBase64 || "").replace(/^data:application\/pdf;base64,/i, "").trim();
  if (!raw) return null;
  const bytes = Buffer.from(raw, "base64");
  if (!bytes.length || bytes.length > maxBytes) return null;
  return bytes;
}

/**
 * Parcours serveur. Le devis reçu est déjà celui relu en base.
 * requireStatusSync n’est vrai que pour le projet de recette.
 * Une transaction qui échoue laisse le registre inchangé.
 */
export async function runSaleRequest({
  profile,
  user,
  action,
  recorded,
  body = {},
  book,
  now = Date.now(),
  requireStatusSync = false,
  transaction,
  maxBytes = 4_000_000,
} = {}) {
  const decision = authorizeSaleAction(profile, action);
  if (!decision.ok) {
    return { status: 403, persist: false, body: { ok: false, error: decision.error, productionWrite: false } };
  }
  if (!recorded?.id) {
    return { status: 404, persist: false, body: { ok: false, error: "Devis introuvable.", productionWrite: false } };
  }
  if (recorded.kind && recorded.kind !== "Devis") {
    return { status: 400, persist: false, body: { ok: false, error: "Seuls les devis peuvent être signés.", productionWrite: false } };
  }

  const submitted = submittedAmount(body);
  const amount = decision.action === "annuler" ? { ok: true, amount: recorded.totalTtc } : assertRecordedAmount(recorded, submitted);
  if (!amount.ok) {
    return { status: 400, persist: false, body: { ok: false, error: amount.error, productionWrite: false } };
  }

  const devis = {
    id: recorded.id,
    organizationId: recorded.organizationId,
    totalTtc: amount.amount,
    commercialId: recorded.commercialId,
    sourceProspectId: recorded.sourceProspectId,
    status: recorded.status,
    label: recorded.label,
  };
  const bytes = pdfBytes(body, maxBytes);
  const proof = bytes ? {
    kind: body.proof?.kind || body.kind || "devis_signe",
    declaredSignatureDate: body.proof?.declaredSignatureDate || body.declaredSignatureDate,
    bytes,
    ...(submitted != null && submitted !== "" ? { amountTtc: submitted } : {}),
  } : null;

  const planned = executeSaleAction(book, {
    action: decision.action,
    actor: { id: user?.id, role: profile?.role, name: profile?.full_name || profile?.email || "" },
    devis,
    proof,
    reason: body.reason,
    replacesDevisId: body.replacesDevisId,
    now,
  });
  if (!planned.ok) {
    return { status: 400, persist: false, body: { ...planned, productionWrite: false } };
  }

  const mustSync = requireStatusSync && !planned.identical && ["demande", "confirmer", "annuler", "remplacer"].includes(decision.action);
  if (mustSync) {
    if (typeof transaction !== "function") {
      return {
        status: 503,
        persist: false,
        body: {
          ok: false,
          error: "Confirmation interrompue : la synchronisation n’a pas abouti.",
          productionWrite: false,
          confirmed: false,
        },
      };
    }
    try {
      const synced = await transaction({ sale: planned.sale, sync: planned.sync, recorded: devis });
      if (synced?.clientCalled || synced?.appointmentCalled) {
        return {
          status: 503,
          persist: false,
          body: {
            ok: false,
            error: "La fiche client et le rendez-vous ne changent pas.",
            productionWrite: false,
            confirmed: false,
          },
        };
      }
      if (!synced?.ok) {
        return {
          status: 503,
          persist: false,
          body: {
            ok: false,
            error: synced?.error || "Confirmation interrompue : la synchronisation n’a pas abouti.",
            productionWrite: false,
            confirmed: false,
          },
        };
      }
    } catch (error) {
      const message = String(error?.message || "").trim();
      const safe = message && message.length <= 240 && !/eyJ|password|service_role|apikey|Bearer/i.test(message)
        ? message
        : "Confirmation interrompue : la synchronisation n’a pas abouti.";
      return {
        status: 503,
        persist: false,
        body: {
          ok: false,
          error: safe,
          productionWrite: false,
          confirmed: false,
        },
      };
    }
  }

  return {
    status: 200,
    persist: true,
    book: planned.book,
    sale: planned.sale,
    pdf: bytes && planned.sale?.proofDigest && planned.sale.status !== "annulee" ? { digest: planned.sale.proofDigest, bytes } : null,
    body: {
      ok: true,
      productionWrite: false,
      identical: Boolean(planned.identical),
      sale: planned.sale,
      sync: planned.sync || null,
      verdict: saleVerdict({ devisStatus: recorded.status, sale: planned.sale }),
      journal: (planned.book.journal || []).filter(entry => entry.devisId === String(recorded.id)),
      totals: commercialSaleTotals(planned.book.sales),
    },
  };
}

export function saleView({ profile, book, devisId, recorded }) {
  const sale = saleForDevis(book, devisId);
  return {
    ok: true,
    productionWrite: false,
    sale,
    verdict: saleVerdict({ devisStatus: recorded?.status || "", sale }),
    journal: (book?.journal || []).filter(entry => entry.devisId === String(devisId)),
    totals: commercialSaleTotals(book?.sales || []),
    canRequest: canRequestCommercialSignature(profile),
    canConfirm: canConfirmCommercialSale(profile),
  };
}

export function proofAccess({ profile, userId, sale }) {
  if (!sale?.proofDigest) return { status: 404, error: "Aucun justificatif." };
  if (!canReadSaleProof(profile, userId, sale)) {
    return { status: 403, error: "Vous ne pouvez pas consulter ce justificatif." };
  }
  return { status: 200 };
}
