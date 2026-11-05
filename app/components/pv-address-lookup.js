"use client";

import { useState } from "react";
import { LoaderCircle, MapPin } from "lucide-react";
import { BanSuggestionList, useBanSuggestions } from "./ban-address";
import { authFetch } from "../lib/supabase-rest";

/**
 * Autocomplete adresse France (BAN) + productible PVGIS via /api/pv/yield.
 */
export default function PvAddressLookup({
  onResolved,
  defaultLabel = "",
}) {
  const [query, setQuery] = useState(defaultLabel);
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState(null);
  const { suggestions, busy, clearSuggestions } = useBanSuggestions(query, {
    paused: Boolean(selected && selected.label === query),
  });

  async function pick(item) {
    setSelected(item);
    setQuery(item.label);
    clearSuggestions();
    setStatus("Calcul du productible local…");
    try {
      const response = await authFetch(
        `/api/pv/yield?lat=${encodeURIComponent(item.lat)}&lon=${encodeURIComponent(item.lon)}`
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Productible indisponible");
      setStatus(
        data.source === "pvgis"
          ? `Productible PVGIS : ${data.yieldValue} kWh/kWc/an`
          : `Productible estimé : ${data.yieldValue} kWh/kWc/an`
      );
      onResolved?.({
        address: item.name || item.label,
        postcode: item.postcode,
        city: item.city,
        lat: item.lat,
        lon: item.lon,
        label: item.label,
        yieldValue: data.yieldValue,
        yieldSource: data.source,
      });
    } catch (error) {
      setStatus(String(error?.message || "Adresse enregistrée sans productible"));
      onResolved?.({
        address: item.name || item.label,
        postcode: item.postcode,
        city: item.city,
        lat: item.lat,
        lon: item.lon,
        label: item.label,
        yieldValue: null,
        yieldSource: null,
      });
    }
  }

  return (
    <div className="pv-address-lookup">
      <label>
        Adresse du site (géolocalisation)
        <div className="pv-address-input">
          <MapPin size={16} />
          <input
            value={query}
            onChange={event => {
              setSelected(null);
              setQuery(event.target.value);
              setStatus("");
            }}
            placeholder="Ex. 12 rue de la Paix, Nantes"
            autoComplete="off"
          />
          {busy && <LoaderCircle size={16} className="spin" />}
        </div>
      </label>
      <BanSuggestionList suggestions={suggestions} onPick={pick} />
      {status && <p className="pv-address-status">{status}</p>}
      <input type="hidden" name="address" value={selected?.name || selected?.label || ""} />
      <input type="hidden" name="postcode" value={selected?.postcode || ""} />
      <input type="hidden" name="lat" value={selected?.lat || ""} />
      <input type="hidden" name="lon" value={selected?.lon || ""} />
      <input type="hidden" name="siteLabel" value={selected?.label || query} />
    </div>
  );
}
