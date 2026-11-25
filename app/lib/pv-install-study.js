import { shouldTrustGoogleRoof } from "./google-solar.js";
import { ignOrthoWms, isTypicalDays, lonLatToImagePercent, metersToImagePercent } from "./pv-geo.js";
import { PV_MONTH_FACTORS, PV_MONTHS } from "./pv-study.js";

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const SUN_SHAPE = Array.from({ length: 24 }, (_, hour) => (
  hour >= 7 && hour <= 18 ? Math.max(0, Math.sin(((hour - 6.5) / 12) * Math.PI)) : 0
));
const SUN_SUM = SUN_SHAPE.reduce((sum, value) => sum + value, 0);

export const PV_CONSUMPTION_PROFILES = [
  { id: "day-present", label: "Présent en journée (retraité, télétravail)" },
  { id: "day-absent", label: "Absent en journée (travail à l’extérieur)" },
];

export const DEFAULT_VIRTUAL_BATTERY = {
  enabled: true,
  name: "Batterie virtuelle",
  monthlyPerkWc: 1.2,
  transportPerkWh: 0.1086,
  connectionCost: 279,
  steeringBonusYear: 71,
  subscriptionMonth: 18.24,
};

function num(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function normalizeRoofModule(mod = {}, index = 0) {
  const x = num(mod.x, NaN);
  const y = num(mod.y, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    id: String(mod.id || `m-${index + 1}`),
    x: Math.min(99.5, Math.max(0.5, x)),
    y: Math.min(99.5, Math.max(0.5, y)),
  };
}

export function emptyPlaneLayout(overrides = {}) {
  const modules = Array.isArray(overrides.modules)
    ? overrides.modules.map((mod, index) => normalizeRoofModule(mod, index)).filter(Boolean)
    : [];
  return {
    offsetX: Math.min(45, Math.max(-45, num(overrides.offsetX, 0))),
    offsetY: Math.min(45, Math.max(-45, num(overrides.offsetY, 0))),
    rotate: num(overrides.rotate, 0),
    columns: Math.min(12, Math.max(0, Math.round(num(overrides.columns, 0)))),
    modules,
  };
}

export function isManualPlaneLayout(layout = {}) {
  const next = emptyPlaneLayout(layout);
  return Boolean(next.offsetX || next.offsetY || next.rotate || next.columns || next.modules.length);
}

export function addPlaneModule(layout = {}, point = {}, index = 0) {
  const next = emptyPlaneLayout(layout);
  const module = normalizeRoofModule({
    id: `m-${Date.now()}-${next.modules.length}-${index}`,
    x: point.x,
    y: point.y,
  }, next.modules.length);
  return module ? emptyPlaneLayout({ ...next, modules: [...next.modules, module] }) : next;
}

export function movePlaneModule(layout = {}, moduleIndex, point = {}) {
  const next = emptyPlaneLayout(layout);
  const modules = next.modules.map((mod, index) => (
    index === moduleIndex ? normalizeRoofModule({ ...mod, ...point }, index) || mod : mod
  ));
  return emptyPlaneLayout({ ...next, modules });
}

export function removePlaneModule(layout = {}, moduleIndex) {
  const next = emptyPlaneLayout(layout);
  return emptyPlaneLayout({
    ...next,
    modules: next.modules.filter((_, index) => index !== moduleIndex),
  });
}

function median(values = []) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clusterByAxis(items, get, tolerance) {
  const sorted = [...items].sort((a, b) => get(a) - get(b));
  const groups = [];
  sorted.forEach(item => {
    const last = groups[groups.length - 1];
    const lastCenter = last ? median(last.map(get)) : null;
    if (!last || Math.abs(get(item) - lastCenter) > tolerance) groups.push([item]);
    else last.push(item);
  });
  const merged = [];
  groups.forEach(group => {
    const last = merged[merged.length - 1];
    if (last && Math.abs(median(last.map(get)) - median(group.map(get))) <= tolerance) {
      last.push(...group);
    } else {
      merged.push([...group]);
    }
  });
  return merged;
}

export function alignRoofModules(modules = [], size = {}) {
  const items = modules.map((mod, index) => normalizeRoofModule(mod, index)).filter(Boolean);
  if (items.length < 2) return items;
  const w = Math.max(0.8, num(size.w, 3.2));
  const h = Math.max(0.6, num(size.h, 2));
  const neighbor = Math.max(w, h) * 2.15;
  const parent = items.map((_, index) => index);
  function find(index) {
    return parent[index] === index ? index : (parent[index] = find(parent[index]));
  }
  function unite(a, b) {
    parent[find(a)] = find(b);
  }
  items.forEach((left, i) => {
    items.forEach((right, j) => {
      if (j <= i) return;
      if (Math.hypot(left.x - right.x, left.y - right.y) <= neighbor) unite(i, j);
    });
  });
  const groups = new Map();
  items.forEach((item, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item);
  });
  const aligned = new Map();
  groups.forEach(group => {
    const rows = clusterByAxis(group, item => item.y, Math.max(0.6 * h, 1.1));
    const cols = clusterByAxis(group, item => item.x, Math.max(0.6 * w, 1.1));
    const rowY = new Map(rows.flatMap(row => {
      const y = median(row.map(item => item.y));
      return row.map(item => [item.id, y]);
    }));
    const colX = new Map(cols.flatMap(col => {
      const x = median(col.map(item => item.x));
      return col.map(item => [item.id, x]);
    }));
    group.forEach(item => {
      aligned.set(item.id, normalizeRoofModule({
        ...item,
        x: colX.get(item.id) ?? item.x,
        y: rowY.get(item.id) ?? item.y,
      }));
    });
  });
  return items.map(item => aligned.get(item.id) || item);
}

