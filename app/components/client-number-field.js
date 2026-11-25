"use client";

import { useEffect, useState } from "react";
import { CLIENT_NUMBER_PREFIX, findClientByNumber, formatClientNumber } from "../lib/client-number";
import { EXISTING_CLIENT_MESSAGE } from "../lib/existing-client";

export default function ClientNumberField({
  clients = [],
  clientId = "",
  onSelect,
  variant = "default",
  prefix = CLIENT_NUMBER_PREFIX,
  label = "Numéro client",
  numberKey = "clientNumber",
  missMessage = EXISTING_CLIENT_MESSAGE,
  formatNumber = formatClientNumber,
  findNumber = findClientByNumber,
}) {
  const selected = (clients || []).find(item => String(item.id) === String(clientId)) || null;
  const selectedNumber = selected?.[numberKey];
  const [digits, setDigits] = useState(selectedNumber ? String(selectedNumber) : "");
  const [checked, setChecked] = useState(false);
  const match = findNumber(clients, digits);

  useEffect(() => {
    setDigits(selectedNumber ? String(selectedNumber) : "");
    setChecked(false);
  }, [selected?.id, selectedNumber]);

  function commit(next = digits) {
    setChecked(true);
    const found = findNumber(clients, next);
    if (found) onSelect?.(found);
  }

  const hero = variant === "hero";

  return (
    <div className={`client-number-field${hero ? " is-hero" : ""}`}>
      <label>
        <span>{label}</span>
        <div className="client-number-input">
          <b>{prefix}</b>
          <input
            inputMode="numeric"
            autoComplete="off"
            placeholder="00042"
            aria-label={label}
            value={digits}
            onChange={event => {
              setChecked(false);
              setDigits(event.target.value.replace(/\D/g, "").slice(0, 6));
            }}
            onBlur={() => { if (digits) commit(); }}
            onKeyDown={event => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              commit();
            }}
          />
        </div>
      </label>
      {match && (
        <p className="client-number-match">
          {hero ? <span>{match.name}</span> : (
            <>
              <b>{formatNumber(match[numberKey])}</b>
              <span>{match.name}{[match.address, match.postalCode, match.city].filter(Boolean).length ? ` — ${[match.address, match.postalCode, match.city].filter(Boolean).join(" ")}` : ""}</span>
            </>
          )}
        </p>
      )}
      {checked && digits && !match && <p className="client-number-miss">{missMessage}</p>}
    </div>
  );
}
