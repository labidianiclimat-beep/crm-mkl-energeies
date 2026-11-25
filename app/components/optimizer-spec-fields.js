"use client";

import { useMemo, useState } from "react";
import {
  OPTIMIZER_FIELD_GROUPS,
  OPTIMIZER_HEADING,
  emptyOptimizerSpecs,
  formatOptimizerDescription,
  isOptimizerSpecText,
  optimizer600wSpecs,
  optimizerField,
  parseOptimizerDescription,
} from "../lib/optimizer-specs";

const WIDE_KEYS = new Set([
  "model",
  "mpptVoltageRange",
  "shutdownImpedance",
  "safety",
  "dimensions",
  "installationPart",
  "operatingClimate",
  "compatibleProducts",
]);

export default function OptimizerSpecFields({
  brandName = "",
  title = "",
  initialDescription = "",
}) {
  const parsed = useMemo(() => parseOptimizerDescription(initialDescription), [initialDescription]);
  const [specs, setSpecs] = useState(() => {
    if (parsed.matched) return { ...emptyOptimizerSpecs(), ...parsed };
    if (!String(initialDescription || "").trim()) return optimizer600wSpecs();
    return emptyOptimizerSpecs();
  });
  const [touched, setTouched] = useState(isOptimizerSpecText(initialDescription) || !String(initialDescription || "").trim());

  function update(key, value) {
    setTouched(true);
    setSpecs(current => ({ ...current, [key]: value }));
  }

  const description = touched
    ? formatOptimizerDescription(specs, { brand: brandName, title })
    : String(initialDescription || "");

  return (
    <div className="heat-pump-specs optimizer-specs">
      <div className="heat-pump-specs-head">
        <b>{OPTIMIZER_HEADING}</b>
        <span>Fiche SUN2000-600W-P. Les cases reprennent la colonne soulignée en vert.</span>
      </div>
      <label>
        Marque
        <input value={brandName} readOnly />
      </label>
      {OPTIMIZER_FIELD_GROUPS.map(group => (
        <section key={group.title} className="heat-pump-spec-group">
          <h4>{group.title}</h4>
          <div className="heat-pump-spec-grid">
            {group.keys.map(key => {
              const field = optimizerField(key);
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
