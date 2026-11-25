"use client";

import { useEffect, useState } from "react";
import { authFetch } from "../lib/supabase-rest";

function euro(value) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

export default function CommercialSalePanel({ document, profile }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [replacesDevisId, setReplacesDevisId] = useState("");
  const [busy, setBusy] = useState(false);

  const id = document?.id;
  const persisted = Boolean(id && String(id).includes("-"));

  async function load() {
    if (!persisted) return;
    const response = await authFetch(`/api/devis/${id}/signature`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Lecture impossible");
    setState(data);
  }

  useEffect(() => {
    let alive = true;
    load().catch(caught => { if (alive) setError(String(caught.message || caught)); });
    return () => { alive = false; };
  }, [id, document?.status]);

  async function send(action, extra = {}) {
    setBusy(true);
    setError("");
    try {
      const response = await authFetch(`/api/devis/${id}/signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "La validation n’a pas pu être envoyée.");
      setState(current => ({ ...current, ...data, canRequest: current?.canRequest, canConfirm: current?.canConfirm }));
      setReason("");
    } catch (caught) {
      setError(String(caught.message || caught));
    } finally {
      setBusy(false);
    }
  }

  async function deposit() {
    if (!date) {
      setError("Indiquez la date de signature.");
      return;
    }
    await send("demande", {
      declaredSignatureDate: date,
      kind: "devis_signe",
      useStoredDevis: true,
    });
  }

  async function openProof() {
    const response = await authFetch(`/api/devis/${id}/signature?fichier=1`);
    if (!response.ok) {
      setError("Justificatif inaccessible.");
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    window.open(url, "_blank", "noopener");
  }

  if (!persisted || !profile) return null;
  const sale = state?.sale;
  const verdict = state?.verdict || "";
  const tone = verdict === "Signée vérifiée" ? "is-verified" : verdict === "Acceptation historique non vérifiée" ? "is-historical" : "";

  return <section className="commercial-sale-panel">
    <h3>Signature du client</h3>
    {verdict && <strong className={`sale-state ${tone}`}>{verdict}</strong>}
    {sale?.status === "confirmee" && <ul>
      <li>Date de signature : {sale.declaredSignatureDate}</li>
      <li>Validateur : {sale.confirmedByName || sale.confirmedBy}</li>
      <li>Montant contractuel TTC : {euro(sale.amountTtc)}</li>
    </ul>}
    {sale?.status === "demande" && <p>Justificatif déposé le {sale.declaredSignatureDate}. {sale.requestedByName ? `Par ${sale.requestedByName}.` : ""}</p>}
    {sale?.proofDigest && <p><button type="button" onClick={openProof}>Voir le justificatif</button></p>}
    {error && <p className="sale-error">{error}</p>}
    {state?.canRequest && sale?.status !== "confirmee" && sale?.status !== "demande" && <div className="sale-actions">
      <label>Date de signature<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <button type="button" className="primary" disabled={busy} onClick={deposit}>Soumettre à la validation</button>
    </div>}
    {state?.canConfirm && sale?.status === "demande" && <div className="sale-actions">
      <button type="button" className="primary" disabled={busy} onClick={() => send("confirmer")}>Confirmer la vente</button>
      <label>Devis remplacé<input value={replacesDevisId} onChange={event => setReplacesDevisId(event.target.value)} placeholder="Identifiant du devis d’origine" /></label>
      <button type="button" disabled={busy || !replacesDevisId.trim()} onClick={() => send("remplacer", { replacesDevisId: replacesDevisId.trim() })}>Confirmer en avenant</button>
    </div>}
    {state?.canConfirm && sale?.status === "confirmee" && <div className="sale-actions">
      <label>Motif d’annulation<input value={reason} onChange={event => setReason(event.target.value)} placeholder="Motif obligatoire" /></label>
      <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => send("annuler", { reason })}>Annuler la confirmation</button>
    </div>}
    {sale?.status === "confirmee" && <p>Effet de la confirmation : devis Accepté, opportunité liée Gagné. Le rendez-vous et la fiche client ne changent pas.</p>}
    {state?.totals && <p>CA signé vérifié : {euro(state.totals.net)} net, {euro(state.totals.brut)} brut.</p>}
    {state?.journal?.length > 0 && <div>
      <b>Historique</b>
      <ul>{state.journal.map((entry, index) => <li key={`${entry.at}-${index}`}>{entry.action} — {entry.actorName || entry.actorId} — {entry.at ? new Date(entry.at).toLocaleString("fr-FR") : ""}{entry.reason ? ` — ${entry.reason}` : ""}</li>)}</ul>
    </div>}
  </section>;
}
