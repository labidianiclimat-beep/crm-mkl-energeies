"use client";

import { useMemo, useState } from "react";
import {
  BATTERY_FIELD_GROUPS,
  BATTERY_HEADING,
  batteryField,
  emptyBatterySpecs,
  formatBatteryDescription,
  isBatterySpecText,
  parseBatteryDescription,
} from "../lib/battery-specs";

const WIDE_KEYS = new Set([
  "operatingModes",
  "cellTechnology",
  "scalability",
  "powerFactor",
  "nominalVoltageMono",
  "voltageRangeMono",
  "nominalVoltageTri",
  "voltageRangeTri",
  "backupPeakPower",
  "backupConnection",
  "gridAcConnection",
  "surgeCategory",
  "dimensions",
  "powerModuleDimensions",
  "batteryModuleDimensions",
  "installation",
  "operatingTemp",
  "storageTemp",
  "altitude",
  "display",
  "communication",
  "compatibleMeter",
  "compatibleInverters",
  "gridStandards",
  "emc",
  "certifications",
]);

export default function BatterySpecFields({
  title = "",
  initialDescription = "",
}) {
  const parsed = useMemo(() => parseBatteryDescription(initialDescription), [initialDescription]);
  const [specs, setSpecs] = useState(() => {
    if (parsed.matched) return { ...emptyBatterySpecs(), ...parsed };
    return emptyBatterySpecs();
  });
  const [touched, setTouched] = useState(isBatterySpecText(initialDescription) || !String(initialDescription || "").trim());

  function update(key, value) {
    setTouched(true);
    setSpecs(current => ({ ...current, [key]: value }));
  }

  const description = touched
    ? formatBatteryDescription(specs, { title })
    : String(initialDescription || "");

  return (
    <div className="heat-pump-specs battery-specs">
      <div className="heat-pump-specs-head">
        <b>{BATTERY_HEADING}</b>
        <span>Fiche technique batterie (couplage AC/DC, énergie, secours). Saisissez les valeurs constructeur : elles remplacent la description commerciale sur le devis.</span>
      </div>
      {BATTERY_FIELD_GROUPS.map(group => (
        <section key={group.title} className="heat-pump-spec-group">
          <h4>{group.title}</h4>
          <div className="heat-pump-spec-grid">
            {group.keys.map(key => {
              const field = batteryField(key);
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
