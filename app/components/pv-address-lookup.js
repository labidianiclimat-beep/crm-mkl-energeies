"use client";

import { useEffect, useState } from "react";
import { MapPin, LoaderCircle } from "lucide-react";
import { searchFrenchAddresses } from "../lib/pv-geo";
import { authFetch } from "../lib/supabase-rest";

/**
 * Autocomplete adresse France (BAN) + productible PVGIS via /api/pv/yield.
 */
export default function PvAddressLookup({
  onResolved,
  defaultLabel = "",
}) {
  const [query, setQuery] = useState(defaultLabel);
  const [suggestions, setSuggestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (query.trim().length < 3 || (selected && selected.label === query)) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setBusy(true);
        const rows = await searchFrenchAddresses(query, { limit: 6 });
        setSuggestions(rows);
      } catch {
        setSuggestions([]);
      } finally {
        setBusy(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [query, selected]);

  async function pick(item) {
    setSelected(item);
    setQuery(item.label);
    setSuggestions([]);
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
      {suggestions.length > 0 && (
        <ul className="pv-address-suggestions">
          {suggestions.map(item => (
            <li key={`${item.label}-${item.score}`}>
              <button type="button" onClick={() => pick(item)}>
                <b>{item.label}</b>
                <small>
                  {item.postcode} {item.city}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {status && <p className="pv-address-status">{status}</p>}
      <input type="hidden" name="address" value={selected?.name || selected?.label || ""} />
      <input type="hidden" name="postcode" value={selected?.postcode || ""} />
      <input type="hidden" name="lat" value={selected?.lat || ""} />
      <input type="hidden" name="lon" value={selected?.lon || ""} />
      <input type="hidden" name="siteLabel" value={selected?.label || query} />
    </div>
  );
}
