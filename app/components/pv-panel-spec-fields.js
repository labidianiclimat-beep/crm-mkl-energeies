"use client";

import { useMemo, useState } from "react";
import {
  PV_PANEL_FIELD_GROUPS,
  PV_PANEL_HEADING,
  emptyPvPanelSpecs,
  formatPvPanelDescription,
  isPvPanelSpecText,
  parsePvPanelDescription,
  pvPanelField,
} from "../lib/pv-panel-specs";

const WIDE_KEYS = new Set([
  "cellType",
  "moduleType",
  "dimensions",
  "frontGlass",
  "backGlass",
  "junctionBox",
  "cables",
  "connector",
  "maxSystemVoltage",
  "testLoad",
  "designLoad",
  "nmot",
  "certifications",
  "powerWarranty",
]);

export default function PvPanelSpecFields({
  title = "",
  initialDescription = "",
}) {
  const parsed = useMemo(() => parsePvPanelDescription(initialDescription), [initialDescription]);
  const [specs, setSpecs] = useState(() => {
    if (parsed.matched) return { ...emptyPvPanelSpecs(), ...parsed };
    return emptyPvPanelSpecs();
  });
  const [touched, setTouched] = useState(isPvPanelSpecText(initialDescription) || !String(initialDescription || "").trim());

  function update(key, value) {
    setTouched(true);
    setSpecs(current => ({ ...current, [key]: value }));
  }

  const description = touched
    ? formatPvPanelDescription(specs, { title })
    : String(initialDescription || "");

  return (
    <div className="heat-pump-specs pv-panel-specs">
      <div className="heat-pump-specs-head">
        <b>{PV_PANEL_HEADING}</b>
        <span>Fiche technique panneau (STC, NMOT, mécanique). Saisissez les valeurs constructeur : elles remplacent la description commerciale sur le devis.</span>
      </div>
      {PV_PANEL_FIELD_GROUPS.map(group => (
        <section key={group.title} className="heat-pump-spec-group">
          <h4>{group.title}</h4>
          <div className="heat-pump-spec-grid">
            {group.keys.map(key => {
              const field = pvPanelField(key);
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
