"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Droplets,
  Flame,
  Heater,
  Home,
  Package,
  Search,
  Snowflake,
  Sun,
  Waves,
  Wind,
  X,
} from "lucide-react";
import {
  DEVIS_PICKER_CATEGORIES,
  brandsForCategory,
  buildQuoteLineFromArticle,
  materialsForBrand,
  priceTtc,
} from "../lib/article-picker";
import { ARTICLE_TAX_RATES } from "../lib/articles";

const ICONS = {
  Snowflake,
  Flame,
  Heater,
  Home,
  Droplets,
  Waves,
  Wind,
  Sun,
  Package,
};

const money = value =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0));

export default function ArticlePickerWizard({
  articles = [],
  brandCatalog = [],
  defaultTax = 20,
  includeInactive = false,
  onAdd,
  onClose,
}) {
  const [step, setStep] = useState("categories"); // categories | brands | materials | configure
  const [categoryCode, setCategoryCode] = useState("");
  const [brandName, setBrandName] = useState("");
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({
    qty: 1,
    unit: 0,
    tax: defaultTax,
    discountType: "percent",
    discountValue: 0,
    description: "",
    name: "",
  });

  const category = DEVIS_PICKER_CATEGORIES.find(item => item.code === categoryCode) || null;
  const brands = useMemo(
    () => (categoryCode ? brandsForCategory(articles, categoryCode, { includeInactive, brandCatalog }) : []),
    [articles, categoryCode, includeInactive, brandCatalog]
  );
  const materials = useMemo(
    () =>
      categoryCode && brandName
        ? materialsForBrand(articles, categoryCode, brandName, { includeInactive, query, sort })
        : [],
    [articles, categoryCode, brandName, includeInactive, query, sort]
  );

  const categoriesWithCounts = useMemo(
    () =>
      DEVIS_PICKER_CATEGORIES.map(item => ({
        ...item,
        count: brandsForCategory(articles, item.code, { includeInactive, brandCatalog }).reduce((sum, b) => sum + b.count, 0),
      })),
    [articles, includeInactive, brandCatalog]
  );

  function openCategory(code) {
    setCategoryCode(code);
    setBrandName("");
    setSelectedArticle(null);
    setQuery("");
    setStep("brands");
  }

  function openBrand(name) {
    setBrandName(name);
    setSelectedArticle(null);
    setQuery("");
    setStep("materials");
  }

  function openConfigure(article) {
    setSelectedArticle(article);
    setForm({
      qty: 1,
      unit: Number(article.sell || 0),
      tax: Number(article.tax ?? defaultTax),
      discountType: "percent",
      discountValue: 0,
      description: article.description || "",
      name: article.name || "",
    });
    setStep("configure");
  }

  function goBack() {
    if (step === "configure") return setStep("materials");
    if (step === "materials") return setStep("brands");
    if (step === "brands") return setStep("categories");
    onClose?.();
  }

  function confirmAdd(andContinue = false) {
    if (!selectedArticle) return;
    const line = buildQuoteLineFromArticle(selectedArticle, form, { tax: defaultTax });
    onAdd?.(line);
    setToast(`« ${line.name} » ajouté au devis`);
    if (andContinue) {
      setStep("materials");
      setSelectedArticle(null);
      setTimeout(() => setToast(""), 1800);
      return;
    }
    setTimeout(() => onClose?.(), 400);
  }

  const crumbs = ["Articles"];
  if (category) crumbs.push(category.label);
  if (brandName && step !== "brands" && step !== "categories") crumbs.push(brandName);
  if (selectedArticle && step === "configure") crumbs.push(selectedArticle.name);

  return (
    <div className="article-wizard-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
      <div className="article-wizard" role="dialog" aria-modal="true" aria-label="Ajouter un article au devis">
        <header className="article-wizard-head">
          <div>
            <p className="article-wizard-eyebrow">CATALOGUE MKL ÉNERGIES</p>
            <h2>Ajouter un article</h2>
            <nav className="article-wizard-crumbs" aria-label="Fil d’Ariane">
              {crumbs.map((crumb, index) => (
                <span key={`${crumb}-${index}`}>
                  {index > 0 && <i>/</i>}
                  <button
                    type="button"
                    className={index === crumbs.length - 1 ? "current" : ""}
                    onClick={() => {
                      if (index === 0) setStep("categories");
                      else if (index === 1) setStep("brands");
                      else if (index === 2) setStep("materials");
                    }}
                  >
                    {crumb}
                  </button>
                </span>
              ))}
            </nav>
          </div>
          <div className="article-wizard-actions">
            <button type="button" className="wizard-ghost" onClick={goBack}>
              <ArrowLeft size={16} /> Retour
            </button>
            <button type="button" className="wizard-ghost" onClick={onClose}>
              <X size={16} /> Annuler
            </button>
          </div>
        </header>

        {toast && (
          <div className="article-wizard-toast">
            <CheckCircle2 size={16} />
            {toast}
          </div>
        )}

        <div className="article-wizard-body">
          {step === "categories" && (
            <div className="wizard-category-grid">
              {categoriesWithCounts.map(item => {
                const Icon = ICONS[item.icon] || Package;
                return (
                  <button type="button" key={item.code} className="wizard-category-card" onClick={() => openCategory(item.code)}>
                    <span className="wizard-category-icon">
                      <Icon size={28} />
                    </span>
                    <b>{item.label}</b>
                    <span>{item.description}</span>
                    <em>{item.count} matériel{item.count > 1 ? "s" : ""}</em>
                  </button>
                );
              })}
            </div>
          )}

          {step === "brands" && (
            <>
              <div className="wizard-toolbar">
                <button type="button" className="wizard-link" onClick={() => setStep("categories")}>
                  ← Toutes les catégories
                </button>
              </div>
              {!brands.length ? (
                <div className="wizard-empty">
                  <Package size={28} />
                  <b>Aucune marque pour {category?.label}</b>
                  <span>Ajoutez des articles actifs avec une marque dans Gestion des articles.</span>
                </div>
              ) : (
                <div className="wizard-brand-grid">
                  {brands.map(brand => (
                    <button type="button" key={brand.name} className="wizard-brand-card" onClick={() => openBrand(brand.name)}>
                      {brand.logoUrl ? (
                        <img className="wizard-brand-logo" src={brand.logoUrl} alt="" />
                      ) : (
                        <span className="wizard-brand-badge">{(brand.name || "?").slice(0, 1).toUpperCase()}</span>
                      )}
                      <b>{brand.name}</b>
                      <em>{brand.count} matériel{brand.count > 1 ? "s" : ""}</em>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {step === "materials" && (
            <>
              <div className="wizard-toolbar">
                <button type="button" className="wizard-link" onClick={() => setStep("brands")}>
                  ← Changer de marque
                </button>
                <div className="wizard-search">
                  <Search size={16} />
                  <input
                    type="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Rechercher référence ou désignation…"
                  />
                </div>
                <label className="wizard-sort">
                  Tri
                  <select value={sort} onChange={e => setSort(e.target.value)}>
                    <option value="name">Nom</option>
                    <option value="code">Référence</option>
                    <option value="price">Prix HT</option>
                  </select>
                </label>
              </div>
              {!materials.length ? (
                <div className="wizard-empty">
                  <Package size={28} />
                  <b>Aucun matériel trouvé</b>
                  <span>Modifiez la recherche ou choisissez une autre marque.</span>
                </div>
              ) : (
                <div className="wizard-material-grid">
                  {materials.map(article => (
                    <article key={article.id} className="wizard-material-card">
                      <div className="wizard-material-top">
                        <span className="wizard-material-photo">
                          <Package size={22} />
                        </span>
                        <div>
                          <small>{article.code}</small>
                          <b>{article.name}</b>
                          <em>
                            {article.category}
                            {article.brand ? ` · ${article.brand}` : ""}
                          </em>
                        </div>
                      </div>
                      <div className="wizard-material-prices">
                        <span>
                          <small>HT</small>
                          <b>{money(article.sell)}</b>
                        </span>
                        <span>
                          <small>TVA</small>
                          <b>{article.tax}%</b>
                        </span>
                        <span>
                          <small>TTC</small>
                          <b>{money(priceTtc(article.sell, article.tax))}</b>
                        </span>
                      </div>
                      <div className="wizard-material-foot">
                        <span className={`wizard-status ${article.status === "Inactif" ? "off" : "on"}`}>
                          {article.status || "Actif"}
                        </span>
                        <button type="button" className="wizard-primary" onClick={() => openConfigure(article)}>
                          Ajouter au devis
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}

          {step === "configure" && selectedArticle && (
            <div className="wizard-configure">
              <div className="wizard-configure-summary">
                <Package size={22} />
                <div>
                  <small>{selectedArticle.code}</small>
                  <b>{selectedArticle.name}</b>
                  <span>
                    {category?.label} · {brandName}
                  </span>
                </div>
              </div>
              <div className="wizard-configure-grid">
                <label>
                  Quantité
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.qty}
                    onChange={e => setForm({ ...form, qty: e.target.value })}
                  />
                </label>
                <label>
                  Prix unitaire HT (€)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.unit}
                    onChange={e => setForm({ ...form, unit: e.target.value })}
                  />
                </label>
                <label>
                  TVA
                  <select value={form.tax} onChange={e => setForm({ ...form, tax: Number(e.target.value) })}>
                    {ARTICLE_TAX_RATES.map(rate => (
                      <option key={rate} value={rate}>
                        {rate} %
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Remise
                  <div className="wizard-discount-row">
                    <select
                      value={form.discountType}
                      onChange={e => setForm({ ...form, discountType: e.target.value })}
                    >
                      <option value="percent">%</option>
                      <option value="amount">€ TTC</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.discountValue}
                      onChange={e => setForm({ ...form, discountValue: e.target.value })}
                    />
                  </div>
                </label>
              </div>
              <label>
                Libellé dans le devis (sans modifier l’article catalogue)
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </label>
              <label>
                Description complémentaire
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                />
              </label>
              <div className="wizard-configure-actions">
                <button type="button" className="wizard-ghost" onClick={() => setStep("materials")}>
                  Retour au matériel
                </button>
                <button type="button" className="wizard-ghost" onClick={() => confirmAdd(true)}>
                  Ajouter et continuer
                </button>
                <button type="button" className="wizard-primary" onClick={() => confirmAdd(false)}>
                  Ajouter au devis
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
