/** Pans, ombrage et légende à partir de buildingInsights Google Solar (sans GeoTIFF). */

export const FLUX_STOPS = [
  [0, 18, 12, 48],
  [0.28, 88, 28, 120],
  [0.48, 194, 59, 110],
  [0.72, 240, 122, 42],
  [1, 255, 229, 106],
];

function planeName(degrees) {
  const names = ["Nord", "Nord-Est", "Est", "Sud-Est", "Sud", "Sud-Ouest", "Ouest", "Nord-Ouest"];
  const index = Math.round((((Number(degrees) % 360) + 360) % 360) / 45) % 8;
  return names[index];
}

export function googleImageryYear(google) {
  const year = Number(google?.imageryDate?.year);
  return Number.isFinite(year) && year > 1990 ? year : null;
}

export function metersBetween(a, b) {
  const lat1 = Number(a?.lat);
  const lon1 = Number(a?.lon);
  const lat2 = Number(b?.lat);
  const lon2 = Number(b?.lon);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Infinity;
  const dLat = (lat2 - lat1) * 111_320;
  const dLon = (lon2 - lon1) * 111_320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.hypot(dLat, dLon);
}

/** Google Solar n’est pas une photo à jour : on ne pose le calepinage GPS que si l’imagerie est récente et sur le bon site. */
export function shouldTrustGoogleRoof(google, site = {}, { maxAgeYears = 8, maxMeters = 28 } = {}) {
  const year = googleImageryYear(google);
  if (!year || (new Date().getFullYear() - year) > maxAgeYears) return false;
  const origin = { lat: site.lat, lon: site.lon };
  if (Number.isFinite(origin.lat) && Number.isFinite(origin.lon) && google?.center) {
    if (metersBetween(origin, google.center) > maxMeters) return false;
  }
  return true;
}

export function shadePercentFromSunshine(median, peak) {
  const mid = Number(median);
  const max = Number(peak);
  if (!max || !Number.isFinite(mid) || mid <= 0) return 0;
  return Math.min(40, Math.max(0, Math.round((1 - mid / max) * 100)));
}

export function googleSegmentsToPlanes(google, { panelPower = 500 } = {}) {
  const peak = Number(google?.maxSunshineHoursPerYear) || 0;
  const counts = {};
  for (const panel of google?.solarPanels || []) {
    const index = Number(panel.segmentIndex);
    if (Number.isFinite(index)) counts[index] = (counts[index] || 0) + 1;
  }
  const hasPanelCounts = Object.keys(counts).length > 0;
  const ranked = (google?.roofSegments || []).map((segment, index) => {
    const area = Number(segment.area) || 0;
    const panels = hasPanelCounts ? (counts[index] || 0) : Math.round(area / 2);
    const median = Number(segment.sunshineMedian ?? segment.sunshineQuantiles?.[5]);
    return {
      name: planeName(segment.azimuth),
      compass: Math.round(Number(segment.azimuth) || 180),
      tilt: Math.min(60, Math.max(0, Math.round(Number(segment.pitch) || 30))),
      shadePercent: shadePercentFromSunshine(median, peak),
      panels: Math.max(0, panels),
      panelPower: Math.max(100, Number(panelPower) || 500),
      area,
    };
  }).sort((a, b) => (b.panels - a.panels) || (b.area - a.area));
  const usable = ranked.filter(plane => (
    hasPanelCounts ? plane.panels >= 2 : plane.area >= 8 || plane.panels >= 2
  ));
  return (usable.length ? usable : ranked.filter(plane => plane.panels > 0 || plane.area > 0))
    .slice(0, 4)
    .map(({ area: _area, ...plane }) => ({ ...plane, panels: Math.max(1, plane.panels) }));
}

export function radiusMetersFromBounds(box, fallback = 55) {
  const sw = box?.sw || box?.southWest;
  const ne = box?.ne || box?.northEast;
  const south = Number(sw?.latitude ?? box?.south);
  const west = Number(sw?.longitude ?? box?.west);
  const north = Number(ne?.latitude ?? box?.north);
  const east = Number(ne?.longitude ?? box?.east);
  if (![south, west, north, east].every(Number.isFinite)) return fallback;
  const dLat = (north - south) * 111_320;
  const midLat = (north + south) / 2;
  const dLon = (east - west) * 111_320 * Math.cos(midLat * Math.PI / 180);
  return Math.min(80, Math.max(40, Math.round(Math.hypot(dLat, dLon) / 2 + 18)));
}

