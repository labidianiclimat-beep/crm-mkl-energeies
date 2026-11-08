"use client";

import { useMemo, useState } from "react";
import {
  MICRO_INVERTER_FIELD_GROUPS,
  MICRO_INVERTER_HEADING,
  emptyMicroInverterSpecs,
  formatMicroInverterDescription,
  isMicroInverterSpecText,
  microInverterField,
  parseMicroInverterDescription,
} from "../lib/micro-inverter-specs";

const WIDE_KEYS = new Set([
  "operatingVoltage",
  "maxIsc",
  "maxUnitsPerCircuit",
  "maxUnitsPerCable",
  "powerFactorRange",
  "topology",
  "ambientTemp",
  "humidity",
  "dvcClass",
  "dcConnectorPairs",
  "acConnector",
  "dcConnector",
  "dimensions",
  "cooling",
  "enclosure",
  "gridCompliance",
  "safety",
  "communication",
  "warranty",
]);

export default function MicroInverterSpecFields({
  brandName = "",
  title = "",
  initialDescription = "",
}) {
  const parsed = useMemo(() => parseMicroInverterDescription(initialDescription), [initialDescription]);
  const [specs, setSpecs] = useState(() => {
    if (parsed.matched) return { ...emptyMicroInverterSpecs(), ...parsed };
    return emptyMicroInverterSpecs();
  });
  const [touched, setTouched] = useState(isMicroInverterSpecText(initialDescription) || !String(initialDescription || "").trim());

  function update(key, value) {
    setTouched(true);
    setSpecs(current => ({ ...current, [key]: value }));
  }

  const description = touched
    ? formatMicroInverterDescription(specs, { brand: brandName, title })
    : String(initialDescription || "");

  return (
    <div className="heat-pump-specs micro-inverter-specs">
      <div className="heat-pump-specs-head">
        <b>{MICRO_INVERTER_HEADING}</b>
        <span>Fiche DSH-00751 (IQ9N). Saisissez les valeurs constructeur : elles remplacent la description commerciale sur le devis.</span>
      </div>
      <label>
        Marque
        <input value={brandName} readOnly />
      </label>
      {MICRO_INVERTER_FIELD_GROUPS.map(group => (
        <section key={group.title} className="heat-pump-spec-group">
          <h4>{group.title}</h4>
          <div className="heat-pump-spec-grid">
            {group.keys.map(key => {
              const field = microInverterField(key);
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
