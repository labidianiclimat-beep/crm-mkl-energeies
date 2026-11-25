"use client";

import { useEffect, useState } from "react";
import { searchFrenchAddresses } from "../lib/pv-geo";

export function useBanSuggestions(query, { paused = false, limit = 6 } = {}) {
  const [suggestions, setSuggestions] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (paused || String(query || "").trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setBusy(true);
        setSuggestions(await searchFrenchAddresses(query, { limit }));
      } catch {
        setSuggestions([]);
      } finally {
        setBusy(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [query, paused, limit]);

  return {
    suggestions,
    busy,
    clearSuggestions: () => setSuggestions([]),
  };
}

export function BanSuggestionList({ suggestions, onPick }) {
  if (!suggestions?.length) return null;
  return (
    <ul className="pv-address-suggestions">
      {suggestions.map(item => (
        <li key={`${item.label}-${item.score}-${item.postcode}`}>
          <button type="button" onClick={() => onPick(item)}>
            <b>{item.label}</b>
            <small>{item.postcode} {item.city}</small>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function applyBanAddress(item) {
  return {
    address: item?.name || item?.label || "",
    postalCode: item?.postcode || "",
    city: item?.city || "",
  };
}
