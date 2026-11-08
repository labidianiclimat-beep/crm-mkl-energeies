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

export function parsePvgisHourStamp(time) {
  const text = String(time || "");
  if (text.length < 13) return null;
  const month = Number(text.slice(4, 6)) - 1;
  const hour = Number(text.slice(9, 11));
  if (month < 0 || month > 11 || hour < 0 || hour > 23) return null;
  return { month, hour };
}

export function isTypicalDays(value) {
  return Array.isArray(value)
    && value.length === 12
    && value.every(day => Array.isArray(day) && day.length === 24 && day.every(item => Number.isFinite(Number(item))));
}

/** 12 journées types (W / kWc) à partir de la série horaire PVGIS. */
export function extractPvgisTypicalDays(payload) {
  const rows = payload?.outputs?.hourly;
  if (!Array.isArray(rows) || rows.length < 24 * 28) return null;
  const sums = Array.from({ length: 12 }, () => Array(24).fill(0));
  const counts = Array.from({ length: 12 }, () => Array(24).fill(0));
  for (const row of rows) {
    const stamp = parsePvgisHourStamp(row?.time);
    if (!stamp) continue;
    sums[stamp.month][stamp.hour] += Number(row.P) || 0;
    counts[stamp.month][stamp.hour] += 1;
  }
  const typicalDays = sums.map((hours, month) => hours.map((sum, hour) => (
    counts[month][hour] ? Math.round((sum / counts[month][hour]) * 10) / 10 : 0
  )));
  return typicalDays.some(day => day.some(value => value > 0)) ? typicalDays : null;
}

export function typicalDaysMonthlyKwhPerKwp(typicalDays) {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!isTypicalDays(typicalDays)) return null;
  return typicalDays.map((day, month) => Math.round(
    day.reduce((sum, watt) => sum + Number(watt || 0), 0) * days[month] / 1000
  ));
}

export function extractPvgisMonthlyKwhPerKwp(payload) {
  const rows = payload?.outputs?.monthly?.fixed;
  if (!Array.isArray(rows) || rows.length < 12) return null;
  const monthly = rows.slice(0, 12).map(row => Math.round(Number(row?.E_m ?? row?.E_m_avg ?? 0)));
  return monthly.every(value => value >= 0) && monthly.some(value => value > 0) ? monthly : null;
}

/** Boussole 0 = nord, 180 = sud → aspect PVGIS (0 = sud, 90 = ouest). */
export function compassToPvgisAspect(degrees) {
  let aspect = Number(degrees) - 180;
  if (!Number.isFinite(aspect)) return 0;
  while (aspect > 180) aspect -= 360;
  while (aspect < -180) aspect += 360;
  return Math.round(aspect);
}

export function ignOrthoUrl(lon, lat) {
  const x = Number(lon);
  const y = Number(lat);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
  return `https://www.geoportail.gouv.fr/carte?c=${encodeURIComponent(x)},${encodeURIComponent(y)}&z=19&l0=ORTHOIMAGERY.ORTHOPHOTOS::GEOPORTAIL:OGC:WMTS(1)&permalink=yes`;
}

export function lonLatToTile(lon, lat, zoom = 18) {
  const x = Number(lon);
  const y = Number(lat);
  const z = Number(zoom);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  const n = 2 ** z;
  const latRad = y * Math.PI / 180;
  return {
    x: Math.floor((x + 180) / 360 * n),
    y: Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n),
    z,
  };
}

export function ignOrthoTileUrl(lon, lat, zoom = 18) {
  const tile = lonLatToTile(lon, lat, zoom);
  if (!tile) return "";
  return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX=${tile.z}&TILEROW=${tile.y}&TILECOL=${tile.x}`;
}

export function ignOrthoWms(lon, lat, { radiusMeters = 36, width = 900, height = 700 } = {}) {
  const x = Number(lon);
  const y = Number(lat);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const dLat = radiusMeters / 111_320;
  const dLon = radiusMeters / (111_320 * Math.cos(y * Math.PI / 180));
  const bounds = {
    south: y - dLat,
    west: x - dLon,
    north: y + dLat,
    east: x + dLon,
  };
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  return {
    url: `https://data.geopf.fr/wms-r/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ORTHOIMAGERY.ORTHOPHOTOS&CRS=EPSG:4326&BBOX=${bbox}&WIDTH=${width}&HEIGHT=${height}&FORMAT=image/jpeg&STYLES=`,
    bounds,
    center: { lat: y, lon: x },
    radiusMeters,
    source: "ign-wms",
  };
}

export function lonLatToImagePercent(lon, lat, bounds) {
  if (!bounds) return null;
  const width = Number(bounds.east) - Number(bounds.west);
  const height = Number(bounds.north) - Number(bounds.south);
  if (!width || !height) return null;
  return {
    x: ((Number(lon) - bounds.west) / width) * 100,
    y: ((bounds.north - Number(lat)) / height) * 100,
  };
}

export function metersToImagePercent(meters, bounds, axis = "x") {
  if (!bounds) return 0;
  const midLat = (Number(bounds.north) + Number(bounds.south)) / 2;
  const span = axis === "y"
    ? (Number(bounds.north) - Number(bounds.south)) * 111_320
    : (Number(bounds.east) - Number(bounds.west)) * 111_320 * Math.cos(midLat * Math.PI / 180);
  return span ? (Number(meters) / span) * 100 : 0;
}
