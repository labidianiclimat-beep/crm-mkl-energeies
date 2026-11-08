"use client";

import { useMemo, useState } from "react";
import {
  INVERTER_FIELD_GROUPS,
  INVERTER_HEADING,
  emptyInverterSpecs,
  formatInverterDescription,
  inverterField,
  isInverterSpecText,
  parseInverterDescription,
} from "../lib/inverter-specs";

const WIDE_KEYS = new Set([
  "recommendedPvPower",
  "mpptVoltageRange",
  "maxInputCurrentPerMppt",
  "compatibleBattery",
  "batteryVoltageRange",
  "batteryMaxCurrent",
  "ratedOutputVoltage",
  "powerFactorRange",
  "backupOutput",
  "dcSurgeProtection",
  "acSurgeProtection",
  "operatingTemp",
  "humidity",
  "altitude",
  "display",
  "communication",
  "weight",
  "dimensions",
  "optimizerCompatibility",
  "safety",
  "gridStandards",
]);

export default function InverterSpecFields({
  title = "",
  initialDescription = "",
}) {
  const parsed = useMemo(() => parseInverterDescription(initialDescription), [initialDescription]);
  const [specs, setSpecs] = useState(() => {
    if (parsed.matched) return { ...emptyInverterSpecs(), ...parsed };
    return emptyInverterSpecs();
  });
  const [touched, setTouched] = useState(isInverterSpecText(initialDescription) || !String(initialDescription || "").trim());

  function update(key, value) {
    setTouched(true);
    setSpecs(current => ({ ...current, [key]: value }));
  }

  const description = touched
    ? formatInverterDescription(specs, { title })
    : String(initialDescription || "");

  return (
    <div className="heat-pump-specs inverter-specs">
      <div className="heat-pump-specs-head">
        <b>{INVERTER_HEADING}</b>
        <span>Fiche technique onduleur string (entrée PV, batterie, protections). Saisissez les valeurs constructeur : elles remplacent la description commerciale sur le devis.</span>
      </div>
      {INVERTER_FIELD_GROUPS.map(group => (
        <section key={group.title} className="heat-pump-spec-group">
          <h4>{group.title}</h4>
          <div className="heat-pump-spec-grid">
            {group.keys.map(key => {
              const field = inverterField(key);
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
