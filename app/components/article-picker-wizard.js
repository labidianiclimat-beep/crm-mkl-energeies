"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Droplets,
  Flame,
  Heater,
  Home,
  Library,
  Package,
  Plus,
  Search,
  FileText,
  Snowflake,
  Sun,
  Waves,
  Wind,
  Wrench,
  X,
} from "lucide-react";
import {
  brandsForCreate,
  brandsForPath,
  brandsForPickerIntent,
  buildPickerCrumbs,
  buildQuoteLineFromArticle,
  buildQuoteLinesFromBundle,
  bundleTotalHt,
  bundleMatchesPath,
  bundlesForPath,
  isBundleActive,
  catalogPathIds,
  formatArticlePower,
  persistPickerSubcategory,
  pickerAccessoryKind,
  pickerCategories,
  pickerSubcategories,
  pickerVariants,
  subfamilyHasVariants,
  articlesForPath,
  priceTtc,
  resolveBundlePath,
} from "../lib/article-picker";
import ArticleSellPriceField from "./article-sell-price-field";
import { ARTICLE_UNITS } from "../lib/articles";
import { taxonomyNamesEqual } from "../lib/article-taxonomy";
import { isHeatPumpMachineArticle, matchesBundleSearch } from "../lib/article-bundles";
import {
  HEAT_PUMP_EMITTERS,
  applyHeatPumpEmitterToLines,
  bundleNeedsHeatPumpEmitter,
} from "../lib/heat-pump-emitters";
import {
  HEAT_PUMP_BOILER_REMOVALS,
  HEAT_PUMP_TANK_REMOVALS,
  bundleOffersBoilerRemoval,
  heatPumpBoilerRemovalById,
  heatPumpRemovalQuoteLines,
  heatPumpTankRemovalById,
} from "../lib/heat-pump-removal";
import { PV_QUOTE_SIZES, bundleMatchesPvSize, pvQuoteSizeById } from "../lib/pv-quote-sizes";
import { isRadiatorBundle } from "../lib/radiator-bundle";
import { isHeatPumpPath } from "../lib/heat-pump-specs";
import { isClimOutdoorPath } from "../lib/clim-outdoor-specs";
import { isClimIndoorPath } from "../lib/clim-indoor-specs";
import { isMicroInverterPath } from "../lib/micro-inverter-specs";
import { isInverterPath } from "../lib/inverter-specs";
import { isPvPanelPath } from "../lib/pv-panel-specs";
import { isBatteryPath } from "../lib/battery-specs";
import { isOptimizerPath } from "../lib/optimizer-specs";
import {
  expandMultiSplitBundleForQuote,
  isClimConsoleArticle,
  isMultiSplitPath,
  multiSplitIndoorCount,
  multiSplitSelectionError,
  syncIndoorSlots,
  withClimStandardAccessories,
} from "../lib/clim-multisplit-bundle";
import { atlanticHeatPumpArticles, downloadAtlanticHeatPumpTariff } from "../lib/heat-pump-tariff";
import HeatPumpSpecFields from "./heat-pump-spec-fields";
import ClimOutdoorSpecFields from "./clim-outdoor-spec-fields";
import ClimIndoorSpecFields from "./clim-indoor-spec-fields";
import MicroInverterSpecFields from "./micro-inverter-spec-fields";
import InverterSpecFields from "./inverter-spec-fields";
import PvPanelSpecFields from "./pv-panel-spec-fields";
import BatterySpecFields from "./battery-spec-fields";
import OptimizerSpecFields from "./optimizer-spec-fields";
import ArticleCommercialDocField from "./article-commercial-doc-field";

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

