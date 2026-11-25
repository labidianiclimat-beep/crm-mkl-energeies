"use client";

import { useState } from "react";
import { Download, Droplets, FileSpreadsheet, Flame, Printer, Snowflake, Sun } from "lucide-react";
import { DEFAULT_COMPANY } from "../lib/company";
import { downloadTariffGrid, preparedTariffGrids, TARIFF_FAMILIES } from "../lib/heat-pump-tariff";
import { authFetch } from "../lib/supabase-rest";

const FAMILY_ICONS = {
  pac: Flame,
  ballon: Droplets,
  clim: Snowflake,
  pv: Sun,
};

export default function TariffGridsView({ articles = [], query = "", toast, canPrint = false }) {
  const [busyKey, setBusyKey] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const needle = String(query || "").trim().toLowerCase();
  const prepared = preparedTariffGrids(articles);
  const brands = [...new Set(prepared.map(grid => grid.brand))].sort((a, b) => a.localeCompare(b, "fr"));
  const productIds = new Set(prepared.filter(grid => !brandFilter || grid.brand === brandFilter).map(grid => grid.familyId));
  const products = TARIFF_FAMILIES.filter(family => productIds.has(family.id));
  const grids = prepared.filter(grid =>
    (!brandFilter || grid.brand === brandFilter)
    && (!productFilter || grid.familyId === productFilter)
    && (!needle || `${grid.title} ${grid.brand} ${grid.family}`.toLowerCase().includes(needle))
  );

  async function run(grid, action) {
    const key = `${grid.id}:${action}`;
    if (busyKey || !grid.ready) return;
    if (action === "print" && !canPrint) return;
    setBusyKey(key);
    try {
      let company = DEFAULT_COMPANY;
      try {
        const response = await authFetch("/api/company");
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.company) company = data.company;
      } catch {}
      await downloadTariffGrid(articles, grid, { toast, company, print: action === "print" });
    } catch (error) {
      toast?.(String(error?.message || (action === "print" ? "Impression de la grille impossible" : "Téléchargement de la grille impossible")));
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div className="module-content">
      <div className="module-top">
        <div>
          <p>CATALOGUE</p>
          <h1>Grilles tarifaires PDF</h1>
          <span>Une grille par marque et par produit : pompe à chaleur, climatisation, ballon d’eau chaude ou photovoltaïque.</span>
        </div>
        <div className="tariff-grid-filters">
          <label>Marque
            <select value={brandFilter} onChange={event => { setBrandFilter(event.target.value); setProductFilter(""); }}>
              <option value="">Toutes les marques</option>
              {brands.map(brand => <option key={brand} value={brand}>{brand}</option>)}
            </select>
          </label>
          <label>Produit
            <select value={productFilter} onChange={event => setProductFilter(event.target.value)}>
              <option value="">Tous les produits</option>
              {products.map(family => <option key={family.id} value={family.id}>{family.family}</option>)}
            </select>
          </label>
        </div>
      </div>
      {!grids.length ? (
        <div className="quote-empty">
          <FileSpreadsheet size={20} />
          <span>Aucune grille pour le moment. Créez un article PAC, ballon thermodynamique, climatisation ou photovoltaïque pour la générer.</span>
        </div>
      ) : (
        <div className="tariff-grid-list">
          {grids.map(grid => {
            const Icon = FAMILY_ICONS[grid.familyId] || Flame;
            const labels = grid.countLabels || {};
            return (
              <article className={`tariff-grid-card${grid.ready ? "" : " is-empty"}`} key={grid.id}>
                <div className="tariff-grid-card-head">
                  <span><Icon size={20} /></span>
                  <div>
                    <h3>{grid.title}</h3>
                    <p>{grid.brand} · {grid.family}</p>
                  </div>
                </div>
                <div className={`tariff-grid-counts${labels.duos && labels.duos !== "—" ? "" : " is-pair"}`}>
                  <div><small>{labels.simples || "Mono"}</small><b>{grid.counts.simples}</b></div>
                  <div><small>{labels.tris || "Tri"}</small><b>{grid.counts.tris || 0}</b></div>
                  {labels.duos && labels.duos !== "—" ? <div><small>{labels.duos}</small><b>{grid.counts.duos}</b></div> : null}
                </div>
                <p className="tariff-grid-hint">{grid.hint}</p>
                <div className="tariff-grid-actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={!grid.ready || Boolean(busyKey)}
                    onClick={() => run(grid, "download")}
                  >
                    <Download size={16} />
                    {busyKey === `${grid.id}:download` ? "Préparation…" : "Télécharger le PDF"}
                  </button>
                  {canPrint ? (
                    <button
                      type="button"
                      className="secondary"
                      disabled={!grid.ready || Boolean(busyKey)}
                      onClick={() => run(grid, "print")}
                    >
                      <Printer size={16} />
                      {busyKey === `${grid.id}:print` ? "Préparation…" : "Imprimer"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
