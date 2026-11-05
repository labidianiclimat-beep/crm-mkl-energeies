import { isHeatPumpMachineArticle } from "./article-bundles.js";
import { isHeatPumpPath } from "./heat-pump-specs.js";

export const HEAT_PUMP_EMITTERS = [
  {
    id: "radiators",
    label: "Radiateurs",
    quoteLabel: "Pompe à chaleur, moyenne température",
    image: "/equipment/emitter-radiators.svg",
  },
  {
    id: "radiators-floor",
    label: "Radiateurs et plancher chauffant",
    quoteLabel: "Pompe à chaleur, moyenne température",
    image: "/equipment/emitter-radiators-floor.svg",
  },
  {
    id: "floor",
    label: "Plancher chauffant",
    quoteLabel: "Pompe à chaleur, basse température",
    image: "/equipment/emitter-floor.svg",
  },
];

export function heatPumpEmitterById(id) {
  return HEAT_PUMP_EMITTERS.find(item => item.id === id) || null;
}

function catalogPlain(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function articleForLine(line, articles = []) {
  if (!line) return null;
  return (articles || []).find(row =>
    (line.articleId && row?.id && String(row.id) === String(line.articleId))
    || (line.code && row?.code && String(row.code) === String(line.code))
  ) || null;
}

export function quoteLineIsHeatPumpMachine(line, article) {
  if (article) return isHeatPumpMachineArticle(article);
  const hay = catalogPlain([line?.name, line?.designation, line?.code, line?.category, line?.subcategory].filter(Boolean).join(" "));
  if (!hay) return false;
  if (hay.includes("fourniture") || hay.includes("installation") || /\bpose\b/.test(` ${hay} `)) return false;
  if (isHeatPumpPath({ category: line?.category, subcategory: line?.subcategory })) return true;
  return hay.includes("pompe a chaleur") || /\bpac\b/.test(` ${hay} `);
}

export function bundleNeedsHeatPumpEmitter(bundle, articles = []) {
  return (bundle?.items || []).some(item => quoteLineIsHeatPumpMachine(item, articleForLine(item, articles)));
}

export function withHeatPumpEmitterLabel(name, emitterId) {
  const choice = heatPumpEmitterById(emitterId);
  if (!choice) return String(name || "").trim();
  const base = String(name || "").trim();
  if (!base) return choice.quoteLabel;
  if (base.endsWith(choice.quoteLabel)) return base;
  return `${base} — ${choice.quoteLabel}`;
}

/** Pose le régime de température sur la première ligne pompe à chaleur. Le prix ne change pas. */
export function applyHeatPumpEmitterToLines(lines = [], articles = [], emitterId) {
  if (!heatPumpEmitterById(emitterId)) return lines || [];
  let applied = false;
  return (lines || []).map(line => {
    if (applied || !quoteLineIsHeatPumpMachine(line, articleForLine(line, articles))) return line;
    applied = true;
    return {
      ...line,
      name: withHeatPumpEmitterLabel(line.name, emitterId),
      heatPumpEmitter: emitterId,
    };
  });
}
