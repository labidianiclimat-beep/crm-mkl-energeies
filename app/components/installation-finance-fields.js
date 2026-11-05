"use client";

import { Trash2 } from "lucide-react";
import { INSTALLATION_OTHER_COMMERCIAL, INSTALLATION_OTHER_COMMERCIAL_LABEL, addPurchaseLine, formatEuroFromCents, parseEuroToCents, removePurchaseLine } from "../lib/installation-finance";

function indicativeTotal(purchases = []) {
  let total = 0;
  for (const line of purchases) {
    const parsed = parseEuroToCents(line.amount);
    if (!parsed.ok) return null;
    total += parsed.cents;
  }
  return total;
}

export default function InstallationFinanceFields({ salespeople = [], value, onChange, hint = "" }) {
  const total = indicativeTotal(value?.purchases || []);
  function patch(next) {
    onChange?.(next);
  }
  function patchLine(key, field, fieldValue) {
    patch({
      ...value,
      purchases: (value.purchases || []).map(line => line.key === key ? { ...line, [field]: fieldValue } : line),
    });
  }
  return <div className="installation-finance">
    <b>Montants du chantier</b>
    {hint ? <span>{hint}</span> : null}
    <label>Commercial
      <select value={value.commercialId || ""} onChange={event => patch({ ...value, commercialId: event.target.value })} required>
        <option value="">Choisir un commercial</option>
        {salespeople.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        <option value={INSTALLATION_OTHER_COMMERCIAL}>{INSTALLATION_OTHER_COMMERCIAL_LABEL}</option>
      </select>
    </label>
    <div className="form-row">
      <label>Montant de la vente TTC
        <input value={value.saleTtc || ""} onChange={event => patch({ ...value, saleTtc: event.target.value })} inputMode="decimal" autoComplete="off" placeholder="0,00" required/>
      </label>
      <label>Montant alloué à la pose
        <input value={value.poseAmount || ""} onChange={event => patch({ ...value, poseAmount: event.target.value })} inputMode="decimal" autoComplete="off" placeholder="0,00" required/>
      </label>
    </div>
    <div className="installation-purchases">
      <b>Achats</b>
      {(value.purchases || []).map((line, index) => <div className="installation-purchase" key={line.key}>
        <label>Libellé
          <input value={line.label || ""} onChange={event => patchLine(line.key, "label", event.target.value)} placeholder="Description de l’achat" required/>
        </label>
        <label>Montant
          <input value={line.amount || ""} onChange={event => patchLine(line.key, "amount", event.target.value)} inputMode="decimal" autoComplete="off" placeholder="0,00" required/>
        </label>
        {(value.purchases || []).length > 1 ? <button type="button" onClick={() => patch(removePurchaseLine(value, line.key))} aria-label={`Retirer l’achat ${index + 1}`}><Trash2 size={14}/>Retirer</button> : <span/>}
      </div>)}
      <button type="button" className="secondary" onClick={() => patch(addPurchaseLine(value))}>+ Ajouter un achat</button>
      <p>Total des achats <strong>{total == null ? "—" : formatEuroFromCents(total)}</strong></p>
      <small>Le total est recalculé à l’enregistrement. Les montants sont en euros.</small>
    </div>
  </div>;
}

export function InstallationFinanceSummary({ finance }) {
  if (!finance) return null;
  return <div className="installation-finance-view">
    <p>Commercial <b>{finance.commercialName || (finance.commercialId ? "Commercial" : INSTALLATION_OTHER_COMMERCIAL_LABEL)}</b></p>
    <p>Vente TTC <b>{formatEuroFromCents(finance.saleTtcCents)}</b></p>
    <p>Pose <b>{formatEuroFromCents(finance.poseCents)}</b></p>
    <ul>{(finance.purchases || []).map(line => <li key={line.id || line.label}>{line.label} <b>{formatEuroFromCents(line.amountCents)}</b></li>)}</ul>
    <p>Total des achats <b>{formatEuroFromCents(finance.purchaseTotalCents)}</b></p>
  </div>;
}
