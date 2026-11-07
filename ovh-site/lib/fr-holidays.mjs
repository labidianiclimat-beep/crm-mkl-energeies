/**
 * Jours fériés France métropolitaine (+ Alsace-Moselle 67/68).
 * Liste à tenir à jour chaque année — validation juridique recommandée.
 */

function easterSunday(year) {
  // Meeus/Jones/Butcher
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function ymd(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysUtc(d, n) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/**
 * @param {number} year
 * @param {{ alsaceMoselle?: boolean }} [opts]
 * @returns {Set<string>} YYYY-MM-DD
 */
export function frenchHolidays(year, { alsaceMoselle = false } = {}) {
  const easter = easterSunday(year);
  const set = new Set([
    `${year}-01-01`,
    ymd(addDaysUtc(easter, 1)), // Lundi de Pâques
    `${year}-05-01`,
    `${year}-05-08`,
    ymd(addDaysUtc(easter, 39)), // Ascension
    ymd(addDaysUtc(easter, 50)), // Lundi de Pentecôte
    `${year}-07-14`,
    `${year}-08-15`,
    `${year}-11-01`,
    `${year}-11-11`,
    `${year}-12-25`,
  ]);
  if (alsaceMoselle) {
    set.add(ymd(addDaysUtc(easter, -2))); // Vendredi saint
    set.add(`${year}-12-26`); // Saint-Étienne
  }
  return set;
}

export function isAlsaceMosellePostal(postalCode) {
  const pc = String(postalCode || "").replace(/\D/g, "");
  return pc.startsWith("67") || pc.startsWith("68");
}
