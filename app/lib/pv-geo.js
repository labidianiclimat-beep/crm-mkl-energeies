/** Géolocalisation adresse FR (BAN) + productible solaire (PVGIS). */

export function normalizeBanFeature(feature) {
  const props = feature?.properties || {};
  const [lon, lat] = feature?.geometry?.coordinates || [];
  return {
    label: props.label || "",
    name: props.name || "",
    postcode: props.postcode || "",
    city: props.city || props.municipality || "",
    context: props.context || "",
    lat: Number(lat) || null,
    lon: Number(lon) || null,
    score: Number(props.score) || 0,
  };
}

export async function searchFrenchAddresses(query, { limit = 6 } = {}) {
  const q = String(query || "").trim();
  if (q.length < 3) return [];
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Recherche d’adresse indisponible.");
  const data = await response.json();
  return (data.features || []).map(normalizeBanFeature).filter(item => item.label);
}

/** Estimation de secours France métropolitaine si PVGIS indisponible. */
export function estimateYieldFallback(lat) {
  const y = Number(lat);
  if (!Number.isFinite(y)) return 1100;
  if (y >= 48.5) return 980;
  if (y >= 47) return 1050;
  if (y >= 45.5) return 1150;
  if (y >= 44) return 1250;
  return 1350;
}

export function extractPvgisYearlyKwhPerKwp(payload) {
  const totals = payload?.outputs?.totals?.fixed;
  const yearly = Number(totals?.E_y ?? totals?.E_y_avg ?? 0);
  return yearly > 0 ? Math.round(yearly) : null;
}
