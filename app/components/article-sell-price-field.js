"use client";

import { useState } from "react";
import { priceHtFromTtc, priceTtc, roundPrice, sellHtFromInput } from "../lib/article-picker";

function formatPriceInput(value) {
  if (value === "" || value == null || Number.isNaN(Number(value))) return "";
  return String(roundPrice(value));
}

export default function ArticleSellPriceField({
  defaultSell = "",
  tax = 20,
  name = "sell",
}) {
  const [mode, setMode] = useState("ht");
  const [amount, setAmount] = useState(
    defaultSell === "" || defaultSell == null ? "" : formatPriceInput(defaultSell)
  );
  const numeric = Number(amount || 0);
  const sellHt = sellHtFromInput(amount, tax, mode);
  const sellTtc = roundPrice(mode === "ht" ? priceTtc(numeric, tax) : numeric);

  function switchMode(next) {
    if (next === mode) return;
    if (amount !== "") {
      setAmount(formatPriceInput(next === "ttc" ? priceTtc(numeric, tax) : priceHtFromTtc(numeric, tax)));
    }
    setMode(next);
  }

  return (
    <label className="article-sell-price">
      <span className="article-sell-price-head">
        <span>Prix de vente {mode === "ttc" ? "TTC" : "HT"} (€)</span>
        <span className="article-sell-mode" role="group" aria-label="Saisir le prix en HT ou TTC">
          <button type="button" className={mode === "ht" ? "is-on" : ""} onClick={() => switchMode("ht")}>HT</button>
          <button type="button" className={mode === "ttc" ? "is-on" : ""} onClick={() => switchMode("ttc")}>TTC</button>
        </span>
      </span>
      <input
        type="number"
        min="0"
        step="0.01"
        required
        value={amount}
        onChange={event => setAmount(event.target.value)}
        aria-label={`Prix de vente ${mode === "ttc" ? "TTC" : "HT"}`}
      />
      <input type="hidden" name={name} value={amount === "" ? "" : sellHt} />
      {amount !== "" ? (
        <small>
          {mode === "ttc"
            ? `Soit ${formatEuro(sellHt)} HT`
            : `Soit ${formatEuro(sellTtc)} TTC`}
        </small>
      ) : null}
    </label>
  );
}

function formatEuro(value) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}
