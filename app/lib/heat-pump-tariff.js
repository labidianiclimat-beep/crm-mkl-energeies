import { jsPDF } from "jspdf";
import { findPickerFamily, formatArticlePower, pickerAccessoryKind } from "./article-picker.js";
import { companyDisplayName, DEFAULT_COMPANY } from "./company.js";
import { euro, loadPrintLogo } from "./devis-pdf.js";
import { pdfFilename, printPdfBlob, reservePdfTab, triggerBlobDownload } from "./html-to-pdf.js";
import { defaultHeatPumpWarranty, isHeatPumpPath, parseHeatPumpDescription } from "./heat-pump-specs.js";

const BLUE = [64, 95, 174];
const GOLD = [255, 219, 98];
const INK = [31, 45, 79];
const MUTED = [125, 135, 153];
const LINE = [228, 231, 238];
const PAGE_W = 297;
const MX = 14;
const MY = 12;
const FOOTER_Y = 200;
const CONTENT_BOTTOM = 190;
const LOGO_W = 52;
const LOGO_H = 52 * (551 / 1446);
const INNER_W = PAGE_W - MX * 2;

const BASE_COLS = [
  { key: "name", label: "Modèle", w: 80 },
  { key: "code", label: "Réf.", w: 42 },
  { key: "power", label: "P. -7 / +35", w: 32 },
  { key: "scop", label: "SCOP", w: 30 },
  { key: "energy", label: "Classe", w: 28 },
  { key: "ht", label: "P.U HT", w: 28, align: "right" },
  { key: "ttc", label: "P.U TTC", w: 29, align: "right" },
];

export const TARIFF_SECTION_LABELS = {
  simple: "Pompes à chaleur",
  simpleMono: "Pompes à chaleur monophasé",
  simpleTri: "Pompes à chaleur triphasé",
  duo: "Pompes à chaleur Duo",
  duoMono: "Pompes à chaleur Duo monophasé",
  duoTri: "Pompes à chaleur Duo triphasé",
};

export const TARIFF_FAMILIES = [
  {
    id: "pac",
    family: "Pompe à chaleur",
    title: brand => `Pompes à chaleur ${brand}`,
    intro: (count, brand) => `${count} pompe${count > 1 ? "s" : ""} à chaleur ${brand} — monophasé puis triphasé, de la plus petite à la plus grande puissance, puis les Duo.`,
    empty: brand => `Aucun modèle ${brand} enregistré pour le moment.`,
    hint: "Monophasé puis triphasé, de la plus petite à la plus grande puissance, puis les Duo.",
    countLabels: { simples: "PAC mono", tris: "PAC tri", duos: "PAC Duo" },
    sectionLabels: { ...TARIFF_SECTION_LABELS },
    cols: BASE_COLS,
  },
  {
    id: "ballon",
    family: "Ballon d’eau chaude",
    title: brand => `Ballons d’eau chaude ${brand}`,
    intro: (count, brand) => `${count} ballon${count > 1 ? "s" : ""} thermodynamique${count > 1 ? "s" : ""} ${brand} — monophasé puis triphasé, de la plus petite à la plus grande capacité.`,
    empty: brand => `Aucun ballon thermodynamique ${brand} enregistré pour le moment.`,
    hint: "Monophasé puis triphasé, de la plus petite à la plus grande capacité.",
    countLabels: { simples: "Mono", tris: "Tri", duos: "—" },
    sectionLabels: {
      simple: "Ballons thermodynamiques",
      simpleMono: "Ballons thermodynamiques monophasé",
      simpleTri: "Ballons thermodynamiques triphasé",
      duo: "Ballons thermodynamiques",
      duoMono: "Ballons thermodynamiques monophasé",
      duoTri: "Ballons thermodynamiques triphasé",
    },
    cols: BASE_COLS.map(col => (
      col.key === "power" ? { ...col, label: "Capacité" }
        : col.key === "scop" ? { ...col, label: "COP" }
        : col
    )),
  },
  {
    id: "clim",
    family: "Climatisation",
    title: brand => `Climatisation ${brand}`,
    intro: (count, brand) => `${count} climatisation${count > 1 ? "s" : ""} ${brand} — monophasé puis triphasé, splits puis multi-splits.`,
    empty: brand => `Aucun modèle ${brand} enregistré pour le moment.`,
    hint: "Monophasé puis triphasé, splits puis multi-splits, de la plus petite à la plus grande puissance.",
    countLabels: { simples: "Splits mono", tris: "Splits tri", duos: "Multi-splits" },
    sectionLabels: {
      simple: "Climatisation",
      simpleMono: "Climatisation monophasé",
      simpleTri: "Climatisation triphasé",
      duo: "Climatisation multi-split",
      duoMono: "Climatisation multi-split monophasé",
      duoTri: "Climatisation multi-split triphasé",
    },
    cols: BASE_COLS.map(col => (
      col.key === "power" ? { ...col, label: "Puissance" }
        : col.key === "scop" ? { ...col, label: "SEER" }
        : col
    )),
  },
  {
    id: "pv",
    family: "Photovoltaïque",
    title: brand => `Photovoltaïque ${brand}`,
    intro: (count, brand) => `${count} article${count > 1 ? "s" : ""} photovoltaïque${count > 1 ? "s" : ""} ${brand} — monophasé puis triphasé, panneaux puis onduleurs.`,
    empty: brand => `Aucun modèle ${brand} enregistré pour le moment.`,
    hint: "Monophasé puis triphasé, panneaux puis onduleurs, de la plus petite à la plus grande puissance.",
    countLabels: { simples: "Panneaux mono", tris: "Panneaux tri", duos: "Onduleurs" },
    sectionLabels: {
      simple: "Panneaux photovoltaïques",
      simpleMono: "Panneaux photovoltaïques monophasé",
      simpleTri: "Panneaux photovoltaïques triphasé",
      duo: "Onduleurs",
      duoMono: "Onduleurs monophasé",
      duoTri: "Onduleurs triphasé",
    },
    cols: BASE_COLS.map(col => (
      col.key === "power" ? { ...col, label: "Puissance" }
        : col.key === "scop" ? { ...col, label: "Type" }
        : col
    )),
  },
];

