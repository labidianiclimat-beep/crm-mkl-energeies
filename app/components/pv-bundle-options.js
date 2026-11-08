"use client";

import { PV_BATTERY_OPTION, PV_CONNECTION_OPTIONS, PV_OPTIMIZER_OPTION, applyPvBundleOptions, selectedPvOptions } from "../lib/pv-quote-options";

const money = value =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0));

export default function PvBundleOptions({ items = [], index = 0, articles = [], onChange }) {
  const selected = selectedPvOptions(items, index);
  function choose(kind, value) {
    onChange?.(applyPvBundleOptions(items, index, { [kind]: value }, articles));
  }
  return (
    <div className="pv-bundle-options">
      <label>Raccordement
        <select aria-label="Raccordement" value={selected.connection} onChange={event => choose("connection", event.target.value)}>
          <option value="">Choisir</option>
          {PV_CONNECTION_OPTIONS.map(option => (
            <option key={option.id} value={option.id}>{option.name} — {money(option.ttc)} TTC</option>
          ))}
        </select>
      </label>
      <label>Optimiseur
        <select aria-label="Optimiseur" value={selected.optimizer} onChange={event => choose("optimizer", event.target.value)}>
          <option value="">Choisir</option>
          <option value={PV_OPTIMIZER_OPTION.id}>{PV_OPTIMIZER_OPTION.name} — {money(PV_OPTIMIZER_OPTION.ttc)} TTC</option>
        </select>
      </label>
      <label>Batterie
        <select aria-label="Batterie Marstek" value={selected.battery} onChange={event => choose("battery", event.target.value)}>
          <option value="">Choisir</option>
          <option value={PV_BATTERY_OPTION.id}>{PV_BATTERY_OPTION.name} — {money(PV_BATTERY_OPTION.ttc)} TTC</option>
        </select>
      </label>
    </div>
  );
}
