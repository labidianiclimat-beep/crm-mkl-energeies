"use client";

import { CIVILITIES, normalizeCivility } from "../lib/clients";

export function CivilitySelect({ value = "", readOnly = false }) {
  const current = normalizeCivility(value);
  const options = !current || CIVILITIES.includes(current) ? CIVILITIES : [current, ...CIVILITIES];
  return (
    <label>Civilité
      <select name="civilite" defaultValue={current} disabled={readOnly}>
        <option value="">Choisir</option>
        {options.map(item => <option key={item}>{item}</option>)}
      </select>
    </label>
  );
}
