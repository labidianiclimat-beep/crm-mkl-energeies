import { normalizeCatalogName, taxonomyNamesEqual } from "./article-taxonomy.js";
import { PICKER_SUBFAMILIES, articleMatchesBundleItem, buildBundleItemFromArticle, buildQuoteLineFromArticle } from "./article-picker.js";

function plain(value) {
  return normalizeCatalogName(value);
}

function articleName(article) {
  return plain(article?.name || article?.designation);
}

function articleSubcategory(article) {
  return article?.subcategory || article?.sous_categorie || "";
}

function articleCategory(article) {
  return plain(article?.category || article?.categorie);
}

export function radiatorTypeNames() {
  const family = (PICKER_SUBFAMILIES.Chauffage || []).find(item => item.name === "Radiateur électrique");
  return (family?.variants || [])
    .filter(item => plain(item.name) !== "accessoires")
    .flatMap(item => [item.name, ...(item.aliases || [])]);
}

export function isRadiatorAccessoryArticle(article) {
  if (!article) return false;
  const name = articleName(article);
  const category = articleCategory(article);
  if (category.startsWith("climatis") || category.startsWith("photovolta")) return false;
  const subcategory = articleSubcategory(article);
  if (taxonomyNamesEqual(subcategory, "Accessoires") || taxonomyNamesEqual(subcategory, "Accessoire")) {
    if (name.includes("pompe a chaleur") && !name.includes("radiateur")) return false;
    return category.startsWith("chauff") || category.includes("radiateur") || name.includes("radiateur") || name.includes("pied") || name.includes("roulette") || name.includes("tt-ks") || !category;
  }
  return (/\bpieds?\b/.test(` ${name} `) || name.includes("roulette")) && (name.includes("radiateur") || name.includes("tt-ks"));
}

export function isRadiatorInstallationArticle(article) {
  if (!article || isRadiatorAccessoryArticle(article)) return false;
  const name = articleName(article);
  const subcategory = plain(articleSubcategory(article));
  const category = articleCategory(article);
  if (category.startsWith("climatis") || category.startsWith("photovolta")) return false;
  if ((name.includes("pompe a chaleur") || /\bpac\b/.test(` ${name} `)) && !name.includes("radiateur")) return false;
  const labor = article.role === "labor"
    || name.includes("installation")
    || /\bpose\b/.test(` ${name} `)
    || subcategory === "installation"
    || subcategory === "pose";
  if (!labor) return false;
  if (name.includes("fourniture") && !name.includes("radiateur")) return false;
  return name.includes("radiateur") || name.includes("tt-ks") || name.includes("technotherm") || subcategory.includes("radiateur");
}

export function isRadiatorGroupInstallationLine(item) {
  if (!item || isRadiatorAccessoryArticle(item) || isRadiatorMachineArticle(item)) return false;
  if (isRadiatorInstallationArticle(item)) return true;
  const name = articleName(item);
  const subcategory = plain(articleSubcategory(item));
  return item.role === "labor"
    || name.includes("installation")
    || /\bpose\b/.test(` ${name} `)
    || subcategory === "installation"
    || subcategory === "pose";
}

export function isRadiatorMachineArticle(article) {
  if (!article || isRadiatorAccessoryArticle(article)) return false;
  const name = articleName(article);
  const subcategory = articleSubcategory(article);
  if (name.includes("installation") || /\bpose\b/.test(` ${name} `)) return false;
  if (radiatorTypeNames().some(alias => taxonomyNamesEqual(subcategory, alias))) return true;
  const hay = ` ${plain(`${articleCategory(article)} ${subcategory} ${name}`)} `;
  if (hay.includes(" pompe a chaleur ") || /\bpac\b/.test(hay)) return false;
  return /\bradiateur\b/.test(hay);
}

export function isRadiatorBundle(bundle = {}) {
  const subcategory = bundle.subcategory || bundle.family || "";
  const category = bundle.category || "";
  if (taxonomyNamesEqual(subcategory, "Radiateur électrique") || taxonomyNamesEqual(category, "Radiateur électrique")) return true;
  if (radiatorTypeNames().some(name => taxonomyNamesEqual(subcategory, name) || taxonomyNamesEqual(category, name))) return true;
  return (bundle.items || []).some(isRadiatorMachineArticle);
}