export function roofPanelSize(project = {}, complete = {}) {
  const ortho = studyOrtho(project, complete);
  const google = complete.google || {};
  const widthM = Number(google.panelWidthMeters || 1.7);
  const heightM = Number(google.panelHeightMeters || 1);
  if (!ortho?.bounds) return { w: 1.7, h: 1 };
  return {
    w: Math.min(2.1, Math.max(1.15, metersToImagePercent(widthM, ortho.bounds, "x") * 0.55)),
    h: Math.min(1.25, Math.max(0.7, metersToImagePercent(heightM, ortho.bounds, "y") * 0.55)),
  };
}

export function roofPanelAlignSize(project = {}, complete = {}) {
  const size = roofPanelSize(project, complete);
  return {
    w: Math.max(size.w, 3.2),
    h: Math.max(size.h, 2),
  };
}

export function normalizeRoofPlane(plane = {}, index = 0) {
  const layout = emptyPlaneLayout(plane.layout);
  const panels = layout.modules.length
    ? layout.modules.length
    : Math.max(0, Math.round(num(plane.panels, 0)));
  const panelPower = Math.max(0, num(plane.panelPower, 500));
  return {
    id: plane.id || `plane-${index + 1}`,
    name: plane.name || (index === 0 ? "Sud" : "Nord"),
    compass: num(plane.compass, index === 0 ? 180 : 0),
    tilt: num(plane.tilt, 30),
    panels,
    panelPower,
    shadePercent: Math.min(40, Math.max(0, num(plane.shadePercent, 0))),
    yieldValue: num(plane.yieldValue, 0),
    monthly: Array.isArray(plane.monthly) && plane.monthly.length === 12
      ? plane.monthly.map(value => Math.round(num(value)))
      : null,
    typicalDays: isTypicalDays(plane.typicalDays) ? plane.typicalDays : null,
    source: plane.source || "",
    layout,
  };
}

export function hourLoadShares(profile = "day-present") {
  const factors = Array.from({ length: 24 }, (_, hour) => (
    profile === "day-present"
      ? (hour >= 8 && hour <= 18 ? 1.35 : 0.55)
      : ((hour >= 7 && hour <= 9) || (hour >= 18 && hour <= 22) ? 1.6 : 0.45)
  ));
  const total = factors.reduce((sum, value) => sum + value, 0);
  return factors.map(value => value / total);
}

export function planeHourWatts(plane, month, hour) {
  const shade = 1 - num(plane.shadePercent) / 100;
  if (isTypicalDays(plane.typicalDays)) {
    return num(plane.typicalDays[month]?.[hour]) * planePowerKwp(plane) * shade;
  }
  const monthKwh = Array.isArray(plane.monthly) && plane.monthly[month] != null
    ? num(plane.monthly[month]) * shade
    : planeProduction(plane) * PV_MONTH_FACTORS[month];
  const days = MONTH_DAYS[month] || 30;
  return days && SUN_SUM ? (monthKwh / days) * 1000 * (SUN_SHAPE[hour] / SUN_SUM) : 0;
}

export function planePowerKwp(plane) {
  return (num(plane.panels) * num(plane.panelPower)) / 1000;
}