const FAMILY_BY_ID = Object.fromEntries(TARIFF_FAMILIES.map(family => [family.id, family]));

function pdfLatin(value) {
  return String(value ?? "").replace(/[\u00a0\u202f\u2007\u2009]/g, " ");
}

function latinKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function isAtlanticBrand(value) {
  return /atlantic/i.test(String(value || "").trim());
}

function articleIsActive(article) {
  if (!article) return false;
  if (article.active === false || article.actif === false) return false;
  if (article.status === "Inactif") return false;
  return true;
}

function specsOf(article) {
  return parseHeatPumpDescription(article?.description || article?.technicalDescription || "");
}

export function articleTariffBrand(article) {
  const specs = specsOf(article);
  return String(article?.brand || specs.brand || "").trim();
}

function sameBrand(article, brand) {
  const left = latinKey(articleTariffBrand(article));
  const right = latinKey(brand);
  if (right === "sans marque") return !left;
  if (!right) return !left;
  if (!left) return false;
  return left === right;
}

function pickerFamilyName(article) {
  return findPickerFamily(article?.category)?.name || findPickerFamily(article?.subcategory)?.name || "";
}

export function isBallonThermodynamiqueArticle(article) {
  if (!article || pickerAccessoryKind(article)) return false;
  const category = article.category || article.categorie || "";
  const subcategory = article.subcategory || article.sous_categorie || "";
  if (pickerFamilyName(article) === "Ballon d’eau chaude" || findPickerFamily(subcategory)?.name === "Ballon d’eau chaude") return true;
  const hay = latinKey([category, subcategory, article.name, article.code, article.designation].join(" "));
  if (/ballon/.test(hay) && /thermo|eau chaude|\becs\b/.test(hay)) return true;
  if (/(calypso|odyssee|egeo)/.test(hay) && !/pompe|\bpac\b|alfea|excellia/.test(hay)) return true;
  return false;
}

export function isHeatPumpDuoArticle(article) {
  return /(?:^|[^a-z0-9])duo(?:[^a-z0-9]|$)/i.test(
    latinKey([article?.subcategory, article?.name, article?.code, article?.designation].join(" "))
  );
}

