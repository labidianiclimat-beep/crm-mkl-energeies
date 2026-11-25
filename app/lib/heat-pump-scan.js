import { emptyHeatPumpSpecs } from "./heat-pump-specs.js";

export const HEAT_PUMP_SCAN_FIELD_ALIASES = {
  eprel: ["eprel", "n eprel", "n° eprel", "no eprel", "numero eprel", "registration number"],
  ademe: ["ademe", "n ademe", "n° ademe", "agrement ademe", "n agrement ademe", "numero agrement"],
  refrigerant: ["refrigerant", "fluide", "fluide frigorigene", "type de fluide"],
  energyClass: ["classe energetique", "classe d'efficacite", "energy class", "classe chauffage"],
  seasonalEfficiency: ["efficacite energetique saisonniere", "efficacite saisonniere", "etas", "ηs"],
  scop: ["scop"],
  maxFlowTemp: ["temperature de depart maximum", "temperature de depart max", "depart max", "flow temperature"],
  soundLevel: ["niveau sonore", "puissance acoustique", "lwa", "sound power"],
  dhwTank: ["ballon ecs integre", "ballon ecs", "ballon integre", "volume ecs"],
  bufferVolume: ["volume tampon integre", "volume tampon", "ballon tampon"],
  expansionVessel: ["vase d'expansion", "vase d expansion", "expansion vessel"],
  operatingWeight: ["poids de fonctionnement", "poids en fonctionnement", "masse", "poids"],
  operatingRange: ["plage de fonctionnement", "temperature exterieure", "operating range"],
  powerSupply: ["alimentation", "tension", "power supply"],
  electricBackup: ["appoint electrique", "resistance d appoint", "backup heater"],
  dhwBackup: ["appoint ecs", "appoint sanitaire"],
};

const POWER_KEYS = {
  "-7/35": "powerMinus7_35",
  "-7/55": "powerMinus7_55",
  "7/35": "powerPlus7_35",
};
const COP_KEYS = {
  "-7/35": "copMinus7_35",
  "-7/55": "copMinus7_55",
  "7/35": "copPlus7_35",
};

export function normalizeScanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ");
}

