"use client";

import { HOUSING_TYPES, OCCUPANCY_TYPES } from "../lib/housing";

export default function HousingFields({
  housingType = "",
  constructionYear = "",
  occupancy = "",
  onChange,
  readOnly = false,
  hint = "Ces informations préremplissent le devis et l’attestation TVA 5,5 %.",
}) {
  const controlled = typeof onChange === "function";
  const patch = key => event => onChange?.({ [key]: event.target.value });
  return (
    <>
      <div className="form-row housing-fields">
        <label>Type de logement
          <select
            name="housingType"
            disabled={readOnly}
            {...(controlled
              ? { value: housingType, onChange: patch("housingType") }
              : { defaultValue: housingType })}
          >
            <option value="">Choisir…</option>
            {HOUSING_TYPES.map(type => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label>Année de construction
          <input
            name="constructionYear"
            inputMode="numeric"
            placeholder="1998"
            readOnly={readOnly}
            {...(controlled
              ? { value: constructionYear, onChange: patch("constructionYear") }
              : { defaultValue: constructionYear })}
          />
        </label>
        <label>Occupant
          <select
            name="occupancy"
            disabled={readOnly}
            {...(controlled
              ? { value: occupancy, onChange: patch("occupancy") }
              : { defaultValue: occupancy })}
          >
            <option value="">Choisir…</option>
            {OCCUPANCY_TYPES.map(type => <option key={type}>{type}</option>)}
          </select>
        </label>
      </div>
      {hint ? <p className="directory-search-help">{hint}</p> : null}
    </>
  );
}