export function isClimatisationMultiArticle(article) {
  return /(?:^|[^a-z0-9])(multi|bi[-\s]?split|tri[-\s]?split|quadri|dual)(?:[^a-z0-9]|$)/i.test(
    latinKey([article?.subcategory, article?.name, article?.code, article?.designation].join(" "))
  );
}

export function isPhotovoltaicInverterArticle(article) {
  return /ondul|inverter|micro[-\s]?ondu/.test(
    latinKey([article?.subcategory, article?.name, article?.code, article?.designation].join(" "))
  );
}

function isAirAirArticle(article) {
  const hay = latinKey([article?.category, article?.subcategory, article?.name, article?.code].join(" "));
  if (/air\s*\/\s*eau/.test(hay)) return false;
  return /air\s*\/\s*air|climatis/.test(hay);
}

export function isHeatPumpModelArticle(article) {
  if (!article || pickerAccessoryKind(article)) return false;
  if (isBallonThermodynamiqueArticle(article) || isClimatisationModelArticle(article)) return false;
  if (pickerFamilyName(article) === "Photovoltaïque") return false;
  const specs = specsOf(article);
  return (
    isHeatPumpPath({
      category: article.category,
      subcategory: article.subcategory,
      sourceReference: article.sourceReference,
    }) || specs.matched > 0
  );
}

export function isAtlanticHeatPumpArticle(article) {
  return isHeatPumpModelArticle(article) && isAtlanticBrand(articleTariffBrand(article));
}

export function isClimatisationModelArticle(article) {
  if (!article || pickerAccessoryKind(article)) return false;
  if (isBallonThermodynamiqueArticle(article)) return false;
  if (pickerFamilyName(article) === "Climatisation") return true;
  return isAirAirArticle(article);
}

export function isPhotovoltaicModelArticle(article) {
  if (!article || pickerAccessoryKind(article)) return false;
  return pickerFamilyName(article) === "Photovoltaïque";
}

function modelMatcher(familyId) {
  if (familyId === "clim") return isClimatisationModelArticle;
  if (familyId === "pv") return isPhotovoltaicModelArticle;
  if (familyId === "ballon") return isBallonThermodynamiqueArticle;
  return isHeatPumpModelArticle;
}

function variantMatcher(familyId) {
  if (familyId === "clim") return isClimatisationMultiArticle;
  if (familyId === "pv") return isPhotovoltaicInverterArticle;
  if (familyId === "ballon") return () => false;
  return isHeatPumpDuoArticle;
}

export function atlanticHeatPumpArticles(articles = [], { includeInactive = false } = {}) {
  return (articles || [])
    .filter(article => isAtlanticHeatPumpArticle(article))
    .filter(article => includeInactive || articleIsActive(article));
}

function accessoryTariffFamily(article) {
  if (!article || !pickerAccessoryKind(article)) return "";
  const family = pickerFamilyName(article);
  if (family === "Climatisation") return "clim";
  if (family === "Photovoltaïque") return "pv";
  if (family === "Ballon d’eau chaude") return "ballon";
  const hay = latinKey([article.category, article.subcategory, article.name, article.code].join(" "));
  if (/photo|photovolta|\bpv\b|panneau|ondul/.test(hay)) return "pv";
  if (/climatis|\bsplit\b|\bclim\b/.test(hay)) return "clim";
  if (/ballon|thermo/.test(hay)) return "ballon";
  if (family === "Chauffage" || /pompe|\bpac\b|chauffage/.test(hay)) return "pac";
  return "";
}

function isFamilyAccessory(article, familyId, brand) {
  if (accessoryTariffFamily(article) !== familyId) return false;
  const articleBrand = articleTariffBrand(article);
  if (!articleBrand) return true;
  return sameBrand(article, brand);
}

export function atlanticHeatPumpAccessories(articles = [], kind, { includeInactive = false } = {}) {
  return (articles || [])
    .filter(article => pickerAccessoryKind(article) === kind && isFamilyAccessory(article, "pac", "Atlantic"))
    .filter(article => includeInactive || articleIsActive(article));
}

