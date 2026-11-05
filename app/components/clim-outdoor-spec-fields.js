"use client";

import { useMemo, useState } from "react";
import {
  CLIM_OUTDOOR_FIELD_GROUPS,
  climOutdoorField,
  formatClimOutdoorDescription,
  isClimOutdoorSpecText,
  parseClimOutdoorDescription,
  emptyClimOutdoorSpecs,
} from "../lib/clim-outdoor-specs";

const WIDE_KEYS = new Set([
  "coolingRange",
  "heatingRange",
  "absorbedPower",
  "eerCop",
  "soundPower",
  "soundPressure",
  "airflow",
  "dimensions",
  "pipeDiameter",
  "indoorCapacity",
  "coolingOperatingRange",
  "heatingOperatingRange",
  "powerSupply",
]);

export default function ClimOutdoorSpecFields({
  brandName = "",
  title = "",
  initialDescription = "",
}) {
  const parsed = useMemo(() => parseClimOutdoorDescription(initialDescription), [initialDescription]);
  const [specs, setSpecs] = useState(() => {
    if (parsed.matched) return { ...emptyClimOutdoorSpecs(), ...parsed };
    return emptyClimOutdoorSpecs();
  });
  const [touched, setTouched] = useState(isClimOutdoorSpecText(initialDescription) || !String(initialDescription || "").trim());

  function update(key, value) {
    setTouched(true);
    setSpecs(current => ({ ...current, [key]: value }));
  }

  const description = touched
    ? formatClimOutdoorDescription(specs, { brand: brandName, title })
    : String(initialDescription || "");

  return (
    <div className="heat-pump-specs clim-outdoor-specs">
      <div className="heat-pump-specs-head">
        <b>GROUPE EXTÉRIEUR</b>
        <span>Remplissez les valeurs constructeur. Elles remplacent la description commerciale sur le devis.</span>
      </div>
      <label>
        Marque
        <input value={brandName} readOnly />
      </label>
      {CLIM_OUTDOOR_FIELD_GROUPS.map(group => (
        <section key={group.title} className="heat-pump-spec-group">
          <h4>{group.title}</h4>
          <div className="heat-pump-spec-grid">
            {group.keys.map(key => {
              const field = climOutdoorField(key);
              if (!field) return null;
              return (
                <label key={key} className={WIDE_KEYS.has(key) ? "wide" : undefined}>
                  {field.label}
                  <input
                    value={specs[key] || ""}
                    onChange={event => update(key, event.target.value)}
                    placeholder={field.placeholder}
                  />
                </label>
              );
            })}
          </div>
        </section>
      ))}
      <input type="hidden" name="description" value={description} />
      {description ? (
        <pre className="heat-pump-preview" aria-label="Aperçu description devis">{description}</pre>
      ) : null}
    </div>
  );
}