function isActiveArticle(article) {
  return Boolean(article) && article.status !== "Inactif" && article.active !== false;
}

export function isRadiatorFootOrWheel(article) {
  if (!article || isRadiatorMachineArticle(article)) return false;
  const name = ` ${articleName(article)} `;
  return /\bpieds?\b/.test(name) || /\broulettes?\b/.test(name);
}

export function radiatorFootAndWheelChoices(articles = []) {
  const seen = new Set();
  return (articles || [])
    .filter(article => isActiveArticle(article) && isRadiatorFootOrWheel(article))
    .filter(article => {
      const key = String(article.id || article.code || article.name || "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => {
      const rank = article => (articleName(article).includes("roulette") ? 1 : 0);
      return rank(left) - rank(right) || String(left.name || "").localeCompare(String(right.name || ""), "fr");
    });
}

export function radiatorAccessoryChoices(articles = []) {
  return (articles || [])
    .filter(article => isActiveArticle(article) && isRadiatorAccessoryArticle(article))
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "fr"));
}

function bundleCoversArticle(bundle, article) {
  return (bundle?.items || []).some(item => (
    (item.role || "principal") === "principal" && articleMatchesBundleItem(article, item)
  ));
}

export function radiatorBundleDrafts(articles = [], bundles = []) {
  return (articles || []).filter(isRadiatorMachineArticle).flatMap(article => {
    if ((bundles || []).some(bundle => bundleCoversArticle(bundle, article))) return [];
    const items = [buildBundleItemFromArticle(article, { role: "principal", qty: 1 })];
    const subcategory = article.subcategory || article.sous_categorie || "Radiateur électrique";
    return [{
      name: String(article.name || article.designation || article.code || "").trim(),
      category: "Chauffage",
      subcategory,
      brand: article.brand || article.marque || "",
      family: subcategory,
      items,
      active: true,
      status: "Actif",
    }];
  }).filter(draft => draft.name);
}

export function radiatorInstallationArticle(articles = []) {
  const matches = (articles || []).filter(article => isActiveArticle(article) && isRadiatorInstallationArticle(article));
  return matches.find(article => articleName(article).includes("radiateur")) || matches[0] || null;
}

function lineQty(item) {
  const qty = Number(item?.qty);
  return Number.isFinite(qty) ? qty : 0;
}

export function arrangeRadiatorBundleItems(items = [], articles = [], { accessoryId } = {}) {
  const radiators = [];
  const extras = [];
  const accessories = [];
  const installations = [];
  for (const item of items || []) {
    if (isRadiatorMachineArticle(item)) radiators.push({ ...item, role: "principal" });
    else if (isRadiatorAccessoryArticle(item)) accessories.push(item);
    else if (isRadiatorGroupInstallationLine(item)) installations.push({ ...item, role: "labor" });
    else extras.push(item);
  }

  let accessory = accessories[0] ? { ...accessories[0], role: "supply" } : null;
  if (accessoryId !== undefined) {
    accessory = null;
    if (accessoryId) {
      const article = (articles || []).find(row => String(row.id || row.code || "") === String(accessoryId));
      if (article && isRadiatorAccessoryArticle(article)) {
        const previous = accessories.find(item => articleMatchesBundleItem(article, item));
        const built = buildBundleItemFromArticle(article, { role: "supply", qty: previous?.qty || 1 });
        accessory = { ...built, qty: lineQty(previous) > 0 ? previous.qty : built.qty };
      }
    }
  }

  let installation = installations[0] || null;
  const catalogInstall = radiatorInstallationArticle(articles);
  if (!installation && catalogInstall && radiators.length) {
    installation = buildBundleItemFromArticle(catalogInstall, { role: "labor", qty: 1 });
  }
  if (installation && radiators.length) {
    const qty = radiators.reduce((sum, item) => sum + lineQty(item), 0);
    if (qty > 0) installation = { ...installation, role: "labor", qty };
  }

  return [
    ...radiators,
    ...(accessory ? [accessory] : []),
    ...extras,
    ...(installation ? [installation] : []),
  ];
}

function radiatorQuoteInstallation(line, bundleIds) {
  if (!line || isRadiatorMachineArticle(line) || isRadiatorFootOrWheel(line)) return false;
  if (isRadiatorInstallationArticle(line)) return true;
  return Boolean(line.bundleId && bundleIds.has(String(line.bundleId)) && isRadiatorGroupInstallationLine(line));
}

