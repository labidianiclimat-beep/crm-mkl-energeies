export const PV_MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
export const PV_MONTH_FACTORS = [0.055, 0.065, 0.085, 0.1, 0.115, 0.12, 0.12, 0.11, 0.09, 0.07, 0.04, 0.03];

function latin(value) {
  return String(value ?? "").replace(/[\u00a0\u202f\u2007\u2009]/g, " ");
}

export function formatPvMoney(value) {
  return latin(
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value || 0)
  );
}

export function formatPvNumber(value) {
  return latin(new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value || 0));
}

export function computePvStudyResults(project = {}) {
  const production = Number(project.estimatedProduction || 0);
  const consumption = Number(project.annualConsumption || 0);
  const selfRate = Number(project.selfConsumptionRate || 65) / 100;
  const selfConsumed = Math.min(consumption, production * selfRate);
  const surplus = Math.max(0, production - selfConsumed);
  const gridAfter = Math.max(0, consumption - selfConsumed);
  const yearlySaving = selfConsumed * Number(project.electricityPrice || 0.194) + surplus * Number(project.surplusPrice || 0.04);
  const savings25 = Array.from({ length: 25 }, (_, index) => yearlySaving * Math.pow(1.04, index)).reduce((sum, value) => sum + value, 0);
  const payback = yearlySaving ? Number(project.price || 0) / yearlySaving : 0;
  return {
    production,
    consumption,
    selfConsumed,
    surplus,
    gridAfter,
    yearlySaving,
    savings25,
    payback,
    autonomy: consumption ? (selfConsumed / consumption) * 100 : 0,
    co2: production * 0.055,
    trees: Math.round((production * 0.055) / 25),
    monthly: PV_MONTH_FACTORS.map(value => Math.round(production * value)),
  };
}