export function normalizeScanKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`´’]/g, "'")
    .replace(/[°]/g, "")
    .replace(/[^a-z0-9η%/+.' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function frNumber(value, { min = 0, max = 1e6 } = {}) {
  const match = String(value || "").replace(/,/g, ".").match(/-?\d+(?:\.\d+)?/);
  if (!match) return "";
  const number = Number(match[0]);
  if (!Number.isFinite(number) || number < min || number > max) return "";
  return String(match[0]).replace(".", ",");
}

function withUnit(number, unit) {
  const value = compact(number);
  if (!value) return "";
  if (new RegExp(String(unit).replace(/[()]/g, "\\$&"), "i").test(value)) return value;
  return `${value} ${unit}`;
}

function conditionKey(air, water) {
  return `${Number(air)}/${Number(water)}`;
}

function conditionRegex(air, water) {
  const airPart = Number(air) < 0 ? `-\\s*${Math.abs(air)}` : `\\+?\\s*${air}`;
  return new RegExp(`(?:A\\s*)?${airPart}\\s*(?:°\\s*C)?\\s*[\\/]\\s*(?:W\\s*)?${water}\\b`, "i");
}

function lineValue(line, aliases) {
  const raw = String(line || "").trim();
  if (!raw) return null;
  const haystack = normalizeScanKey(raw);
  for (const alias of aliases) {
    const needle = normalizeScanKey(alias);
    if (!needle) continue;
    if (haystack === needle) return "";
    if (haystack.startsWith(`${needle} `) || haystack.startsWith(`${needle}:`)) {
      const cut = raw.search(/[:：]/);
      if (cut >= 0) return compact(raw.slice(cut + 1));
      const rest = raw.slice(raw.toLowerCase().indexOf(alias.toLowerCase()) + alias.length);
      return compact(rest.replace(/^[:：]\s*/, ""));
    }
    if (haystack.includes(`${needle}:`)) {
      const cut = raw.search(/[:：]/);
      if (cut >= 0) return compact(raw.slice(cut + 1));
    }
  }
  return null;
}

function valuesByAlias(lines, aliases) {
  const found = [];
  for (let index = 0; index < lines.length; index += 1) {
    const direct = lineValue(lines[index], aliases);
    if (direct === null) continue;
    if (direct) found.push(direct);
    else {
      const next = compact(lines[index + 1] || "");
      if (next && lineValue(next, aliases) === null) found.push(next);
    }
  }
  return found;
}

function firstByAlias(lines, aliases) {
  return valuesByAlias(lines, aliases)[0] || "";
}

function extractEprel(text) {
  const match = String(text || "").match(/\b(?:n[°o.]?\s*)?eprel\b[^0-9]{0,24}(\d{5,10})\b/i)
    || String(text || "").match(/\bregistration(?:\s+number)?\b[^0-9]{0,20}(\d{5,10})\b/i);
  return match?.[1] || "";
}

function extractRefrigerant(text, labeled) {
  const match = `${labeled} ${text}`.match(/\bR[-\s]?(32|290|410A|134A|454B)\b/i);
  return match ? `R${match[1].toUpperCase()}` : compact(labeled);
}

function extractEnergyClass(text, labeled) {
  const chunk = `${labeled}\n${text}`;
  const pair = chunk.match(/A\+{1,3}\s*\/\s*A\+{0,3}/i);
  if (pair) return pair[0].replace(/\s+/g, " ").toUpperCase();
  const singles = [...chunk.matchAll(/\bA\+{2,3}\b/g)].map(item => item[0]);
  if (singles.length >= 2) return `${singles[0]} / ${singles[1]}`;
  return singles[0] || compact(labeled);
}

function extractPercents(text) {
  return [...String(text || "").matchAll(/(\d{2,3}(?:[.,]\d+)?)\s*%/g)]
    .map(item => frNumber(item[1], { min: 80, max: 250 }))
    .filter(Boolean);
}

function extractScopPair(text, labeled) {
  const labeledPair = String(labeled || "").match(/(\d(?:[.,]\d+)?)\s*\/\s*(\d(?:[.,]\d+)?)/);
  if (labeledPair) return `${frNumber(labeledPair[1])} / ${frNumber(labeledPair[2])}`;
  const at35 = text.match(/scop[^.\n]{0,28}35[^0-9]{0,12}(\d(?:[.,]\d+)?)/i);
  const at55 = text.match(/scop[^.\n]{0,28}55[^0-9]{0,12}(\d(?:[.,]\d+)?)/i);
  if (at35?.[1] && at55?.[1]) return `${frNumber(at35[1])} / ${frNumber(at55[1])}`;
  const generic = text.match(/\bscop\b[^0-9]{0,16}(\d(?:[.,]\d+)?)\s*\/\s*(\d(?:[.,]\d+)?)/i);
  if (generic) return `${frNumber(generic[1])} / ${frNumber(generic[2])}`;
  return compact(labeled);
}

function numbersIn(line) {
  return [...String(line || "").matchAll(/(\d{1,3}(?:[.,]\d+)?)/g)].map(item => item[1]);
}

function applyConditionValue(set, kind, air, water, raw) {
  const key = (kind === "cop" ? COP_KEYS : POWER_KEYS)[conditionKey(air, water)];
  if (!key) return;
  if (kind === "cop") {
    const value = frNumber(raw, { min: 1.2, max: 8 });
    if (value) set(key, value);
    return;
  }
  const value = frNumber(raw, { min: 2, max: 40 });
  if (value) set(key, withUnit(value, "kW"));
}

function extractConditionTable(lines, set) {
  const tokenRe = /(?:A\s*)?(-?\+?\s*\d+)\s*(?:°\s*C)?\s*[\\/]\s*(?:W\s*)?(\d+)/gi;
  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index];
    const conditions = [];
    let match;
    tokenRe.lastIndex = 0;
    while ((match = tokenRe.exec(header))) {
      conditions.push({
        air: Number(String(match[1]).replace(/\s+/g, "")),
        water: Number(match[2]),
      });
    }
    if (conditions.length < 2) continue;
    for (let rowIndex = index; rowIndex < Math.min(lines.length, index + 8); rowIndex += 1) {
      const row = lines[rowIndex];
      const isPower = /puissance|heating capacity|\bkW\b/i.test(row);
      const isCop = /\bcop\b/i.test(row);
      if (!isPower && !isCop) continue;
      const nums = numbersIn(row).filter(value => {
        if (isCop) return Number(String(value).replace(",", ".")) <= 8;
        return Number(String(value).replace(",", ".")) >= 2;
      });
      conditions.forEach((condition, offset) => {
        if (nums[offset]) applyConditionValue(set, isCop ? "cop" : "power", condition.air, condition.water, nums[offset]);
      });
    }
  }
}

function extractAroundCondition(lines, air, water, kind) {
  const pattern = conditionRegex(air, water);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!pattern.test(line)) continue;
    const window = [lines[index - 1], line, lines[index + 1]].filter(Boolean).join(" ");
    if (kind === "cop") {
      const cop = window.match(/\bcop\b[^0-9]{0,12}(\d(?:[.,]\d+)?)/i)
        || line.match(/(\d(?:[.,]\d+)?)/);
      const value = frNumber(cop?.[1], { min: 1.2, max: 8 });
      if (value) return value;
    }
    const power = window.match(/(\d{1,2}(?:[.,]\d+)?)\s*kW/i) || line.match(/(\d{1,2}(?:[.,]\d+)?)/);
    const value = frNumber(power?.[1], { min: 2, max: 40 });
    if (value) return withUnit(value, "kW");
  }
  return "";
}

function extractSound(text, labeled) {
  const match = `${labeled} ${text}`.match(/(\d{2}(?:[.,]\d+)?)\s*dB(?:\s*\(?A\)?)?/i);
  return match ? withUnit(frNumber(match[1], { min: 20, max: 90 }), "dB(A)") : compact(labeled);
}

function extractWeight(labeled) {
  const match = String(labeled || "").match(/(\d{2,3}(?:[.,]\d+)?)\s*kg\b/i);
  if (match) return withUnit(frNumber(match[1], { min: 20, max: 400 }), "kg");
  const number = frNumber(labeled, { min: 20, max: 400 });
  return number ? withUnit(number, "kg") : compact(labeled);
}

function extractVolume(labeled) {
  if (!labeled) return "";
  if (/non|sans|no\b/i.test(labeled) && !/\d/.test(labeled)) return compact(labeled);
  const liters = labeled.match(/(\d{1,3}(?:[.,]\d+)?)\s*L\b/i);
  if (liters) {
    const prefix = /oui|yes|integre/i.test(labeled) ? "Oui — " : "";
    return `${prefix}${withUnit(frNumber(liters[1], { min: 4, max: 500 }), "L")}`;
  }
  return compact(labeled);
}

function extractRange(labeled, text) {
  const match = `${labeled} ${text}`.match(/(-?\d{1,2})\s*°?\s*C?\s*[\/àa-]+\s*\+?(-?\d{1,2})\s*°?\s*C/i);
  if (!match) return compact(labeled);
  return `${match[1]} °C / +${String(match[2]).replace(/^\+/, "")} °C`;
}

function extractSupply(labeled, text) {
  const chunk = `${labeled} ${text}`;
  if (/400\s*V|triphase/i.test(chunk)) return compact(labeled) || "400 V triphasé";
  if (/230\s*V|monophase/i.test(chunk)) return compact(labeled) || "230 V monophasé";
  return compact(labeled);
}

function extractWarranty(lines) {
  const start = lines.findIndex(line => /^garantie\b/i.test(normalizeScanKey(line)));
  if (start < 0) return "";
  const collected = [];
  const first = lines[start].replace(/^garantie\s*[:：]?\s*/i, "").trim();
  if (first) collected.push(first);
  for (const line of lines.slice(start + 1, start + 8)) {
    if (!line.trim()) break;
    if (/^(marque|eprel|classe|scop|puissance|fluide)\b/i.test(normalizeScanKey(line))) break;
    collected.push(line.trim());
  }
  return collected.join("\n").trim();
}

export function extractHeatPumpSpecsFromText(rawText) {
  const text = normalizeScanText(rawText);
  const lines = text.split("\n").map(line => compact(line)).filter(Boolean);
  const specs = emptyHeatPumpSpecs();
  const hits = {};

  function set(key, value) {
    const cleaned = compact(value);
    if (!cleaned) return;
    specs[key] = cleaned;
    hits[key] = cleaned;
  }

  set("eprel", firstByAlias(lines, HEAT_PUMP_SCAN_FIELD_ALIASES.eprel) || extractEprel(text));
  const ademe = firstByAlias(lines, HEAT_PUMP_SCAN_FIELD_ALIASES.ademe);
  if (ademe) set("ademe", ademe.replace(/^n[°o.]?\s*/i, ""));
  set("refrigerant", extractRefrigerant(text, firstByAlias(lines, HEAT_PUMP_SCAN_FIELD_ALIASES.refrigerant)));
  set("energyClass", extractEnergyClass(text, firstByAlias(lines, HEAT_PUMP_SCAN_FIELD_ALIASES.energyClass)));

  const seasonalLabel = firstByAlias(lines, HEAT_PUMP_SCAN_FIELD_ALIASES.seasonalEfficiency);
  const percents = extractPercents(seasonalLabel || text);
  if (percents[0] && percents[1]) set("seasonalEfficiency", `${percents[0]} % / ${percents[1]} %`);
  else if (seasonalLabel) set("seasonalEfficiency", seasonalLabel);

  set("scop", extractScopPair(text, firstByAlias(lines, HEAT_PUMP_SCAN_FIELD_ALIASES.scop)));

  const maxTemp = firstByAlias(lines, HEAT_PUMP_SCAN_FIELD_ALIASES.maxFlowTemp);
  if (maxTemp) {
    const number = frNumber(maxTemp, { min: 35, max: 80 });
    set("maxFlowTemp", number ? withUnit(number, "°C") : maxTemp);
  }

  extractConditionTable(lines, set);
  for (const [token, key] of Object.entries(POWER_KEYS)) {
    if (specs[key]) continue;
    const [air, water] = token.split("/").map(Number);
    set(key, extractAroundCondition(lines, air, water, "power"));
  }
  for (const [token, key] of Object.entries(COP_KEYS)) {
    if (specs[key]) continue;
    const [air, water] = token.split("/").map(Number);
    set(key, extractAroundCondition(lines, air, water, "cop"));
  }

  set("soundLevel", extractSound(text, firstByAlias(lines, HEAT_PUMP_SCAN_FIELD_ALIASES.soundLevel)));
  set("dhwTank", extractVolume(firstByAlias(lines, HEAT_PUMP_SCAN_FIELD_ALIASES.dhwTank)));
  set("bufferVolume", extractVolume(firstByAlias(lines, HEAT_PUMP_SCAN_FIELD_ALIASES.bufferVolume)));
  set("expansionVessel", extractVolume(firstByAlias(lines, HEAT_PUMP_SCAN_FIELD_ALIASES.expansionVessel)));
  set("operatingWeight", extractWeight(firstByAlias(lines, HEAT_PUMP_SCAN_FIELD_ALIASES.operatingWeight)));
  set("operatingRange", extractRange(firstByAlias(lines, HEAT_PUMP_SCAN_FIELD_ALIASES.operatingRange), text));
  set("powerSupply", extractSupply(firstByAlias(lines, HEAT_PUMP_SCAN_FIELD_ALIASES.powerSupply), text));
  const electric = firstByAlias(lines, HEAT_PUMP_SCAN_FIELD_ALIASES.electricBackup);
  if (electric) set("electricBackup", electric);
  const dhw = firstByAlias(lines, HEAT_PUMP_SCAN_FIELD_ALIASES.dhwBackup);
  if (dhw) set("dhwBackup", dhw);
  const warranty = extractWarranty(lines);
  if (warranty) set("warranty", warranty);

  return { specs, hits, found: Object.keys(hits).length, text };
}

export function mergeHeatPumpScan(current = {}, scanned = {}) {
  const next = { ...emptyHeatPumpSpecs(), ...current };
  const keptEprel = compact(next.eprel);
  for (const [key, value] of Object.entries(scanned || {})) {
    const incoming = compact(value);
    if (!incoming) continue;
    if (key === "eprel" && keptEprel) continue;
    next[key] = incoming;
  }
  return next;
}
