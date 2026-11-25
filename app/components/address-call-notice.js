"use client";

import { useState } from "react";
import { addressGapSentence, completeAddressErrors, missingAddressParts } from "../lib/address";
import { authFetch } from "../lib/supabase-rest";

export function dialPhone(phone) {
  window.location.href = `tel:${String(phone || "").replace(/\s/g, "")}`;
}

export function personAddressGaps(person) {
  if (!person) return [];
  return missingAddressParts({
    address: person.address || person.clientStreet,
    postalCode: person.postalCode ?? person.postal ?? person.clientPostal,
    city: person.city || person.clientCity,
  });
}

export default function AddressCallNotice({
  parts = [],
  person = null,
  clientId = "",
  phone = "",
  onComplete,
  onCall,
  onSaved,
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({
    address: person?.address || person?.clientStreet || "",
    postal: person?.postalCode || person?.postal || person?.clientPostal || "",
    city: person?.city || person?.clientCity || "",
  });
  if (!parts.length) return null;

  async function save(event) {
    event.preventDefault();
    const errors = completeAddressErrors({ address: draft.address, postalCode: draft.postal, city: draft.city });
    if (errors.length) {
      setError(errors[0]);
      return;
    }
    if (!clientId) {
      onSaved?.({ address: draft.address, postalCode: draft.postal, city: draft.city });
      setEditing(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = { address: draft.address, postalCode: draft.postal, city: draft.city };
      const response = await authFetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && (response.status === 403 || response.status === 409)) {
        const tour = await authFetch("/api/entretien/tour", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "address", clientId, address: draft.address, postal: draft.postal, city: draft.city }),
        });
        const tourData = await tour.json().catch(() => ({}));
        if (!tour.ok) throw new Error(tourData.error || data.error || "Enregistrement impossible");
      } else if (!response.ok) {
        throw new Error(data.error || "Enregistrement impossible");
      }
      onSaved?.({ address: draft.address, postalCode: draft.postal, city: draft.city });
      setEditing(false);
    } catch (err) {
      setError(err.message || "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  function startComplete() {
    if (onComplete && !clientId) {
      onComplete();
      return;
    }
    setEditing(true);
  }

  return (
    <div className="address-call-notice" id="address-call-notice" role="status">
      <b>Adresse incomplète</b>
      <p>{addressGapSentence(parts)}</p>
      {editing && (
        <form onSubmit={save}>
          <label>Voie<input value={draft.address} onChange={event => setDraft(current => ({ ...current, address: event.target.value }))} required /></label>
          <label>Code postal<input inputMode="numeric" maxLength={5} value={draft.postal} onChange={event => setDraft(current => ({ ...current, postal: event.target.value.replace(/\D/g, "").slice(0, 5) }))} required /></label>
          <label>Commune<input value={draft.city} onChange={event => setDraft(current => ({ ...current, city: event.target.value }))} required /></label>
          {error && <p className="client-number-miss">{error}</p>}
          <button type="submit" className="primary" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer l’adresse"}</button>
        </form>
      )}
      <div>
        {!editing && (onComplete || clientId || onSaved) && (
          <button type="button" className="primary" onClick={startComplete}>Compléter l’adresse</button>
        )}
        {phone && (
          <button type="button" className="secondary" onClick={() => (onCall ? onCall() : dialPhone(phone))}>Appeler quand même</button>
        )}
      </div>
    </div>
  );
}

export function ClientPhoneLink({ person, phone, className, children, onComplete }) {
  const parts = personAddressGaps(person);
  const [open, setOpen] = useState(false);
  const label = children || phone;
  if (!phone) return null;
  if (!parts.length) {
    return <a className={className} href={`tel:${String(phone).replace(/\s/g, "")}`}>{label}</a>;
  }
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <AddressCallNotice
          parts={parts}
          person={person}
          clientId={person?.id || ""}
          phone={phone}
          onComplete={onComplete}
          onCall={() => { setOpen(false); dialPhone(phone); }}
          onSaved={() => setOpen(false)}
        />
      )}
    </>
  );
}