function powerSortKey(value) {
  const parsed = parseFloat(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 9999;
}

export function articleElectricalPhase(article) {
  const specs = specsOf(article);
  const hay = latinKey([
    specs.powerSupply,
    article?.powerSupply,
    article?.name,
    article?.code,
    article?.designation,
    article?.description,
    article?.technicalDescription,
  ].join(" "));
  if (/400\s*v|triphas|3\s*n\s*~|3~/.test(hay)) return "tri";
  if (/(?:^|[^a-z0-9])tri(?:phas\w*)?(?:[^a-z0-9]|$)/.test(hay) && !/tri[\s-]?split/.test(hay)) return "tri";
  return "mono";
}

function powerLabel(article, familyId) {
  if (familyId === "pac") {
    const specs = specsOf(article);
    const fromSpecs = String(specs.powerMinus7_35 || "").trim();
    if (fromSpecs) return fromSpecs;
    if (article.powerW) return `${Number(article.powerW) / 1000} kW`.replace(".", ",");
    return "";
  }
  if (familyId === "pv") {
    const watts = Number(article.powerW || 0);
    if (watts > 0 && watts < 1000) return `${watts} Wc`;
  }
  return formatArticlePower(article) || "";
}

function specLabel(article, familyId) {
  if (familyId === "pac") return String(specsOf(article).scop || "").trim();
  if (familyId === "clim") {
    const match = String(article.description || article.technicalDescription || "").match(/seer\s*[:\s]*([\d.,]+)/i);
    return match ? match[1] : "";
  }
  if (familyId === "pv") return isPhotovoltaicInverterArticle(article) ? "Onduleur" : "Panneau";
  if (familyId === "ballon") return String(specsOf(article).scop || "").trim();
  return "";
}

function energyLabel(article, familyId) {
  if (familyId === "pac" || familyId === "clim" || familyId === "ballon") return String(specsOf(article).energyClass || "").trim();
  return "";
}

function articleToTariffRow(article, section, family = FAMILY_BY_ID.pac) {
  const labels = family.sectionLabels || TARIFF_SECTION_LABELS;
  const ht = Number(article.sell || article.prix_vente_ht || 0);
  const tax = Number(article.tax ?? article.taux_tva ?? 20);
  const ttc = ht * (1 + (Number.isFinite(tax) ? tax : 20) / 100);
  const modelSection = /^(simple|duo)/.test(section);
  const phase = modelSection ? articleElectricalPhase(article) : "";
  return {
    id: article.id,
    section,
    phase,
    sectionLabel: labels[section] || section,
    name: String(article.name || "").trim() || labels[section] || "Article",
    code: String(article.code || "").trim() || "—",
    power: modelSection ? (powerLabel(article, family.id) || "—") : "—",
    scop: modelSection ? (specLabel(article, family.id) || "—") : "—",
    energy: modelSection ? (energyLabel(article, family.id) || "—") : "—",
    tax: Number.isFinite(tax) ? tax : 20,
    ht,
    ttc,
    htLabel: euro(ht),
    ttcLabel: euro(ttc),
  };
}

function sortModelRows(rows) {
  return [...rows].sort((a, b) => powerSortKey(a.power) - powerSortKey(b.power) || a.name.localeCompare(b.name, "fr"));
}

function activeArticles(articles, includeInactive) {
  return (articles || []).filter(article => includeInactive || articleIsActive(article));
}

export function tariffSectionsFor(articles = [], grid = {}, options = {}) {
  const family = FAMILY_BY_ID[grid.familyId] || FAMILY_BY_ID.pac;
  const brand = grid.brand || "Atlantic";
  const isModel = modelMatcher(family.id);
  const isVariant = variantMatcher(family.id);
  const pool = activeArticles(articles, options.includeInactive);
  const models = pool.filter(article => isModel(article) && sameBrand(article, brand));
  const simpleRows = models.filter(article => !isVariant(article));
  const duoRows = models.filter(article => isVariant(article));
  const simpleMono = sortModelRows(
    simpleRows
      .filter(article => articleElectricalPhase(article) !== "tri")
      .map(article => articleToTariffRow(article, "simpleMono", family))
  );
  const simpleTri = sortModelRows(
    simpleRows
      .filter(article => articleElectricalPhase(article) === "tri")
      .map(article => articleToTariffRow(article, "simpleTri", family))
  );
  const duoMono = sortModelRows(
    duoRows
      .filter(article => articleElectricalPhase(article) !== "tri")
      .map(article => articleToTariffRow(article, "duoMono", family))
  );
  const duoTri = sortModelRows(
    duoRows
      .filter(article => articleElectricalPhase(article) === "tri")
      .map(article => articleToTariffRow(article, "duoTri", family))
  );
  const simples = [...simpleMono, ...simpleTri];
  const duos = [...duoMono, ...duoTri];
  const supplies = pool
    .filter(article => pickerAccessoryKind(article) === "fourniture" && isFamilyAccessory(article, family.id, brand))
    .map(article => articleToTariffRow(article, "supply", family))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const labors = pool
    .filter(article => pickerAccessoryKind(article) === "installation" && isFamilyAccessory(article, family.id, brand))
    .map(article => articleToTariffRow(article, "labor", family))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return { simples, duos, simpleMono, simpleTri, duoMono, duoTri, supplies, labors };
}

export function heatPumpTariffSections(articles = [], options = {}) {
  return tariffSectionsFor(articles, { familyId: "pac", brand: "Atlantic" }, options);
}

export function heatPumpTariffRows(articles = [], options = {}) {
  const sections = heatPumpTariffSections(articles, options);
  return [...sections.simples, ...sections.duos];
}

function brandSlug(brand) {
  return latinKey(brand).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sans-marque";
}

function preferredBrandLabel(articles) {
  const counts = new Map();
  for (const article of articles) {
    const name = articleTariffBrand(article);
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))[0]?.[0] || "";
}

