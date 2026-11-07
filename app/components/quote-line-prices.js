"use client";

import { isForfaitQuoteLine } from "../lib/devis";

const euro = value =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0));

function forfaitTtc(item, priced, tax) {
  const fromTotals = Number(priced?.totalTTC);
  if (Number.isFinite(fromTotals) && fromTotals > 0) return fromTotals;
  const ht = Number(item?.forfaitHt);
  const rate = Number(item?.tax ?? tax ?? 0);
  if (!Number.isFinite(ht)) return 0;
  return ht * (1 + (Number.isFinite(rate) ? rate : 0) / 100);
}

function taxSelect(item, tax, canPrice, onChange) {
  return (
    <select aria-label={isForfaitQuoteLine(item) ? "TVA du forfait" : "Taux de TVA"} value={item.tax ?? tax} disabled={!canPrice} onChange={event => onChange("tax", Number(event.target.value))}>
      <option value="0">0 %</option>
      <option value="5.5">5,5 %</option>
      <option value="10">10 %</option>
      <option value="20">20 %</option>
    </select>
  );
}

export default function QuoteLinePrices({
  item,
  tax = 20,
  priced,
  canPrice = true,
  discountType = false,
  onChange,
}) {
  const forfait = isForfaitQuoteLine(item);
  const carrier = forfait && item.forfaitHt != null && item.forfaitHt !== "";
  const quiet = (
    <>
      <span className="quote-forfait-blank" />
      {discountType && <span className="quote-forfait-blank" />}
      <span className="quote-forfait-blank" />
      <span className="quote-forfait-blank" />
    </>
  );
  if (forfait && !carrier) {
    return (
      <>
        <span className="quote-forfait-blank" aria-label="Prix inclus dans le forfait" />
        {quiet}
      </>
    );
  }
  if (carrier) {
    return (
      <>
        <span className="quote-col-ht">
          <input aria-label="Montant du forfait HT" type="number" min="0" step="0.01" value={item.forfaitHt} disabled={!canPrice} onChange={event => onChange("forfaitHt", event.target.value)} />
          <small>{euro(item.forfaitHt)} HT</small>
        </span>
        {taxSelect(item, tax, canPrice, onChange)}
        {discountType && <span className="quote-forfait-blank" />}
        <span className="quote-forfait-blank" />
        <b className="quote-col-ttc">{euro(forfaitTtc(item, priced, tax))}<small>TTC</small></b>
      </>
    );
  }
  return (
    <>
      <input aria-label="Prix unitaire HT" type="number" min="0" step="0.01" value={item.unit} disabled={!canPrice} onChange={event => onChange("unit", event.target.value)} />
      {taxSelect(item, tax, canPrice, onChange)}
      {discountType && (
        <select aria-label="Type de remise" value={item.discountType || "percent"} disabled={!canPrice} onChange={event => onChange("discountType", event.target.value)}>
          <option value="percent">%</option>
          <option value="amount">€ TTC</option>
        </select>
      )}
      <input aria-label="Valeur de remise" type="number" min="0" step="0.01" value={item.discountValue || 0} disabled={!canPrice} onChange={event => onChange("discountValue", event.target.value)} />
      <b>{euro(priced?.totalTTC || 0)}</b>
    </>
  );
}
