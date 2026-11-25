"use client";

import { useMemo, useState } from "react";
import {
  CLIM_INDOOR_FIELD_GROUPS,
  climIndoorField,
  climIndoorHeading,
  emptyClimIndoorSpecs,
  formatClimIndoorDescription,
  isClimIndoorSpecText,
  parseClimIndoorDescription,
} from "../lib/clim-indoor-specs";

const WIDE_KEYS = new Set([
  "soundPressure",
  "airflow",
  "dimensions",
  "liquidGasDiameter",
  "pipeDiameters",
  "connectivity",
]);

export default function ClimIndoorSpecFields({
  brandName = "",
  title = "",
  subcategory = "",
  initialDescription = "",
}) {
  const parsed = useMemo(() => parseClimIndoorDescription(initialDescription), [initialDescription]);
  const [specs, setSpecs] = useState(() => {
    if (parsed.matched) return { ...emptyClimIndoorSpecs(), ...parsed };
    return emptyClimIndoorSpecs();
  });
  const [touched, setTouched] = useState(isClimIndoorSpecText(initialDescription) || !String(initialDescription || "").trim());
  const heading = climIndoorHeading(subcategory);

  function update(key, value) {
    setTouched(true);
    setSpecs(current => ({ ...current, [key]: value }));
  }

  const description = touched
    ? formatClimIndoorDescription(specs, { brand: brandName, title, subcategory })
    : String(initialDescription || "");

  return (
    <div className="heat-pump-specs clim-indoor-specs">
      <div className="heat-pump-specs-head">
        <b>{heading}</b>
        <span>Remplissez les valeurs constructeur. Elles remplacent la description commerciale sur le devis.</span>
      </div>
      <label>
        Marque
        <input value={brandName} readOnly />
      </label>
      {CLIM_INDOOR_FIELD_GROUPS.map(group => (
        <section key={group.title} className="heat-pump-spec-group">
          <h4>{group.title}</h4>
          <div className="heat-pump-spec-grid">
            {group.keys.map(key => {
              const field = climIndoorField(key);
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