function accessoryForRadiator(lines, radiator) {
  return (lines || []).find(line => (
    isRadiatorFootOrWheel(line)
    && line.radiatorFor != null
    && String(line.radiatorFor) === String(radiator.id)
  )) || null;
}

export function foldRadiatorQuoteLines(lines = [], articles = [], { assign } = {}) {
  const list = (lines || []).map(line => ({ ...line }));
  const radiators = list.filter(isRadiatorMachineArticle);
  if (!radiators.length) return lines;
  const bundleIds = new Set(radiators.map(line => line.bundleId).filter(value => value != null && String(value).trim()).map(String));
  const blocks = radiators.map(radiator => {
    let source = accessoryForRadiator(list, radiator);
    if (!source) {
      const next = list[list.indexOf(radiator) + 1];
      if (next && isRadiatorFootOrWheel(next) && next.radiatorFor == null) source = next;
    }
    let accessory = source ? { ...source, radiatorFor: radiator.id } : null;
    if (assign && String(assign.radiatorId) === String(radiator.id)) {
      if (!assign.article) {
        accessory = null;
      } else {
        const built = buildQuoteLineFromArticle(assign.article, {
          qty: lineQty(source) > 0 ? source.qty : lineQty(radiator) || 1,
          tax: assign.article.tax,
        }, { tax: assign.article.tax ?? 10 });
        accessory = {
          ...built,
          id: source?.id || `pied-${radiator.id}`,
          radiatorFor: radiator.id,
          bundleId: radiator.bundleId || source?.bundleId || null,
          bundleName: radiator.bundleName || source?.bundleName || "",
          qty: lineQty(source) > 0 ? source.qty : lineQty(radiator) || 1,
        };
      }
    }
    return { radiator, accessory, source };
  });
  const consumed = new Set();
  for (const block of blocks) {
    consumed.add(block.radiator);
    if (block.source) consumed.add(block.source);
  }
  let installation = list.find(line => radiatorQuoteInstallation(line, bundleIds)) || null;
  const catalogInstall = radiatorInstallationArticle(articles);
  if (!installation && catalogInstall) {
    const built = buildQuoteLineFromArticle(catalogInstall, { qty: 1, tax: catalogInstall.tax }, { tax: catalogInstall.tax ?? 10 });
    installation = {
      ...built,
      id: `inst-${radiators[0].id}`,
      bundleId: radiators[0].bundleId || null,
      bundleName: radiators[0].bundleName || "",
    };
  }
  if (installation) {
    const qty = radiators.reduce((sum, line) => sum + lineQty(line), 0);
    if (qty > 0) installation = { ...installation, qty, role: "labor" };
  }
  const blockLines = [];
  for (const block of blocks) {
    blockLines.push(block.radiator);
    if (block.accessory) blockLines.push(block.accessory);
  }
  if (installation) blockLines.push(installation);
  for (const line of list) {
    if (radiatorQuoteInstallation(line, bundleIds)) consumed.add(line);
  }
  let inserted = false;
  const output = [];
  for (const line of list) {
    if (consumed.has(line)) {
      if (!inserted) {
        output.push(...blockLines);
        inserted = true;
      }
      continue;
    }
    output.push(line);
  }
  return output;
}

export function syncRadiatorQuoteLines(lines = []) {
  const next = (lines || []).map(line => ({ ...line }));
  const groups = new Map();
  next.forEach((line, index) => {
    const key = line?.bundleId != null && String(line.bundleId).trim() ? String(line.bundleId) : "";
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });
  for (const indexes of groups.values()) {
    const radiatorIndexes = indexes.filter(index => isRadiatorMachineArticle(next[index]));
    const installIndexes = indexes.filter(index => isRadiatorGroupInstallationLine(next[index]));
    if (!radiatorIndexes.length || !installIndexes.length) continue;
    const qty = radiatorIndexes.reduce((sum, index) => sum + lineQty(next[index]), 0);
    if (qty <= 0) continue;
    const keep = installIndexes[0];
    if (Number(next[keep].qty) !== qty) next[keep] = { ...next[keep], qty };
  }
  return next;
}