function gridFromSections(family, brand, sections) {
  const modelCount = sections.simples.length + sections.duos.length;
  return {
    id: `${family.id}-${brandSlug(brand)}`,
    familyId: family.id,
    title: family.title(brand),
    brand,
    family: family.family,
    ready: modelCount > 0,
    filename: `grille-tarifaire-${family.id}-${brandSlug(brand)}`,
    hint: family.hint,
    countLabels: family.countLabels,
    counts: {
      simples: sections.simpleMono.length,
      tris: sections.simpleTri.length,
      duos: sections.duos.length,
    },
  };
}

export function preparedTariffGrids(articles = []) {
  const pool = activeArticles(articles, false);
  const grids = [];
  for (const family of TARIFF_FAMILIES) {
    const isModel = modelMatcher(family.id);
    const models = pool.filter(isModel);
    const groups = new Map();
    for (const article of models) {
      const brand = articleTariffBrand(article) || "Sans marque";
      const key = latinKey(brand);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(article);
    }
    const brands = [...groups.entries()]
      .map(([, group]) => preferredBrandLabel(group))
      .sort((a, b) => a.localeCompare(b, "fr"));
    for (const brand of brands) {
      const sections = tariffSectionsFor(articles, { familyId: family.id, brand });
      const grid = gridFromSections(family, brand, sections);
      if (grid.ready) grids.push(grid);
    }
  }
  const productOrder = { pac: 0, clim: 1, ballon: 2, pv: 3 };
  return grids.sort((a, b) => a.brand.localeCompare(b.brand, "fr") || (productOrder[a.familyId] ?? 9) - (productOrder[b.familyId] ?? 9));
}

export function findPreparedTariffGrid(articles = [], gridId = "") {
  return preparedTariffGrids(articles).find(grid => grid.id === gridId) || null;
}

function imageFormat(data) {
  const value = String(data || "");
  if (value.startsWith("data:image/jpeg") || value.startsWith("data:image/jpg")) return "JPEG";
  return "PNG";
}

function colXs(cols = BASE_COLS) {
  let x = MX;
  return cols.map(col => {
    const start = x;
    x += col.w;
    return { ...col, x: start };
  });
}

function drawLogo(pdf, logoData, x, y) {
  if (!logoData || !String(logoData).startsWith("data:")) return;
  try {
    pdf.addImage(logoData, imageFormat(logoData), x, y, LOGO_W, LOGO_H);
  } catch {
    /* logo optionnel */
  }
}

