export const DOMOFINANCE_NAME = "Domofinance";

const MODALITIES = ["normal", "gratuit", "compense"];
const BORROWER_INSURANCES = ["D", "DIM", "DIMC"];
const COBORROWER_INSURANCES = ["D", "DIM", "DIMC", "none"];

export function isDomofinanceCredit(state) {
  return state?.financeMode === "credit" && state?.financier === DOMOFINANCE_NAME;
}

export function clearDomofinanceResult(partial = {}) {
  return {
    ...partial,
    domofinanceApplied: false,
    domofinanceFingerprint: "",
  };
}

export function isoDateToDomo(iso) {
  const match = String(iso || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return `${match[3]}${match[2]}${match[1]}`;
}

export function parseDomoAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (!raw) return null;
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : null;
}

export function loanAmountEuros(totalTTC, personalContribution) {
  const total = Number(totalTTC || 0);
  const apport = Math.max(0, Number(personalContribution || 0));
  if (!Number.isFinite(total)) return 0;
  return Math.max(0, Math.round(total - apport));
}

export function borrowerAgeYears(isoDate, today = new Date()) {
  const match = String(isoDate || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const birth = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(birth.getTime())) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const month = today.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

export function insuranceChoices({ birthDate, inActivity, today } = {}) {
  const age = borrowerAgeYears(birthDate, today);
  const active = inActivity === true || inActivity === "true";
  if ((age != null && age >= 65) || !active) return ["D"];
  return ["D", "DIM", "DIMC"];
}

export function modalityLabel(id) {
  if (id === "normal") return "Normal";
  if (id === "gratuit") return "Gratuit";
  if (id === "compense") return "Compensé";
  return id || "";
}

export function insuranceLabel(id) {
  if (id === "D") return "D — décès";
  if (id === "DIM") return "DIM";
  if (id === "DIMC") return "DIMC";
  if (id === "none") return "Aucune";
  return id || "";
}

export function normalizeModalities(material) {
  const raw = material?.availableModalities;
  const values = Array.isArray(raw) ? raw : Object.values(raw || {});
  return [...new Set(values.map(value => String(value || "").trim()).filter(value => MODALITIES.includes(value)))];
}

export function suggestMaterialId(items = [], materials = [], articles = []) {
  const ids = new Set((materials || []).map(item => String(item.id)));
  const byId = new Map((articles || []).filter(article => article?.id).map(article => [String(article.id), article]));
  const hay = (items || []).map(item => {
    const article = byId.get(String(item.articleId || item.article_id || ""));
    return [
      item?.name,
      item?.category,
      item?.subcategory,
      item?.brand,
      item?.bundleName,
      article?.name,
      article?.category,
      article?.subcategory,
      article?.brand,
    ].filter(Boolean).join(" ");
  }).join(" ").toLowerCase();
  const pick = (...candidates) => candidates.find(id => ids.has(id)) || "";
  if (/panasonic/.test(hay)) {
    const id = pick("214");
    if (id) return id;
  }
  if (/viessmann|viessman/.test(hay)) {
    const id = pick("225");
    if (id) return id;
  }
  if (/eco-?ptz|éco-?ptz/.test(hay)) {
    const id = pick("222");
    if (id) return id;
  }
  if (/photovolta/.test(hay)) {
    const id = pick("14");
    if (id) return id;
  }
  if (/pompe|pac\b|chauffage|isolation|ballon|thermodynam/.test(hay)) {
    return pick("168", "176", "2");
  }
  return pick("2") || (materials[0] ? String(materials[0].id) : "");
}

export function durationOptions(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  return Object.entries(payload)
    .map(([months, monthly]) => ({
      months: Number(months),
      monthlyExInsurance: parseDomoAmount(monthly),
    }))
    .filter(item => Number.isInteger(item.months) && item.months > 0 && item.monthlyExInsurance != null)
    .sort((left, right) => left.months - right.months);
}

export function mapSimulationResult(result) {
  if (!result || typeof result !== "object") return null;
  const months = Number(result.duration);
  const monthlyPayment = parseDomoAmount(result.mens1_ins_lin);
  const financedAmount = parseDomoAmount(result.amount);
  if (!Number.isInteger(months) || months <= 0 || monthlyPayment == null || financedAmount == null) return null;
  return {
    financeMonths: months,
    monthlyPayment,
    monthlyExInsurance: parseDomoAmount(result.mensualite1),
    financeNominalRate: parseDomoAmount(result.tnc_display),
    financeTaeg: parseDomoAmount(result.teg_display),
    financeTaea: parseDomoAmount(result.taea),
    firstMonthlyPayment: Number(result.premiere_echeance) === 180 ? 180 : 30,
    financedAmount,
    creditCost: parseDomoAmount(result.cout_du_credit),
    equipmentName: String(result.equipment_name || "").trim(),
    sellerRetention: parseDomoAmount(result.montant_retenue_vendeur),
    sellerRetentionRate: parseDomoAmount(result.coef_retenue),
  };
}

function simulationSnapshot(state, totalTTC) {
  return {
    materialId: String(state?.domofinanceMaterialId || ""),
    amount: loanAmountEuros(totalTTC, state?.personalContribution),
    modality: String(state?.domofinanceModality || ""),
    postpone: Boolean(state?.domofinancePostpone),
    birthDate: String(state?.borrowerBirthDate || ""),
    inActivity: Boolean(state?.borrowerInActivity),
    insurance: String(state?.borrowerInsurance || ""),
    hasCoborrower: Boolean(state?.hasCoborrower),
    coborrowerBirthDate: state?.hasCoborrower ? String(state?.coborrowerBirthDate || "") : "",
    coborrowerInActivity: state?.hasCoborrower ? Boolean(state?.coborrowerInActivity) : false,
    coborrowerInsurance: state?.hasCoborrower ? String(state?.coborrowerInsurance || "") : "",
    months: Number(state?.financeMonths || 0),
  };
}

export function domofinanceFingerprint(state, totalTTC) {
  return JSON.stringify(simulationSnapshot(state, totalTTC));
}

export function domofinanceIsCurrent(state, totalTTC) {
  if (!state?.domofinanceApplied || !state?.domofinanceFingerprint) return false;
  return state.domofinanceFingerprint === domofinanceFingerprint(state, totalTTC);
}

export function domofinanceInputError(state, totalTTC) {
  if (!isDomofinanceCredit(state)) return "";
  if (!String(state.domofinanceMaterialId || "").trim()) return "Choisissez un produit Domofinance.";
  if (!isoDateToDomo(state.borrowerBirthDate)) return "Indiquez la date de naissance de l’emprunteur.";
  if (state.hasCoborrower && !isoDateToDomo(state.coborrowerBirthDate)) {
    return "Indiquez la date de naissance du co-emprunteur.";
  }
  const amount = loanAmountEuros(totalTTC, state.personalContribution);
  if (amount <= 0) return "Le montant à financer doit être supérieur à 0.";
  const min = Number(state.domofinanceMinAmount);
  const max = Number(state.domofinanceMaxAmount);
  if (Number.isFinite(min) && min > 0 && amount < min) return `Domofinance refuse ce produit sous ${min} €.`;
  if (Number.isFinite(max) && max > 0 && amount > max) return `Domofinance refuse ce produit au-dessus de ${max} €.`;
  return "";
}

export function domofinanceBlocker(state, totalTTC) {
  const inputError = domofinanceInputError(state, totalTTC);
  if (inputError || !isDomofinanceCredit(state)) return inputError;
  if (!domofinanceIsCurrent(state, totalTTC)) return "Calculez la simulation Domofinance avant de continuer.";
  return "";
}

export function buildDomofinanceRequest(body = {}) {
  const action = String(body.action || "");
  if (action === "materiels") return { path: "/materiels", params: {} };

  const materialId = String(body.materialId || "").trim();
  if (!/^\d+$/.test(materialId)) return { error: "Produit Domofinance invalide." };
  const amount = Math.round(Number(body.amount));
  if (!Number.isInteger(amount) || amount <= 0 || amount > 200000) return { error: "Montant de prêt invalide." };
  const modality = String(body.modality || "");
  if (!MODALITIES.includes(modality)) return { error: "Modalité invalide." };
  const birth = isoDateToDomo(body.birthDate);
  if (!birth) return { error: "Date de naissance invalide." };

  const params = {
    valueAmount: String(amount),
    valueModality: modality,
    valuePostpone: body.postpone ? "true" : "false",
    valueAge: birth,
  };
  if (body.hasCoborrower) {
    const coborrowerBirth = isoDateToDomo(body.coborrowerBirthDate);
    if (!coborrowerBirth) return { error: "Date de naissance du co-emprunteur invalide." };
    params.valueAgeCoborrower = coborrowerBirth;
  }
  if (action === "durees") return { path: `/simulation/${materialId}`, params };
  if (action !== "resultat") return { error: "Action Domofinance inconnue." };

  const months = Math.round(Number(body.months));
  if (!Number.isInteger(months) || months <= 0) return { error: "Durée invalide." };
  const insurance = String(body.insurance || "");
  if (!BORROWER_INSURANCES.includes(insurance)) return { error: "Assurance invalide." };
  params.valueDuration = String(months);
  params.valueInActivity = body.inActivity ? "true" : "false";
  params.valueInsurance = insurance;
  if (body.hasCoborrower) {
    const coborrowerInsurance = String(body.coborrowerInsurance || "none");
    if (!COBORROWER_INSURANCES.includes(coborrowerInsurance)) return { error: "Assurance du co-emprunteur invalide." };
    params.valueInActivityCoborrower = body.coborrowerInActivity ? "true" : "false";
    params.valueInsuranceCoborrower = coborrowerInsurance;
  }
  return { path: `/simulation/resultat/${materialId}`, params };
}
