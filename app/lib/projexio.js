export const PROJEXIO_NAME = "Projexio";

export function isProjexioCredit(state) {
  return state?.financeMode === "credit" && state?.financier === PROJEXIO_NAME;
}

export function clearProjexioResult(partial = {}) {
  return {
    ...partial,
    projexioApplied: false,
    projexioFingerprint: "",
  };
}

export function loanAmountEuros(totalTTC, personalContribution) {
  const total = Number(totalTTC || 0);
  const apport = Math.max(0, Number(personalContribution || 0));
  if (!Number.isFinite(total)) return 0;
  return Math.max(0, Number((total - apport).toFixed(2)));
}

export function normalizeBaremes(payload) {
  const list = Array.isArray(payload) ? payload : [];
  return list
    .map(item => ({
      bareme: Number(item?.bareme),
      montantMin: Number(item?.montantMin),
      montantMax: Number(item?.montantMax),
      echeanceMin: Number(item?.echeanceMin),
      echeanceMax: Number(item?.echeanceMax),
      report: Number(item?.report || 0),
      taeg: Number(item?.taeg),
      fraisDossier: Number(item?.fraisDossier || 0),
      tauxSenior: numberOrNull(item?.tauxSenior),
      tauxDecesPtia: numberOrNull(item?.tauxDecesPtia),
      tauxDecesPtiaIptItt: numberOrNull(item?.tauxDecesPtiaIptItt),
    }))
    .filter(item => Number.isInteger(item.bareme) && item.bareme > 0);
}

export function baremeLabel(bareme) {
  if (!bareme) return "Barème";
  const report = Number(bareme.report) > 0 ? `report ${bareme.report} mois` : "sans report";
  return `Barème ${bareme.bareme} · ${formatBound(bareme.montantMin)} à ${formatBound(bareme.montantMax)} € · ${bareme.echeanceMin} à ${bareme.echeanceMax} mois · ${report}`;
}

export function insuranceChoices(bareme) {
  const choices = [{ id: "none", label: "Sans assurance", rate: "" }];
  if (!bareme) return choices;
  pushRate(choices, "deces", "Décès / PTIA", bareme.tauxDecesPtia);
  pushRate(choices, "senior", "Senior", bareme.tauxSenior);
  pushRate(choices, "complet", "Décès / PTIA / IPT / ITT", bareme.tauxDecesPtiaIptItt);
  return choices;
}

export function projexioFirstMonthlyDays(bareme) {
  const id = String(bareme || "");
  if (id === "1") return 30;
  if (id === "2") return 180;
  return "";
}

export function suggestBaremeId(baremes = [], amount = 0) {
  const fitting = baremes.filter(item => amount >= item.montantMin && amount <= item.montantMax);
  const pool = fitting.length ? fitting : baremes;
  const preferred = pool.find(item => item.bareme === 1) || pool[0];
  return preferred ? String(preferred.bareme) : "";
}

export function simulationOptions(payload) {
  const list = Array.isArray(payload?.simulations) ? payload.simulations : [];
  return list
    .map(item => mapSimulation(item))
    .filter(Boolean)
    .sort((left, right) => left.financeMonths - right.financeMonths);
}

export function mapSimulation(item) {
  if (!item || typeof item !== "object") return null;
  const months = Number(item.nbEcheances);
  const monthlyExInsurance = numberOrNull(item.mensualite);
  const monthlyWithInsurance = numberOrNull(item.mensualiteAvecAssurance);
  if (!Number.isInteger(months) || months <= 0 || monthlyExInsurance == null) return null;
  return {
    financeMonths: months,
    monthlyPayment: monthlyWithInsurance ?? monthlyExInsurance,
    monthlyExInsurance,
    financeNominalRate: numberOrNull(item.tna),
    financeTaeg: numberOrNull(item.taeg),
    financeTaea: numberOrNull(item.tauxAssurance),
    reportMonths: Number(item.dureeReport || 0),
    fileFees: numberOrNull(item.fraisDossier) ?? 0,
    creditCost: numberOrNull(item.coutTotal),
    lastMonthly: numberOrNull(item.derniereMensualiteAvecAssurance) ?? numberOrNull(item.derniereMensualite),
    example: String(item.exemple || "").trim(),
    insuranceInfo: String(item.infosAssurance || "").trim(),
  };
}

export function legalNotices(payload) {
  const legal = payload?.legal && typeof payload.legal === "object" ? payload.legal : {};
  return {
    pedago: String(legal.pedago || "").trim(),
    mentions: String(legal.mentions || "").trim(),
  };
}

function simulationSnapshot(state, totalTTC) {
  return {
    bareme: String(state?.projexioBareme || ""),
    amount: loanAmountEuros(totalTTC, state?.personalContribution),
    insurance: state?.projexioInsuranceRate === "" || state?.projexioInsuranceRate == null
      ? ""
      : Number(state.projexioInsuranceRate),
    months: Number(state?.financeMonths || 0),
  };
}

export function projexioFingerprint(state, totalTTC) {
  return JSON.stringify(simulationSnapshot(state, totalTTC));
}

export function projexioIsCurrent(state, totalTTC) {
  if (!state?.projexioApplied || !state?.projexioFingerprint) return false;
  return state.projexioFingerprint === projexioFingerprint(state, totalTTC);
}

export function projexioInputError(state, totalTTC) {
  if (!isProjexioCredit(state)) return "";
  if (!String(state.projexioBareme || "").trim()) return "Choisissez un barème Projexio.";
  const amount = loanAmountEuros(totalTTC, state.personalContribution);
  if (amount <= 0) return "Le montant à financer doit être supérieur à 0.";
  const min = Number(state.projexioMinAmount);
  const max = Number(state.projexioMaxAmount);
  if (Number.isFinite(min) && amount < min) return `Projexio refuse ce barème sous ${formatBound(min)} €.`;
  if (Number.isFinite(max) && max > 0 && amount > max) return `Projexio refuse ce barème au-dessus de ${formatBound(max)} €.`;
  return "";
}

export function projexioBlocker(state, totalTTC) {
  const inputError = projexioInputError(state, totalTTC);
  if (inputError || !isProjexioCredit(state)) return inputError;
  if (!projexioIsCurrent(state, totalTTC)) return "Calculez la simulation Projexio avant de continuer.";
  return "";
}

export function buildProjexioRequest(body = {}) {
  const action = String(body.action || "");
  if (action === "baremes") return { path: "/baremes/", params: {} };
  if (action !== "simulations") return { error: "Action Projexio inconnue." };

  const bareme = Math.round(Number(body.bareme));
  if (!Number.isInteger(bareme) || bareme <= 0) return { error: "Barème Projexio invalide." };
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 200000) return { error: "Montant de prêt invalide." };
  const params = {
    bareme: String(bareme),
    montant: String(Number(amount.toFixed(2))),
  };
  if (body.insuranceRate !== "" && body.insuranceRate != null) {
    const rate = Number(body.insuranceRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { error: "Taux d’assurance invalide." };
    params.assu = String(rate);
  }
  return { path: "/", params };
}

function numberOrNull(value) {
  if (value === "" || value == null) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function formatBound(value) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function pushRate(choices, id, label, rate) {
  const amount = Number(rate);
  if (!Number.isFinite(amount) || amount <= 0) return;
  choices.push({ id, label: `${label} — ${String(amount).replace(".", ",")} %`, rate: amount });
}