export async function buildTariffGridPdfBlob(articles = [], grid = {}, {
  logoData = "",
  company = DEFAULT_COMPANY,
  date = new Date(),
  includeInactive = false,
} = {}) {
  const family = FAMILY_BY_ID[grid.familyId] || FAMILY_BY_ID.pac;
  const brand = grid.brand || "Atlantic";
  const subtitle = grid.title || family.title(brand);
  const labels = family.sectionLabels || TARIFF_SECTION_LABELS;
  const cols = family.cols || BASE_COLS;
  const sections = tariffSectionsFor(articles, { familyId: family.id, brand }, { includeInactive });
  const ordered = [
    ["simpleMono", sections.simpleMono],
    ["simpleTri", sections.simpleTri],
    ["duoMono", sections.duoMono],
    ["duoTri", sections.duoTri],
  ];
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const companyName = companyDisplayName(company) || "MKL Énergies";
  const dateLabel = (date instanceof Date ? date : new Date(date)).toLocaleDateString("fr-FR");
  const title = "GRILLE TARIFAIRE";
  let y = MY;
  let page = 1;

  const drawHeader = (continued = false) => {
    drawLogo(pdf, logoData, MX, MY);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.setTextColor(...BLUE);
    pdf.text(continued ? `${title} — Suite` : title, PAGE_W - MX, MY + 6, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(...INK);
    pdf.text(pdfLatin(subtitle), PAGE_W - MX, MY + 12, { align: "right" });
    pdf.text(`Catalogue au ${dateLabel}`, PAGE_W - MX, MY + 17, { align: "right" });
    const lineY = Math.max(MY + LOGO_H + 3, MY + 20);
    pdf.setDrawColor(...BLUE);
    pdf.setLineWidth(0.25);
    pdf.line(MX, lineY, PAGE_W - MX, lineY);
    pdf.setDrawColor(...GOLD);
    pdf.setLineWidth(0.45);
    pdf.line(MX, lineY + 0.7, PAGE_W - MX, lineY + 0.7);
    y = lineY + 6;
  };

  const drawFooter = (current, total) => {
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.3);
    pdf.line(MX, FOOTER_Y - 4, PAGE_W - MX, FOOTER_Y - 4);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...MUTED);
    pdf.text(companyName, MX, FOOTER_Y);
    pdf.text("Document interne — tarifs extraits des fiches articles", PAGE_W / 2, FOOTER_Y, { align: "center" });
    pdf.text(`Page ${current}/${total}`, PAGE_W - MX, FOOTER_Y, { align: "right" });
  };

  const drawColHead = () => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...MUTED);
    colXs(cols).forEach(col => {
      const tx = col.align === "right" ? col.x + col.w - 1.2 : col.x + 1.2;
      pdf.text(col.label, tx, y + 3.8, col.align === "right" ? { align: "right" } : undefined);
    });
    pdf.setDrawColor(...BLUE);
    pdf.setLineWidth(0.35);
    pdf.line(MX, y + 5.6, PAGE_W - MX, y + 5.6);
    y += 7;
  };

  const newPage = (withCols = false) => {
    pdf.addPage();
    page += 1;
    drawHeader(true);
    if (withCols) drawColHead();
  };

  const drawSectionTitle = label => {
    if (y + 22 > CONTENT_BOTTOM) newPage(false);
    y += 3;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(...BLUE);
    pdf.text(pdfLatin(label), MX, y + 3.6);
    pdf.setDrawColor(...GOLD);
    pdf.setLineWidth(0.35);
    pdf.line(MX, y + 5.4, PAGE_W - MX, y + 5.4);
    y += 7;
    drawColHead();
  };

  const drawRow = (row, index) => {
    const drawn = colXs(cols);
    const nameLines = pdf.splitTextToSize(pdfLatin(row.name), drawn[0].w - 2.4);
    const codeLines = pdf.splitTextToSize(pdfLatin(row.code), drawn[1].w - 2.4);
    const lineCount = Math.max(nameLines.length, codeLines.length, 1);
    const h = Math.max(9, 4 + lineCount * 3.6);
    if (y + h > CONTENT_BOTTOM) newPage(true);
    if (index % 2 === 0) {
      pdf.setFillColor(247, 249, 254);
      pdf.rect(MX, y, INNER_W, h, "F");
    }
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.2);
    pdf.line(MX, y + h, PAGE_W - MX, y + h);
    const cells = [
      { ...drawn[0], lines: nameLines, bold: true, color: INK },
      { ...drawn[1], lines: codeLines, color: [83, 96, 119] },
      { ...drawn[2], lines: [pdfLatin(row.power)], color: INK },
      { ...drawn[3], lines: [pdfLatin(row.scop)], color: INK },
      { ...drawn[4], lines: [pdfLatin(row.energy)], color: INK },
      { ...drawn[5], lines: [row.htLabel], color: INK },
      { ...drawn[6], lines: [row.ttcLabel], color: INK },
    ];
    cells.forEach(cell => {
      pdf.setFont("helvetica", cell.bold ? "bold" : "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(...cell.color);
      cell.lines.forEach((line, i) => {
        const tx = cell.align === "right" ? cell.x + cell.w - 1.2 : cell.x + 1.2;
        pdf.text(line, tx, y + 4.4 + i * 3.6, cell.align === "right" ? { align: "right" } : undefined);
      });
    });
    y += h;
  };

  drawHeader(false);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...MUTED);
  const modelCount = sections.simples.length + sections.duos.length;
  const intro = modelCount ? family.intro(modelCount, brand) : family.empty(brand);
  pdf.text(pdfLatin(intro), MX, y);
  y += 5;

  ordered.forEach(([section, rows]) => {
    if (!rows.length) return;
    drawSectionTitle(labels[section]);
    rows.forEach((row, index) => drawRow(row, index));
  });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...MUTED);
  const notes = [
    "Prix unitaires issus des fiches articles (vente HT). Le TTC applique le taux de TVA de chaque modèle.",
  ];
  if (family.id === "pac") notes.push(pdfLatin(defaultHeatPumpWarranty(brand).replace(/\n/g, " ")));
  const noteLines = notes.flatMap(line => pdf.splitTextToSize(line, INNER_W));
  const noteH = 3 + noteLines.length * 3.2;
  if (y + noteH > CONTENT_BOTTOM && y + 8 > CONTENT_BOTTOM) newPage(false);
  noteLines.forEach((line, index) => {
    const ty = y + 4 + index * 3.2;
    if (ty > CONTENT_BOTTOM) return;
    pdf.text(line, MX, ty);
  });

  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    pdf.setPage(i);
    drawFooter(i, total);
  }

  return new Blob([pdf.output("arraybuffer")], { type: "application/pdf" });
}