export function planeProduction(plane) {
  const power = planePowerKwp(plane);
  const shade = 1 - num(plane.shadePercent) / 100;
  if (Array.isArray(plane.monthly) && plane.monthly.length === 12) {
    return Math.round(plane.monthly.reduce((sum, value) => sum + num(value), 0) * shade);
  }
  return Math.round(power * num(plane.yieldValue, 0) * shade);
}

export function consumptionProfileLabel(id) {
  return PV_CONSUMPTION_PROFILES.find(item => item.id === id)?.label || PV_CONSUMPTION_PROFILES[0].label;
}

export function compassLabel(degrees) {
  const names = ["Nord", "Nord-Est", "Est", "Sud-Est", "Sud", "Sud-Ouest", "Ouest", "Nord-Ouest"];
  const index = Math.round((((num(degrees) % 360) + 360) % 360) / 45) % 8;
  return names[index];
}

export function grow25(yearly) {
  return Array.from({ length: 25 }, (_, index) => num(yearly) * Math.pow(1.04, index))
    .reduce((sum, value) => sum + value, 0);
}

export function studyMapCenter(project = {}, complete = {}) {
  const google = complete.google || project.completeStudy?.google || {};
  const lat = Number(project.lat || google.center?.lat);
  const lon = Number(project.lon || google.center?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

export function studyOrtho(project = {}, complete = {}) {
  const stored = complete.ortho || {};
  if (stored.url && stored.bounds) return stored;
  const center = studyMapCenter(project, complete);
  return center ? ignOrthoWms(center.lon, center.lat) : null;
}

function offsetLatLon(lat, lon, meters, compass) {
  const rad = (Number(compass) * Math.PI) / 180;
  return {
    lat: lat + (meters * Math.cos(rad)) / 111_320,
    lon: lon + (meters * Math.sin(rad)) / (111_320 * Math.cos(lat * Math.PI / 180)),
  };
}

export function layoutRoofPanels({ project = {}, complete = {}, planes = [], preferPlaced = false } = {}) {
  const ortho = studyOrtho(project, complete);
  if (!ortho?.bounds) return [];
  const google = complete.google || {};
  const { w, h } = roofPanelSize(project, complete);
  const fromPlaced = [];
  planes.forEach((plane, planeIndex) => {
    const layout = emptyPlaneLayout(plane.layout);
    layout.modules.forEach((mod, index) => {
      fromPlaced.push({
        id: mod.id || `p-${planeIndex}-${index}`,
        planeIndex,
        moduleIndex: index,
        x: mod.x,
        y: mod.y,
        w,
        h,
        rotate: Number(plane.compass || 0) + layout.rotate,
        source: "placed",
      });
    });
  });
  if (fromPlaced.length || preferPlaced) return fromPlaced;

  const useManual = Boolean(complete.panelLayout?.manual) || planes.some(plane => isManualPlaneLayout(plane.layout));
  const fromGoogle = !useManual && shouldTrustGoogleRoof(google, project)
    ? (google.solarPanels || []).slice(0, 48).map((panel, index) => {
      const point = lonLatToImagePercent(panel.lon, panel.lat, ortho.bounds);
      if (!point) return null;
      const segment = (google.roofSegments || [])[panel.segmentIndex] || {};
      return {
        id: `g-${index}`,
        planeIndex: Number(panel.segmentIndex) || 0,
        x: point.x,
        y: point.y,
        w,
        h,
        rotate: Number(segment.azimuth || 0),
        source: "google",
      };
    }).filter(Boolean)
    : [];
  if (fromGoogle.length) return fromGoogle;

  const center = studyMapCenter(project, complete);
  if (!center) return [];
  const placed = [];
  planes.forEach((plane, planeIndex) => {
    const layout = emptyPlaneLayout(plane.layout);
    const count = Math.min(24, Math.max(0, Math.round(Number(plane.panels) || 0)));
    const cols = layout.columns || Math.max(2, Math.ceil(Math.sqrt(count)));
    const origin = offsetLatLon(center.lat, center.lon, 5.2, plane.compass);
    const across = plane.compass + 90;
    for (let index = 0; index < count; index += 1) {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const along = offsetLatLon(origin.lat, origin.lon, (col - (cols - 1) / 2) * 1.85, across);
      const cell = offsetLatLon(along.lat, along.lon, row * 1.15, plane.compass);
      const point = lonLatToImagePercent(cell.lon, cell.lat, ortho.bounds);
      if (!point) continue;
      placed.push({
        id: `p-${planeIndex}-${index}`,
        planeIndex,
        x: point.x + layout.offsetX,
        y: point.y + layout.offsetY,
        w,
        h,
        rotate: Number(plane.compass || 0) + layout.rotate,
        source: "plane",
      });
    }
  });
  return placed;
}

export function emptyCompleteStudy(overrides = {}) {
  return {
    consumptionProfile: "day-present",
    virtualBattery: { ...DEFAULT_VIRTUAL_BATTERY },
    planes: [
      normalizeRoofPlane({ name: "Sud", compass: 180, tilt: 30, panels: 9, panelPower: 500 }, 0),
    ],
    panelModel: "Module photovoltaïque",
    inverterModel: "Onduleur",
    solarProvider: "pvgis",
    orthoUrl: "",
    fluxPng: "",
    rgbPng: "",
    panelLayout: { manual: false, ...(overrides.panelLayout || {}) },
    ...overrides,
  };
}

export function completeStudyFromProject(project = {}) {
  const stored = project.completeStudy && typeof project.completeStudy === "object"
    ? project.completeStudy
    : {};
  const planes = Array.isArray(stored.planes) && stored.planes.length
    ? stored.planes.map(normalizeRoofPlane)
    : [normalizeRoofPlane({
      name: "Toiture",
      compass: 180,
      tilt: 30,
      panels: project.panels || 0,
      panelPower: project.panelPower || 450,
      yieldValue: project.yieldValue || 1100,
    }, 0)];
  return {
    ...emptyCompleteStudy(),
    ...stored,
    consumptionProfile: stored.consumptionProfile || "day-present",
    virtualBattery: { ...DEFAULT_VIRTUAL_BATTERY, ...(stored.virtualBattery || {}) },
    planes,
    panelModel: stored.panelModel || `${project.panels || "—"} × ${project.panelPower || "—"} W`,
    inverterModel: stored.inverterModel || "Onduleur ou micro-onduleurs",
    solarProvider: stored.solarProvider || (project.yieldSource === "pvgis" ? "pvgis" : stored.solarProvider || "pvgis"),
  };
}

export function computeInstallStudyResults(project = {}, complete = completeStudyFromProject(project)) {
  const planes = (complete.planes || []).map(normalizeRoofPlane);
  const production = planes.reduce((sum, plane) => sum + planeProduction(plane), 0)
    || num(project.estimatedProduction);
  const consumption = num(project.annualConsumption, 2300);
  const profile = complete.consumptionProfile || "day-present";
  const electricityPrice = num(project.electricityPrice, 0.2001);
  const surplusPrice = num(project.surplusPrice, 0.04);
  const battery = { ...DEFAULT_VIRTUAL_BATTERY, ...(complete.virtualBattery || {}) };
  const powerKwp = planes.reduce((sum, plane) => sum + planePowerKwp(plane), 0)
    || num(project.powerKwp);

  const loadShare = hourLoadShares(profile);
  let directWh = 0;
  let surplusWh = 0;
  let needWh = 0;
  const monthly = MONTH_DAYS.map((days, month) => {
    let monthWh = 0;
    for (let hour = 0; hour < 24; hour += 1) {
      const prodWh = planes.reduce((sum, plane) => sum + planeHourWatts(plane, month, hour), 0);
      const loadWh = (consumption / 365) * 1000 * loadShare[hour];
      monthWh += prodWh * days;
      directWh += Math.min(prodWh, loadWh) * days;
      surplusWh += Math.max(0, prodWh - loadWh) * days;
      needWh += Math.max(0, loadWh - prodWh) * days;
    }
    return Math.round(monthWh / 1000);
  });
  const hourlyProduction = monthly.reduce((sum, value) => sum + value, 0);
  const productionUsed = hourlyProduction || production;
  const direct = directWh / 1000;
  const remainingNeed = needWh / 1000;
  const surplus = surplusWh / 1000;
  const fromBattery = battery.enabled ? Math.min(remainingNeed, surplus) : 0;
  const selfConsumed = direct + fromBattery;
  const gridAfter = Math.max(0, consumption - selfConsumed);
  const leftover = Math.max(0, productionUsed - selfConsumed);
  const selfRate = productionUsed ? (selfConsumed / productionUsed) * 100 : 0;
  const autonomy = consumption ? (selfConsumed / consumption) * 100 : 0;

  const transport = fromBattery * num(battery.transportPerkWh);
  const storageFee = powerKwp * num(battery.monthlyPerkWc) * 12;
  const oaMissed = fromBattery * surplusPrice;
  const steering = battery.enabled ? num(battery.steeringBonusYear) : 0;
  const extraSelfYear = fromBattery * electricityPrice;
  const virtualCostYear = transport + storageFee;
  const extraSelf25 = grow25(extraSelfYear);
  const cagnottage25 = grow25(steering);
  const oaMissed25 = grow25(oaMissed);
  const virtualCost25 = grow25(virtualCostYear);
  const withoutBatterySaving = direct * electricityPrice + Math.max(0, productionUsed - direct) * surplusPrice;
  const withoutBattery25 = grow25(withoutBatterySaving);
  const savings25 = withoutBattery25 + extraSelf25 + cagnottage25 - oaMissed25 - virtualCost25;
  const yearlySaving = extraSelfYear + steering - virtualCostYear;
  const connection = battery.enabled ? num(battery.connectionCost) : 0;
  const projectCost = num(project.price) + connection;
  const withoutSelfRate = productionUsed ? (direct / productionUsed) * 100 : 0;
  const withoutImportRate = consumption ? (Math.max(0, consumption - direct) / consumption) * 100 : 0;
  const importRate = consumption ? (gridAfter / consumption) * 100 : 0;
  const billCurrent = consumption * electricityPrice / 12;
  const billSelf = selfConsumed * electricityPrice / 12;
  const billCagnot = steering / 12;
  const billTransport = transport / 12;
  const billStorage = powerKwp * num(battery.monthlyPerkWc);
  const billAfter = Math.max(0, billCurrent - billSelf - billCagnot + billTransport + billStorage);
  const producedKwhCost = productionUsed > 0 ? num(project.price) / (productionUsed * 25) : 0;
  const monthlySplit = monthly.map(value => {
    const share = productionUsed ? value / productionUsed : 0;
    return {
      production: value,
      direct: Math.round(direct * share),
      battery: Math.round(fromBattery * share),
      consumption: Math.round(consumption / 12),
    };
  });

  const september = 8;
  const hours = Array.from({ length: 24 }, (_, hour) => {
    const productionWh = planes.reduce((sum, plane) => sum + planeHourWatts(plane, september, hour), 0);
    const loadWh = (consumption / 365) * 1000 * loadShare[hour];
    return {
      hour,
      production: Math.round(productionWh),
      consumption: Math.round(loadWh),
      self: Math.round(Math.min(productionWh, loadWh)),
      surplus: Math.round(Math.max(0, productionWh - loadWh)),
      grid: Math.round(Math.max(0, loadWh - productionWh)),
    };
  });
  const hourlySource = planes.some(plane => isTypicalDays(plane.typicalDays)) ? "pvgis-hourly" : "synthese";

  return {
    production: productionUsed,
    hourlySource,
    consumption,
    monthly,
    planes,
    powerKwp,
    panels: planes.reduce((sum, plane) => sum + num(plane.panels), 0),
    direct: Math.round(direct),
    fromBattery: Math.round(fromBattery),
    selfConsumed: Math.round(selfConsumed),
    surplus: Math.round(leftover),
    gridAfter: Math.round(gridAfter),
    selfRate,
    autonomy,
    electricityPrice,
    surplusPrice,
    yearlySaving,
    savings25,
    projectCost,
    connection,
    netGain: savings25 - projectCost,
    transport,
    storageFee,
    steering,
    oaMissed,
    withoutBattery25,
    extraSelf25,
    cagnottage25,
    oaMissed25,
    virtualCost25,
    extraBattery25: savings25 - withoutBattery25,
    withoutSelfRate,
    withoutImportRate,
    importRate,
    selfRatePts: selfRate - withoutSelfRate,
    importPts: importRate - withoutImportRate,
    billBefore: billCurrent,
    billSelf,
    billCagnot,
    billTransport,
    billStorage,
    billAfter,
    billChangePct: billCurrent ? ((billAfter - billCurrent) / billCurrent) * 100 : 0,
    producedKwhCost,
    monthlySplit,
    hours,
    daySelfRate: (() => {
      const prod = hours.reduce((sum, item) => sum + item.production, 0);
      const self = hours.reduce((sum, item) => sum + item.self, 0);
      return prod ? (self / prod) * 100 : 0;
    })(),
    co2: Math.round(productionUsed * 0.333),
    trees: Math.round(productionUsed / 537),
    machines: Math.round(productionUsed / 0.7),
    carKm: Math.round(productionUsed * 0.333),
  };
}
