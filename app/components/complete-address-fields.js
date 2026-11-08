"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, MapPin } from "lucide-react";
import { applyBanAddress, BanSuggestionList, useBanSuggestions } from "./ban-address";

export default function CompleteAddressFields({
  address = "",
  addressComplement = "",
  postalCode = "",
  city = "",
  namePrefix = "",
  onChange,
  readOnly = false,
}) {
  const [street, setStreet] = useState(address);
  const [complement, setComplement] = useState(addressComplement);
  const [postal, setPostal] = useState(postalCode);
  const [town, setTown] = useState(city);
  const [pickedStreet, setPickedStreet] = useState(address || "");
  const { suggestions, busy, clearSuggestions } = useBanSuggestions(street, {
    paused: readOnly || Boolean(pickedStreet && street === pickedStreet),
  });

  useEffect(() => {
    setStreet(address || "");
    setComplement(addressComplement || "");
    setPostal(postalCode || "");
    setTown(city || "");
  }, [address, addressComplement, postalCode, city]);

  function emit(next) {
    onChange?.({
      address: next.address,
      addressComplement: next.addressComplement,
      postalCode: next.postalCode,
      city: next.city,
    });
  }

  function pick(item) {
    const next = applyBanAddress(item);
    setStreet(next.address);
    setPostal(next.postalCode);
    setTown(next.city);
    setPickedStreet(next.address);
    clearSuggestions();
    emit({
      address: next.address,
      addressComplement: complement,
      postalCode: next.postalCode,
      city: next.city,
    });
  }

  return (
    <div className="complete-address">
      <div className="form-section-title">ADRESSE COMPLÈTE (OBLIGATOIRE)</div>
      <p className="complete-address-help">
        Numéro et voie : la saisie propose les adresses BAN et pré-remplit le code postal et la ville.
      </p>
      <div className="complete-address-street">
        <label htmlFor={`${namePrefix}site-address`}>Numéro et voie</label>
        <div className="pv-address-input">
          <MapPin size={16} />
          <input
            id={`${namePrefix}site-address`}
            name={`${namePrefix}address`}
            required
            placeholder="12 rue de la Paix"
            value={street}
            onChange={event => {
              const next = event.target.value;
              setStreet(next);
              setPickedStreet("");
              emit({ address: next, addressComplement: complement, postalCode: postal, city: town });
            }}
            onKeyDown={event => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (suggestions[0]) pick(suggestions[0]);
            }}
            onFocus={event => {
              event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
            }}
            autoComplete="off"
            enterKeyHint="done"
            readOnly={readOnly}
          />
          {busy && <LoaderCircle size={16} className="spin" />}
        </div>
        {!readOnly && <BanSuggestionList suggestions={suggestions} onPick={pick} />}
      </div>
      <label>Complément d’adresse
        <input
          name={`${namePrefix}addressComplement`}
          placeholder="Bâtiment, étage, résidence…"
          value={complement}
          readOnly={readOnly}
          onChange={event => {
            setComplement(event.target.value);
            emit({ address: street, addressComplement: event.target.value, postalCode: postal, city: town });
          }}
        />
      </label>
      <div className="form-row">
        <label>Code postal
          <input
            name={`${namePrefix}postalCode`}
            required
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            placeholder="44000"
            value={postal}
            readOnly={readOnly}
            onChange={event => {
              const next = event.currentTarget.value.replace(/\D/g, "").slice(0, 5);
              setPostal(next);
              emit({ address: street, addressComplement: complement, postalCode: next, city: town });
            }}
          />
        </label>
        <label>Ville
          <input
            name={`${namePrefix}city`}
            required
            placeholder="Nantes"
            value={town}
            readOnly={readOnly}
            onChange={event => {
              setTown(event.target.value);
              emit({ address: street, addressComplement: complement, postalCode: postal, city: event.target.value });
            }}
            autoComplete="address-level2"
          />
        </label>
      </div>
    </div>
  );
}
