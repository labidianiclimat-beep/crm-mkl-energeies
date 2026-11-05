"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Droplets,
  Flame,
  Heater,
  Home,
  Library,
  Package,
  Plus,
  Search,
  Star,
  Snowflake,
  Sun,
  Trash2,
  Waves,
  Wind,
  Wrench,
  X,
} from "lucide-react";
import {
  articleBundleRole,
  articleMatchesBundleItem,
  articlesForPath,
  bundlesContainingArticle,
  BUNDLE_ROLE_LABELS,
  brandsForPath,
  buildBundleItemFromArticle,
  buildPickerCrumbs,
  bundleLineTotal,
  bundleTotalHt,
  hydratePickerPath,
  moveBundleItems,
  normalizeBundle,
  pickerAccessoryKind,
  pickerCategories,
  pickerSubcategories,
  pickerVariants,
  persistPickerSubcategory,
  subfamilyHasVariants,
  priceTtc,
  searchArticlesByReference,
  suggestBundleName,
} from "../lib/article-picker";
import {
  extraMultiSplitBundleItems,
  isClimIndoorArticle,
  isMultiSplitPath,
  multiSplitBundleError,
  multiSplitIndoorCount,
  parseMultiSplitBundle,
  withClimStandardAccessories,
} from "../lib/clim-multisplit-bundle";
import QuoteBundleHeading from "./quote-bundle-heading";
import {
  arrangeRadiatorBundleItems,
  isRadiatorAccessoryArticle,
  isRadiatorBundle,
  isRadiatorGroupInstallationLine,
  isRadiatorInstallationArticle,
  isRadiatorMachineArticle,
  radiatorFootAndWheelChoices,
} from "../lib/radiator-bundle";

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
  Wrench,
};

const money = value =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0));