export async function buildHeatPumpTariffPdfBlob(articles = [], options = {}) {
  return buildTariffGridPdfBlob(articles, {
    id: "pac-atlantic",
    familyId: "pac",
    brand: "Atlantic",
    title: "Pompes à chaleur Atlantic",
  }, options);
}

export async function downloadTariffGrid(articles = [], grid, { toast, company = DEFAULT_COMPANY, download, print = false } = {}) {
  if (!grid?.familyId) {
    toast?.("Aucune grille tarifaire à télécharger.");
    return false;
  }
  const sections = tariffSectionsFor(articles, grid);
  if (!sections.simples.length && !sections.duos.length) {
    toast?.(`Aucun article ${grid.family || ""} ${grid.brand || ""} dans le catalogue.`.replace(/\s+/g, " ").trim());
    return false;
  }
  const tab = print || typeof download === "function" ? null : reservePdfTab();
  try {
    const logoData = await loadPrintLogo();
    const blob = await buildTariffGridPdfBlob(articles, grid, { logoData, company });
    const filename = grid.filename || `grille-tarifaire-${grid.familyId || "pac"}-${brandSlug(grid.brand || "")}`;
    if (print) {
      printPdfBlob(blob);
    } else if (typeof download === "function") {
      download(blob, `${filename}.pdf`);
    } else {
      triggerBlobDownload(blob, pdfFilename(filename), tab);
    }
  } catch (error) {
    try { tab?.close(); } catch { /* ignore */ }
    throw error;
  }
  toast?.(print ? `Impression de ${grid.title || "la grille"}.` : `Grille tarifaire ${grid.title || grid.brand} ouverte.`);
  return true;
}

export async function downloadAtlanticHeatPumpTariff(articles = [], options = {}) {
  const grid = preparedTariffGrids(articles).find(item => item.id === "pac-atlantic") || {
    id: "pac-atlantic",
    familyId: "pac",
    brand: "Atlantic",
    family: "Pompe à chaleur",
    title: "Pompes à chaleur Atlantic",
    filename: "grille-tarifaire-pac-atlantic",
    ready: true,
  };
  return downloadTariffGrid(articles, grid, options);
}