export default function ArticlePickerWizard({
  articles = [],
  categories = [],
  subcategories = [],
  brandCatalog = [],
  bundles = [],
  defaultTax = 20,
  includeInactive = false,
  mode = "pick",
  onAdd,
  onAddMany,
  onCreate,
  onClose,
  onEnsureBundles,
  initialTab = "articles",
}) {
  const isCreate = mode === "create";
  const pickIntent = initialTab === "groups" ? "groups" : "articles";
  const [step, setStep] = useState("categories");
  const [category, setCategory] = useState(null);
  const [subcategory, setSubcategory] = useState(null);
  const [variant, setVariant] = useState(null);
  const [brandName, setBrandName] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const [pickTab, setPickTab] = useState(pickIntent);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [articleName, setArticleName] = useState("");
  const [createTax, setCreateTax] = useState("20");
  const [pendingBundle, setPendingBundle] = useState(null);
  const [indoorSlotIds, setIndoorSlotIds] = useState([]);
  const [pendingEmitter, setPendingEmitter] = useState(null);
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [boilerRemovalId, setBoilerRemovalId] = useState("");
  const [tankRemovalId, setTankRemovalId] = useState("");
  const [pvSizeId, setPvSizeId] = useState("");
  const ensuredBundles = useRef(false);

  useEffect(() => {
    if (pickIntent !== "groups" || !onEnsureBundles || ensuredBundles.current) return;
    ensuredBundles.current = true;
    onEnsureBundles().catch(() => {});
  }, [pickIntent, onEnsureBundles]);

  const categoryCards = useMemo(() => {
    const cards = pickerCategories(categories, articles, { includeInactive });
    if (isCreate) return cards;
    if (pickIntent === "groups") {
      return cards
        .map(item => ({
          ...item,
          bundleCount: bundlesForPath(bundles, { category: item }, { includeInactive }).length,
        }))
        .filter(item => item.bundleCount > 0 || taxonomyNamesEqual(item.name, "Photovoltaïque"));
    }
    return cards.filter(item => Number(item.count || 0) > 0);
  }, [categories, articles, bundles, includeInactive, isCreate, pickIntent]);
  const subcategoryCards = useMemo(() => {
    if (!category) return [];
    const cards = pickerSubcategories(category, subcategories, articles, { includeInactive });
    if (isCreate) return cards;
    if (pickIntent === "groups") {
      return cards
        .map(item => ({
          ...item,
          bundleCount: bundlesForPath(bundles, { category, subcategory: item }, { includeInactive }).length,
        }))
        .filter(item => item.bundleCount > 0 || (taxonomyNamesEqual(item.name, "Radiateur électrique") && Number(item.count || 0) > 0));
    }
    return cards.filter(item => item.group || Number(item.count || 0) > 0);
  }, [category, subcategories, articles, bundles, includeInactive, isCreate, pickIntent]);
  const variantCards = useMemo(
    () => (subcategory ? pickerVariants(subcategory, articles, { includeInactive }) : []),
    [subcategory, articles, includeInactive]
  );
  const pathSubcategory = variant || subcategory;
  const persistSubcategory = persistPickerSubcategory(subcategory, variant);
  const accessoryKind = pickerAccessoryKind(pathSubcategory);
  const brands = useMemo(() => {
    if (!category || !pathSubcategory) return [];
    const opts = { includeInactive, brandCatalog };
    if (isCreate) return brandsForCreate(articles, { category, subcategory: pathSubcategory }, opts);
    const list = brandsForPickerIntent({
      articles,
      bundles,
      category,
      subcategory: pathSubcategory,
      intent: pickIntent,
      includeInactive,
      brandCatalog,
    });
    if (
      pickIntent === "groups"
      && taxonomyNamesEqual(pathSubcategory?.name, "Radiateur électrique")
      && !list.some(brand => Number(brand.bundleCount || 0) > 0)
    ) {
      return brandsForPath(articles, { category, subcategory: pathSubcategory }, opts).filter(brand => Number(brand.count || 0) > 0);
    }
    return list;
  }, [articles, bundles, category, pathSubcategory, includeInactive, brandCatalog, isCreate, pickIntent]);
  const materials = useMemo(
    () =>
      category && pathSubcategory && (brandName || accessoryKind)
        ? articlesForPath(articles, { category, subcategory: pathSubcategory, brand: accessoryKind ? "" : brandName }, { includeInactive, query, sort })
        : [],
    [articles, category, pathSubcategory, brandName, accessoryKind, includeInactive, query, sort]
  );
  const matchingBundles = useMemo(() => {
    if (isCreate || pickIntent !== "groups" || !category) return [];
    const needle = query.trim();
    if (needle) {
      return (bundles || []).filter(bundle => {
        if (!includeInactive && !isBundleActive(bundle)) return false;
        if (!bundleMatchesPath(bundle, { category })) return false;
        if (matchesBundleSearch(bundle, needle)) return true;
        const words = needle
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .split(/\s+/)
          .filter(Boolean);
        return words.includes("radiateur") && isRadiatorBundle(bundle) && words.every(word => (
          word === "radiateur" || word === "electrique" || word === "groupe" || matchesBundleSearch(bundle, word)
        ));
      });
    }
    if (!pathSubcategory || (!brandName && !accessoryKind)) return [];
    return bundlesForPath(bundles, { category, subcategory: pathSubcategory, brand: accessoryKind ? "" : brandName }, { includeInactive });
  }, [bundles, category, pathSubcategory, brandName, accessoryKind, query, isCreate, includeInactive, pickIntent]);
  const pvSize = pvQuoteSizeById(pvSizeId);
  const pvGroups = useMemo(() => {
    if (!pvSize) return [];
    const needle = query.trim().toLowerCase();
    return (bundles || []).filter(bundle => {
      if (!includeInactive && !isBundleActive(bundle)) return false;
      if (!bundleMatchesPvSize(bundle, pvSize)) return false;
      return !needle || matchesBundleSearch(bundle, needle);
    });
  }, [bundles, pvSize, includeInactive, query]);

  const crumbs = buildPickerCrumbs({ category, subcategory, variant, brand: brandName, step });
  const selectedBrand = (brandCatalog || []).find(item => taxonomyNamesEqual(item.name, brandName))
    || brands.find(item => item.id && taxonomyNamesEqual(item.name, brandName))
    || null;
  const heatPumpForm = isHeatPumpPath({
    category: category?.name,
    subcategory: persistSubcategory?.name,
    accessory: Boolean(accessoryKind),
  });
  const climOutdoorForm = isClimOutdoorPath({
    category: category?.name,
    subcategory: persistSubcategory?.name,
    accessory: Boolean(accessoryKind),
  });
  const climIndoorForm = isClimIndoorPath({
    category: category?.name,
    subcategory: persistSubcategory?.name,
    accessory: Boolean(accessoryKind),
  });
  const microInverterForm = isMicroInverterPath({
    category: category?.name,
    subcategory: persistSubcategory?.name,
    accessory: Boolean(accessoryKind),
  });
  const inverterForm = isInverterPath({
    category: category?.name,
    subcategory: persistSubcategory?.name,
    accessory: Boolean(accessoryKind),
  });
  const pvPanelForm = isPvPanelPath({
    category: category?.name,
    subcategory: persistSubcategory?.name,
    accessory: Boolean(accessoryKind),
  });
  const batteryForm = isBatteryPath({
    category: category?.name,
    subcategory: persistSubcategory?.name,
    accessory: Boolean(accessoryKind),
  });
  const optimizerForm = isOptimizerPath({
    category: category?.name,
    subcategory: persistSubcategory?.name,
    accessory: Boolean(accessoryKind),
  });
  const specTitleForm = heatPumpForm || climOutdoorForm || climIndoorForm || microInverterForm || inverterForm || pvPanelForm || batteryForm || optimizerForm;
  const atlanticCount = atlanticHeatPumpArticles(articles, { includeInactive }).length;
  const showTariff = atlanticCount > 0 && (
    isHeatPumpPath({ category: category?.name, subcategory: pathSubcategory?.name })
    || /atlantic/i.test(brandName)
  );

  async function downloadTariff() {
    try {
      await downloadAtlanticHeatPumpTariff(articles, { toast: message => setToast(message) });
    } catch (error) {
      setToast(String(error?.message || "Téléchargement de la grille impossible"));
    }
  }

  function openCategory(item) {
    setCategory(item);
    setSubcategory(null);
    setVariant(null);
    setBrandName("");
    setQuery("");
    setPvSizeId("");
    if (pickIntent === "groups" && taxonomyNamesEqual(item.name, "Photovoltaïque")) {
      setStep("pv-sizes");
      return;
    }
    setStep("subcategories");
  }

  function openPvSize(sizeId) {
    setPvSizeId(sizeId);
    setQuery("");
    setStep("pv-groups");
  }

  function openSubcategory(item) {
    setSubcategory(item);
    setVariant(null);
    setBrandName("");
    setQuery("");
    if (item?.accessory || pickerAccessoryKind(item)) {
      setStep(isCreate ? "form" : "articles");
      return;
    }
    if (pickIntent === "groups" && taxonomyNamesEqual(item.name, "Radiateur électrique")) {
      setStep("brands");
      return;
    }
    setStep(subfamilyHasVariants(item) ? "variants" : "brands");
  }

  function openVariant(item) {
    setVariant(item);
    setBrandName("");
    setQuery("");
    setFormError("");
    setArticleName("");
    if (item?.accessory) {
      setStep(isCreate ? "form" : "articles");
      return;
    }
    setStep("brands");
  }

  function openBrand(name, { tab } = {}) {
    setBrandName(name);
    setQuery("");
    setFormError("");
    setArticleName("");
    setPickTab(tab || pickIntent);
    setStep(isCreate ? "form" : "articles");
  }

  function goToCrumb(targetStep) {
    if (targetStep === "categories") {
      setCategory(null);
      setSubcategory(null);
      setVariant(null);
      setBrandName("");
      setQuery("");
    } else if (targetStep === "subcategories") {
      setSubcategory(null);
      setVariant(null);
      setBrandName("");
      setQuery("");
    } else if (targetStep === "variants") {
      setVariant(null);
      setBrandName("");
      setQuery("");
    } else if (targetStep === "brands") {
      setBrandName("");
      setQuery("");
    }
    setPendingBundle(null);
    setIndoorSlotIds([]);
    setPendingEmitter(null);
    setPendingRemoval(null);
    setBoilerRemovalId("");
    setTankRemovalId("");
    if (targetStep === "categories") setPvSizeId("");
    setStep(targetStep);
  }

  function goBack() {
    if (step === "pv-groups") {
      setStep("pv-sizes");
      return;
    }
    if (step === "pv-sizes") return goToCrumb("categories");
    if (step === "emitters" && pendingEmitter?.removal) {
      setPendingEmitter(null);
      setFormError("");
      setStep("removal");
      return;
    }
    if (step === "emitters" || step === "multisplit" || step === "removal") {
      setPendingBundle(null);
      setIndoorSlotIds([]);
      setPendingEmitter(null);
      setPendingRemoval(null);
      setBoilerRemovalId("");
      setTankRemovalId("");
      setFormError("");
      setStep("articles");
      return;
    }
    if (step === "form") return goToCrumb(accessoryKind ? (variant ? "variants" : "subcategories") : "brands");
    if (step === "articles") return goToCrumb(accessoryKind ? (variant ? "variants" : "subcategories") : "brands");
    if (step === "brands") return goToCrumb(subfamilyHasVariants(subcategory) ? "variants" : "subcategories");
    if (step === "variants") return goToCrumb("subcategories");
    if (step === "subcategories") return goToCrumb("categories");
    onClose?.();
  }

  async function submitCreate(event) {
    event.preventDefault();
    if (saving) return;
    const data = Object.fromEntries(new FormData(event.target).entries());
    const ids = catalogPathIds(category, persistSubcategory);
    const chosenBrand = (brandCatalog || []).find(item => String(item.id) === String(data.brandId || ""))
      || selectedBrand;
    setSaving(true);
    setFormError("");
    try {
      await onCreate?.({
        code: data.code,
        name: data.name,
        category: category?.name || "",
        subcategory: persistSubcategory?.name || "",
        categoryId: ids.categoryId,
        subcategoryId: ids.subcategoryId,
        brandId: chosenBrand?.id || data.brandId || "",
        brand: chosenBrand?.name || brandName || "",
        sourceReference: accessoryKind ? `picker:${accessoryKind}` : "",
        description: data.description || "",
        technicalDescription: data.technicalDescription || "",
        ficheName: data.ficheName || "",
        ficheData: data.ficheData || "",
        unit: data.unit,
        tax: Number(data.tax),
        buy: Number(data.buy),
        sell: Number(data.sell),
        status: data.status || "Actif",
        powerW: data.powerW ? Number(data.powerW) : undefined,
      });
    } catch (error) {
      setFormError(String(error?.message || "Création impossible"));
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  function commitArticle(article, emitterId) {
    const line = buildQuoteLineFromArticle(article, { qty: 1, tax: article.tax ?? defaultTax }, { tax: defaultTax });
    const [labeled] = emitterId ? applyHeatPumpEmitterToLines([line], articles, emitterId) : [line];
    onAdd?.(labeled);
    setToast(`« ${labeled.name} » ajouté au devis`);
    setTimeout(() => onClose?.(), 350);
  }

  function addArticle(article) {
    if (isHeatPumpMachineArticle(article)) {
      setPendingEmitter({ kind: "article", article });
      setStep("emitters");
      return;
    }
    commitArticle(article);
  }

  const pendingMulti = useMemo(() => {
    if (!pendingBundle) return null;
    return expandMultiSplitBundleForQuote(pendingBundle, articles, indoorSlotIds);
  }, [pendingBundle, articles, indoorSlotIds]);

  function addBundle(bundle) {
    const count = multiSplitIndoorCount(bundle);
    if (count && isMultiSplitPath(bundle)) {
      const expanded = expandMultiSplitBundleForQuote(bundle, articles, []);
      setPendingBundle(bundle);
      setIndoorSlotIds(Array.from({ length: expanded.count || count }, () => ""));
      setFormError("");
      setStep("multisplit");
      return;
    }
    if (bundleOffersBoilerRemoval(bundle, articles)) {
      setPendingRemoval(bundle);
      setBoilerRemovalId("");
      setTankRemovalId("");
      setFormError("");
      setStep("removal");
      return;
    }
    if (bundleNeedsHeatPumpEmitter(bundle, articles)) {
      setPendingEmitter({ kind: "bundle", bundle });
      setStep("emitters");
      return;
    }
    commitBundle(bundle);
  }

  function commitBundle(bundle, emitterId, removal) {
    const lines = buildQuoteLinesFromBundle(
      { ...bundle, items: withClimStandardAccessories(bundle.items, articles, bundle) },
      articles,
      { tax: defaultTax }
    );
    if (!lines.length) return;
    const labeled = emitterId ? applyHeatPumpEmitterToLines(lines, articles, emitterId) : lines;
    const extras = removal ? heatPumpRemovalQuoteLines(removal, bundle) : [];
    const quoteLines = [...labeled, ...extras];
    onAddMany?.(quoteLines);
    setToast(`Groupe « ${bundle.name} » : ${quoteLines.length} ligne${quoteLines.length > 1 ? "s" : ""} ajoutée${quoteLines.length > 1 ? "s" : ""}`);
    setTimeout(() => onClose?.(), 450);
  }

  function confirmMultiSplitBundle() {
    if (!pendingBundle || !pendingMulti) return;
    const selectionError = multiSplitSelectionError({
      outdoor: pendingMulti.outdoor,
      count: pendingMulti.count,
    });
    if (selectionError) {
      setFormError(selectionError);
      return;
    }
    const lines = buildQuoteLinesFromBundle(
      { ...pendingBundle, items: withClimStandardAccessories(pendingMulti.items, articles, pendingBundle) },
      articles,
      { tax: defaultTax }
    );
    if (!lines.length) return;
    onAddMany?.(lines);
    setToast(`Groupe « ${pendingBundle.name} » : ${lines.length} ligne${lines.length > 1 ? "s" : ""} ajoutée${lines.length > 1 ? "s" : ""}`);
    setTimeout(() => onClose?.(), 450);
  }

  function confirmEmitter(emitterId) {
    if (!pendingEmitter || !HEAT_PUMP_EMITTERS.some(item => item.id === emitterId)) return;
    if (pendingEmitter.kind === "article") {
      commitArticle(pendingEmitter.article, emitterId);
      return;
    }
    commitBundle(pendingEmitter.bundle, emitterId, pendingEmitter.removal);
  }

  function confirmRemoval() {
    if (!pendingRemoval) return;
    const boiler = heatPumpBoilerRemovalById(boilerRemovalId);
    if (!boiler) {
      setFormError("Choisissez l’enlèvement de chaudière.");
      return;
    }
    if (boiler.needsTank && !heatPumpTankRemovalById(tankRemovalId)) {
      setFormError("Choisissez l’enlèvement de cuve.");
      return;
    }
    const removal = { boilerId: boiler.id, tankId: boiler.needsTank ? tankRemovalId : "" };
    setFormError("");
    if (bundleNeedsHeatPumpEmitter(pendingRemoval, articles)) {
      setPendingEmitter({ kind: "bundle", bundle: pendingRemoval, removal });
      setStep("emitters");
      return;
    }
    commitBundle(pendingRemoval, null, removal);
  }

  const selectedBoilerRemoval = heatPumpBoilerRemovalById(boilerRemovalId);
  const selectedTankRemoval = selectedBoilerRemoval?.needsTank ? heatPumpTankRemovalById(tankRemovalId) : null;

  function selectIndoorSlot(index, articleId) {
    if (!pendingMulti) return;
    const next = syncIndoorSlots(indoorSlotIds, pendingMulti.count, pendingMulti.indoorCandidates);
    next[index] = String(articleId || "");
    setIndoorSlotIds(next);
    setFormError("");
  }

  const dialog = (
    <div className="article-wizard-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
      <div className="article-wizard" role="dialog" aria-modal="true" aria-label={isCreate ? "Nouvel article" : "Ajouter un article ou un groupe au devis"}>
        <header className="article-wizard-head">
          <div>
            <p className="article-wizard-eyebrow">CATALOGUE MKL ÉNERGIES</p>
            <h2>{isCreate ? "Nouvel article" : pickIntent === "groups" ? "Ajouter un groupe d’articles" : "Ajouter un article"}</h2>
            <nav className="article-wizard-crumbs" aria-label="Fil d’Ariane">
              {crumbs.map((crumb, index) => (
                <span key={`${crumb.id}-${index}`}>
                  {index > 0 && <i>/</i>}
                  <button
                    type="button"
                    className={crumb.current ? "current" : ""}
                    onClick={() => !crumb.current && goToCrumb(crumb.step)}
                  >
                    {crumb.label}
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

        {(toast || (step === "multisplit" && formError)) && (
          <div className={`article-wizard-toast${formError && step === "multisplit" ? " wizard-form-error" : ""}`}>
            <CheckCircle2 size={16} />
            {step === "multisplit" && formError ? formError : toast}
          </div>
        )}

        <div className="article-wizard-body">
          {step === "categories" && (
            !categoryCards.length ? (
              <div className="wizard-empty">
                <Package size={28} />
                <b>Aucune catégorie</b>
                <span>Créez les familles de produits dans Gestion des articles, puis relancez le devis.</span>
              </div>
            ) : (
              <div className="wizard-category-grid">
                {categoryCards.map(item => {
                  const Icon = ICONS[item.icon] || Package;
                  return (
                    <button type="button" key={item.id || item.name} className="wizard-category-card" onClick={() => openCategory(item)}>
                      <span className="wizard-category-icon">
                        <Icon size={28} />
                      </span>
                      <b>{item.name}</b>
                      <span>{item.description || (isCreate ? "Ouvrir les sous-catégories" : "Ouvrir les sous-catégories")}</span>
                      <em>
                        {pickIntent === "groups" && taxonomyNamesEqual(item.name, "Photovoltaïque")
                          ? "Choisir une puissance"
                          : pickIntent === "groups"
                          ? `${item.bundleCount} groupe${item.bundleCount > 1 ? "s" : ""}`
                          : `${item.count} article${item.count > 1 ? "s" : ""}`}
                      </em>
                    </button>
                  );
                })}
              </div>
            )
          )}

          {step === "subcategories" && (
            <>
              <div className="wizard-toolbar">
                <button type="button" className="wizard-link" onClick={() => goToCrumb("categories")}>
                  ← Toutes les catégories
                </button>
              </div>
              {!subcategoryCards.length ? (
                <div className="wizard-empty">
                  <Package size={28} />
                  <b>Aucune sous-catégorie pour {category?.name}</b>
                  <span>Ajoutez-en depuis l’administration du catalogue.</span>
                </div>
              ) : (
                <div className="wizard-category-grid">
                  {subcategoryCards.map(item => {
                    const Icon = ICONS[item.icon] || Package;
                    return (
                    <button
                      type="button"
                      key={item.id || item.name}
                      className="wizard-category-card"
                      onClick={() => openSubcategory(item)}
                    >
                      <span className="wizard-category-icon">
                        <Icon size={26} />
                      </span>
                      <b>{item.name}</b>
                      <span>
                        {item.description ||
                          (item.accessory
                            ? item.name
                            : subfamilyHasVariants(item)
                            ? (taxonomyNamesEqual(item.name, "Pompe à chaleur")
                              ? "PAC, Duo, fourniture ou installation"
                              : "Matériel, fourniture ou installation")
                            : isCreate
                              ? `Choisir une marque pour ${item.name}`
                              : `Marques disponibles pour ${item.name}`)}
                      </span>
                      <em>
                        {pickIntent === "groups"
                          ? `${item.bundleCount} groupe${item.bundleCount > 1 ? "s" : ""}`
                          : `${item.count} article${item.count > 1 ? "s" : ""}`}
                      </em>
                    </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {step === "variants" && (
            <>
              <div className="wizard-toolbar">
                <button type="button" className="wizard-link" onClick={() => goToCrumb("subcategories")}>
                  ← Toutes les sous-catégories
                </button>
              </div>
              <div className="wizard-category-grid">
                {variantCards.map(item => {
                  const Icon = ICONS[item.icon] || Flame;
                  const bundleCount = pickIntent === "groups"
                    ? bundlesForPath(bundles, { category, subcategory: item }, { includeInactive }).length
                    : 0;
                  return (
                    <button
                      type="button"
                      key={item.id || item.name}
                      className="wizard-category-card"
                      onClick={() => openVariant(item)}
                    >
                      <span className="wizard-category-icon">
                        <Icon size={26} />
                      </span>
                      <b>{item.name}</b>
                      <span>{item.description || `Choisir une marque pour ${item.name}`}</span>
                      <em>
                        {pickIntent === "groups"
                          ? `${bundleCount} groupe${bundleCount > 1 ? "s" : ""}`
                          : `${item.count} article${item.count > 1 ? "s" : ""}`}
                      </em>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === "brands" && (
            <>
              <div className="wizard-toolbar">
                <button
                  type="button"
                  className="wizard-link"
                  onClick={() => goToCrumb(subfamilyHasVariants(subcategory) && !(pickIntent === "groups" && taxonomyNamesEqual(subcategory?.name, "Radiateur électrique")) ? "variants" : "subcategories")}
                >
                  {subfamilyHasVariants(subcategory) && !(pickIntent === "groups" && taxonomyNamesEqual(subcategory?.name, "Radiateur électrique")) ? "← Types" : "← Toutes les sous-catégories"}
                </button>
                {showTariff && (
                  <button type="button" className="wizard-ghost" onClick={downloadTariff}>
                    <FileText size={16} /> Grille tarifaire Atlantic
                  </button>
                )}
              </div>
              {!brands.length ? (
                <div className="wizard-empty">
                  <Package size={28} />
                  <b>Aucune marque pour {pathSubcategory?.name}</b>
                  <span>
                    {isCreate
                      ? "Créez d’abord une marque dans l’onglet Marques, puis revenez ici."
                      : Number(pathSubcategory?.count || 0) === 0
                        ? "Cette fenêtre est vide. Le premier article se crée dans Gestion des articles → Nouvel article."
                        : pickIntent === "groups"
                        ? "Aucun groupe d’articles n’est rattaché à une marque dans cette sous-catégorie."
                        : "Aucun article actif n’est rattaché à une marque dans cette sous-catégorie."}
                  </span>
                </div>
              ) : (
                <div className="wizard-brand-grid">
                  {brands.map(brand => (
                    <button type="button" key={brand.name} className="wizard-brand-card" onClick={() => openBrand(brand.name, { tab: pickIntent })}>
                      {brand.logoUrl ? (
                        <img className="wizard-brand-logo" src={brand.logoUrl} alt="" />
                      ) : (
                        <span className="wizard-brand-badge">{(brand.name || "?").slice(0, 1).toUpperCase()}</span>
                      )}
                      <b>{brand.name}</b>
                      <em>
                        {pickIntent === "groups"
                          ? `${brand.bundleCount || 0} groupe${(brand.bundleCount || 0) > 1 ? "s" : ""}`
                          : `${brand.count} article${brand.count > 1 ? "s" : ""}`}
                      </em>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {step === "articles" && !isCreate && (
            <>
              <div className="wizard-toolbar">
                <button type="button" className="wizard-link" onClick={() => goToCrumb("brands")}>
                  ← Changer de marque
                </button>
                {showTariff && (
                  <button type="button" className="wizard-ghost" onClick={downloadTariff}>
                    <FileText size={16} /> Grille tarifaire Atlantic
                  </button>
                )}
                {!isCreate && (
                  <p className="wizard-pick-hint">
                    {pickIntent === "groups" ? `${matchingBundles.length} groupe${matchingBundles.length > 1 ? "s" : ""}` : `${materials.length} article${materials.length > 1 ? "s" : ""}`}
                  </p>
                )}
                <div className="wizard-search">
                  <Search size={16} />
                  <input
                    type="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={pickTab === "groups" ? "Rechercher un groupe…" : "Rechercher référence ou désignation…"}
                  />
                </div>
                {pickTab === "articles" && (
                  <label className="wizard-sort">
                    Tri
                    <select value={sort} onChange={e => setSort(e.target.value)}>
                      <option value="name">Nom</option>
                      <option value="code">Référence</option>
                      <option value="price">Prix HT</option>
                    </select>
                  </label>
                )}
              </div>
              {pickTab === "articles" && (
                !materials.length ? (
                  <div className="wizard-empty">
                    <Package size={28} />
                    <b>Aucun article trouvé</b>
                    <span>Modifiez la recherche ou choisissez une autre marque.</span>
                  </div>
                ) : (
                  <div className="wizard-material-grid">
                    {materials.map(article => {
                      const power = formatArticlePower(article);
                      return (
                        <article key={article.id} className="wizard-material-card">
                          <div className="wizard-material-top">
                            <span className="wizard-material-photo">
                              {article.photoUrl ? <img src={article.photoUrl} alt="" /> : <Package size={22} />}
                            </span>
                            <div>
                              <small>{article.code}</small>
                              <b>{article.name}</b>
                              <em>
                                {article.brand || brandName}
                                {power ? ` · ${power}` : ""}
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
                            <button type="button" className="wizard-primary" onClick={() => addArticle(article)}>
                              Ajouter au devis
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )
              )}
              {pickTab === "groups" && (
                !matchingBundles.length ? (
                  <div className="wizard-empty">
                    <Library size={28} />
                    <b>Aucun groupe sur ce chemin</b>
                    <span>Attachez un groupe à {category?.name}{subcategory?.name ? ` / ${subcategory.name}` : ""} depuis Groupes d’articles.</span>
                  </div>
                ) : (
                  <div className="wizard-material-grid">
                    {matchingBundles.map(bundle => {
                      const total = bundleTotalHt(bundle);
                      const path = resolveBundlePath(bundle);
                      return (
                        <article key={bundle.id} className="wizard-material-card wizard-bundle-card">
                          {bundle.name && (
                            <div className="quote-bundle-heading">
                              <b>{bundle.name}</b>
                            </div>
                          )}
                          <div className="wizard-material-top">
                            <span className="wizard-material-photo">
                              <Library size={22} />
                            </span>
                            <div>
                              <small>{bundle.items?.length || 0} article{(bundle.items?.length || 0) > 1 ? "s" : ""}</small>
                              <em>{[path.category, path.subcategory, path.brand || brandName || "Toutes marques"].filter(Boolean).join(" · ")}</em>
                            </div>
                          </div>
                          <ul className="wizard-bundle-items">
                            {(bundle.items || []).slice(0, 4).map((item, index) => (
                              <li key={`${item.code || item.name}-${index}`}>
                                <span>{item.name}</span>
                                <b>{money(item.price)}</b>
                              </li>
                            ))}
                            {(bundle.items || []).length > 4 && (
                              <li className="more">+ {(bundle.items || []).length - 4} autre{(bundle.items || []).length - 4 > 1 ? "s" : ""}</li>
                            )}
                          </ul>
                          <div className="wizard-material-prices">
                            <span>
                              <small>Total HT</small>
                              <b>{money(total)}</b>
                            </span>
                            <span>
                              <small>TVA</small>
                              <b>{defaultTax}%</b>
                            </span>
                            <span>
                              <small>TTC env.</small>
                              <b>{money(priceTtc(total, defaultTax))}</b>
                            </span>
                          </div>
                          <div className="wizard-material-foot">
                            <span className="wizard-status on">Groupe</span>
                            <button type="button" className="wizard-primary" onClick={() => addBundle(bundle)}>
                              Ajouter le groupe
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )
              )}
            </>
          )}

          {step === "pv-sizes" && (
            <div className="pv-size-step">
              <div className="wizard-toolbar">
                <button type="button" className="wizard-link" onClick={goBack}>← Toutes les catégories</button>
              </div>
              <b className="bundle-compose-title">Puissance photovoltaïque</b>
              <span className="bundle-compose-hint">Chaque dessin compte les panneaux. Le choix ouvre les groupes de cette puissance.</span>
              <div className="pv-size-grid">
                {PV_QUOTE_SIZES.map(size => (
                  <article key={size.id} className="pv-size-card">
                    <span className="pv-size-panels" style={{ gridTemplateColumns: `repeat(${size.columns}, 10px)` }} aria-hidden="true">
                      {Array.from({ length: size.panels }, (_, index) => <i key={index} />)}
                    </span>
                    <b>{size.kwLabel} {size.phaseLabel}</b>
                    <small>{size.panels} panneaux</small>
                    <button type="button" className="wizard-primary" onClick={() => openPvSize(size.id)}>
                      Choisir
                    </button>
                  </article>
                ))}
              </div>
            </div>
          )}

          {step === "pv-groups" && pvSize && (
            <div className="pv-size-step">
              <div className="wizard-toolbar">
                <button type="button" className="wizard-link" onClick={goBack}>← Changer de puissance</button>
                <p className="wizard-pick-hint">{pvGroups.length} groupe{pvGroups.length > 1 ? "s" : ""}</p>
              </div>
              <b className="bundle-compose-title">{pvSize.kwLabel} {pvSize.phaseLabel}</b>
              <span className="bundle-compose-hint">{pvSize.panels} panneaux. Les groupes créés pour cette puissance s’affichent ici.</span>
              {!pvGroups.length ? (
                <div className="wizard-empty">
                  <Library size={28} />
                  <b>Aucun groupe pour {pvSize.kwLabel} {pvSize.phaseLabel}</b>
                  <span>Ils apparaîtront ici dès qu’un groupe portera « {pvSize.kwLabel} {pvSize.phaseLabel} » dans son nom.</span>
                </div>
              ) : (
                <div className="wizard-material-grid">
                  {pvGroups.map(bundle => (
                    <article key={bundle.id} className="wizard-material-card wizard-bundle-card">
                      {bundle.name && <div className="quote-bundle-heading"><b>{bundle.name}</b></div>}
                      <ul className="wizard-bundle-items">
                        {(bundle.items || []).slice(0, 4).map((item, index) => (
                          <li key={`${item.code || item.name}-${index}`}>
                            <span>{item.name}</span>
                            <b>{money(item.price)}</b>
                          </li>
                        ))}
                      </ul>
                      <div className="wizard-material-foot">
                        <span className="wizard-status on">Groupe</span>
                        <button type="button" className="wizard-primary" onClick={() => addBundle(bundle)}>Ajouter le groupe</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === "removal" && pendingRemoval && (
            <div className="heat-pump-removal">
              <div className="wizard-toolbar">
                <button type="button" className="wizard-link" onClick={goBack}>← Changer de groupe</button>
              </div>
              <b className="bundle-compose-title">Enlèvement de chaudière</b>
              <span className="bundle-compose-hint">Ce choix s’ajoute au groupe, avec la phrase correspondante sur le devis.</span>
              {formError && <p className="wizard-form-error">{formError}</p>}
              <label className="bundle-multisplit-slot">
                Chaudière
                <select
                  aria-label="Enlèvement de chaudière"
                  value={boilerRemovalId}
                  onChange={event => {
                    const next = event.target.value;
                    setBoilerRemovalId(next);
                    if (!heatPumpBoilerRemovalById(next)?.needsTank) setTankRemovalId("");
                    setFormError("");
                  }}
                >
                  <option value="">Choisir</option>
                  {HEAT_PUMP_BOILER_REMOVALS.map(choice => (
                    <option key={choice.id} value={choice.id}>{choice.label}</option>
                  ))}
                </select>
              </label>
              {selectedBoilerRemoval && <p className="heat-pump-removal-phrase">{selectedBoilerRemoval.phrase}</p>}
              {selectedBoilerRemoval?.needsTank && (
                <label className="bundle-multisplit-slot">
                  Cuve
                  <select
                    aria-label="Enlèvement de cuve"
                    value={tankRemovalId}
                    onChange={event => {
                      setTankRemovalId(event.target.value);
                      setFormError("");
                    }}
                  >
                    <option value="">Choisir</option>
                    {HEAT_PUMP_TANK_REMOVALS.map(choice => (
                      <option key={choice.id} value={choice.id}>{choice.label} — {money(choice.price)} HT</option>
                    ))}
                  </select>
                </label>
              )}
              {selectedTankRemoval && <p className="heat-pump-removal-phrase">{selectedTankRemoval.phrase}</p>}
              <div className="wizard-create-actions">
                <button type="button" className="wizard-primary" onClick={confirmRemoval}>
                  {bundleNeedsHeatPumpEmitter(pendingRemoval, articles) ? "Continuer" : "Ajouter le groupe au devis"}
                </button>
              </div>
            </div>
          )}

          {step === "emitters" && pendingEmitter && (
            <div className="heat-pump-emitters">
              <div className="wizard-toolbar">
                <button type="button" className="wizard-link" onClick={goBack}>← Changer de choix</button>
              </div>
              <b className="bundle-compose-title">Émetteurs de la pompe à chaleur</b>
              <span className="bundle-compose-hint">Un seul choix. Il s’inscrit à côté de la pompe à chaleur sur le devis.</span>
              <div className="heat-pump-emitter-grid">
                {HEAT_PUMP_EMITTERS.map(choice => (
                  <article key={choice.id} className="heat-pump-emitter-card">
                    <img src={choice.image} alt={choice.label} />
                    <button type="button" className="wizard-primary" onClick={() => confirmEmitter(choice.id)}>
                      {choice.label}
                    </button>
                  </article>
                ))}
              </div>
            </div>
          )}

          {step === "multisplit" && pendingBundle && pendingMulti && (
            <div className="bundle-multisplit-quote">
              <div className="wizard-toolbar">
                <button type="button" className="wizard-link" onClick={goBack}>← Changer de groupe</button>
              </div>
              <b className="bundle-compose-title">Unités intérieures et consoles basses</b>
              <span className="bundle-compose-hint">
                Choisissez jusqu’à {pendingMulti.count} unité{pendingMulti.count > 1 ? "s" : ""} intérieure{pendingMulti.count > 1 ? "s" : ""} ou console{pendingMulti.count > 1 ? "s" : ""} basse{pendingMulti.count > 1 ? "s" : ""} {pendingMulti.outdoor?.brand || "de cette marque"}. Les lignes vides n’apparaissent pas sur le devis.
              </span>
              <p className="bundle-multisplit-head">
                <small>Groupe extérieur</small>
                <strong>{pendingMulti.outdoor?.name || pendingBundle.name}</strong>
              </p>
              {!pendingMulti.indoorCandidates.length ? (
                <span className="bundle-multisplit-empty">Aucune unité intérieure ni console basse n’est disponible pour cette marque.</span>
              ) : Array.from({ length: pendingMulti.count }, (_, index) => (
                <label key={`quote-indoor-${index}`} className="bundle-multisplit-slot">
                  Unité / console {index + 1}
                  <select
                    value={indoorSlotIds[index] || ""}
                    onChange={event => selectIndoorSlot(index, event.target.value)}
                    aria-label={`Unité intérieure ou console basse ${index + 1}`}
                  >
                    <option value="">Choisir une unité intérieure ou une console basse</option>
                    {pendingMulti.indoorCandidates.map(article => (
                      <option key={article.id || article.code} value={article.id || article.code}>
                        {isClimConsoleArticle(article) ? "Console basse · " : ""}
                        {article.code ? `${article.code} — ${article.name}` : article.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {pendingMulti.fourniture && (
                <p className="bundle-multisplit-labor">
                  <small>{pendingMulti.fourniture.name || "Fourniture"}</small>
                  <strong>× {pendingMulti.items.find(item => item.role === "supply")?.qty || pendingMulti.count}</strong>
                </p>
              )}
              {pendingMulti.installation && (
                <p className="bundle-multisplit-labor">
                  <small>{pendingMulti.installation.name || "Installation"}</small>
                  <strong>× {pendingMulti.items.find(item => item.role === "labor")?.qty || pendingMulti.count}</strong>
                </p>
              )}
              <div className="wizard-create-actions">
                <button type="button" className="wizard-primary" onClick={confirmMultiSplitBundle}>
                  Ajouter le groupe au devis
                </button>
              </div>
            </div>
          )}

          {step === "form" && (
            <form className="wizard-create-form article-fields" onSubmit={submitCreate}>
              <div className="wizard-toolbar">
                <button type="button" className="wizard-link" onClick={() => goToCrumb(accessoryKind ? (variant ? "variants" : "subcategories") : "brands")}>
                  {accessoryKind ? (variant ? "← Types" : "← Toutes les sous-catégories") : "← Changer de marque"}
                </button>
                {showTariff && (
                  <button type="button" className="wizard-ghost" onClick={downloadTariff}>
                    <FileText size={16} /> Grille tarifaire Atlantic
                  </button>
                )}
              </div>
              <div className="wizard-path-recap">
                <span>{category?.name}</span>
                <span>{persistSubcategory?.name}</span>
                <span>{pathSubcategory?.name}</span>
                {brandName ? <span>{brandName}</span> : null}
              </div>
              {formError && <p className="wizard-form-error">{formError}</p>}
              <div className="form-row">
                <label>
                  Référence
                  <input name="code" required placeholder="Ex. PV-450W" />
                </label>
                <label>
                  Unité
                  <select name="unit" defaultValue={accessoryKind === "installation" ? "Forfait" : "Unité"}>
                    {ARTICLE_UNITS.map(unit => (
                      <option key={unit}>{unit}</option>
                    ))}
                  </select>
                </label>
              </div>
              {accessoryKind ? (
                <label>
                  Marque
                  <select name="brandId" defaultValue="">
                    <option value="">Sans marque</option>
                    {(brandCatalog || [])
                      .filter(brand => brand.active !== false && brand.status !== "Inactif")
                      .map(brand => (
                        <option key={brand.id} value={brand.id}>{brand.name}</option>
                      ))}
                  </select>
                </label>
              ) : null}
              <label>
                {specTitleForm ? "Titre" : "Désignation"}
                <input
                  name="name"
                  required
                  placeholder={specTitleForm ? "Nom du modèle affiché sur le devis" : "Nom du produit ou service"}
                  value={articleName}
                  onChange={event => setArticleName(event.target.value)}
                />
              </label>
              <ArticleCommercialDocField />
              {heatPumpForm ? (
                <HeatPumpSpecFields brandName={brandName} title={articleName} persistFiche={false} />
              ) : climOutdoorForm ? (
                <ClimOutdoorSpecFields brandName={brandName} title={articleName} />
              ) : climIndoorForm ? (
                <ClimIndoorSpecFields brandName={brandName} title={articleName} subcategory={persistSubcategory?.name} />
              ) : microInverterForm ? (
                <MicroInverterSpecFields brandName={brandName} title={articleName} />
              ) : inverterForm ? (
                <InverterSpecFields title={articleName} />
              ) : pvPanelForm ? (
                <PvPanelSpecFields title={articleName} />
              ) : batteryForm ? (
                <BatterySpecFields title={articleName} />
              ) : optimizerForm ? (
                <OptimizerSpecFields brandName={brandName} title={articleName} />
              ) : (
                <label>
                  Description commerciale
                  <textarea name="description" rows="2" placeholder="Texte visible sur le devis" />
                </label>
              )}
              <label>
                Description technique
                <textarea name="technicalDescription" rows="2" placeholder="Caractéristiques techniques internes" />
              </label>
              <div className="form-row">
                <label>
                  Prix d’achat HT (€)
                  <input name="buy" type="number" min="0" step="0.01" required />
                </label>
                <ArticleSellPriceField tax={createTax} />
              </div>
              <div className="form-row">
                <label>
                  TVA
                  <select name="tax" value={createTax} onChange={event => setCreateTax(event.target.value)}>
                    <option value="20">20 %</option>
                    <option value="10">10 %</option>
                    <option value="5.5">5,5 %</option>
                    <option value="0">0 %</option>
                  </select>
                </label>
                <label>
                  Puissance (W)
                  <input name="powerW" type="number" min="0" step="1" placeholder="Optionnel" />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Statut
                  <select name="status" defaultValue="Actif">
                    <option>Actif</option>
                    <option>Inactif</option>
                  </select>
                </label>
              </div>
              <div className="wizard-create-actions">
                <button className="wizard-primary" type="submit" disabled={saving || (!accessoryKind && !selectedBrand?.id)}>
                  <Plus size={16} /> {saving ? "Création…" : "Créer l’article"}
                </button>
              </div>
              {!accessoryKind && !selectedBrand?.id && (
                <p className="wizard-form-error">Cette marque n’est pas enregistrée. Créez-la dans l’onglet Marques.</p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
}