export function solarUrlWithKey(url, key) {
  if (!url || !key) return url || "";
  return `${url}${String(url).includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`;
}

export function lerpColor(t, stops = FLUX_STOPS) {
  const x = Math.min(1, Math.max(0, Number(t) || 0));
  let index = 1;
  while (index < stops.length && x > stops[index][0]) index += 1;
  const start = stops[index - 1];
  const end = stops[Math.min(index, stops.length - 1)];
  const span = (end[0] - start[0]) || 1;
  const u = (x - start[0]) / span;
  return [
    Math.round(start[1] + (end[1] - start[1]) * u),
    Math.round(start[2] + (end[2] - start[2]) * u),
    Math.round(start[3] + (end[3] - start[3]) * u),
  ];
}

export function fluxPercentiles(values, { low = 0.08, high = 0.96 } = {}) {
  const valid = [];
  for (const value of values || []) {
    if (Number.isFinite(value) && value > 0 && value < 1e6) valid.push(value);
  }
  if (!valid.length) return { min: 0, max: 1 };
  valid.sort((a, b) => a - b);
  const at = quantile => valid[Math.min(valid.length - 1, Math.floor(quantile * (valid.length - 1)))];
  const min = at(low);
  return { min, max: Math.max(min + 1, at(high)) };
}

export function colorizeFluxRgba(values, width, height, range) {
  const { min, max } = range || fluxPercentiles(values);
  const span = (max - min) || 1;
  const rgba = new Uint8Array(Math.max(0, width) * Math.max(0, height) * 4);
  for (let index = 0; index < width * height; index += 1) {
    const value = values[index];
    const t = !Number.isFinite(value) || value <= 0 ? 0 : (value - min) / span;
    const [r, g, b] = lerpColor(t);
    const offset = index * 4;
    rgba[offset] = r;
    rgba[offset + 1] = g;
    rgba[offset + 2] = b;
    rgba[offset + 3] = 255;
  }
  return rgba;
}

export function rgbRastersToRgba(rasters, width, height) {
  const red = rasters?.[0];
  const green = rasters?.[1] || red;
  const blue = rasters?.[2] || red;
  const sample = red?.[0];
  const factor = (red instanceof Uint16Array || Number(sample) > 255) ? 1 / 257 : 1;
  const rgba = new Uint8Array(Math.max(0, width) * Math.max(0, height) * 4);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    rgba[offset] = Math.max(0, Math.min(255, Math.round(Number(red?.[index] || 0) * factor)));
    rgba[offset + 1] = Math.max(0, Math.min(255, Math.round(Number(green?.[index] || 0) * factor)));
    rgba[offset + 2] = Math.max(0, Math.min(255, Math.round(Number(blue?.[index] || 0) * factor)));
    rgba[offset + 3] = 255;
  }
  return rgba;
}

export function normalizeBuildingInsights(data) {
  const solar = data?.solarPotential || {};
  const center = data?.center || {};
  return {
    provider: "google",
    center: { lat: center.latitude, lon: center.longitude },
    boundingBox: data?.boundingBox || null,
    imageryQuality: data?.imageryQuality || "",
    imageryDate: data?.imageryDate || null,
    maxArrayPanelsCount: solar.maxArrayPanelsCount || null,
    maxArrayAreaMeters2: solar.maxArrayAreaMeters2 || null,
    maxSunshineHoursPerYear: solar.maxSunshineHoursPerYear || null,
    carbonOffsetFactorKgPerMwh: solar.carbonOffsetFactorKgPerMwh || null,
    panelWidthMeters: solar.panelWidthMeters || 1.7,
    panelHeightMeters: solar.panelHeightMeters || 1,
    roofSegments: (solar.roofSegmentStats || []).map(segment => ({
      pitch: segment.pitchDegrees,
      azimuth: segment.azimuthDegrees,
      lat: segment.center?.latitude,
      lon: segment.center?.longitude,
      area: segment.stats?.areaMeters2,
      sunshineQuantiles: segment.stats?.sunshineQuantiles || [],
      sunshineMedian: Array.isArray(segment.stats?.sunshineQuantiles)
        ? segment.stats.sunshineQuantiles[5]
        : null,
    })),
    solarPanels: (solar.solarPanels || []).slice(0, 80).map(panel => ({
      lat: panel.center?.latitude,
      lon: panel.center?.longitude,
      orientation: panel.orientation,
      segmentIndex: panel.segmentIndex,
    })),
    roofSegmentCount: Array.isArray(solar.roofSegmentStats) ? solar.roofSegmentStats.length : 0,
  };
}