export default function BundleBuilderWizard({
  bundle = null,
  articles = [],
  categories = [],
  subcategories = [],
  brandCatalog = [],
  bundles = [],
  includeInactive = false,
  onSave,
  onClose,
}) {
  const hydrated = bundle ? hydratePickerPath(bundle, categories, subcategories, articles) : {};
  const normalizedBundle = bundle ? normalizeBundle(bundle) : null;
  const initialItems = normalizedBundle
    ? (multiSplitIndoorCount(normalizedBundle)
      ? normalizedBundle.items.filter(item => !isClimIndoorArticle(item))
      : normalizedBundle.items)
    : [];
  const [step, setStep] = useState(bundle?.items?.length ? "review" : "categories");
  const [category, setCategory] = useState(hydrated.category || null);
  const [subcategory, setSubcategory] = useState(hydrated.subcategory || null);
  const [variant, setVariant] = useState(hydrated.variant || null);
  const [brandName, setBrandName] = useState(hydrated.brand || "");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(() => (
    isRadiatorBundle({ ...(normalizedBundle || {}), items: initialItems })
      ? arrangeRadiatorBundleItems(initialItems, articles)
      : initialItems
  ));
  const [name, setName] = useState(bundle?.name || "");
  const [error, setError] = useState("");

  const categoryCards = useMemo(
    () => pickerCategories(categories, articles, { includeInactive }),
    [categories, articles, includeInactive]
  );
  const subcategoryCards = useMemo(
    () => (category ? pickerSubcategories(category, subcategories, articles, { includeInactive }) : []),
    [category, subcategories, articles, includeInactive]
  );
  const variantCards = useMemo(
    () => (subcategory ? pickerVariants(subcategory, articles, { includeInactive }) : []),
    [subcategory, articles, includeInactive]
  );
  const pathSubcategory = variant || subcategory;
  const persistSubcategory = persistPickerSubcategory(subcategory, variant);
  const accessoryKind = pickerAccessoryKind(pathSubcategory);
  const multiCount = !accessoryKind ? multiSplitIndoorCount(persistSubcategory?.name || pathSubcategory?.name || category?.name) : 0;
  const multiSplit = Boolean(multiCount && isMultiSplitPath(persistSubcategory?.name || pathSubcategory?.name));
  const brands = useMemo(
    () => (category && pathSubcategory ? brandsForPath(articles, { category, subcategory: pathSubcategory }, { includeInactive, brandCatalog }) : []),
    [articles, category, pathSubcategory, includeInactive, brandCatalog]
  );
  const catalog = useMemo(() => {
    if (step !== "principal" || !category || !pathSubcategory) return [];
    return articlesForPath(
      articles,
      { category, subcategory: pathSubcategory, brand: accessoryKind ? "" : brandName },
      { includeInactive, query: "" }
    );
  }, [articles, step, category, pathSubcategory, brandName, accessoryKind, includeInactive]);
  const referenceHits = useMemo(
    () => searchArticlesByReference(articles, query, { includeInactive }),
    [articles, query, includeInactive]
  );

  const crumbs = buildPickerCrumbs({ category, subcategory, variant, brand: brandName, step });
  const radiatorMode = isRadiatorBundle({
    category: category?.name || "",
    subcategory: persistSubcategory?.name || subcategory?.name || "",
    family: subcategory?.name || "",
    items,
  });
  const accessoryChoices = useMemo(
    () => (radiatorMode ? radiatorFootAndWheelChoices(articles) : []),
    [radiatorMode, articles]
  );

  function shapeItems(next, options) {
    const mode = isRadiatorBundle({
      category: category?.name || "",
      subcategory: persistSubcategory?.name || subcategory?.name || "",
      family: subcategory?.name || "",
      items: next,
    });
    return mode ? arrangeRadiatorBundleItems(next, articles, options) : next;
  }
  const total = bundleTotalHt({ items });
  const composeCopy = {
    principal: accessoryKind === "installation"
      ? {
        title: "Main-d’œuvre",
        hint: "Cochez les références d’installation à ajouter au groupe.",
        empty: `Aucune installation pour ${pathSubcategory?.name || "ce chemin"}. Ajoutez-les d’abord au catalogue.`,
      }
      : accessoryKind === "fourniture"
        ? {
          title: "Fournitures",
          hint: "Cochez les fournitures à ajouter au groupe.",
          empty: `Aucune fourniture pour ${pathSubcategory?.name || "ce chemin"}. Ajoutez-les d’abord au catalogue.`,
        }
        : {
          title: multiSplit ? "Groupe extérieur" : "Articles du groupe",
          hint: multiSplit
            ? "Cochez le groupe extérieur, puis ajoutez fournitures, installations si besoin. Les unités intérieures se choisissent sur le devis."
            : "Cochez les références à ajouter au groupe.",
          empty: `Aucun article pour ${brandName || pathSubcategory?.name || "ce chemin"}. Ajoutez-les d’abord au catalogue.`,
        },
  };

  function openCategory(item) {
    setCategory(item);
    setSubcategory(null);
    setVariant(null);
    setBrandName("");
    setQuery("");
    setStep("subcategories");
  }

  function openSubcategory(item) {
    setSubcategory(item);
    setVariant(null);
    setBrandName("");
    setQuery("");
    if (item?.accessory || pickerAccessoryKind(item)) {
      setStep("principal");
      return;
    }
    setStep(subfamilyHasVariants(item) ? "variants" : "brands");
  }

  function openVariant(item) {
    setVariant(item);
    setBrandName("");
    setQuery("");
    setStep(item?.accessory ? "principal" : "brands");
  }

  function openBrand(nameValue) {
    setBrandName(nameValue);
    setQuery("");
    setStep("principal");
  }

  function goToCrumb(targetStep) {
    if (targetStep === "categories") {
      setCategory(null);
      setSubcategory(null);
      setVariant(null);
      setBrandName("");
    } else if (targetStep === "subcategories") {
      setSubcategory(null);
      setVariant(null);
      setBrandName("");
    } else if (targetStep === "variants") {
      setVariant(null);
      setBrandName("");
    } else if (targetStep === "brands") {
      setBrandName("");
    }
    setQuery("");
    setStep(targetStep);
  }

  function restartPath() {
    setCategory(null);
    setSubcategory(null);
    setVariant(null);
    setBrandName("");
    setQuery("");
    setError("");
    setStep("categories");
  }

  function goBack() {
    if (step === "review") return restartPath();
    if (step === "principal") return goToCrumb(pathSubcategory?.accessory ? (variant ? "variants" : "subcategories") : "brands");
    if (step === "brands") return goToCrumb(subfamilyHasVariants(subcategory) ? "variants" : "subcategories");
    if (step === "variants") return goToCrumb("subcategories");
    if (step === "subcategories") return goToCrumb("categories");
    onClose?.();
  }

  const outdoorArticle = useMemo(() => {
    if (!multiSplit) return null;
    return parseMultiSplitBundle({
      items,
      subcategory: persistSubcategory?.name || pathSubcategory?.name,
    }, articles).outdoor;
  }, [articles, items, multiSplit, persistSubcategory, pathSubcategory]);

  function applyOutdoor(outdoor) {
    setItems(current => [
      buildBundleItemFromArticle(outdoor, { role: "principal", qty: 1 }),
      ...extraMultiSplitBundleItems(current, outdoorArticle || outdoor),
    ]);
    setError("");
  }

  function addArticleFromSearch(article) {
    if (multiSplit && step === "principal") {
      toggleArticle(article);
      setQuery("");
      return;
    }
    setItems(current => {
      if (current.some(item => articleMatchesBundleItem(article, item))) return current;
      return shapeItems([...current, buildBundleItemFromArticle(article, { role: articleBundleRole(article) })]);
    });
    setQuery("");
    setError("");
  }

  function toggleArticle(article) {
    if (multiSplit) {
      const already = outdoorArticle && articleMatchesBundleItem(article, outdoorArticle);
      if (already) {
        setItems(current => extraMultiSplitBundleItems(current, outdoorArticle));
        setError("");
        return;
      }
      applyOutdoor(article);
      return;
    }
    const role = accessoryKind === "installation"
      ? "labor"
      : accessoryKind === "fourniture"
        ? "supply"
        : articleBundleRole(article);
    setItems(current => {
      const index = current.findIndex(item => articleMatchesBundleItem(article, item));
      if (index >= 0) return shapeItems(current.filter((_, itemIndex) => itemIndex !== index));
      return shapeItems([...current, buildBundleItemFromArticle(article, { role })]);
    });
  }

  function updateItem(index, field, value) {
    setItems(current => shapeItems(current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item)));
  }

  function removeItem(index) {
    setItems(current => shapeItems(current.filter((_, itemIndex) => itemIndex !== index)));
  }

  function moveItem(index, direction) {
    setItems(current => moveBundleItems(current, index, direction));
  }

  function multiSplitError() {
    if (!multiSplit) return "";
    return multiSplitBundleError({
      outdoor: outdoorArticle,
      count: multiCount,
    });
  }

  function goToReview() {
    const selectionError = multiSplitError();
    if (selectionError) {
      setError(selectionError);
      return;
    }
    setQuery("");
    setError("");
    setItems(current => shapeItems(withClimStandardAccessories(current, articles, {
      category: category?.name || "",
      items: current,
    })));
    setStep("review");
  }

  async function save() {
    if (multiSplit) {
      const selectionError = multiSplitError();
      if (selectionError) {
        setError(selectionError);
        return;
      }
    }
    const savedItems = items.some(item => (item.role || "principal") === "principal")
      ? items
      : items.map((item, index) => (index === 0 ? { ...item, role: "principal" } : item));
    if (!savedItems.length) {
      setError("Ajoutez au moins un article au groupe.");
      restartPath();
      return;
    }
    const first = savedItems[0];
    const payloadBase = {
      ...(bundle || {}),
      name: name.trim() || suggestBundleName({ items: savedItems, brand: first.brand }),
      category: category?.name || first.category || "",
      subcategory: persistSubcategory?.name || first.subcategory || "",
      brand: brandName || first.brand || "",
      family: persistSubcategory?.name || category?.name || first.subcategory || first.category || "",
      items: savedItems,
    };
    const payload = normalizeBundle({
      ...payloadBase,
      items: shapeItems(withClimStandardAccessories(savedItems, articles, payloadBase)),
    });
    try {
      await onSave?.(payload);
    } catch (err) {
      setError(String(err?.message || "Enregistrement du groupe impossible."));
    }
  }

  return (
    <div className="article-wizard-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
      <div className="article-wizard bundle-builder" role="dialog" aria-modal="true" aria-label={bundle?.id ? "Modifier le groupe d’articles" : "Créer un groupe d’articles"}>
        <header className="article-wizard-head">
          <div>
            <p className="article-wizard-eyebrow">GROUPES D’ARTICLES</p>
            <h2>{bundle?.id ? "Modifier le groupe" : "Créer un groupe"}</h2>
            <nav className="article-wizard-crumbs" aria-label="Fil d’Ariane">
              {crumbs.map((crumb, index) => (
                <span key={`${crumb.id}-${index}`}>
                  {index > 0 && <i>/</i>}
                  <button type="button" className={crumb.current ? "current" : ""} onClick={() => !crumb.current && goToCrumb(crumb.step)}>
                    {crumb.label}
                  </button>
                </span>
              ))}
            </nav>
          </div>
          <div className="article-wizard-actions">
            <button type="button" className="wizard-ghost" onClick={goBack}><ArrowLeft size={16} /> Retour</button>
            <button type="button" className="wizard-ghost" onClick={onClose}><X size={16} /> Annuler</button>
          </div>
        </header>

        {error && <div className="article-wizard-toast wizard-form-error"><CheckCircle2 size={16} />{error}</div>}

        <div className="bundle-ref-search">
          <div className="wizard-search">
            <Search size={16} />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Référence article — tapez puis cliquez pour l’ajouter au groupe"
              aria-label="Rechercher une référence article"
            />
          </div>
          {query.trim().length >= 2 && (
            <div className="bundle-ref-results" role="listbox" aria-label="Résultats de référence">
              {referenceHits.length ? referenceHits.map(article => {
                const selected = items.some(item => articleMatchesBundleItem(article, item));
                return (
                  <button
                    type="button"
                    key={article.id || article.code}
                    className={`bundle-ref-hit${selected ? " is-selected" : ""}`}
                    onClick={() => addArticleFromSearch(article)}
                    disabled={selected && !(multiSplit && step === "principal")}
                  >
                    <span>
                      <small>{article.code}</small>
                      <b>{article.name}</b>
                      <em>{[article.brand, article.subcategory || article.category].filter(Boolean).join(" · ")}</em>
                    </span>
                    <strong>{selected ? "Dans le groupe" : "Ajouter"}</strong>
                  </button>
                );
              }) : (
                <p>Aucune référence pour « {query.trim()} ».</p>
              )}
            </div>
          )}
        </div>

        {items.length > 0 && step !== "review" && (
          <div className="bundle-basket-bar">
            <span>{items.length} article{items.length > 1 ? "s" : ""} dans le groupe</span>
            <button type="button" className="wizard-primary" onClick={goToReview}>
              Terminer le groupe
            </button>
          </div>
        )}

        <div className="article-wizard-body">
          {step === "categories" && (
            <div className="wizard-category-grid">
              {categoryCards.map(item => {
                const Icon = ICONS[item.icon] || Package;
                return (
                  <button type="button" key={item.id || item.name} className="wizard-category-card" onClick={() => openCategory(item)}>
                    <span className="wizard-category-icon"><Icon size={28} /></span>
                    <b>{item.name}</b>
                    <span>{item.description || "Ouvrir les sous-catégories"}</span>
                    <em>{item.count} article{item.count > 1 ? "s" : ""}</em>
                  </button>
                );
              })}
            </div>
          )}

          {step === "subcategories" && (
            <>
              <div className="wizard-toolbar">
                <button type="button" className="wizard-link" onClick={() => goToCrumb("categories")}>← Toutes les catégories</button>
              </div>
              <div className="wizard-category-grid">
                {subcategoryCards.map(item => {
                  const Icon = ICONS[item.icon] || Package;
                  return (
                    <button type="button" key={item.id || item.name} className="wizard-category-card" onClick={() => openSubcategory(item)}>
                      <span className="wizard-category-icon"><Icon size={26} /></span>
                      <b>{item.name}</b>
                      <span>{item.description || `Marques pour ${item.name}`}</span>
                      <em>{item.count} article{item.count > 1 ? "s" : ""}</em>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === "variants" && (
            <>
              <div className="wizard-toolbar">
                <button type="button" className="wizard-link" onClick={() => goToCrumb("subcategories")}>← Toutes les sous-catégories</button>
              </div>
              <div className="wizard-category-grid">
                {variantCards.map(item => {
                  const Icon = ICONS[item.icon] || Flame;
                  return (
                    <button type="button" key={item.id || item.name} className="wizard-category-card" onClick={() => openVariant(item)}>
                      <span className="wizard-category-icon"><Icon size={26} /></span>
                      <b>{item.name}</b>
                      <span>{item.description || `Marques pour ${item.name}`}</span>
                      <em>{item.count} article{item.count > 1 ? "s" : ""}</em>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === "brands" && (
            <>
              <div className="wizard-toolbar">
                <button type="button" className="wizard-link" onClick={() => goToCrumb(subfamilyHasVariants(subcategory) ? "variants" : "subcategories")}>
                  {subfamilyHasVariants(subcategory) ? "← Types" : "← Toutes les sous-catégories"}
                </button>
              </div>
              {!brands.length ? (
                <div className="wizard-empty">
                  <Package size={28} />
                  <b>Aucune marque pour {pathSubcategory?.name}</b>
                  <span>Ajoutez d’abord des articles catalogue avec une marque sur ce chemin.</span>
                </div>
              ) : (
                <div className="wizard-brand-grid">
                  {brands.map(brand => (
                    <button type="button" key={brand.name} className="wizard-brand-card" onClick={() => openBrand(brand.name)}>
                      {brand.logoUrl ? <img className="wizard-brand-logo" src={brand.logoUrl} alt="" /> : <span className="wizard-brand-badge">{(brand.name || "?").slice(0, 1).toUpperCase()}</span>}
                      <b>{brand.name}</b>
                      <em>{brand.count} article{brand.count > 1 ? "s" : ""}</em>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {step === "principal" && (
            <ComposeStep
              copy={composeCopy.principal}
              catalog={catalog}
              items={items}
              bundles={bundles}
              onToggle={toggleArticle}
              onUpdate={updateItem}
              onRemove={removeItem}
              onMove={moveItem}
              onRestart={restartPath}
              onReview={goToReview}
              multiSplit={multiSplit}
              multiCount={multiCount}
              outdoor={outdoorArticle}
            />
          )}

          {step === "review" && (
            <div className="bundle-review">
              <QuoteBundleHeading
                title={name}
                placeholder={suggestBundleName({ items, brand: brandName })}
                onChange={setName}
              />
              <p className="bundle-path-hint">
                {category?.name}{subcategory?.name ? ` → ${subcategory.name}` : ""}{brandName ? ` → ${brandName}` : ""}
              </p>
              {radiatorMode ? (
                <RadiatorGroupReview
                  items={items}
                  choices={accessoryChoices}
                  onQty={updateItem}
                  onRemove={removeItem}
                  onAccessory={accessoryId => setItems(current => arrangeRadiatorBundleItems(current, articles, { accessoryId }))}
                  onAccessoryQty={value => setItems(current => shapeItems(current.map(item => (
                    isRadiatorAccessoryArticle(item) ? { ...item, qty: value } : item
                  ))))}
                />
              ) : (
              <section className="bundle-review-block">
                <b>Ordre dans le groupe</b>
                {!items.length ? <span className="bundle-review-empty">Aucun article</span> : items.map((item, index) => (
                  <div className="bundle-review-line" key={`${item.code}-${index}`}>
                    <div className="bundle-order-btns">
                      <button type="button" onClick={() => moveItem(index, -1)} disabled={index === 0} aria-label="Monter"><ChevronUp size={16} /></button>
                      <button type="button" onClick={() => moveItem(index, 1)} disabled={index === items.length - 1} aria-label="Descendre"><ChevronDown size={16} /></button>
                    </div>
                    <em className="bundle-order-index">{index + 1}</em>
                    <span>
                      <small>{item.code} · {BUNDLE_ROLE_LABELS[item.role || "principal"]}</small>
                      <strong>{item.name}</strong>
                    </span>
                    <em>× {item.qty}</em>
                    <b>{money(bundleLineTotal(item))}</b>
                    <button type="button" onClick={() => removeItem(index)} aria-label="Retirer"><Trash2 size={14} /></button>
                  </div>
                ))}
              </section>
              )}
              <div className="bundle-review-total"><span>Total HT du groupe</span><b>{money(total)}</b></div>
              <div className="wizard-create-actions">
                <button type="button" className="wizard-ghost" onClick={restartPath}>
                  <Plus size={16} /> Ajouter un autre article
                </button>
                <button type="button" className="wizard-primary" onClick={save}><Library size={16} /> Enregistrer le groupe</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RadiatorGroupReview({ items, choices, onQty, onRemove, onAccessory, onAccessoryQty }) {
  const radiators = items.map((item, index) => ({ item, index })).filter(({ item }) => isRadiatorMachineArticle(item));
  const accessory = items.find(isRadiatorAccessoryArticle) || null;
  const installation = items.find(isRadiatorInstallationArticle) || items.find(isRadiatorGroupInstallationLine) || null;
  const selected = accessory ? choices.find(article => articleMatchesBundleItem(article, accessory)) : null;
  const selectedId = selected ? String(selected.id || selected.code || "") : "";
  return (
    <section className="bundle-review-block bundle-radiator">
      <b>Radiateurs</b>
      {!radiators.length ? <span className="bundle-review-empty">Ajoutez les radiateurs. Chaque type reste une ligne.</span> : radiators.map(({ item, index }) => (
        <div className="bundle-review-line" key={`${item.code || item.name}-${index}`}>
          <span>
            <small>{item.code}</small>
            <strong>{item.name}</strong>
          </span>
          <input type="number" min="1" step="1" aria-label={`Quantité ${item.name}`} value={item.qty} onChange={event => onQty(index, "qty", event.target.value)} />
          <b>{money(bundleLineTotal(item))}</b>
          <button type="button" onClick={() => onRemove(index)} aria-label={`Retirer ${item.name}`}><Trash2 size={14} /></button>
        </div>
      ))}
      <label className="bundle-radiator-slot">
        Pied ou roulette
        <select value={selectedId} onChange={event => onAccessory(event.target.value)} aria-label="Pied ou roulette">
          <option value="">Choisir un pied ou des roulettes</option>
          {choices.map(article => (
            <option key={article.id || article.code} value={article.id || article.code}>
              {article.code ? `${article.code} — ${article.name}` : article.name}
            </option>
          ))}
        </select>
      </label>
      {accessory && (
        <label className="bundle-radiator-slot">
          Quantité de l’accessoire
          <input type="number" min="0.01" step="1" aria-label="Quantité de l’accessoire" value={accessory.qty} onChange={event => onAccessoryQty(event.target.value)} />
        </label>
      )}
      <p className="bundle-radiator-install">
        <span>
          <small>Installation</small>
          <strong>{installation?.name || "Aucune installation radiateur au catalogue"}</strong>
        </span>
        {installation ? <b>× {installation.qty}</b> : null}
      </p>
    </section>
  );
}

function ComposeStep({
  copy = {},
  catalog,
  items,
  bundles = [],
  onToggle,
  onUpdate,
  onRemove,
  onMove,
  onRestart,
  onReview,
  multiSplit = false,
  multiCount = 0,
  outdoor = null,
}) {
  const knownBundles = items.length ? [...bundles, { name: "ce groupe", items }] : bundles;
  const title = copy.title || "Articles du groupe";
  const hint = copy.hint || "Cochez les références à ajouter au groupe.";
  const empty = copy.empty || "Aucun article pour ce chemin.";
  return (
    <div className="bundle-compose">
      <div className="wizard-toolbar">
        <div>
          <b className="bundle-compose-title">{title}</b>
          <span className="bundle-compose-hint">{hint}</span>
        </div>
      </div>
      <div className="bundle-compose-layout">
        <div>
          {!catalog.length ? (
            <div className="wizard-empty">
              <Package size={28} />
              <b>{empty}</b>
            </div>
          ) : (
            <div className="wizard-material-grid">
              {catalog.map(article => {
                const usedIn = bundlesContainingArticle(article, knownBundles);
                const names = [...new Set(usedIn.map(bundle => bundle.name).filter(Boolean))];
                const inBundle = usedIn.length > 0;
                const selected = items.some(item => articleMatchesBundleItem(article, item));
                const starTitle = names.length ? `Déjà dans : ${names.join(", ")}` : "Déjà dans un groupe";
                return (
                <article key={article.id || article.code} className={`wizard-material-card${inBundle ? " is-in-bundle" : ""}${selected ? " is-selected" : ""}`}>
                  {inBundle && (
                    <span className="wizard-bundle-star" title={starTitle} aria-label={starTitle}>
                      <Star size={16} strokeWidth={1.6} />
                    </span>
                  )}
                  <div className="wizard-material-top">
                    <span className="wizard-material-photo"><Package size={22} /></span>
                    <div>
                      <small>{article.code}</small>
                      <b>{article.name}</b>
                      <em>{[article.brand, article.subcategory].filter(Boolean).join(" · ")}</em>
                    </div>
                  </div>
                  <div className="wizard-material-prices">
                    <span><small>HT</small><b>{money(article.sell)}</b></span>
                    <span><small>TVA</small><b>{article.tax}%</b></span>
                    <span><small>TTC</small><b>{money(priceTtc(article.sell, article.tax))}</b></span>
                  </div>
                  <div className="wizard-material-foot">
                    <span className="wizard-status on">{article.unit || "Unité"}</span>
                    <label className="wizard-material-check">
                      <input type="checkbox" checked={selected} onChange={() => onToggle(article)} />
                      {selected ? "Dans le groupe" : "Ajouter au groupe"}
                    </label>
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </div>
        <aside className="bundle-compose-selected">
          <b>Dans ce groupe</b>
          {multiSplit && !outdoor && <span>Cochez un groupe extérieur. Ajoutez ensuite fournitures et installations si besoin. Les unités intérieures se choisissent sur le devis.</span>}
          {multiSplit && outdoor && (
            <span className="bundle-multisplit-empty">{multiCount} unité{multiCount > 1 ? "s" : ""} intérieure{multiCount > 1 ? "s" : ""} à choisir au devis.</span>
          )}
          {!items.length && !multiSplit ? <span>Aucun article pour l’instant. Cochez les références à gauche.</span> : null}
          {items.map((item, index) => (
            <div key={`${item.code}-${index}`} className="bundle-compose-line">
              <div className="bundle-order-btns">
                <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} aria-label="Monter"><ChevronUp size={14} /></button>
                <button type="button" onClick={() => onMove(index, 1)} disabled={index === items.length - 1} aria-label="Descendre"><ChevronDown size={14} /></button>
              </div>
              <span>{item.name}</span>
              <input type="number" min="0.01" step="0.01" value={item.qty} onChange={e => onUpdate(index, "qty", Number(e.target.value))} aria-label="Quantité" />
              <button type="button" onClick={() => onRemove(index)} aria-label="Retirer"><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" className="wizard-ghost" onClick={onRestart}>Ajouter un autre article</button>
          {items.length > 0 && (
            <button type="button" className="wizard-primary" onClick={onReview}>Terminer le groupe</button>
          )}
        </aside>
      </div>
    </div>
  );
}
