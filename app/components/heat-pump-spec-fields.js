"use client";

import { useMemo, useState } from "react";
import { Download, ScanSearch, Upload, X } from "lucide-react";
import { articleHasCommercialDoc, downloadArticleCommercialDoc } from "../lib/article-commercial-doc";
import { extractHeatPumpSpecsFromText, mergeHeatPumpScan } from "../lib/heat-pump-scan";
import { extractTextFromHeatPumpFile } from "../lib/heat-pump-scan-browser";
import {
  defaultHeatPumpSpecs,
  defaultHeatPumpWarranty,
  formatHeatPumpDescription,
  HEAT_PUMP_FIELD_GROUPS,
  heatPumpField,
  isHeatPumpSpecText,
  parseHeatPumpDescription,
} from "../lib/heat-pump-specs";

const STORE_MAX_BYTES = 1.8 * 1024 * 1024;
const SCAN_MAX_BYTES = 8 * 1024 * 1024;

export default function HeatPumpSpecFields({
  brandName = "",
  title = "",
  initialDescription = "",
  initialFicheName = "",
  initialFicheData = "",
  persistFiche = true,
}) {
  const parsed = useMemo(() => parseHeatPumpDescription(initialDescription), [initialDescription]);
  const [specs, setSpecs] = useState(() => {
    const defaults = defaultHeatPumpSpecs(brandName);
    if (parsed.matched) {
      return {
        ...defaults,
        ...parsed,
        warranty: parsed.warranty || defaults.warranty,
      };
    }
    return defaults;
  });
  const [touched, setTouched] = useState(isHeatPumpSpecText(initialDescription) || !String(initialDescription || "").trim());
  const [lastBrand, setLastBrand] = useState(brandName);
  const [ficheName, setFicheName] = useState(initialFicheName || "");
  const [ficheData, setFicheData] = useState(initialFicheData || "");
  const [ficheError, setFicheError] = useState("");
  const [scanStatus, setScanStatus] = useState("");
  const [scanCount, setScanCount] = useState(0);
  const [scanning, setScanning] = useState(false);

  if (brandName !== lastBrand) {
    setLastBrand(brandName);
    const previousDefault = defaultHeatPumpWarranty(lastBrand);
    const genericDefault = defaultHeatPumpWarranty("constructeur");
    const atlanticDefault = defaultHeatPumpWarranty("Atlantic");
    setSpecs(current => {
      const warranty = String(current.warranty || "").trim();
      if (!warranty || warranty === previousDefault || warranty === genericDefault || warranty === atlanticDefault) {
        return { ...current, warranty: defaultHeatPumpWarranty(brandName) };
      }
      return current;
    });
  }

  function update(key, value) {
    setTouched(true);
    setSpecs(current => ({ ...current, [key]: value }));
  }

  async function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Lecture impossible"));
      reader.readAsDataURL(file);
    });
  }

  async function onFicheChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFicheError("");
    setScanStatus("");
    setScanCount(0);
    if (file.size > SCAN_MAX_BYTES) {
      setFicheError("Document trop lourd (8 Mo max).");
      return;
    }
    setScanning(true);
    try {
      if (file.size <= STORE_MAX_BYTES) {
        setFicheName(file.name);
        setFicheData(await readAsDataUrl(file));
      } else {
        setFicheName(file.name);
        setFicheData("");
        setFicheError("Fiche scannée, mais trop lourde pour rester jointe au devis (1,8 Mo max).");
      }
      const text = await extractTextFromHeatPumpFile(file, { onProgress: setScanStatus });
      const scanned = extractHeatPumpSpecsFromText(text);
      if (!scanned.found) {
        setScanStatus("Aucune valeur reconnue. Vérifiez le document ou complétez les cases à la main.");
        return;
      }
      setTouched(true);
      setSpecs(current => mergeHeatPumpScan(current, scanned.specs));
      setScanCount(scanned.found);
      setScanStatus(`${scanned.found} valeur${scanned.found > 1 ? "s" : ""} trouvée${scanned.found > 1 ? "s" : ""} — vérifiez les cases.`);
    } catch (error) {
      setFicheError(error.message || "Scan impossible.");
      setScanStatus("");
    } finally {
      setScanning(false);
    }
  }

  const description = touched
    ? formatHeatPumpDescription(specs, { brand: brandName, title })
    : String(initialDescription || "");

  return (
    <div className="heat-pump-specs">
      <div className="heat-pump-specs-head">
        <b>Fiche pompe à chaleur</b>
        <span>Saisissez le n° EPREL, puis importez la fiche constructeur : elle est scannée pour remplir les cases.</span>
      </div>
      <div className="heat-pump-scan-box">
        <label className="heat-pump-eprel">
          N° EPREL
          <input
            value={specs.eprel || ""}
            onChange={event => update("eprel", event.target.value)}
            placeholder="Ex. 1765432"
            inputMode="numeric"
          />
        </label>
        <div className="heat-pump-fiche-actions">
          <b>Fiche constructeur</b>
          <span>PDF ou photo de la fiche technique. Le scan cherche EPREL, ADEME, SCOP, puissances…</span>
          <div>
            <label className={`secondary import-button${scanning ? " is-disabled" : ""}`}>
              {scanning ? <ScanSearch size={16} /> : <Upload size={16} />}
              {scanning ? "Scan en cours…" : ficheName ? "Scanner une autre fiche" : "Scanner la fiche constructeur"}
              <input type="file" accept="application/pdf,image/*" disabled={scanning} onChange={onFicheChange} />
            </label>
            {articleHasCommercialDoc({ ficheData }) ? (
              <button
                type="button"
                className="wizard-link"
                onClick={() => downloadArticleCommercialDoc({ ficheName, ficheData })}
              >
                <Download size={14} /> Télécharger {ficheName}
              </button>
            ) : null}
            {ficheName ? (
              <button type="button" className="wizard-link" onClick={() => { setFicheName(""); setFicheData(""); setScanStatus(""); setScanCount(0); }}>
                <X size={14} /> Retirer {ficheName}
              </button>
            ) : null}
          </div>
          {ficheName ? <em>Document lié : {ficheName}{scanCount ? ` · ${scanCount} valeurs lues` : ""}</em> : null}
          {scanStatus ? <em className={scanCount ? "heat-pump-scan-ok" : undefined}>{scanStatus}</em> : null}
          {ficheError ? <small className="field-error">{ficheError}</small> : null}
        </div>
      </div>
      {HEAT_PUMP_FIELD_GROUPS.map(group => (
        <section key={group.title} className="heat-pump-spec-group">
          <h4>{group.title}</h4>
          <div className="heat-pump-spec-grid">
            {group.keys.filter(key => key !== "eprel").map(key => {
              const field = heatPumpField(key);
              if (!field) return null;
              const wide = key === "electricBackup" || key === "dhwBackup" || key === "seasonalEfficiency" || key === "energyClass" || key === "operatingRange";
              return (
                <label key={key} className={wide ? "wide" : undefined}>
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
      <label>
        Garantie
        <textarea
          rows="4"
          value={specs.warranty || ""}
          onChange={event => update("warranty", event.target.value)}
        />
      </label>
      <input type="hidden" name="description" value={description} />
      {persistFiche ? (
        <>
          <input type="hidden" name="ficheName" value={ficheName} />
          <input type="hidden" name="ficheData" value={ficheData} />
        </>
      ) : null}
      {description ? (
        <pre className="heat-pump-preview" aria-label="Aperçu description devis">{description}</pre>
      ) : null}
    </div>
  );
}
