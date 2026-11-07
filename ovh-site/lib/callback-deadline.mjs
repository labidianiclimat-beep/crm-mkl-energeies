/**
 * Calcul de l’échéance « 5 jours ouvrables » (Europe/Paris).
 * Règle provisoire (à valider juridiquement) :
 * - départ = jour de la demande en calendrier Paris ;
 * - si heure locale ≥ 17:00, départ = prochain jour ;
 * - on avance de 5 jours qui ne sont ni samedi/dimanche ni férié ;
 * - échéance = 17:00 Europe/Paris ce 5ᵉ jour.
 */

import { frenchHolidays, isAlsaceMosellePostal } from "./fr-holidays.mjs";

const TZ = "Europe/Paris";

function partsInParis(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const map = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function parisYmdToUtcDate(year, month, day, hour = 12, minute = 0) {
  // Approximation stable : construire une date UTC puis ajuster via offset Paris
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const p = partsInParis(guess);
  const asParisMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
  const wantedMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const delta = asParisMs - wantedMs;
  return new Date(guess.getTime() - delta);
}

function addCalendarDays(year, month, day, n) {
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function weekdayUtcYmd(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=dim
}

/**
 * @param {Date} [from]
 * @param {{ postalCode?: string, businessDays?: number }} [opts]
 */
export function computeCallbackDeadline(from = new Date(), { postalCode = "", businessDays = 5 } = {}) {
  const alsace = isAlsaceMosellePostal(postalCode);
  let { year, month, day, hour } = partsInParis(from);

  // Après 17h → démarrer le lendemain calendaire
  if (hour >= 17) {
    ({ year, month, day } = addCalendarDays(year, month, day, 1));
  }

  const holidayCache = new Map();
  const holidaysFor = (y) => {
    if (!holidayCache.has(y)) holidayCache.set(y, frenchHolidays(y, { alsaceMoselle: alsace }));
    return holidayCache.get(y);
  };

  const isBusiness = (y, m, d) => {
    const wd = weekdayUtcYmd(y, m, d);
    if (wd === 0 || wd === 6) return false;
    const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return !holidaysFor(y).has(key);
  };

  // Si le jour de départ n’est pas ouvré, avancer jusqu’au prochain
  while (!isBusiness(year, month, day)) {
    ({ year, month, day } = addCalendarDays(year, month, day, 1));
  }

  let remaining = businessDays;
  let y = year;
  let m = month;
  let d = day;
  while (remaining > 0) {
    ({ year: y, month: m, day: d } = addCalendarDays(y, m, d, 1));
    if (isBusiness(y, m, d)) remaining -= 1;
  }

  const deadline = parisYmdToUtcDate(y, m, d, 17, 0);
  const localDate = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return {
    callbackDeadline: deadline.toISOString(),
    callbackDeadlineLocal: localDate,
    timezone: TZ,
    businessDays,
    alsaceMoselleHolidays: alsace,
  };
}

export function isCallbackStillAuthorized(deadlineIso, now = new Date()) {
  if (!deadlineIso) return false;
  const t = Date.parse(deadlineIso);
  if (!Number.isFinite(t)) return false;
  return now.getTime() <= t;
}
