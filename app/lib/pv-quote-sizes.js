/** Puissances proposées avant les groupes photovoltaïques d’un devis. */

export const PV_QUOTE_SIZES = [
  { id: "3-mono", kw: 3, kwLabel: "3 kW", phase: "mono", phaseLabel: "monophasé", panels: 6, columns: 3 },
  { id: "4.5-mono", kw: 4.5, kwLabel: "4,5 kW", phase: "mono", phaseLabel: "monophasé", panels: 9, columns: 3 },
  { id: "6-mono", kw: 6, kwLabel: "6 kW", phase: "mono", phaseLabel: "monophasé", panels: 12, columns: 6 },
  { id: "6-tri", kw: 6, kwLabel: "6 kW", phase: "tri", phaseLabel: "triphasé", panels: 12, columns: 6 },
  { id: "7.5-tri", kw: 7.5, kwLabel: "7,5 kW", phase: "tri", phaseLabel: "triphasé", panels: 15, columns: 5 },
  { id: "9-tri", kw: 9, kwLabel: "9 kW", phase: "tri", phaseLabel: "triphasé", panels: 18, columns: 6 },
];

export function pvQuoteSizeById(id) {
  return PV_QUOTE_SIZES.find(item => item.id === id) || null;
}

function plain(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/,/g, ".");
}

function bundleHay(bundle) {
  return plain([bundle?.name, bundle?.category, bundle?.subcategory, bundle?.family, bundle?.brand].filter(Boolean).join(" "));
}

function powerMatches(hay, size) {
  const kw = Number(size.kw);
  if (kw === 4.5) return /(?:^|[^0-9])4\.5\s*(?:kw|kilowatt)/.test(hay);
  if (kw === 7.5) return /(?:^|[^0-9])7\.5\s*(?:kw|kilowatt)/.test(hay);
  const token = String(kw);
  return new RegExp(`(?:^|[^0-9.])${token}\\s*(?:kw|kilowatt)`).test(hay);
}

function phaseMatches(hay, size) {
  const mono = hay.includes("mono");
  const tri = /(?:^|[^a-z])tri/.test(hay);
  if (size.phase === "mono") return mono && !tri;
  return tri;
}

export function bundleMatchesPvSize(bundle, size) {
  if (!bundle || !size) return false;
  const hay = bundleHay(bundle);
  if (!hay) return false;
  const category = plain(bundle.category || bundle.family || "");
  const otherTrade = /chauffage|climatis|ballon|vmc|isolation|radiateur/.test(category);
  const isPv = hay.includes("photovolta") || /\bpv\b/.test(` ${hay} `) || hay.includes("panneau");
  if (otherTrade && !isPv) return false;
  return powerMatches(hay, size) && phaseMatches(hay, size);
}
